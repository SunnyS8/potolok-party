require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const ai = require('./ai');
const db = require('./db');
const notify = require('./notify');
const crm = require('./crm');
const calc = require('./calculator');
const assistant = require('./assistant');
const analytics = require('./analytics');
const prices = require('./prices');
const wallsCalc = require('./walls');
const iks = require('./iks-calculator');
const combinedCalc = require('./combined');
const exp = require('./export');
const clientCabinet = require('./client');
const integrations = require('./integrations');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте позже' },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Слишком много сообщений, попробуйте позже' },
});

const AUTH_TOKEN = process.env.AUTH_TOKEN;
const DEMO_TOKEN = process.env.DEMO_TOKEN || 'demo';

function getRole(req) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (token === DEMO_TOKEN || req.query.demo === '1' || req.query.demo === 'true') return 'demo';
  if (AUTH_TOKEN) {
    if (token === AUTH_TOKEN) return 'manager';
    return 'guest';
  }
  return 'manager';
}

function requireRead(req, res, next) {
  req.role = getRole(req);
  next();
}

function requireWrite(req, res, next) {
  const role = getRole(req);
  if (role === 'manager') { req.role = role; return next(); }
  res.status(role === 'demo' ? 403 : 401).json({ error: role === 'demo' ? 'Демо-доступ: только просмотр' : 'Не авторизован' });
}

const app = express();
app.set('trust proxy', 1);

app.get(['/drawing', '/drawing/'], (req, res) => res.redirect(301, '/calculator/'));
app.get('/drawing/*', (req, res) => res.redirect(301, '/calculator/'));
app.get('/calculator.html', (req, res) => res.redirect(301, '/calculator/'));

app.use('/calculator', express.static(path.join(__dirname, '..', 'public', 'calculator')));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/', apiLimiter);
app.use('/api/crm/', requireRead);
app.use('/api/assistant/', requireRead);
app.use('/api/prices', (req, res, next) => {
  if (req.method === 'GET') return next();
  requireWrite(req, res, next);
});
app.use('/api/analytics/', requireRead);
app.use('/api/leads', requireRead);
app.use('/api/lead/', requireRead);
app.use('/api/deal/', requireRead);
app.use('/api/crm/lead', (req, res, next) => req.method === 'GET' ? next() : requireWrite(req, res, next));
app.use('/api/crm/deal', (req, res, next) => req.method === 'GET' ? next() : requireWrite(req, res, next));
app.use('/api/crm/task', (req, res, next) => req.method === 'GET' ? next() : requireWrite(req, res, next));
app.use('/api/assistant/chat', (req, res, next) => req.method === 'GET' ? next() : requireWrite(req, res, next));
app.use('/api/assistant/template', (req, res, next) => req.method === 'GET' ? next() : requireWrite(req, res, next));

const PORT = process.env.PORT || 3000;
const activeSessions = new Map();

crm.init();

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const sid = sessionId || crypto.randomUUID();
    if (!activeSessions.has(sid)) activeSessions.set(sid, []);
    const history = activeSessions.get(sid);

    history.push({ role: 'user', content: message });
    db.saveChatMessage(sid, 'user', message);

    const response = await ai.chat(history);
    history.push(response);
    db.saveChatMessage(sid, 'assistant', response.content);

    if (history.length > 30) history.splice(0, history.length - 30);

    const lastFiveUser = history.filter(m => m.role === 'user').slice(-5).map(m => m.content);
    const hasContact = lastFiveUser.some(m => /\+?\d{10,}/.test(m));
    const hasCeilingType = lastFiveUser.some(m => /матов|глянц|сатин|тканев|двухуровнев|пвх/i.test(m));
    const wantsMeasurement = lastFiveUser.some(m => /замер|вызов|приезж|заявк/i.test(m));
    const readyToOrder = hasContact && (hasCeilingType || wantsMeasurement);

    res.json({ reply: response.content, sessionId: sid, readyToOrder, hasContact });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/lead', async (req, res) => {
  try {
    const data = req.body;
    const lead = await crm.createLead({
      name: data.name || '',
      phone: data.phone || '',
      email: data.email || '',
      source: data.source || 'chat',
      productType: data.productType || 'ceiling', // ceiling, walls, combined
      ceilingType: data.ceilingType || '',
      area: data.area ? parseFloat(data.area) : null,
      hasWalls: data.hasWalls ? 1 : 0,
      wallArea: data.wallArea ? parseFloat(data.wallArea) : null,
      wallSystem: data.wallSystem || '',
      hasLights: data.hasLights ? 1 : 0,
      notes: data.notes || '',
      upgrades: data.upgrades || '',
    });
    notify.notifyAll(lead);
    integrations.sendToCrm(lead).then(res => {
      if (res.sentCount === 0) console.log('CRM integration skipped:', res.results.map(r => r.reason).join('; '));
    }).catch(err => console.error('CRM integration error:', err.message));
    const clientData = data.phone ? clientCabinet.loginByPhone(data.phone) : null;
    res.json({ ok: true, id: lead.id, client: clientData });
  } catch (err) {
    console.error('Lead error:', err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.post('/api/calculator', async (req, res) => {
  try {
    const { ceilingType, area, options, clientName, clientPhone, skipAI, source } = req.body;
    const parsedArea = parseFloat(area) || 0;
    const estimate = calc.calcLocalEstimate({
      ceilingType,
      area: parsedArea,
      width: parseFloat(req.body.width) || Math.sqrt(parsedArea || 16),
      length: parseFloat(req.body.length) || Math.sqrt(parsedArea || 16),
      spots: parseInt(req.body.spots) || 0,
      chandelier: req.body.chandelier || false,
      ledStrip: parseFloat(req.body.ledStrip) || 0,
      pipeBypass: parseInt(req.body.pipeBypass) || 0,
      cornice: parseFloat(req.body.cornice) || 0,
      hatch: parseInt(req.body.hatch) || 0,
      vent: parseInt(req.body.vent) || 0,
      niche: parseFloat(req.body.niche) || 0,
    });

    let explanation = '';
    if (!skipAI) {
      try {
        explanation = await ai.calculatePrice(ceilingType, parsedArea, options || []);
      } catch (e) {
        explanation = 'Расчёт выполнен локально';
      }
    }

    const saved = db.saveCalcRequest({
      ceilingType,
      area: parsedArea,
      options: JSON.stringify(options || []),
      estimatedPrice: estimate.total,
      clientName: clientName || '',
      clientPhone: clientPhone || '',
      source: source || '',
    });

    res.json({
      explanation,
      calcId: saved.id,
      estimate,
      total: estimate.total,
      canvasPrice: estimate.canvasPrice,
      extraTotal: estimate.extraTotal,
      extras: estimate.extras,
      perimeter: estimate.perimeter,
    });
  } catch (err) {
    console.error('Calculator error:', err);
    res.status(500).json({ error: 'Ошибка расчёта' });
  }
});

app.put('/api/calculator/:id/phone', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Телефон обязателен' });
    db.updateCalcRequest(parseInt(req.params.id), { clientPhone: phone });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.post('/api/calculator/advanced', async (req, res) => {
  try {
    const params = req.body;
    const estimate = await calc.generateEstimate(params);
    res.json(estimate);
  } catch (err) {
    console.error('Advanced calc error:', err);
    res.status(500).json({ error: 'Ошибка расчёта' });
  }
});

app.post('/api/calculator/quote', async (req, res) => {
  try {
    const { estimate, client } = req.body;
    const quoteText = calc.generateQuoteText(estimate || req.body, client || { name: 'Клиент' });
    const saved = db.saveQuote({ text: quoteText, clientName: client?.name || '', estimateId: estimate?.id || null });
    res.json({ ok: true, id: saved.id, text: quoteText });
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ error: 'Ошибка генерации КП' });
  }
});

app.post('/api/walls/calculate', (req, res) => {
  try {
    const body = req.body || {};
    const height = parseFloat(body.height) || 2.7;
    const perimeter = parseFloat(body.perimeter) || (Array.isArray(body.walls) ? body.walls.reduce((sum, w) => sum + (parseFloat(w.width) || 0), 0) : 0);
    const wallArea = parseFloat(body.wallArea) || (Array.isArray(body.walls) ? body.walls.reduce((sum, w) => sum + ((parseFloat(w.width) || 0) * height), 0) : 0);
    const wallCount = Math.max(1, Math.round(perimeter / 3) || 1);
    const soundproof = body.soundproof === true || body.soundproof === 'true';

    const iksResult = iks.quickEstimate({
      wallCount,
      totalLength: perimeter,
      height,
      rollWidth: parseFloat(body.rollWidth) || 3.2,
      insulationType: soundproof ? 'tonlosAcoustic' : 'none',
      sockets: body.sockets || [],
      woodenInserts: parseInt(body.woodenInserts) || 0,
      includeGlue: body.includeGlue !== false,
      includeSpray: body.includeSpray || false,
    });

    const scale = iksResult.totalAreaSqm > 0 && wallArea > 0 ? wallArea / iksResult.totalAreaSqm : 1;
    const totalClient = Math.round(iksResult.grandTotalRub * scale);
    const materials = iksResult.materials.map((m) => ({
      name: m.name,
      unit: m.unit,
      quantity: Math.round(m.quantity * scale * 100) / 100,
      unitPrice: m.unitPrice,
      total: Math.round(m.total * scale),
    }));

    res.json({
      wallArea: Math.round(wallArea * 100) / 100,
      perimeter: Math.round(perimeter * 100) / 100,
      height: Math.round(height * 100) / 100,
      totalClient,
      materials,
      summary: {
        totalAreaSqm: Math.round(iksResult.totalAreaSqm * 100) / 100,
        wallCount,
        rollCount: iksResult.packed.length,
      },
    });
  } catch (err) {
    console.error('Walls calc error:', err);
    res.status(500).json({ error: 'Ошибка расчёта натяжных стен' });
  }
});

app.post('/api/calculator/combined', (req, res) => {
  try {
    const result = combinedCalc.calcCombined(req.body);
    res.json(result);
  } catch (err) {
    console.error('Combined calc error:', err);
    res.status(500).json({ error: 'Ошибка комплексного расчёта' });
  }
});

app.post('/api/walls/export/pdf', async (req, res) => {
  try {
    const { project, calcResult } = req.body;
    const buf = await exp.generateWallPdf(project || {}, calcResult);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="smeta.pdf"', 'Content-Length': buf.length });
    res.send(buf);
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Ошибка генерации PDF' });
  }
});

app.post('/api/walls/export/xlsx', async (req, res) => {
  try {
    const { project, calcResult } = req.body;
    const buf = await exp.generateWallXlsx(project || {}, calcResult);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="smeta.xlsx"', 'Content-Length': buf.length });
    res.send(buf);
  } catch (err) {
    console.error('XLSX export error:', err);
    res.status(500).json({ error: 'Ошибка генерации XLSX' });
  }
});

app.post('/api/export/pdf', async (req, res) => {
  try {
    const { title, items, grandTotal, upgradesTotal, discountLabel, discountSavings } = req.body;
    const buf = await exp.generateEstimatePdf({ title, items, grandTotal, upgradesTotal, discountLabel, discountSavings });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="smeta.pdf"', 'Content-Length': buf.length });
    res.send(buf);
  } catch (err) {
    console.error('Estimate PDF export error:', err);
    res.status(500).json({ error: 'Ошибка генерации PDF' });
  }
});

app.post('/api/crm/lead', async (req, res) => {
  try {
    const lead = await crm.createLead(req.body);
    res.json({ ok: true, id: lead.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/deal', async (req, res) => {
  try {
    const { leadId, ...dealData } = req.body;
    const deal = await crm.createDeal(leadId, dealData);
    res.json({ ok: true, id: deal.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/crm/deal/:id/status', async (req, res) => {
  try {
    const deal = await crm.updateDealStatus(parseInt(req.params.id), req.body.status);
    res.json({ ok: true, deal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/task', async (req, res) => {
  try {
    const task = await crm.createTask(req.body);
    res.json({ ok: true, id: task.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/crm/deals', async (req, res) => {
  try {
    let deals = crm.getDeals();
    const { q, status } = req.query;
    if (status) deals = deals.filter(d => d.status === status);
    if (q) {
      const needle = String(q).toLowerCase().trim();
      const leads = db.getLeads();
      const leadsById = {};
      leads.forEach(l => { leadsById[l.id] = l; });
      deals = deals.filter(d => {
        const lead = leadsById[d.leadId];
        return String(d.id) === needle
          || String(d.leadId) === needle
          || (d.ceilingType || '').toLowerCase().includes(needle)
          || (lead && ((lead.name || '').toLowerCase().includes(needle) || (lead.phone || '').toLowerCase().includes(needle)));
      });
    }
    res.json(deals);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

app.get('/api/crm/tasks', async (req, res) => {
  try {
    res.json(crm.getTasks());
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

app.post('/api/assistant/chat', async (req, res) => {
  try {
    const { message, history, context } = req.body;
    const messages = [...(history || []), { role: 'user', content: message }];
    const reply = await assistant.askAssistant(messages, context);
    res.json({ reply: reply.content });
  } catch (err) {
    console.error('Assistant error:', err);
    res.status(500).json({ error: 'Ошибка ассистента' });
  }
});

app.post('/api/assistant/template', async (req, res) => {
  try {
    const { type, data } = req.body;
    const text = assistant.generateMessageTemplate(type, data);
    if (!text) return res.status(400).json({ error: 'Неизвестный тип шаблона' });
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка генерации шаблона' });
  }
});

app.get('/api/prices', (req, res) => {
  try { res.json(prices.getAll()); }
  catch (err) { res.status(500).json({ error: 'Ошибка загрузки цен' }); }
});

app.put('/api/prices', (req, res) => {
  try { prices.save(req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: 'Ошибка сохранения цен' }); }
});

app.put('/api/prices/ceiling/:id', (req, res) => {
  try {
    const data = prices.getAll();
    const idx = data.ceilingTypes.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
    data.ceilingTypes[idx] = { ...data.ceilingTypes[idx], ...req.body };
    prices.save(data);
    res.json({ ok: true, item: data.ceilingTypes[idx] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/prices/option/:id', (req, res) => {
  try {
    const data = prices.getAll();
    const idx = data.options.findIndex(o => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
    data.options[idx] = { ...data.options[idx], ...req.body };
    prices.save(data);
    res.json({ ok: true, item: data.options[idx] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/prices/profile', (req, res) => {
  try {
    const data = prices.getAll();
    data.profile = { ...data.profile, ...req.body };
    prices.save(data);
    res.json({ ok: true, item: data.profile });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/prices/walls', (req, res) => {
  try {
    prices.saveWallPrices(req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка сохранения цен стен' }); }
});

app.put('/api/prices/walls/material/:id', (req, res) => {
  try {
    const data = prices.getAll();
    if (!data.walls || !data.walls.materials[req.params.id]) return res.status(404).json({ error: 'Не найдено' });
    data.walls.materials[req.params.id] = { ...data.walls.materials[req.params.id], ...req.body };
    prices.save(data);
    res.json({ ok: true, item: data.walls.materials[req.params.id] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/prices/walls/installation/:id', (req, res) => {
  try {
    const data = prices.getAll();
    if (!data.walls || !data.walls.installation[req.params.id]) return res.status(404).json({ error: 'Не найдено' });
    data.walls.installation[req.params.id] = { ...data.walls.installation[req.params.id], ...req.body };
    prices.save(data);
    res.json({ ok: true, item: data.walls.installation[req.params.id] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/prices/iks', (req, res) => {
  try {
    const data = prices.getAll();
    data.iks = { ...(data.iks || {}), ...req.body };
    prices.save(data);
    res.json({ ok: true, item: data.iks });
  } catch (err) { res.status(500).json({ error: 'Ошибка сохранения IK S цен' }); }
});

app.put('/api/prices/sis', (req, res) => {
  try {
    const data = prices.getAll();
    if (req.body.component && data.sis.components[req.body.component]) {
      data.sis.components[req.body.component].price = req.body.price;
    } else {
      data.sis = { ...data.sis, ...req.body };
    }
    prices.save(data);
    res.json({ ok: true, item: data.sis });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/prices/upgrades/:id', (req, res) => {
  try {
    const data = prices.getAll();
    const idx = data.upgrades.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
    data.upgrades[idx] = { ...data.upgrades[idx], price: req.body.price };
    prices.save(data);
    res.json({ ok: true, item: data.upgrades[idx] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

// ─── Add/delete price items ────────────────────────────────────
const genId = (label) => label.toLowerCase().replace(/[^a-zа-яё0-9]+/g, '_').replace(/[^a-zа-яё0-9_]/g, '').slice(0, 30);

app.post('/api/prices/ceiling', (req, res) => {
  try {
    const data = prices.getAll();
    const id = req.body.id || genId(req.body.label || 'new') + '_' + Date.now();
    if (data.ceilingTypes.find(c => c.id === id)) return res.status(400).json({ error: 'ID уже существует' });
    data.ceilingTypes.push({ id, label: req.body.label || 'Новый тип', pricePerM2: Number(req.body.pricePerM2) || 0 });
    prices.save(data);
    res.json({ ok: true, item: data.ceilingTypes[data.ceilingTypes.length - 1] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/prices/ceiling/:id', (req, res) => {
  try {
    const data = prices.getAll();
    const idx = data.ceilingTypes.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
    data.ceilingTypes.splice(idx, 1);
    prices.save(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/prices/option', (req, res) => {
  try {
    const data = prices.getAll();
    const id = req.body.id || genId(req.body.label || 'new') + '_' + Date.now();
    if (data.options.find(o => o.id === id)) return res.status(400).json({ error: 'ID уже существует' });
    data.options.push({ id, label: req.body.label || 'Новая опция', unit: req.body.unit || 'шт', price: Number(req.body.price) || 0 });
    prices.save(data);
    res.json({ ok: true, item: data.options[data.options.length - 1] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/prices/option/:id', (req, res) => {
  try {
    const data = prices.getAll();
    const idx = data.options.findIndex(o => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
    data.options.splice(idx, 1);
    prices.save(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/prices/walls/material', (req, res) => {
  try {
    const data = prices.getAll();
    const key = req.body.key || genId(req.body.label || 'new') + '_' + Date.now();
    if (data.walls.materials[key]) return res.status(400).json({ error: 'Ключ уже существует' });
    data.walls.materials[key] = { label: req.body.label || 'Новый материал', unit: req.body.unit || 'м²', companyPrice: Number(req.body.companyPrice) || 0, clientPrice: Number(req.body.clientPrice) || 0 };
    if (req.body.wastePercent) data.walls.materials[key].wastePercent = Number(req.body.wastePercent);
    if (req.body.perMeters) data.walls.materials[key].perMeters = Number(req.body.perMeters);
    prices.save(data);
    res.json({ ok: true, item: data.walls.materials[key] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/prices/walls/material/:key', (req, res) => {
  try {
    const data = prices.getAll();
    if (!data.walls.materials[req.params.key]) return res.status(404).json({ error: 'Не найдено' });
    delete data.walls.materials[req.params.key];
    prices.save(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/prices/walls/installation', (req, res) => {
  try {
    const data = prices.getAll();
    const key = req.body.key || genId(req.body.label || 'new') + '_' + Date.now();
    if (data.walls.installation[key]) return res.status(400).json({ error: 'Ключ уже существует' });
    data.walls.installation[key] = { label: req.body.label || 'Новая работа', unit: req.body.unit || 'м²', companyRate: Number(req.body.companyRate) || 0, clientRate: Number(req.body.clientRate) || 0 };
    prices.save(data);
    res.json({ ok: true, item: data.walls.installation[key] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/prices/walls/installation/:key', (req, res) => {
  try {
    const data = prices.getAll();
    if (!data.walls.installation[req.params.key]) return res.status(404).json({ error: 'Не найдено' });
    delete data.walls.installation[req.params.key];
    prices.save(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/prices/sis/component', (req, res) => {
  try {
    const data = prices.getAll();
    const key = req.body.key || genId(req.body.label || 'new') + '_' + Date.now();
    if (data.sis.components[key]) return res.status(400).json({ error: 'Компонент уже существует' });
    data.sis.components[key] = { label: req.body.label || 'Новый компонент', unit: req.body.unit || 'м', price: Number(req.body.price) || 0 };
    prices.save(data);
    res.json({ ok: true, item: data.sis.components[key] });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.delete('/api/prices/sis/component/:key', (req, res) => {
  try {
    const data = prices.getAll();
    if (!data.sis.components[req.params.key]) return res.status(404).json({ error: 'Не найдено' });
    delete data.sis.components[req.params.key];
    prices.save(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/assistant/faq', (req, res) => {
  try {
    const faq = assistant.buildFAQ();
    res.json(faq.map(f => ({ keywords: f.q.slice(0, 3), answer: f.a })));
  } catch (err) {
    console.error('FAQ error:', err);
    res.status(500).json({ error: 'Ошибка загрузки FAQ' });
  }
});

app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const data = analytics.getDashboard();
    res.json(data);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Ошибка загрузки аналитики' });
  }
});

app.get('/api/analytics/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const data = analytics.getExportData(format);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
      return res.send('\uFEFF' + data);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка выгрузки' });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    let leads = db.getLeads();
    const { q, status } = req.query;
    if (status) leads = leads.filter(l => l.status === status);
    if (q) {
      const needle = String(q).toLowerCase().trim();
      leads = leads.filter(l =>
        String(l.id) === needle
        || (l.name || '').toLowerCase().includes(needle)
        || (l.phone || '').toLowerCase().includes(needle)
        || (l.email || '').toLowerCase().includes(needle)
        || (l.source || '').toLowerCase().includes(needle)
        || (l.ceilingType || '').toLowerCase().includes(needle)
      );
    }
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

app.get('/api/leads/export', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const { q, status } = req.query;
    let leads = db.getLeads();
    if (status) leads = leads.filter(l => l.status === status);
    if (q) {
      const needle = String(q).toLowerCase().trim();
      leads = leads.filter(l =>
        String(l.id) === needle
        || (l.name || '').toLowerCase().includes(needle)
        || (l.phone || '').toLowerCase().includes(needle)
        || (l.email || '').toLowerCase().includes(needle)
        || (l.source || '').toLowerCase().includes(needle)
        || (l.ceilingType || '').toLowerCase().includes(needle)
      );
    }
    if (format === 'xlsx') {
      const buf = await exp.exportLeadsXlsx(leads);
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename=leads.xlsx', 'Content-Length': buf.length });
      return res.send(buf);
    }
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=leads.csv' });
    res.send('\uFEFF' + exp.exportLeadsCsv(leads));
  } catch (err) {
    res.status(500).json({ error: 'Ошибка выгрузки' });
  }
});

app.get('/api/crm/deals/export', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const deals = crm.getDeals();
    if (format === 'xlsx') {
      const buf = await exp.exportDealsXlsx(deals);
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename=deals.xlsx', 'Content-Length': buf.length });
      return res.send(buf);
    }
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=deals.csv' });
    res.send('\uFEFF' + exp.exportDealsCsv(deals));
  } catch (err) {
    res.status(500).json({ error: 'Ошибка выгрузки' });
  }
});

// ─── Комментарии и история ─────────────────────────────────
app.get('/api/lead/:id/comments', (req, res) => {
  try {
    const lead = db.getLeadById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    res.json({ lead, comments: db.getComments('lead', req.params.id) });
  } catch (err) { res.status(500).json({ error: 'Ошибка загрузки' }); }
});

app.post('/api/lead/:id/comment', requireWrite, (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Пустой комментарий' });
    const lead = db.getLeadById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Лид не найден' });
    const comment = db.saveComment('lead', req.params.id, req.body.author || 'менеджер', text);
    res.json({ ok: true, comment });
  } catch (err) { res.status(500).json({ error: 'Ошибка сохранения' }); }
});

app.get('/api/deal/:id/comments', (req, res) => {
  try {
    const deals = crm.getDeals();
    const deal = deals.find(d => String(d.id) === String(req.params.id));
    if (!deal) return res.status(404).json({ error: 'Сделка не найдена' });
    const lead = deal.leadId ? db.getLeadById(deal.leadId) : null;
    res.json({ deal, lead, comments: db.getComments('deal', req.params.id) });
  } catch (err) { res.status(500).json({ error: 'Ошибка загрузки' }); }
});

app.post('/api/deal/:id/comment', requireWrite, (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Пустой комментарий' });
    const deals = crm.getDeals();
    if (!deals.find(d => String(d.id) === String(req.params.id))) return res.status(404).json({ error: 'Сделка не найдена' });
    const comment = db.saveComment('deal', req.params.id, req.body.author || 'менеджер', text);
    res.json({ ok: true, comment });
  } catch (err) { res.status(500).json({ error: 'Ошибка сохранения' }); }
});

app.get('/api/auth/role', (req, res) => {
  res.json({ role: getRole(req) });
});

app.post('/api/client/code', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.length < 10) return res.status(400).json({ error: 'Введите номер телефона' });
    const result = clientCabinet.requestCode(phone);
    res.json(result);
  } catch (err) {
    console.error('Client code error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/client/login', (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Введите телефон и код' });
    const result = clientCabinet.verifyCode(phone, code);
    res.json(result);
  } catch (err) {
    console.error('Client login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/client/orders', (req, res) => {
  try {
    const token = req.query.token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    const session = clientCabinet.getSession(token);
    if (!session) return res.status(401).json({ error: 'Сессия истекла' });
    res.json({ leads: session.leads, deals: session.deals, quotes: session.quotes });
  } catch (err) {
    console.error('Client orders error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: ai.getProviderName(),
    model: ai.getModel(),
    lowBalance: ai.getLowBalance ? ai.getLowBalance() : false,
    features: ['chat', 'calculator', 'crm', 'assistant', 'analytics'],
    integrations: integrations.status(),
  });
});

app.get('/api/integrations/status', (req, res) => {
  res.json({ ok: true, ...integrations.status() });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    const provider = ai.getProviderName() || 'не настроен (работает без ИИ)';
    console.log(`🚀 Потолок Пати AI запущен: http://localhost:${PORT}`);
    console.log(`   Провайдер: ${provider}, модель: ${ai.getModel()}`);
    console.log(`   Пакет: Growth/Automation — CRM, сметы, ассистент, аналитика`);
  });
}

module.exports = app;
