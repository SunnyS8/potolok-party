const BASE = process.env.FLUX_TEST_BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
async function req(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

(async () => {
  // GET /api/projects пустой
  let r = await req('GET', '/api/projects');
  t('GET /api/projects возвращает statuses', r.status === 200 && Array.isArray(r.json.projects) && r.json.statuses.length === 7, 'status=' + r.status + ' len=' + (r.json.projects || []).length);

  // создание (роль по умолчанию — manager, т.к. без AUTH_TOKEN)
  r = await req('POST', '/api/projects', {
    name: 'Квартира', address: 'Ленина 12', customer: { name: 'Иван', phone: '+79990000001' },
    pricingLevel: 'retail',
  });
  t('POST /api/projects создаёт', r.status === 201 && r.json.project.id, 'status=' + r.status);
  const id = r.json.project.id;

  // добавление позиции
  r = await req('POST', `/api/projects/${id}/items`, { type: 'wall', label: 'Стена', qty: 10, unit: 'м²', price: 3590 });
  t('POST items добавляет позицию', r.status === 201 && r.json.item && r.json.project.totals.retail > 0, 'status=' + r.status);

  // смена статуса (role=manager через demo? нет — без токена роль manager)
  r = await req('PATCH', `/api/projects/${id}/status`, { status: 'quoted', comment: 'КП выдано' });
  t('PATCH status → quoted', r.status === 200 && r.json.project.status === 'quoted', JSON.stringify(r.json));

  // демо-роль: только чтение (demo не может менять)
  r = await req('PATCH', `/api/projects/${id}/status`, { status: 'paid' }, 'demo');
  t('demo не может менять статус (403/401)', r.status === 403 || r.status === 401, 'status=' + r.status);

  // клиентский путь: оплата через клиента невозможна в этом API (нет роли), проверим stats
  r = await req('GET', '/api/projects/stats');
  t('GET /api/projects/stats', r.status === 200 && r.json.total >= 1, JSON.stringify(r.json));

  // получение одного
  r = await req('GET', `/api/projects/${id}`);
  t('GET /api/projects/:id', r.status === 200 && r.json.project.id === id, 'status=' + r.status);

  // обновление
  r = await req('PUT', `/api/projects/${id}`, { name: 'Квартира обновлённая' });
  t('PUT /api/projects/:id', r.status === 200 && r.json.project.name === 'Квартира обновлённая', JSON.stringify(r.json));

  // несуществующий
  r = await req('GET', '/api/projects/999999');
  t('GET неизвестного проекта → 404', r.status === 404, 'status=' + r.status);

  // удаление
  r = await req('DELETE', `/api/projects/${id}`);
  t('DELETE /api/projects/:id', r.status === 200 && r.json.ok === true, 'status=' + r.status);

  console.log('\nРЕЗУЛЬТАТ API: ' + pass + ' ok, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });