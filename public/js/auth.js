// Флюкс | СИС — единый вход по ролям и ролевой маршрутизатор.
// Используется на login.html и всеми страницами-гранями.
(function (global) {
  const API = '/api/auth';

  function getToken() {
    return localStorage.getItem('flux_token') || '';
  }

  function setToken(token) {
    localStorage.setItem('flux_token', token);
  }

  function clearToken() {
    localStorage.removeItem('flux_token');
  }

  function authHeaders() {
    const t = getToken();
    return t ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t } : { 'Content-Type': 'application/json' };
  }

  // Текущая роль из токена (серверный источник истины)
  async function me() {
    const t = getToken();
    if (!t) return { role: null };
    const res = await fetch(API + '/me', { headers: { 'Authorization': 'Bearer ' + t } });
    if (!res.ok) { clearToken(); return { role: null }; }
    return res.json();
  }

  // Вход по ключу (менеджер) или телефону+коду (остальные)
  async function login({ role, accessKey, phone, code }) {
    const res = await fetch(API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, accessKey, phone, code }),
    });
    const data = await res.json();
    if (data.ok && data.token) setToken(data.token);
    return data;
  }

  async function logout() {
    const t = getToken();
    if (t) {
      try { await fetch(API + '/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + t } }); } catch (e) {}
    }
    clearToken();
  }

  // Редирект на свою грань, если роль известна
  async function guard(pages) {
    const data = await me();
    if (!data.role) return { role: null, redirect: pages ? pages[0] : '/login.html' };
    const page = pages && pages[data.role];
    return { role: data.role, page };
  }

  global.FluxAuth = { API, getToken, setToken, clearToken, me, login, logout, guard, authHeaders };
})(window);