const crypto = require('crypto');
const db = require('./db');
const projects = require('./projects');

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
  const clientProjects = projects.getProjectsByCustomerPhone(phone);

  sessions.set(token, { phone, leads, deals, clientProjects, createdAt: Date.now() });
  return { ok: true, token, leads, deals, clientProjects };
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
  const clientProjects = projects.getProjectsByCustomerPhone(session.phone);
  return { phone: session.phone, leads, deals, quotes, calcRequests, clientProjects };
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
  const clientProjects = projects.getProjectsByCustomerPhone(phone);
  sessions.set(token, { phone, leads, deals, quotes, calcRequests, clientProjects, createdAt: Date.now() });
  return { token, leads, deals, quotes, calcRequests, clientProjects };
}

// Оплата проекта клиентом (quoted → paid). Проверяем принадлежность по телефону.
function payProject(token, projectId) {
  const session = getSession(token);
  if (!session) return { ok: false, error: 'Сессия истекла' };
  const phone = String(session.phone || '').replace(/\D/g, '');
  const project = projects.getProject(projectId);
  if (!project) return { ok: false, error: 'Проект не найден' };
  const customerPhone = String(project.customer && project.customer.phone || '').replace(/\D/g, '');
  if (!customerPhone || !customerPhone.includes(phone)) {
    return { ok: false, error: 'Это не ваш проект' };
  }
  if (project.status !== 'quoted') {
    return { ok: false, error: 'Проект нельзя оплатить в статусе «' + (projects.STATUS_LABELS[project.status] || project.status) + '»' };
  }
  const updated = projects.transitionStatus(projectId, 'paid', 'client', 'Оплачено клиентом');
  return { ok: true, project: updated };
}

module.exports = { requestCode, verifyCode, getSession, loginByPhone, payProject };
