const crypto = require('crypto');
const db = require('./db');
const projects = require('./projects');

// Ролевые сессии (in-memory, аналогично client.js). Токен → роль + телефон.
const sessions = new Map();

// Роль → страница-грань
const ROLE_PAGE = {
  designer: '/designer.html',
  dealer: '/dealer.html',
  installer: '/installer.html',
  manager: '/manager.html',
  client: '/client.html',
};

// Роли по способу входа
const KEY_ROLES = ['manager'];            // вход по ключу доступа
const PHONE_ROLES = ['designer', 'dealer', 'installer', 'client']; // вход по телефону + коду

function rolePages() {
  return ROLE_PAGE;
}

// Логин по ключу доступа (менеджер). Ключ — AUTH_TOKEN или DEMO_TOKEN из env.
function loginByKey(role, accessKey) {
  if (role !== 'manager') return { ok: false, error: 'Вход по ключу для этой роли недоступен' };

  const auth = process.env.AUTH_TOKEN;
  const demo = process.env.DEMO_TOKEN || 'demo';
  const token = (accessKey || '').trim();

  // Если ключ не настроен — вход открыт (как раньше). Иначе — должен совпасть.
  if (auth) {
    if (token !== auth) return { ok: false, error: 'Неверный ключ доступа' };
  }
  // Позволяем демо-ключ для песочницы всегда
  if (token !== demo && !auth && token && token !== demo) {
    return { ok: false, error: 'Неверный ключ доступа' };
  }

  const sessionToken = createSession(role, null, token || demo);
  return { ok: true, token: sessionToken, role, page: ROLE_PAGE[role] };
}

// Логин по телефону + коду (дизайнер/дилер/монтажник/клиент)
function loginByPhone(role, phone, code) {
  if (!PHONE_ROLES.includes(role)) return { ok: false, error: 'Вход по телефону для этой роли недоступен' };
  if (!phone || phone.replace(/\D/g, '').length < 10) return { ok: false, error: 'Введите корректный номер телефона' };

  // Демо: код 0000 принимается всегда (реальная SMS-шлюз подключается позже)
  const expected = '0000';
  if (!code) return { ok: false, needCode: true, message: 'Код отправлен' };
  if (String(code) !== expected) return { ok: false, error: 'Неверный код. Демо-код: 0000' };

  const sessionToken = createSession(role, phone, null);
  return { ok: true, token: sessionToken, role, page: ROLE_PAGE[role] };
}

function createSession(role, phone, via) {
  const token = crypto.randomUUID();
  const session = {
    role,
    phone: phone || null,
    via: via || 'phone',
    createdAt: Date.now(),
  };
  // Привязка: монтажник/дилер/дизайнер идентифицируются по телефону, чтобы видеть свои проекты
  if (phone) session.roleKey = phone.replace(/\D/g, '').slice(-6);
  sessions.set(token, session);
  return token;
}

function getRole(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > 86400000 * 7) {
    sessions.delete(token);
    return null;
  }
  return session.role;
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > 86400000 * 7) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function logout(token) {
  if (token) sessions.delete(token);
  return { ok: true };
}

// Список проектов, доступных роли (единая точка для всех граней)
function projectsForRole(token) {
  const session = getSession(token);
  if (!session) return { role: null, projects: [], statuses: projects.PROJECT_STATUSES, statusLabels: projects.STATUS_LABELS };
  const list = projects.listProjects(session.role, {});
  return { role: session.role, projects: list, statuses: projects.PROJECT_STATUSES, statusLabels: projects.STATUS_LABELS };
}

module.exports = {
  ROLE_PAGE,
  KEY_ROLES,
  PHONE_ROLES,
  rolePages,
  loginByKey,
  loginByPhone,
  getRole,
  getSession,
  logout,
  projectsForRole,
};