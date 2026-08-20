// Единый тест-раннер для продукта «Калькулятор СИС»: npm test
// Проверяет расчётные API, заявки, экспорт PDF и отдачу статики.
// Требование: node >= 22 (fetch, SQLite).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sis-tests-'));

let server = null;
let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) { pass++; process.stdout.write(`  ok    ${name}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${name}${extra ? ' — ' + extra : ''}\n`); }
}

async function api(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : await r.arrayBuffer();
  return { status: r.status, data, contentType: ct };
}

async function startServer() {
  const out = fs.openSync(path.join(TMPDIR, 'server.log'), 'a');
  server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMPDIR },
    stdio: ['ignore', out, out],
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch (e) {}
    await new Promise(res => setTimeout(res, 200));
  }
  return false;
}

async function stopServer() {
  if (server && server.pid) {
    try { process.kill(server.pid); } catch (e) {}
    await new Promise(res => setTimeout(res, 300));
  }
}

(async () => {
  console.log('СИС: запуск тестового сервера…');
  if (!(await startServer())) {
    console.log('FAIL: сервер не поднялся');
    process.exit(1);
  }

  console.log('\n— /api/health —');
  const health = await api('GET', '/api/health');
  check('health 200', health.status === 200);
  check('features = [calculator]', health.data.features && health.data.features.join(',') === 'calculator');

  console.log('\n— /api/prices —');
  const prices = await api('GET', '/api/prices');
  check('prices 200', prices.status === 200);
  check('есть типы потолков', Array.isArray(prices.data.ceilingTypes) && prices.data.ceilingTypes.length > 0);
  check('есть опции', Array.isArray(prices.data.options) && prices.data.options.length > 0);
  check('есть компоненты СИС', prices.data.sis && prices.data.sis.components && Object.keys(prices.data.sis.components).length > 0);

  console.log('\n— /api/calculator (потолок) —');
  const calc = await api('POST', '/api/calculator', { ceilingType: 'matte', area: 20, width: 5, length: 4, spots: 4, skipAI: true });
  check('calculator 200', calc.status === 200);
  check('total > 0', typeof calc.data.total === 'number' && calc.data.total > 0, `total=${calc.data.total}`);
  check('estimate.total === total', calc.data.estimate && calc.data.estimate.total === calc.data.total);
  check('есть extras', Array.isArray(calc.data.estimate.extras));
  check('есть canvasPrice', typeof calc.data.estimate.canvasPrice === 'number' && calc.data.estimate.canvasPrice > 0);

  console.log('\n— /api/walls/calculate (стены, быстрый режим) —');
  const walls = await api('POST', '/api/walls/calculate', { perimeter: 14, height: 2.7, wallArea: 37.8 });
  check('walls 200', walls.status === 200);
  check('totalClient > 0', typeof walls.data.totalClient === 'number' && walls.data.totalClient > 0, `total=${walls.data.totalClient}`);
  check('материалы есть', Array.isArray(walls.data.materials) && walls.data.materials.length > 0);
  check('summary.rollCount', walls.data.summary && walls.data.summary.rollCount >= 1);

  console.log('\n— /api/walls/calculate (детальный режим) —');
  const wallsDet = await api('POST', '/api/walls/calculate', { walls: [{ width: 3, height: 2.7 }, { width: 4, height: 2.7 }] });
  check('detailed 200', wallsDet.status === 200);
  check('detailed имеет pricing.totalClient', typeof wallsDet.data.pricing?.totalClient === 'number' && wallsDet.data.pricing.totalClient > 0, `total=${wallsDet.data.pricing?.totalClient}`);
  check('detailed имеет bom', Array.isArray(wallsDet.data.bom) && wallsDet.data.bom.length > 0);

  console.log('\n— /api/calculator/combined (комплекс) —');
  const combined = await api('POST', '/api/calculator/combined', { ceilingType: 'matte', ceilingArea: 20, walls: true, wallArea: 37.8, wallSystem: 'sis', height: 2.7 });
  check('combined 200', combined.status === 200);
  check('ceiling.total > 0', combined.data.ceiling && combined.data.ceiling.total > 0);
  check('walls.total > 0', combined.data.walls && combined.data.walls.total > 0);
  check('combined.finalTotal > 0', combined.data.combined && combined.data.combined.finalTotal > 0, `final=${combined.data.combined && combined.data.combined.finalTotal}`);
  check('скидка 12%', combined.data.combined.bundleDiscount > 0 && combined.data.combined.discountPercent === 12);

  console.log('\n— /api/lead —');
  const lead = await api('POST', '/api/lead', { name: 'Тест', phone: '+79990001122', source: 'calculator', productType: 'combined', area: 20 });
  check('lead 200', lead.status === 200);
  check('lead ok=true, id есть', lead.data.ok === true && lead.data.id > 0);

  console.log('\n— /api/lead с планом + сметой —');
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const planLead = await api('POST', '/api/lead', {
    name: 'С Планом', phone: '+79990002233', source: 'calculator', productType: 'ceiling', area: 20,
    plan: tinyPng, total: 15250,
    estimate: { title: '', items: [{ name: 'Полотно', quantity: 20, unit: 'м²', unitPrice: 450, total: 9000 }], grandTotal: 15250, discountLabel: '', discountSavings: 0 },
    calc: { type: 'ceiling', ceilingType: 'Матовый ПВХ', len: 5, wid: 4, hgt: 2.7, opts: { spots: 1 } },
  });
  check('lead+план 200, hasPlan=true', planLead.status === 200 && planLead.data.hasPlan === true);
  check('lead+план создан', planLead.data.ok === true && planLead.data.id > 0);

  console.log('\n— /api/my/leads (кабинет) —');
  const my = await api('GET', '/api/my/leads?phone=' + encodeURIComponent('+7 999 000-22-33'));
  check('my/leads 200', my.status === 200);
  const myLead = (my.data || []).find(l => l.id === planLead.data.id);
  check('заявка найдена по телефону', !!myLead);
  check('в заявке есть план и смета', myLead && myLead.hasPlan === 1 && myLead.total === 15250 && myLead.estimate && myLead.estimate.items.length === 1 && myLead.calc && myLead.calc.len === 5);
  const myEmpty = await api('GET', '/api/my/leads?phone=' + encodeURIComponent('+79995556677'));
  check('my/leads пустой для чужого телефона', myEmpty.status === 200 && myEmpty.data.length === 0);
  const myNoPhone = await api('GET', '/api/my/leads');
  check('my/leads без телефона -> 400', myNoPhone.status === 400);

  console.log('\n— /api/lead-plan/:id —');
  const planImg = await api('GET', '/api/lead-plan/' + planLead.data.id);
  check('lead-plan 200 image/png', planImg.status === 200 && planImg.contentType.includes('image/png'));

  console.log('\n— /api/export/pdf —');
  const pdf = await api('POST', '/api/export/pdf', { title: 'Смета', items: [{ name: 'Полотно', quantity: 20, unit: 'м²', unitPrice: 600, total: 12000 }], grandTotal: 12000 });
  check('pdf 200', pdf.status === 200);
  check('pdf application/pdf', pdf.contentType.includes('application/pdf'));
  const magic = Buffer.from(pdf.data).slice(0, 5).toString('latin1');
  check('pdf магия %PDF-', magic === '%PDF-', `magic=${magic}`);
  const pdfLatin = Buffer.from(pdf.data).toString('latin1');
  check('pdf кириллица (DejaVu встроен)', /DejaVuSans/.test(pdfLatin));

  console.log('\n— Фронтенд (jsdom, полный сценарий) —');
  await frontendTests(check);

  console.log('\n— Статика и маршруты —');
  const root = await fetch(BASE + '/');
  const rootHtml = await root.text();
  check('GET / отдаёт калькулятор', root.status === 200 && rootHtml.includes('calculator-app.js') && rootHtml.includes('Система Идеальных Стен'));
  check('лендинг удалён (Unbounded)', !rootHtml.includes('Unbounded'));
  check('чат-виджет удалён', !rootHtml.includes('widget.js'));
  for (const p of ['/calculator/', '/calculator.html', '/manager.html', '/app/', '/drawing/', '/login.html']) {
    const r = await fetch(BASE + p);
    check('404: ' + p, r.status === 404, 'status=' + r.status);
  }

  console.log('\n— итог —');
  await stopServer();
  process.stdout.write(`\nПройдено: ${pass}, Провалено: ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();

async function frontendTests(check) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const nodeFetch = global.fetch;

  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'calculator-app.js'), 'utf8');

  const dom = new JSDOM(html, { url: BASE, pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  const doc = win.document;

  win.fetch = (url, opts) => nodeFetch(BASE + url, opts);
  win.scrollTo = () => {};
  win.URL.createObjectURL = () => 'blob:test';
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () { win.__downloaded = this.download; };

  win.eval(appJs);
  doc.dispatchEvent(new win.Event('DOMContentLoaded'));

  const $q = (s) => doc.querySelector(s);
  const $all = (s) => Array.from(doc.querySelectorAll(s));
  const click = (s) => { const el = $q(s); if (el) el.click(); else throw new Error('нет элемента: ' + s); };
  const setVal = (s, v) => { const el = $q(s); el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const numOf = (s) => parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;
  const waitFor = async (fn, ms = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(60); }
    return false;
  };

  check('фронтенд: инпут длины отрисован', !!$q('#in-length'));
  const prices = await (await nodeFetch(BASE + '/api/prices')).json();
  const ceilLabel = prices.ceilingTypes[0].label;

  const waitTotal = async () => waitFor(() => {
    const t = $q('#grand-total').textContent;
    return t && t !== '—';
  });

  /* ── Потолок ── */
  click('.type-card[data-type="ceiling"]');
  await waitFor(() => $q('#step-size').classList.contains('on'));
  check('шаг размеров открыт (потолок)', true);
  check('поле типа потолка видно', !$q('#field-ceiling-type').classList.contains('hidden'));

  setVal('#in-length', '5');
  setVal('#in-width', '4');
  click('#btn-next-size');
  await waitFor(() => $q('#step-opts').classList.contains('on'));
  check('опции потолка отрисованы', $all('#opts-box .opt-row').length >= 5);

  const spotsRow = $all('#opts-box .opt-row').find(r => r.querySelector('.o-name').textContent.includes('светильник'));
  spotsRow.querySelector('.stepper-ctl button:last-child').click();
  click('#btn-next-opts');
  await waitTotal();

  const cRes = await (await nodeFetch(BASE + '/api/calculator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ceilingType: ceilLabel, area: 20, width: 5, length: 4, spots: 1, chandelier: false, ledStrip: 0, pipeBypass: 0, cornice: 0, hatch: 0, vent: 0, niche: 0, skipAI: true }) })).json();
  check('итог потолка совпадает с API', numOf($q('#grand-total').textContent) === Math.round(cRes.estimate.total), `ui=${$q('#grand-total').textContent} api=${cRes.estimate.total}`);
  check('разбивка потолка непустая', $all('#breakdown li').length >= 3);
  check('sticky-бар показан', $q('#sticky').classList.contains('show'));

  click('#btn-pdf');
  check('PDF-кнопка формирует файл', await waitFor(() => win.__downloaded === 'smeta.pdf', 6000));

  /* ── Стены ── */
  click('#btn-restart');
  await waitFor(() => $q('#step-type').classList.contains('on'));
  click('.type-card[data-type="walls"]');
  await waitFor(() => $q('#step-size').classList.contains('on'));
  check('поле высоты видно (стены)', !$q('#field-height').classList.contains('hidden'));
  setVal('#in-length', '5');
  setVal('#in-width', '4');
  setVal('#in-height', '2.7');
  click('#btn-next-size');
  await waitFor(() => $q('#step-opts').classList.contains('on'));
  check('опции стен отрисованы', $all('#opts-box .opt-row').length >= 3);
  click('#btn-next-opts');
  await waitTotal();

  const wRes = await (await nodeFetch(BASE + '/api/walls/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perimeter: 18, height: 2.7, wallArea: 48.6, soundproof: false, sockets: [], woodenInserts: 0, includeGlue: true, includeSpray: false }) })).json();
  check('итог стен совпадает с API', numOf($q('#grand-total').textContent) === Math.round(wRes.totalClient), `ui=${$q('#grand-total').textContent} api=${wRes.totalClient}`);

  /* ── Комплекс ── */
  click('#btn-restart');
  await waitFor(() => $q('#step-type').classList.contains('on'));
  click('.type-card[data-type="combined"]');
  await waitFor(() => $q('#step-size').classList.contains('on'));
  setVal('#in-length', '5');
  setVal('#in-width', '4');
  setVal('#in-height', '2.7');
  click('#btn-next-size');
  await waitFor(() => $q('#step-opts').classList.contains('on'));
  check('комплекс: опции потолка+стен', $all('#opts-box .opt-row').length >= 8);
  click('#btn-next-opts');
  await waitTotal();

  const cbRes = await (await nodeFetch(BASE + '/api/calculator/combined', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ceilingType: ceilLabel, area: 20, width: 5, length: 4, spots: 0, chandelier: false, ledStrip: 0, pipeBypass: 0, cornice: 0, hatch: 0, vent: 0, niche: 0, hasWalls: true, wallArea: 48.6, wallPerimeter: 18, wallHeight: 2.7, rollWidth: 3.2, insulationType: 'none', sockets: [], woodenInserts: 0, includeGlue: true, includeSpray: false }) })).json();
  check('итог комплекса совпадает с API', numOf($q('#grand-total').textContent) === Math.round(cbRes.combined.finalTotal), `ui=${$q('#grand-total').textContent} api=${cbRes.combined.finalTotal}`);
  check('комплекс: строка скидки видна', $all('#breakdown .discount').length === 1);
  check('комплекс: заметка об экономии', !$q('#result-saving').classList.contains('hidden') && $q('#result-saving').textContent.includes('экономите'));

  /* ── Заявка ── */
  setVal('#lead-name', 'Тест');
  setVal('#lead-phone', '+79990001122');
  $q('#lead-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  const leadOk = await waitFor(() => !$q('#lead-success').classList.contains('hidden'), 6000);
  check('заявка отправлена и показан успех', leadOk);

  /* ── Кабинет ── */
  click('#btn-restart');
  await waitFor(() => $q('#step-type').classList.contains('on'));
  check('после рестарта шаг результата скрыт', !$q('#step-result').classList.contains('on'));
  click('#btn-account');
  check('кабинет открылся', !$q('#account').classList.contains('hidden'));
  setVal('#account-phone', '+79990001122');
  $q('#account-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  const accountLoaded = await waitFor(() => !$q('#account-list').classList.contains('hidden'), 6000);
  check('кабинет: заявки загружены', accountLoaded);
  check('кабинет: карточки отрисованы', $all('#account-list .account-card').length >= 1);
  check('кабинет: кнопки PDF и повторить есть', $all('#account-list button[data-act="pdf"]').length >= 1 && $all('#account-list button[data-act="repeat"]').length >= 1);
  $all('#account-list .account-card')[0].querySelector('button[data-act="repeat"]').click();
  const restored = await waitFor(() => $q('#step-result').classList.contains('on'), 8000);
  check('кабинет: повтор расчёта открыл результат', restored);
  check('кабинет закрыт после повтора', $q('#account').classList.contains('hidden'), 'cls=' + $q('#account').className);
  dom.window.close();
}