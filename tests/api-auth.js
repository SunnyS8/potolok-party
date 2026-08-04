const BASE = process.env.FLUX_TEST_BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
async function req(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

(async () => {
  // /api/auth/role без токена
  let r = await req('GET', '/api/auth/role');
  t('role без токена — manager (нет AUTH_TOKEN)', r.status === 200 && r.json.role === 'manager' && Array.isArray(r.json.phoneRoles), JSON.stringify(r.json).slice(0,80));

  // вход менеджером по ключу
  r = await req('POST', '/api/auth/login', { role: 'manager', accessKey: 'demo' });
  t('login manager (demo) возвращает токен и page', r.status === 200 && r.json.ok && r.json.page === '/manager.html', JSON.stringify(r.json).slice(0,80));
  const mTok = r.json.token;

  // роль по токену
  r = await req('GET', '/api/auth/me', null, mTok);
  t('me manager', r.status === 200 && r.json.role === 'manager', JSON.stringify(r.json));

  // вход дизайнером по телефону + код
  r = await req('POST', '/api/auth/login', { role: 'designer', phone: '+79161234567', code: '0000' });
  t('login designer phone+code', r.status === 200 && r.json.ok && r.json.page === '/designer.html', JSON.stringify(r.json).slice(0,80));
  const dTok = r.json.token;

  r = await req('GET', '/api/auth/me', null, dTok);
  t('me designer', r.status === 200 && r.json.role === 'designer', JSON.stringify(r.json));

  // неверный код
  r = await req('POST', '/api/auth/login', { role: 'designer', phone: '+79161234567', code: '9999' });
  t('login с неверным кодом → 401', r.status === 401, 'status=' + r.status);

  // роль видна в проектах: дизайнер создаёт проект, manager видит
  r = await req('POST', '/api/projects', { name: 'Дизайн-тест', customer: { name: 'Тест', phone: '+79161234567' } }, dTok);
  t('designer создаёт проект', r.status === 201 && r.json.project.id, 'status=' + r.status);
  const pid = r.json.project.id;

  r = await req('GET', '/api/projects', null, dTok);
  t('designer видит свои проекты', r.status === 200 && (r.json.projects || []).some(p => p.id === pid), 'count=' + (r.json.projects || []).length);

  // роль designer НЕ видит проекты manager (старые демо-проекты без role designer)
  const older = (r.json.projects || []).filter(p => p.id !== pid);
  t('designer не видит чужие (менеджерские) проекты', older.every(p => p.role === 'designer' || p.assigned && p.assigned.designer), 'чужих=' + older.filter(p => p.role !== 'designer').length);

  // manager видит все (в т.ч. чужой дизайнерский проект)
  r = await req('GET', '/api/projects', null, mTok);
  t('manager видит все проекты', r.status === 200 && (r.json.projects || []).some(p => p.id === pid), 'count=' + (r.json.projects || []).length);

  // демо (без токена) не может писать
  r = await req('POST', '/api/projects', { name: 'X' }, 'demo');
  t('demo-токен не может писать проекты', r.status === 403 || r.status === 401, 'status=' + r.status);

  // logout
  r = await req('POST', '/api/auth/logout', null, mTok);
  t('logout manager', r.status === 200 && r.json.ok, JSON.stringify(r.json));
  r = await req('GET', '/api/auth/me', null, mTok);
  t('после logout сессия мертва', r.status === 401, 'status=' + r.status);

  // неизвестная роль
  r = await req('POST', '/api/auth/login', { role: 'hacker' });
  t('неизвестная роль → 400', r.status === 400, 'status=' + r.status);

  console.log('\nРЕЗУЛЬТАТ: ' + pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });