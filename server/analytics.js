const fs = require('fs');
const path = require('path');
const db = require('./db');

function readJson(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch(e) {}
  return def;
}

function getDashboard() {
  const leads = db.getLeads();
  const deals = db.getDeals();
  const events = db.getAnalyticsEvents(null, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const todayLeads = leads.filter(l => l.created_at?.slice(0, 10) === today);
  const weekLeads = leads.filter(l => l.created_at >= weekAgo);

  const statusCounts = {};
  leads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

  const sourceCounts = {};
  leads.forEach(l => { const s = l.source || 'unknown'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });

  const calcsFile = path.join(__dirname, '..', 'data', 'calculator_requests.json');
  const calcRequests = readJson(calcsFile, []);
  const typeCounts = {};
  calcRequests.forEach(c => { if (c.ceilingType) typeCounts[c.ceilingType] = (typeCounts[c.ceilingType] || 0) + 1; });

  const dealStages = {};
  deals.forEach(d => { dealStages[d.status] = (dealStages[d.status] || 0) + 1; });

  const dealsWon = deals.filter(d => d.status === 'won');
  const avgDealValue = dealsWon.length > 0
    ? Math.round(dealsWon.reduce((s, d) => s + (d.estimatedPrice || 0), 0) / dealsWon.length)
    : 0;

  const weekCalcCount = calcRequests.filter(c => c.created_at >= weekAgo).length;
  const conversionToDeal = leads.length > 0 ? Math.round((deals.length / leads.length) * 100) : 0;

  return {
    period: { from: weekAgo, to: now.toISOString() },
    leads: { total: leads.length, today: todayLeads.length, thisWeek: weekLeads.length, byStatus: statusCounts, bySource: sourceCounts },
    deals: { total: deals.length, byStage: dealStages, won: dealsWon.length, avgValue: avgDealValue },
    calculator: { total: calcRequests.length, thisWeek: weekCalcCount, popularTypes: Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5) },
    conversion: { leadToDeal: conversionToDeal },
    assistant: { totalChats: events.length },
  };
}

function getExportData(format) {
  const leads = db.getLeads();
  const deals = db.getDeals();
  const calcsFile = path.join(__dirname, '..', 'data', 'calculator_requests.json');
  const calcRequests = readJson(calcsFile, []);

  if (format === 'csv') {
    const headers = 'ID;Дата;Имя;Телефон;Источник;Тип потолка;Площадь;Статус';
    const rows = leads.map(l => `${l.id};${l.created_at || ''};${l.name || ''};${l.phone || ''};${l.source || ''};${l.ceilingType || ''};${l.area || ''};${l.status || ''}`);
    return [headers, ...rows].join('\n');
  }

  return { leads, deals, calcRequests };
}

module.exports = { getDashboard, getExportData };
