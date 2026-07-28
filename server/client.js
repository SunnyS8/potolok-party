const crypto = require('crypto');
const db = require('./db');

const sessions = new Map();
const codes = new Map();

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function requestCode(phone) {
  const existing = codes.get(phone);
  if (existing && Date.now() - existing.sentAt < 60000) {
    return { ok: false, error: 'Код уже отправлен, повторите через минуту' };
  }
  const code = '0000';
  codes.set(phone, { code, sentAt: Date.now() });
  console.log(`[CLIENT] Code for ${phone}: ${code}`);
  return { ok: true, message: 'Код отправлен' };
}

function verifyCode(phone, code) {
  const stored = codes.get(phone);
  if (!stored) return { ok: false, error: 'Код не запрашивался' };
  if (Date.now() - stored.sentAt > 300000) {
    codes.delete(phone);
    return { ok: false, error: 'Код истёк, запросите новый' };
  }
  if (stored.code !== code) return { ok: false, error: 'Неверный код' };
  codes.delete(phone);

  const token = crypto.randomUUID();
  const leads = db.getLeads().filter(l => l.phone && l.phone.replace(/\D/g, '').includes(phone.replace(/\D/g, '')));
  const deals = db.getDeals().filter(d => {
    const lead = db.getLeadById(d.leadId);
    return lead && lead.phone && lead.phone.replace(/\D/g, '').includes(phone.replace(/\D/g, ''));
  });

  sessions.set(token, { phone, leads, deals, createdAt: Date.now() });
  return { ok: true, token, leads, deals };
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > 86400000) {
    sessions.delete(token);
    return null;
  }
  const phone = session.phone.replace(/\D/g, '');
  const leads = db.getLeads().filter(l => l.phone && l.phone.replace(/\D/g, '').includes(phone));
  const deals = db.getDeals().filter(d => {
    const lead = db.getLeadById(d.leadId);
    return lead && lead.phone && lead.phone.replace(/\D/g, '').includes(phone);
  });
  const quotes = db.getQuotes().filter(q => {
    return leads.some(l => l.name === q.clientName) || deals.some(d => d.id === q.dealId);
  });
  const calcRequests = db.getCalcRequests().filter(r => r.clientPhone && r.clientPhone.replace(/\D/g, '').includes(phone));
  return { phone: session.phone, leads, deals, quotes, calcRequests };
}

function loginByPhone(phone) {
  const token = crypto.randomUUID();
  const cleaned = phone.replace(/\D/g, '');
  const leads = db.getLeads().filter(l => l.phone && l.phone.replace(/\D/g, '').includes(cleaned));
  const deals = db.getDeals().filter(d => {
    const lead = db.getLeadById(d.leadId);
    return lead && lead.phone && lead.phone.replace(/\D/g, '').includes(cleaned);
  });
  const quotes = db.getQuotes().filter(q => {
    return leads.some(l => l.name === q.clientName) || deals.some(d => d.id === q.dealId);
  });
  const calcRequests = db.getCalcRequests().filter(r => r.clientPhone && r.clientPhone.replace(/\D/g, '').includes(cleaned));
  sessions.set(token, { phone, leads, deals, quotes, calcRequests, createdAt: Date.now() });
  return { token, leads, deals, quotes, calcRequests };
}

module.exports = { requestCode, verifyCode, getSession, loginByPhone };
