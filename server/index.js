require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const ai = require('./ai');
const db = require('./db');
const notify = require('./notify');
const crm = require('./crm');
const calc = require('./calculator');
const assistant = require('./assistant');
const analytics = require('./analytics');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const activeSessions = new Map();

crm.init();

app.post('/api/chat', async (req, res) => {
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
      ceilingType: data.ceilingType || '',
      area: data.area ? parseFloat(data.area) : null,
      hasLights: data.hasLights ? 1 : 0,
      notes: data.notes || '',
    });
    notify.notifyAll(lead);
    res.json({ ok: true, id: lead.id });
  } catch (err) {
    console.error('Lead error:', err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.post('/api/calculator', async (req, res) => {
  try {
    const { ceilingType, area, options, clientName, clientPhone } = req.body;
    const explanation = await ai.calculatePrice(ceilingType, parseFloat(area), options || []);
    db.saveCalcRequest({ ceilingType, area: parseFloat(area), options: JSON.stringify(options || []), estimatedPrice: 0, clientName: clientName || '', clientPhone: clientPhone || '' });
    res.json({ explanation });
  } catch (err) {
    console.error('Calculator error:', err);
    res.status(500).json({ error: 'Ошибка расчёта' });
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
    res.json(crm.getDeals());
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

app.get('/api/assistant/faq', async (req, res) => {
  try {
    res.json(assistant.FAQ.map(f => ({ keywords: f.q.slice(0, 3), answer: f.a })));
  } catch (err) {
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
    const leads = db.getLeads();
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: ai.getProviderName(),
    model: ai.getModel(),
    lowBalance: ai.getLowBalance ? ai.getLowBalance() : false,
    features: ['chat', 'calculator', 'crm', 'assistant', 'analytics'],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  const provider = ai.getProviderName() || 'не настроен (работает без ИИ)';
  console.log(`🚀 Потолок Пати AI запущен: http://localhost:${PORT}`);
  console.log(`   Провайдер: ${provider}, модель: ${ai.getModel()}`);
  console.log(`   Пакет: Growth/Automation — CRM, сметы, ассистент, аналитика`);
});
