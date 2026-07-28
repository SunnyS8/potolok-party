const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const CALC_FILE = path.join(DATA_DIR, 'calculator_requests.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat_logs.json');
const DEALS_FILE = path.join(DATA_DIR, 'deals.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics_events.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, def) {
  ensureDir();
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { /* ignore */ }
  return def;
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function saveLead(data) {
  const leads = readJson(LEADS_FILE, []);
  const entry = { id: leads.length + 1, ...data, status: data.status || 'new', created_at: new Date().toISOString() };
  leads.push(entry);
  writeJson(LEADS_FILE, leads);
  return entry;
}

function updateLead(id, updates) {
  const leads = readJson(LEADS_FILE, []);
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return null;
  leads[idx] = { ...leads[idx], ...updates, updated_at: new Date().toISOString() };
  writeJson(LEADS_FILE, leads);
  return leads[idx];
}

function saveCalcRequest(data) {
  const items = readJson(CALC_FILE, []);
  const entry = { id: items.length + 1, ...data, created_at: new Date().toISOString() };
  items.push(entry);
  writeJson(CALC_FILE, items);
  return entry;
}

function updateCalcRequest(id, updates) {
  const items = readJson(CALC_FILE, []);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates };
  writeJson(CALC_FILE, items);
  return items[idx];
}

function saveChatMessage(sessionId, role, content) {
  const logs = readJson(CHAT_FILE, []);
  logs.push({ session_id: sessionId, role, content, created_at: new Date().toISOString() });
  if (logs.length > 10000) logs.splice(0, logs.length - 5000);
  writeJson(CHAT_FILE, logs);
}

function getLeads() { return readJson(LEADS_FILE, []).reverse(); }
function getLeadById(id) { return readJson(LEADS_FILE, []).find(l => l.id === id) || null; }

function saveDeal(data) {
  const deals = readJson(DEALS_FILE, []);
  const entry = { id: deals.length + 1, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  deals.push(entry);
  writeJson(DEALS_FILE, deals);
  return entry;
}

function updateDeal(id, updates) {
  const deals = readJson(DEALS_FILE, []);
  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) return null;
  deals[idx] = { ...deals[idx], ...updates, updated_at: new Date().toISOString() };
  writeJson(DEALS_FILE, deals);
  return deals[idx];
}

function getDeals() { return readJson(DEALS_FILE, []).reverse(); }

function saveTask(data) {
  const tasks = readJson(TASKS_FILE, []);
  const entry = { id: tasks.length + 1, ...data, created_at: new Date().toISOString(), done: false };
  tasks.push(entry);
  writeJson(TASKS_FILE, tasks);
  return entry;
}

function updateTask(id, updates) {
  const tasks = readJson(TASKS_FILE, []);
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...updates, updated_at: new Date().toISOString() };
  writeJson(TASKS_FILE, tasks);
  return tasks[idx];
}

function getTasks() { return readJson(TASKS_FILE, []).reverse(); }

function saveQuote(data) {
  const quotes = readJson(QUOTES_FILE, []);
  const entry = { id: quotes.length + 1, ...data, created_at: new Date().toISOString() };
  quotes.push(entry);
  writeJson(QUOTES_FILE, quotes);
  return entry;
}

function getQuotes() { return readJson(QUOTES_FILE, []).reverse(); }

function trackEvent(eventType, data) {
  const events = readJson(ANALYTICS_FILE, []);
  events.push({ type: eventType, data, timestamp: new Date().toISOString() });
  if (events.length > 50000) events.splice(0, events.length - 40000);
  writeJson(ANALYTICS_FILE, events);
}

function getAnalyticsEvents(type, since) {
  const events = readJson(ANALYTICS_FILE, []);
  const sinceDate = since ? new Date(since) : new Date(0);
  return events.filter(e => (!type || e.type === type) && new Date(e.timestamp) >= sinceDate);
}

function getCalcRequests() { return readJson(CALC_FILE, []).reverse(); }

module.exports = {
  saveLead, updateLead, getLeads, getLeadById,
  saveCalcRequest, updateCalcRequest, getCalcRequests, saveChatMessage,
  saveDeal, updateDeal, getDeals,
  saveTask, updateTask, getTasks,
  saveQuote, getQuotes,
  trackEvent, getAnalyticsEvents,
};
