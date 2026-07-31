const fs = require('fs');
const path = require('path');

// На Vercel (serverless) ФС доступна на запись только в /tmp
const DATA_DIR = process.env.VERCEL === '1'
  ? path.join('/tmp', 'potolok-data')
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'app.db');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const CALC_FILE = path.join(DATA_DIR, 'calculator_requests.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat_logs.json');
const DEALS_FILE = path.join(DATA_DIR, 'deals.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics_events.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');

let useSqlite = false;
let db = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initSqlite() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    ensureDir();
    db = new DatabaseSync(DB_FILE);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, status TEXT, source TEXT, lead_id INTEGER, done INTEGER DEFAULT 0, created_at TEXT);
      CREATE TABLE IF NOT EXISTS deals (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, status TEXT, source TEXT, lead_id INTEGER, done INTEGER DEFAULT 0, created_at TEXT);
      CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, status TEXT, source TEXT, lead_id INTEGER, done INTEGER DEFAULT 0, created_at TEXT);
      CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, status TEXT, source TEXT, lead_id INTEGER, done INTEGER DEFAULT 0, created_at TEXT);
      CREATE TABLE IF NOT EXISTS calc_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, status TEXT, source TEXT, lead_id INTEGER, done INTEGER DEFAULT 0, created_at TEXT);
      CREATE TABLE IF NOT EXISTS chat_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, created_at TEXT);
      CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT, entity_id INTEGER, author TEXT, text TEXT, created_at TEXT);
      CREATE TABLE IF NOT EXISTS analytics_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, data TEXT, timestamp TEXT);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
      CREATE INDEX IF NOT EXISTS idx_events_type ON analytics_events(type);
    `);
    useSqlite = true;
    migrateFromJson();
    return true;
  } catch (e) {
    useSqlite = false;
    db = null;
    console.error('SQLite init failed, using JSON fallback:', e.message);
    return false;
  }
}

// ─── SQLite helpers ─────────────────────────────────────────
function rowToEntity(row, table) {
  if (!row) return null;
  const obj = JSON.parse(row.data || '{}');
  obj.id = row.id;
  if (row.created_at) obj.created_at = row.created_at;
  return obj;
}

function insertEntity(table, data) {
  const now = new Date().toISOString();
  const entry = { ...data, status: data.status || (table === 'leads' ? 'new' : table === 'deals' ? 'negotiation' : undefined), created_at: data.created_at || now };
  const stmt = db.prepare(`INSERT INTO ${table} (data, status, source, lead_id, done, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(
    JSON.stringify(entry),
    entry.status || null,
    data.source || null,
    data.leadId != null ? data.leadId : (table === 'deals' ? data.leadId || null : null),
    data.done ? 1 : 0,
    entry.created_at,
  );
  entry.id = Number(result.lastInsertRowid);
  return entry;
}

function updateEntity(table, id, updates) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) return null;
  const obj = rowToEntity(row, table);
  const merged = { ...obj, ...updates, updated_at: new Date().toISOString() };
  const stmt = db.prepare(`UPDATE ${table} SET data = ?, status = ?, lead_id = ?, done = ? WHERE id = ?`);
  stmt.run(
    JSON.stringify(merged),
    merged.status || null,
    merged.leadId != null ? merged.leadId : null,
    merged.done ? 1 : 0,
    id,
  );
  return merged;
}

function listEntities(table, orderCol = 'id', dir = 'DESC') {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderCol} ${dir}`).all();
  return rows.map(r => rowToEntity(r, table));
}

// ─── JSON helpers (fallback) ────────────────────────────────
function readJson(file, def) {
  ensureDir();
  try {
    if (fs.existsSync(file)) {
      let raw = fs.readFileSync(file, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      return JSON.parse(raw);
    }
  } catch (e) { /* ignore */ }
  return def;
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Миграция JSON → SQLite (одноразовая) ──────────────────
function migrateJsonToTable(jsonFile, table, mapFn) {
  if (!fs.existsSync(jsonFile)) return;
  let items;
  try {
    let raw = fs.readFileSync(jsonFile, 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    items = JSON.parse(raw);
  } catch (e) { return; }
  if (!Array.isArray(items) || items.length === 0) return;
  const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  if (count > 0) return;

  const insert = db.prepare(`INSERT INTO ${table} (id, data, status, source, lead_id, done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN');
  try {
    for (const item of items) {
      const data = mapFn ? mapFn(item) : item;
      const now = item.created_at || new Date().toISOString();
      insert.run(
        item.id != null ? item.id : null,
        JSON.stringify({ ...data, id: item.id != null ? item.id : null }),
        data.status || null,
        data.source || null,
        data.leadId != null ? data.leadId : null,
        data.done ? 1 : 0,
        now,
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Migration error for', table, e.message);
  }
}

function migrateFromJson() {
  migrateJsonToTable(LEADS_FILE, 'leads');
  migrateJsonToTable(DEALS_FILE, 'deals');
  migrateJsonToTable(TASKS_FILE, 'tasks');
  migrateJsonToTable(QUOTES_FILE, 'quotes');
  migrateJsonToTable(CALC_FILE, 'calc_requests');

  // comments — отдельные колонки
  if (fs.existsSync(COMMENTS_FILE)) {
    const c = db.prepare('SELECT COUNT(*) AS cnt FROM comments').get().cnt;
    if (c === 0) {
      const items = readJson(COMMENTS_FILE, []);
      if (items.length) {
        const ins = db.prepare('INSERT INTO comments (id, entity_type, entity_id, author, text, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        db.exec('BEGIN');
        try {
          for (const it of items) {
            ins.run(null, it.entityType, String(it.entityId), it.author || 'менеджер', it.text || '', it.created_at || new Date().toISOString());
          }
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); console.error('Migration error comments:', e.message); }
      }
    }
  }

  // chat_logs — отдельные колонки
  if (fs.existsSync(CHAT_FILE)) {
    const c = db.prepare('SELECT COUNT(*) AS cnt FROM chat_logs').get().cnt;
    if (c === 0) {
      const items = readJson(CHAT_FILE, []);
      if (items.length) {
        const ins = db.prepare('INSERT INTO chat_logs (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)');
        db.exec('BEGIN');
        try {
          for (const it of items) {
            ins.run(null, String(it.session_id || it.sessionId || ''), it.role || '', it.content || '', it.created_at || new Date().toISOString());
          }
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); console.error('Migration error chat:', e.message); }
      }
    }
  }

  // analytics_events — отдельные колонки
  if (fs.existsSync(ANALYTICS_FILE)) {
    const c = db.prepare('SELECT COUNT(*) AS cnt FROM analytics_events').get().cnt;
    if (c === 0) {
      const items = readJson(ANALYTICS_FILE, []);
      if (items.length) {
        const ins = db.prepare('INSERT INTO analytics_events (id, type, data, timestamp) VALUES (?, ?, ?, ?)');
        db.exec('BEGIN');
        try {
          for (const it of items) {
            const ev = { ...it };
            delete ev.id; delete ev.type; delete ev.created_at; delete ev.timestamp;
            ins.run(null, it.type || '', JSON.stringify(ev), it.timestamp || it.created_at || new Date().toISOString());
          }
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); console.error('Migration error events:', e.message); }
      }
    }
  }
}

// ─── Public API (same signatures as before) ─────────────────
function saveLead(data) {
  if (useSqlite) return insertEntity('leads', data);
  const leads = readJson(LEADS_FILE, []);
  const entry = { id: leads.length + 1, ...data, status: data.status || 'new', created_at: new Date().toISOString() };
  leads.push(entry);
  writeJson(LEADS_FILE, leads);
  return entry;
}

function updateLead(id, updates) {
  if (useSqlite) return updateEntity('leads', id, updates);
  const leads = readJson(LEADS_FILE, []);
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return null;
  leads[idx] = { ...leads[idx], ...updates, updated_at: new Date().toISOString() };
  writeJson(LEADS_FILE, leads);
  return leads[idx];
}

function saveCalcRequest(data) {
  if (useSqlite) return insertEntity('calc_requests', data);
  const items = readJson(CALC_FILE, []);
  const entry = { id: items.length + 1, ...data, created_at: new Date().toISOString() };
  items.push(entry);
  writeJson(CALC_FILE, items);
  return entry;
}

function updateCalcRequest(id, updates) {
  if (useSqlite) return updateEntity('calc_requests', id, updates);
  const items = readJson(CALC_FILE, []);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates };
  writeJson(CALC_FILE, items);
  return items[idx];
}

function saveChatMessage(sessionId, role, content) {
  if (useSqlite) {
    const stmt = db.prepare('INSERT INTO chat_logs (session_id, role, content, created_at) VALUES (?, ?, ?, ?)');
    stmt.run(sessionId, role, content, new Date().toISOString());
    const count = db.prepare('SELECT COUNT(*) AS c FROM chat_logs').get().c;
    if (count > 10000) db.prepare('DELETE FROM chat_logs WHERE id NOT IN (SELECT id FROM chat_logs ORDER BY id DESC LIMIT 5000)').run();
    return;
  }
  const logs = readJson(CHAT_FILE, []);
  logs.push({ session_id: sessionId, role, content, created_at: new Date().toISOString() });
  if (logs.length > 10000) logs.splice(0, logs.length - 5000);
  writeJson(CHAT_FILE, logs);
}

function getLeads() {
  if (useSqlite) return listEntities('leads');
  return readJson(LEADS_FILE, []).reverse();
}

function getLeadById(id) {
  if (useSqlite) {
    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    return row ? rowToEntity(row, 'leads') : null;
  }
  return readJson(LEADS_FILE, []).find(l => l.id === id) || null;
}

function saveDeal(data) {
  if (useSqlite) return insertEntity('deals', data);
  const deals = readJson(DEALS_FILE, []);
  const entry = { id: deals.length + 1, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  deals.push(entry);
  writeJson(DEALS_FILE, deals);
  return entry;
}

function updateDeal(id, updates) {
  if (useSqlite) return updateEntity('deals', id, updates);
  const deals = readJson(DEALS_FILE, []);
  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) return null;
  deals[idx] = { ...deals[idx], ...updates, updated_at: new Date().toISOString() };
  writeJson(DEALS_FILE, deals);
  return deals[idx];
}

function getDeals() {
  if (useSqlite) return listEntities('deals');
  return readJson(DEALS_FILE, []).reverse();
}

function saveTask(data) {
  if (useSqlite) return insertEntity('tasks', data);
  const tasks = readJson(TASKS_FILE, []);
  const entry = { id: tasks.length + 1, ...data, created_at: new Date().toISOString(), done: false };
  tasks.push(entry);
  writeJson(TASKS_FILE, tasks);
  return entry;
}

function updateTask(id, updates) {
  if (useSqlite) return updateEntity('tasks', id, updates);
  const tasks = readJson(TASKS_FILE, []);
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...updates, updated_at: new Date().toISOString() };
  writeJson(TASKS_FILE, tasks);
  return tasks[idx];
}

function getTasks() {
  if (useSqlite) return listEntities('tasks');
  return readJson(TASKS_FILE, []).reverse();
}

function saveQuote(data) {
  if (useSqlite) return insertEntity('quotes', data);
  const quotes = readJson(QUOTES_FILE, []);
  const entry = { id: quotes.length + 1, ...data, created_at: new Date().toISOString() };
  quotes.push(entry);
  writeJson(QUOTES_FILE, quotes);
  return entry;
}

function getQuotes() {
  if (useSqlite) return listEntities('quotes');
  return readJson(QUOTES_FILE, []).reverse();
}

function trackEvent(eventType, data, timestamp) {
  const ts = timestamp || new Date().toISOString();
  if (useSqlite) {
    const stmt = db.prepare('INSERT INTO analytics_events (type, data, timestamp) VALUES (?, ?, ?)');
    stmt.run(eventType, JSON.stringify(data || {}), ts);
    const count = db.prepare('SELECT COUNT(*) AS c FROM analytics_events').get().c;
    if (count > 50000) db.prepare('DELETE FROM analytics_events WHERE id NOT IN (SELECT id FROM analytics_events ORDER BY id DESC LIMIT 40000)').run();
    return;
  }
  const events = readJson(ANALYTICS_FILE, []);
  events.push({ type: eventType, data, timestamp: ts });
  if (events.length > 50000) events.splice(0, events.length - 40000);
  writeJson(ANALYTICS_FILE, events);
}

function clearAll() {
  if (useSqlite) {
    db.exec(`
      DELETE FROM leads; DELETE FROM deals; DELETE FROM tasks; DELETE FROM quotes;
      DELETE FROM calc_requests; DELETE FROM chat_logs; DELETE FROM comments; DELETE FROM analytics_events;
      DELETE FROM sqlite_sequence;
    `);
    return;
  }
  writeJson(LEADS_FILE, []);
  writeJson(DEALS_FILE, []);
  writeJson(TASKS_FILE, []);
  writeJson(QUOTES_FILE, []);
  writeJson(CALC_FILE, []);
  writeJson(CHAT_FILE, []);
  writeJson(COMMENTS_FILE, []);
  writeJson(ANALYTICS_FILE, []);
}

function getAnalyticsEvents(type, since) {
  const sinceDate = since ? new Date(since) : new Date(0);
  if (useSqlite) {
    const rows = db.prepare('SELECT * FROM analytics_events WHERE (? IS NULL OR type = ?) AND timestamp >= ? ORDER BY id').all(type || null, type || null, sinceDate.toISOString());
    return rows.map(r => ({
      id: r.id,
      type: r.type,
      data: (() => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } })(),
      timestamp: r.timestamp,
    }));
  }
  const events = readJson(ANALYTICS_FILE, []);
  return events.filter(e => (!type || e.type === type) && new Date(e.timestamp) >= sinceDate);
}

function saveComment(entityType, entityId, author, text) {
  if (useSqlite) {
    const stmt = db.prepare('INSERT INTO comments (entity_type, entity_id, author, text, created_at) VALUES (?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    const result = stmt.run(entityType, String(entityId), author || 'менеджер', text, now);
    return { id: Number(result.lastInsertRowid), entityType, entityId, author: author || 'менеджер', text, created_at: now };
  }
  const comments = readJson(COMMENTS_FILE, []);
  const entry = {
    id: comments.length + 1,
    entityType,
    entityId,
    author: author || 'менеджер',
    text,
    created_at: new Date().toISOString(),
  };
  comments.push(entry);
  writeJson(COMMENTS_FILE, comments);
  return entry;
}

function getComments(entityType, entityId) {
  if (useSqlite) {
    const rows = db.prepare('SELECT * FROM comments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at').all(entityType, String(entityId));
    return rows.map(r => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, author: r.author, text: r.text, created_at: r.created_at }));
  }
  return readJson(COMMENTS_FILE, [])
    .filter(c => c.entityType === entityType && String(c.entityId) === String(entityId))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function getAllComments() {
  if (useSqlite) {
    const rows = db.prepare('SELECT * FROM comments ORDER BY created_at').all();
    return rows.map(r => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, author: r.author, text: r.text, created_at: r.created_at }));
  }
  return readJson(COMMENTS_FILE, []);
}

function getCalcRequests() {
  if (useSqlite) return listEntities('calc_requests');
  return readJson(CALC_FILE, []).reverse();
}

initSqlite();
if (useSqlite) console.log('DB: SQLite (' + DB_FILE + ')');
else console.log('DB: JSON-файлы (fallback)');

module.exports = {
  saveLead, updateLead, getLeads, getLeadById,
  saveCalcRequest, updateCalcRequest, getCalcRequests, saveChatMessage,
  saveDeal, updateDeal, getDeals,
  saveTask, updateTask, getTasks,
  saveQuote, getQuotes,
  trackEvent, getAnalyticsEvents,
  saveComment, getComments, getAllComments,
  clearAll,
};
