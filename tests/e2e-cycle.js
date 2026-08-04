const BASE = process.env.FLUX_TEST_BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? ' :: ' + extra : '')); }
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}

// Входы всех ролей
async function login(role, accessKey) {
  const body = role === 'manager' ? { role, accessKey } : { role, phone: '+79990000000', code: '0000' };
  const r = await api('POST', '/api/auth/login', body);
  return r.json.token || null;
}

async function clientLogin() {
  await api('POST', '/api/client/code', { phone: '+79990000000' });
  const r = await api('POST', '/api/client/login', { phone: '+79990000000', code: '0000' });
  return r.json.token || null;
}

(async () => {
  console.log('— Вход всех ролей —');
  const mgr = await login('manager', 'demo');
  const dsg = await login('designer');
  const cln = await clientLogin();
  const dlr = await login('dealer');
  const ins = await login('installer');
  ok('менеджер вошёл', !!mgr);
  ok('дизайнер вошёл', !!dsg);
  ok('клиент вошёл', !!cln);
  ok('дилер вошёл', !!dlr);
  ok('монтажник вошёл', !!ins);

  console.log('— Шаг 1. Дизайнер создаёт проект и выдаёт КП —');
  const r = await api('POST', '/api/projects', {
    name: 'E2E-квартира', address: 'Тестовая, 1',
    customer: { name: 'Иван E2E', phone: '+79990000000' },
    pricingLevel: 'retail',
  }, dsg);
  ok('проект создан дизайнером', r.status === 201, 'status=' + r.status);
  const project = r.json.project;
  ok('статус design', project.status === 'design', project.status);

  const r2 = await api('POST', '/api/projects/' + project.id + '/items', { type: 'ceiling', label: 'Потолок 15 м²', qty: 15, unit: 'м', price: 3590 }, dsg);
  ok('позиция добавлена', r2.status === 201);
  const t = r2.json.project.totals;
  ok('totals посчитаны', t && t.retail === 15 * 3590, 'retail=' + (t && t.retail));

  const r3 = await api('PATCH', '/api/projects/' + project.id + '/status', { status: 'quoted' }, dsg);
  ok('дизайнер выдал КП (design→quoted)', r3.status === 200 && r3.json.project.status === 'quoted', JSON.stringify(r3.json));

  console.log('— Шаг 2. Клиент видит проект и оплачивает —');
  const r4 = await api('GET', '/api/client/orders?token=' + encodeURIComponent(cln));
  ok('клиент видит проект в кабинете', (r4.json.clientProjects || []).some(p => p.id === project.id), 'projects=' + (r4.json.clientProjects || []).length);
  const r5 = await api('POST', '/api/client/projects/' + project.id + '/pay?token=' + encodeURIComponent(cln));
  ok('клиент оплатил (quoted→paid)', r5.status === 200 && r5.json.project.status === 'paid', JSON.stringify(r5.json));
  const r5b = await api('POST', '/api/client/projects/' + project.id + '/pay?token=' + encodeURIComponent(cln));
  ok('повторная оплата невозможна (уже paid)', r5b.status === 400, JSON.stringify(r5b.json));

  console.log('— Шаг 3. Менеджер запускает закупку —');
  const r6 = await api('PATCH', '/api/projects/' + project.id + '/status', { status: 'supply' }, mgr);
  ok('менеджер перевёл в закупку (paid→supply)', r6.status === 200 && r6.json.project.status === 'supply', JSON.stringify(r6.json));
  const r6b = await api('PUT', '/api/projects/' + project.id, { assigned: { dealer: 'ИП Петров', installer: 'Бригада А' } }, mgr);
  ok('менеджер назначил дилера и монтажника', r6b.status === 200 && r6b.json.project.assigned.installer === 'Бригада А');

  console.log('— Шаг 4. Дилер отгружает, монтажник сдаёт —');
  const r7 = await api('PATCH', '/api/projects/' + project.id + '/status', { status: 'install' }, dlr);
  ok('дилер отгрузил (supply→install)', r7.status === 200 && r7.json.project.status === 'install', JSON.stringify(r7.json));
  const r8 = await api('PATCH', '/api/projects/' + project.id + '/status', { status: 'done' }, ins);
  ok('монтажник сдал (install→done)', r8.status === 200 && r8.json.project.status === 'done', JSON.stringify(r8.json));

  console.log('— Шаг 5. Клиент видит «Сдан», менеджер архивирует —');
  const r9 = await api('GET', '/api/client/orders?token=' + encodeURIComponent(cln));
  const cp = (r9.json.clientProjects || []).find(p => p.id === project.id);
  ok('клиент видит статус done', cp && cp.status === 'done', 'status=' + (cp && cp.status));
  const r10 = await api('PATCH', '/api/projects/' + project.id + '/status', { status: 'archive' }, mgr);
  ok('менеджер архивировал (done→archive)', r10.status === 200 && r10.json.project.status === 'archive', JSON.stringify(r10.json));

  console.log('— Негативные сценарии (права ролей) —');
  const r11 = await api('PATCH', '/api/projects/' + project.id + '/status', { status: 'paid' }, dsg);
  ok('дизайнер НЕ может оплатить из archive', r11.status === 400, 'status=' + r11.status + ' err=' + (r11.json.error || ''));

  // Свежий проект: клиент пытается оплатить чужой проект
  const r12 = await api('POST', '/api/projects', { name: 'Чужой проект', customer: { name: 'Пётр', phone: '+79991112233' } }, dsg);
  const p2 = r12.json.project;
  const r13 = await api('POST', '/api/client/projects/' + p2.id + '/pay?token=' + encodeURIComponent(cln));
  ok('клиент НЕ может оплатить чужой проект', r13.status === 400, 'status=' + r13.status + ' err=' + (r13.json.error || ''));
  const r14 = await api('PATCH', '/api/projects/' + p2.id + '/status', { status: 'install' }, cln);
  ok('нельзя пропустить этапы (design→install сразу)', r14.status === 400, 'status=' + r14.status + ' err=' + (r14.json.error || ''));
  const r15 = await api('DELETE', '/api/projects/' + p2.id, {}, dlr);
  ok('дилер НЕ может удалить проект', r15.status === 401 || r15.status === 400, 'status=' + r15.status);
  const r16 = await api('DELETE', '/api/projects/' + p2.id, {}, mgr);
  ok('менеджер удаляет проект', r16.status === 200 && r16.json.ok === true);

  console.log('\nРЕЗУЛЬТАТ: ' + pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });