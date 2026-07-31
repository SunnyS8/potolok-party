const db = require('./db');

function dayKey(ts) {
  return (ts || '').slice(0, 10);
}

function lastDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function trendSeries(rows, field, n) {
  const days = lastDays(n);
  const counts = {};
  rows.forEach(r => { const k = dayKey(r.created_at); if (k) counts[k] = (counts[k] || 0) + 1; });
  return days.map(d => ({ date: d, count: counts[d] || 0 }));
}

function getDashboard() {
  const leads = db.getLeads();
  const deals = db.getDeals();
  const calcRequests = db.getCalcRequests();
  const events = db.getAnalyticsEvents(null, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const todayLeads = leads.filter(l => dayKey(l.created_at) === today);
  const weekLeads = leads.filter(l => l.created_at >= weekAgo);

  const statusCounts = {};
  leads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

  const sourceCounts = {};
  leads.forEach(l => { const s = l.source || 'unknown'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });

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

  const leadById = {};
  leads.forEach(l => { leadById[l.id] = l; });

  const sourceConversion = {};
  const allSources = new Set(leads.map(l => l.source || 'unknown'));
  allSources.forEach(s => {
    const srcLeads = leads.filter(l => (l.source || 'unknown') === s);
    const srcDeals = deals.filter(d => {
      const lead = d.leadId != null ? leadById[d.leadId] : null;
      return lead ? (lead.source || 'unknown') === s : false;
    });
    const srcWon = srcDeals.filter(d => d.status === 'won');
    sourceConversion[s] = {
      leads: srcLeads.length,
      deals: srcDeals.length,
      won: srcWon.length,
      rate: srcLeads.length > 0 ? Math.round((srcDeals.length / srcLeads.length) * 100) : 0,
    };
  });

  return {
    period: { from: weekAgo, to: now.toISOString() },
    leads: { total: leads.length, today: todayLeads.length, thisWeek: weekLeads.length, byStatus: statusCounts, bySource: sourceCounts },
    deals: { total: deals.length, byStage: dealStages, won: dealsWon.length, avgValue: avgDealValue },
    calculator: { total: calcRequests.length, thisWeek: weekCalcCount, popularTypes: Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5) },
    conversion: {
      leadToDeal: conversionToDeal,
      bySource: sourceConversion,
    },
    trend: {
      leads30: trendSeries(leads, 'created_at', 30),
      deals30: trendSeries(deals, 'created_at', 30),
    },
    assistant: { totalChats: events.length },
  };
}

function getExportData(format) {
  const leads = db.getLeads();
  const deals = db.getDeals();
  const calcRequests = db.getCalcRequests();

  if (format === 'csv') {
    const headers = 'ID;Дата;Имя;Телефон;Источник;Тип потолка;Площадь;Статус';
    const rows = leads.map(l => `${l.id};${l.created_at || ''};${l.name || ''};${l.phone || ''};${l.source || ''};${l.ceilingType || ''};${l.area || ''};${l.status || ''}`);
    return [headers, ...rows].join('\n');
  }

  return { leads, deals, calcRequests };
}

module.exports = { getDashboard, getExportData };
