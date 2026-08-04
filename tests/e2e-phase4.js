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
  // Менеджер: создать проект для клиента с телефоном
  let r = await req('POST', '/api/auth/login', { role: 'manager', accessKey: 'demo' });
  const mTok = r.json.token;

  // создать проект клиента
  r = await req('POST', '/api/projects', {
    name: 'Квартира клиента 555', address: 'Ленина 5',
    customer: { name: 'Пётр Клиентов', phone: '+79160005555' },
    role: 'designer',
  }, mTok);
  t('manager создаёт проект', r.status === 201 && r.json.project.id, 'status=' + r.status);
  const pid = r.json.project.id;

  // довести до install
  await req('PATCH', `/api/projects/${pid}/status`, { status: 'quoted' }, mTok);
  await req('PATCH', `/api/projects/${pid}/status`, { status: 'paid' }, mTok);
  await req('PATCH', `/api/projects/${pid}/status`, { status: 'supply' }, mTok);
  r = await req('PATCH', `/api/projects/${pid}/status`, { status: 'install' }, mTok);
  t('проект доведён до install', r.json.project && r.json.project.status === 'install', JSON.stringify(r.json).slice(0,80));

  // Монтажник: login, должен увидеть проект в install? Нет — только назначенные.
  r = await req('POST', '/api/auth/login', { role: 'installer', phone: '+79160005555', code: '0000' });
  const iTok = r.json.token;
  r = await req('GET', '/api/projects', null, iTok);
  t('монтажник видит проекты только назначенные (пока ни одного)', (r.json.projects || []).every(p => p.role === 'installer' || p.assigned && p.assigned.installer), 'count=' + (r.json.projects || []).length);

  // Менеджер назначает монтажника
  r = await req('PUT', `/api/projects/${pid}`, { assigned: { installer: '+79160005555' } }, mTok);
  t('менеджер назначает монтажника', r.status === 200, 'status=' + r.status);

  r = await req('GET', '/api/projects', null, iTok);
  t('после назначения монтажник видит проект', (r.json.projects || []).some(p => p.id === pid), 'count=' + (r.json.projects || []).length);

  // Клиент: вход по телефону, должен видеть проект
  r = await req('POST', '/api/client/code', { phone: '+79160005555' });
  r = await req('POST', '/api/client/login', { phone: '+79160005555', code: '0000' });
  t('клиент логинится', r.status === 200 && r.json.ok, JSON.stringify(r.json).slice(0,60));
  const cTok = r.json.token;

  r = await req('GET', '/api/client/orders?token=' + encodeURIComponent(cTok));
  t('клиент видит свои проекты в orders', r.status === 200 && (r.json.clientProjects || []).some(p => p.id === pid), 'projects=' + (r.json.clientProjects || []).length);

  // Монтажник сдаёт install → done
  r = await req('PATCH', `/api/projects/${pid}/status`, { status: 'done', comment: 'Сдан' }, iTok);
  t('монтажник сдаёт проект (install → done)', r.json.project && r.json.project.status === 'done', JSON.stringify(r.json).slice(0,80));

  // Клиент видит статус done
  r = await req('GET', '/api/client/orders?token=' + encodeURIComponent(cTok));
  const cp = (r.json.clientProjects || []).find(p => p.id === pid);
  t('клиент видит статус done', cp && cp.status === 'done', 'status=' + (cp && cp.status));

  // Менеджер: список с фильтром по статусу
  r = await req('GET', '/api/projects?status=done', null, mTok);
  t('менеджер фильтрует проекты по статусу done', (r.json.projects || []).some(p => p.id === pid), 'count=' + (r.json.projects || []).length);

  // Менеджер: назначение дилера
  r = await req('PUT', `/api/projects/${pid}`, { assigned: { dealer: 'ООО СтройМатериалы' } }, mTok);
  r = await req('GET', `/api/projects/${pid}`, null, mTok);
  t('менеджер назначает дилера', r.json.project.assigned.dealer === 'ООО СтройМатериалы', JSON.stringify(r.json.project.assigned));

  console.log('\nРЕЗУЛЬТАТ: ' + pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });