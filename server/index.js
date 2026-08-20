require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const ai = require('./ai');
const db = require('./db');
const notify = require('./notify');
const crm = require('./crm');
const calc = require('./calculator');
const prices = require('./prices');
const iks = require('./iks-calculator');
const combinedCalc = require('./combined');
const exp = require('./export');
const integrations = require('./integrations');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте позже' },
});

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/', apiLimiter);

const PORT = process.env.PORT || 3000;

crm.init();

app.post('/api/lead', async (req, res) => {
  try {
    const data = req.body;
    const lead = await crm.createLead({
      name: data.name || '',
      phone: data.phone || '',
      email: data.email || '',
      source: data.source || 'calculator',
      productType: data.productType || 'ceiling',
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
    res.json({ ok: true, id: lead.id });
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

app.post('/api/walls/calculate', (req, res) => {
  try {
    const body = req.body || {};

    if (Array.isArray(body.walls) && body.walls.length > 0 && body.walls[0].width !== undefined) {
      const detailed = iks.calcDetailed(body);
      return res.json(detailed);
    }

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

app.get('/api/prices', (req, res) => {
  try { res.json(prices.getAll()); }
  catch (err) { res.status(500).json({ error: 'Ошибка загрузки цен' }); }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: ai.getProviderName(),
    model: ai.getModel(),
    lowBalance: ai.getLowBalance ? ai.getLowBalance() : false,
    features: ['calculator'],
    integrations: integrations.status(),
  });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    const provider = ai.getProviderName() || 'не настроен (работает без ИИ)';
    console.log(`СИС — калькулятор запущен: http://localhost:${PORT}`);
    console.log(`   Провайдер: ${provider}, модель: ${ai.getModel()}`);
  });
}

module.exports = app;