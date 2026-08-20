'use strict';
/* СИС · Калькулятор — vanilla-приложение, расчёт через серверные API. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
  const fmtMoney = (n) => fmt(n) + ' ₽';
  const parseNum = (v) => {
    if (v == null || v === '') return NaN;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const state = {
    type: null,
    step: 1,
    prices: null,
    result: null,
    opts: {
      spots: 0, chandelier: false, ledStrip: 0, pipeBypass: 0, cornice: 0,
      hatch: 0, vent: 0, niche: 0, soundproof: false, sockets: 0, woodenInserts: 0,
    },
    debounce: null,
    lastPayload: null,
  };

  const els = {};
  const IDS = [
    'in-length', 'in-width', 'in-height', 'in-ceiling-type',
    'field-height', 'field-ceiling-type', 'step-type', 'step-size', 'step-opts', 'step-result',
    'opts-box', 'btn-back-size', 'btn-next-size', 'btn-back-opts', 'btn-next-opts',
    'btn-pdf', 'btn-restart', 'sticky-pdf', 'sticky-cta', 'breakdown', 'grand-total',
    'result-headline', 'result-saving', 'sticky-sum', 'sticky-saving', 'lead-form',
    'lead-name', 'lead-phone', 'lead-consent', 'lead-submit', 'lead-loading', 'lead-success', 'lead-error',
    'calc-loading', 'calc-error', 'sticky', 'toast',
  ];
  function cacheEls() { IDS.forEach(id => els[id] = document.getElementById(id)); }

  const CEILING_OPTS = [
    { key: 'spots', label: 'Встраиваемые светильники', priceKey: 'spot', kind: 'stepper', min: 0, max: 30, unit: 'шт' },
    { key: 'chandelier', label: 'Монтаж люстры', priceKey: 'chandelier', kind: 'toggle' },
    { key: 'ledStrip', label: 'LED-подсветка по периметру', priceKey: 'ledStrip', kind: 'stepper', min: 0, max: 60, unit: 'м' },
    { key: 'pipeBypass', label: 'Обвод трубы отопления', priceKey: 'pipeBypass', kind: 'stepper', min: 0, max: 10, unit: 'шт' },
    { key: 'cornice', label: 'Маскировка карниза', priceKey: 'corniceMask', kind: 'stepper', min: 0, max: 20, unit: 'м' },
    { key: 'hatch', label: 'Ревизионный люк', priceKey: 'hatch', kind: 'stepper', min: 0, max: 5, unit: 'шт' },
    { key: 'vent', label: 'Вентиляционная решётка', priceKey: 'vent', kind: 'stepper', min: 0, max: 5, unit: 'шт' },
    { key: 'niche', label: 'Ниша для штор', priceKey: 'niche', kind: 'stepper', min: 0, max: 10, unit: 'м' },
  ];
  const WALL_OPTS = [
    { key: 'soundproof', label: 'Звукоизоляция «ЮНИТ ПРЕМИУМ»', priceKey: 'soundproof', kind: 'toggle' },
    { key: 'sockets', label: 'Розетки и вырезы', kind: 'stepper', min: 0, max: 20, unit: 'шт' },
    { key: 'woodenInserts', label: 'Деревянные закладные', kind: 'stepper', min: 0, max: 10, unit: 'шт' },
  ];

  function optPrice(key) {
    if (!state.prices) return 0;
    if (key === 'soundproof') return state.prices.sis.soundproofPrice || 0;
    const o = (state.prices.options || []).find(o => o.id === key);
    return o ? o.price : 0;
  }
  function priceByLabel(label) {
    if (!state.prices) return 0;
    const c = (state.prices.ceilingTypes || []).find(c => c.label === label);
    return c ? c.pricePerM2 : 0;
  }
  function profilePrice() { return state.prices && state.prices.profile ? state.prices.profile.price : 0; }

  /* ─── Навигация шагов ─── */
  function showStep(n) {
    state.step = n;
    [1, 2, 3, 4].forEach(i => {
      const sec = els['step-' + ['type', 'size', 'opts', 'result'][i - 1]];
      if (sec) sec.classList.toggle('on', i === n);
      const li = $(`.stepper li[data-step="${i}"]`);
      if (li) {
        li.classList.toggle('active', i === n);
        li.classList.toggle('done', i < n);
      }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectType(type) {
    state.type = type;
    $$('.type-card').forEach(c => c.classList.toggle('selected', c.dataset.type === type));
    els['field-ceiling-type'].classList.toggle('hidden', type === 'walls');
    els['field-height'].classList.toggle('hidden', type === 'ceiling');
    state.result = null;
    state.lastPayload = null;
    renderSticky(false);
    showStep(2);
  }

  /* ─── Шаг 2: размеры ─── */
  function dims() {
    const len = parseNum(els['in-length'].value);
    const wid = parseNum(els['in-width'].value);
    const hgt = parseNum(els['in-height'].value);
    return { len, wid, hgt };
  }
  function dimsValid() {
    const { len, wid, hgt } = dims();
    if (!(len > 0) || !(wid > 0)) return 'Укажите длину и ширину помещения';
    if (state.type !== 'ceiling' && !(hgt > 0)) return 'Укажите высоту потолка';
    return null;
  }
  function gotoOpts() {
    const err = dimsValid();
    if (err) { toast(err, true); return; }
    renderOptions();
    showStep(3);
    scheduleRecalc();
  }
  function markError(el, on) { el.classList.toggle('error', !!on); }

  /* ─── Шаг 3: опции ─── */
  function renderOptions() {
    const box = els['opts-box'];
    box.innerHTML = '';
    const isCeiling = state.type === 'ceiling';
    const isWalls = state.type === 'walls';

    if (isCeiling || state.type === 'combined') {
      box.appendChild(groupTitle('Потолок'));
      CEILING_OPTS.forEach(o => box.appendChild(renderOptRow(o)));
    }
    if (isWalls || state.type === 'combined') {
      box.appendChild(groupTitle('Стены'));
      WALL_OPTS.forEach(o => box.appendChild(renderOptRow(o)));
    }
  }
  function groupTitle(text) {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin:6px 0 2px;';
    d.textContent = text;
    return d;
  }
  function renderOptRow(o) {
    const row = document.createElement('div');
    row.className = 'opt-row';
    const info = document.createElement('div');
    info.className = 'opt-info';
    const name = document.createElement('div');
    name.className = 'o-name';
    name.textContent = o.label;
    const price = document.createElement('div');
    price.className = 'o-price';
    const pp = optPrice(o.priceKey);
    price.textContent = pp > 0 ? (o.kind === 'toggle' ? pp.toLocaleString('ru-RU') + ' ₽ за услугу' : pp.toLocaleString('ru-RU') + ' ₽/' + o.unit) : '';
    info.append(name, price);
    row.appendChild(info);

    if (o.kind === 'toggle') {
      const t = document.createElement('label');
      t.className = 'toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('data-opt', o.key);
      input.checked = !!state.opts[o.key];
      const track = document.createElement('span');
      track.className = 'track';
      const thumb = document.createElement('span');
      thumb.className = 'thumb';
      t.append(input, track, thumb);
      input.addEventListener('change', () => {
        state.opts[o.key] = input.checked;
        scheduleRecalc();
      });
      row.appendChild(t);
    } else {
      const ctl = document.createElement('div');
      ctl.className = 'stepper-ctl';
      const dec = btn('−', () => { setOpt(o.key, Math.max(o.min, state.opts[o.key] - 1)); });
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = state.opts[o.key];
      val.setAttribute('data-val', o.key);
      const inc = btn('+', () => { setOpt(o.key, Math.min(o.max, state.opts[o.key] + 1)); });
      ctl.append(dec, val, inc);
      row.appendChild(ctl);
    }
    return row;
  }
  function btn(label, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  function setOpt(key, value) {
    state.opts[key] = value;
    const val = $(`.val[data-val="${key}"]`);
    if (val) val.textContent = value;
    scheduleRecalc();
  }

  /* ─── Расчёт ─── */
  function scheduleRecalc() {
    clearTimeout(state.debounce);
    state.debounce = setTimeout(recalc, 300);
  }
  async function recalc() {
    if (!state.type) return;
    const err = dimsValid();
    if (err) { renderSticky(false); return; }
    const { len, wid, hgt } = dims();
    const area = len * wid;
    const perimeter = 2 * (len + wid);
    const wallArea = perimeter * hgt;
    const label = els['in-ceiling-type'].value;
    const o = state.opts;
    let payload;
    if (state.type === 'ceiling') {
      payload = {
        ceilingType: label, area, width: len, length: wid,
        spots: o.spots, chandelier: o.chandelier, ledStrip: o.ledStrip, pipeBypass: o.pipeBypass,
        cornice: o.cornice, hatch: o.hatch, vent: o.vent, niche: o.niche,
        skipAI: true, source: 'calculator',
      };
    } else if (state.type === 'walls') {
      payload = {
        perimeter, height: hgt, wallArea, soundproof: o.soundproof,
        sockets: o.sockets > 0 ? [{ type: 1, count: o.sockets }] : [],
        woodenInserts: o.woodenInserts, includeGlue: true, includeSpray: false,
      };
    } else {
      payload = {
        ceilingType: label, area, width: len, length: wid,
        spots: o.spots, chandelier: o.chandelier, ledStrip: o.ledStrip, pipeBypass: o.pipeBypass,
        cornice: o.cornice, hatch: o.hatch, vent: o.vent, niche: o.niche,
        hasWalls: true, wallArea, wallPerimeter: perimeter, wallHeight: hgt, rollWidth: 3.2,
        insulationType: o.soundproof ? 'tonlosAcoustic' : 'none',
        sockets: o.sockets > 0 ? [{ type: 1, count: o.sockets }] : [],
        woodenInserts: o.woodenInserts, includeGlue: true, includeSpray: false,
      };
    }
    state.lastPayload = payload;
    els['calc-loading'].classList.remove('hidden');
    els['calc-error'].classList.add('hidden');
    try {
      const path = state.type === 'ceiling' ? '/api/calculator'
        : state.type === 'walls' ? '/api/walls/calculate' : '/api/calculator/combined';
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      state.result = await r.json();
      renderResult();
      renderSticky(true);
    } catch (e) {
      state.result = null;
      renderSticky(false);
      els['calc-error'].classList.remove('hidden');
    } finally {
      els['calc-loading'].classList.add('hidden');
    }
  }

  /* ─── Отображение результата ─── */
  function splitExtra(line) {
    const m = String(line).match(/^(.*?)\s*=\s*([\d\s]+)\s*₽\s*$/);
    if (m) return { name: m[1].trim(), val: fmtMoney(parseInt(m[2].replace(/\s/g, ''), 10)) };
    return { name: String(line).trim(), val: '' };
  }
  function renderResult() {
    const r = state.result;
    const items = [];
    let total = 0, saving = '';
    const headline = els['result-headline'];

    if (state.type === 'ceiling') {
      headline.textContent = 'Натяжной потолок';
      items.push({ name: 'Полотно · ' + els['in-ceiling-type'].value, val: fmtMoney(r.estimate.canvasPrice) });
      (r.estimate.extras || []).forEach(line => items.push(splitExtra(line)));
      total = r.estimate.total;
    } else if (state.type === 'walls') {
      headline.textContent = 'Бесшовные стены (СИС)';
      (r.materials || []).forEach(m => items.push({ name: m.name + (m.unit ? ' · ' + m.unit : ''), val: fmtMoney(m.total) }));
      total = r.totalClient;
    } else {
      headline.textContent = 'Комплекс «Потолок + стены»';
      items.push({ name: 'Полотно · ' + (r.ceiling.type || els['in-ceiling-type'].value), val: fmtMoney(r.ceiling.breakdown.canvasPrice) });
      (r.ceiling.breakdown.extras || []).forEach(line => items.push(splitExtra(line)));
      (r.walls && r.walls.iksBreakdown || []).forEach(m => items.push({ name: m.name + (m.unit ? ' · ' + m.unit : ''), val: fmtMoney(m.total) }));
      items.push({ name: 'Скидка комплекса (−' + r.combined.discountPercent + '%)', val: '− ' + fmtMoney(r.combined.bundleDiscount), cls: 'discount' });
      total = r.combined.finalTotal;
      saving = (r.messages && r.messages.saving) || '';
    }

    const list = els['breakdown'];
    list.innerHTML = '';
    items.forEach(it => {
      const li = document.createElement('li');
      if (it.cls) li.className = it.cls;
      const nm = document.createElement('span');
      nm.className = 'b-name';
      nm.textContent = it.name;
      const vl = document.createElement('span');
      vl.className = 'b-val';
      vl.textContent = it.val;
      li.append(nm, vl);
      list.appendChild(li);
    });
    els['grand-total'].textContent = fmtMoney(total);
    els['result-saving'].classList.toggle('hidden', !saving);
    els['result-saving'].textContent = saving;
  }

  function renderSticky(show) {
    els['sticky'].classList.toggle('show', !!show);
    if (show && state.result) {
      const total = state.type === 'ceiling' ? state.result.estimate.total
        : state.type === 'walls' ? state.result.totalClient
        : state.result.combined.finalTotal;
      const saving = state.type === 'combined' ? 'экономия ' + fmtMoney(state.result.combined.bundleDiscount) : '';
      els['sticky-sum'].textContent = fmtMoney(total);
      els['sticky-saving'].classList.toggle('hidden', !saving);
      els['sticky-saving'].textContent = saving;
    }
  }

  /* ─── PDF ─── */
  function buildPdfItems() {
    const r = state.result;
    if (!r) return { items: [], grandTotal: 0 };
    const o = state.opts;
    const items = [];
    let grandTotal = 0, discountLabel = '', discountSavings = 0;
    const label = els['in-ceiling-type'].value;

    if (state.type === 'ceiling') {
      const area = parseNum(els['in-length'].value) * parseNum(els['in-width'].value);
      items.push({ name: 'Полотно натяжного потолка · ' + label, quantity: Math.round(area * 100) / 100, unit: 'м²', unitPrice: priceByLabel(label), total: r.estimate.canvasPrice });
      if (o.spots > 0) items.push({ name: 'Встраиваемые светильники', quantity: o.spots, unit: 'шт', unitPrice: optPrice('spot'), total: o.spots * optPrice('spot') });
      if (o.chandelier) items.push({ name: 'Монтаж люстры', quantity: 1, unit: 'шт', unitPrice: optPrice('chandelier'), total: optPrice('chandelier') });
      if (o.ledStrip > 0) items.push({ name: 'LED-подсветка', quantity: o.ledStrip, unit: 'м', unitPrice: optPrice('ledStrip'), total: o.ledStrip * optPrice('ledStrip') });
      if (o.pipeBypass > 0) items.push({ name: 'Обвод трубы отопления', quantity: o.pipeBypass, unit: 'шт', unitPrice: optPrice('pipeBypass'), total: o.pipeBypass * optPrice('pipeBypass') });
      if (o.cornice > 0) items.push({ name: 'Маскировка карниза', quantity: o.cornice, unit: 'м', unitPrice: optPrice('corniceMask'), total: o.cornice * optPrice('corniceMask') });
      if (o.hatch > 0) items.push({ name: 'Ревизионный люк', quantity: o.hatch, unit: 'шт', unitPrice: optPrice('hatch'), total: o.hatch * optPrice('hatch') });
      if (o.vent > 0) items.push({ name: 'Вентиляционная решётка', quantity: o.vent, unit: 'шт', unitPrice: optPrice('vent'), total: o.vent * optPrice('vent') });
      if (o.niche > 0) items.push({ name: 'Ниша для штор', quantity: o.niche, unit: 'м', unitPrice: optPrice('niche'), total: o.niche * optPrice('niche') });
      const per = r.estimate.perimeter || 0;
      items.push({ name: 'Монтажный профиль', quantity: Math.round(per * 100) / 100, unit: 'м', unitPrice: profilePrice(), total: r.estimate.profilePrice });
      grandTotal = r.estimate.total;
    } else if (state.type === 'walls') {
      (r.materials || []).forEach(m => items.push({ name: m.name, quantity: m.quantity, unit: m.unit, unitPrice: m.unitPrice, total: m.total }));
      grandTotal = r.totalClient;
    } else {
      const area = parseNum(els['in-length'].value) * parseNum(els['in-width'].value);
      items.push({ name: 'Полотно натяжного потолка · ' + label, quantity: Math.round(area * 100) / 100, unit: 'м²', unitPrice: priceByLabel(label), total: r.ceiling.breakdown.canvasPrice });
      if (o.spots > 0) items.push({ name: 'Встраиваемые светильники', quantity: o.spots, unit: 'шт', unitPrice: optPrice('spot'), total: o.spots * optPrice('spot') });
      if (o.chandelier) items.push({ name: 'Монтаж люстры', quantity: 1, unit: 'шт', unitPrice: optPrice('chandelier'), total: optPrice('chandelier') });
      if (o.ledStrip > 0) items.push({ name: 'LED-подсветка', quantity: o.ledStrip, unit: 'м', unitPrice: optPrice('ledStrip'), total: o.ledStrip * optPrice('ledStrip') });
      if (o.pipeBypass > 0) items.push({ name: 'Обвод трубы отопления', quantity: o.pipeBypass, unit: 'шт', unitPrice: optPrice('pipeBypass'), total: o.pipeBypass * optPrice('pipeBypass') });
      if (o.cornice > 0) items.push({ name: 'Маскировка карниза', quantity: o.cornice, unit: 'м', unitPrice: optPrice('corniceMask'), total: o.cornice * optPrice('corniceMask') });
      if (o.hatch > 0) items.push({ name: 'Ревизионный люк', quantity: o.hatch, unit: 'шт', unitPrice: optPrice('hatch'), total: o.hatch * optPrice('hatch') });
      if (o.vent > 0) items.push({ name: 'Вентиляционная решётка', quantity: o.vent, unit: 'шт', unitPrice: optPrice('vent'), total: o.vent * optPrice('vent') });
      if (o.niche > 0) items.push({ name: 'Ниша для штор', quantity: o.niche, unit: 'м', unitPrice: optPrice('niche'), total: o.niche * optPrice('niche') });
      items.push({ name: 'Монтажный профиль (потолок)', quantity: Math.round(r.ceiling.breakdown.perimeter * 100) / 100, unit: 'м', unitPrice: profilePrice(), total: r.ceiling.breakdown.profilePrice });
      (r.walls && r.walls.iksBreakdown || []).forEach(m => items.push({ name: m.name, quantity: m.quantity, unit: m.unit, unitPrice: m.total / Math.max(m.quantity, 0.0001), total: m.total }));
      grandTotal = r.combined.finalTotal;
      discountLabel = 'Комплекс −' + r.combined.discountPercent + '%';
      discountSavings = r.combined.bundleDiscount;
    }
    return { items, grandTotal, discountLabel, discountSavings };
  }

  async function downloadPdf() {
    const { items, grandTotal, discountLabel, discountSavings } = buildPdfItems();
    if (!items.length) { toast('Сначала рассчитайте смету', true); return; }
    const title = state.type === 'ceiling' ? 'Смета — натяжной потолок'
      : state.type === 'walls' ? 'Смета — бесшовные стены (СИС)' : 'Смета — комплекс «Потолок + стены»';
    try {
      const r = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, items, grandTotal, upgradesTotal: 0, discountLabel, discountSavings }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'smeta.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Смета скачана');
    } catch (e) {
      toast('Не удалось сформировать PDF', true);
    }
  }

  /* ─── Заявка ─── */
  async function submitLead(e) {
    e.preventDefault();
    const name = els['lead-name'].value.trim();
    const phone = els['lead-phone'].value.replace(/[^\d+]/g, '');
    if (!name) { toast('Укажите имя', true); els['lead-name'].focus(); return; }
    if (phone.replace(/\D/g, '').length < 10) { toast('Укажите корректный телефон', true); els['lead-phone'].focus(); return; }
    if (!els['lead-consent'].checked) { toast('Нужно согласие на обработку данных', true); return; }
    els['lead-submit'].classList.add('hidden');
    els['lead-loading'].classList.remove('hidden');
    els['lead-error'].classList.add('hidden');
    const { len, wid, hgt } = dims();
    const body = {
      name, phone, source: 'calculator',
      productType: state.type === 'ceiling' ? 'ceiling' : state.type === 'walls' ? 'walls' : 'combined',
      ceilingType: state.type === 'walls' ? '' : els['in-ceiling-type'].value,
      area: state.type === 'walls' ? null : Math.round(len * wid * 100) / 100,
      hasWalls: state.type !== 'ceiling',
      wallArea: state.type !== 'ceiling' ? Math.round(2 * (len + wid) * hgt * 100) / 100 : null,
      wallSystem: state.type !== 'ceiling' ? 'sis' : '',
      upgrades: '',
      notes: '',
    };
    try {
      const r = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      els['lead-form'].querySelectorAll('.grid-2, .consent, #lead-submit').forEach(n => n.classList.add('hidden'));
      els['lead-success'].classList.remove('hidden');
      renderSticky(false);
      toast('Заявка отправлена');
    } catch (err) {
      els['lead-submit'].classList.remove('hidden');
      els['lead-loading'].classList.add('hidden');
      els['lead-error'].classList.remove('hidden');
    }
  }

  function resetAll() {
    state.type = null;
    state.result = null;
    state.lastPayload = null;
    Object.keys(state.opts).forEach(k => state.opts[k] = (k === 'chandelier' || k === 'soundproof') ? false : 0);
    ['in-length', 'in-width', 'in-height'].forEach(id => document.getElementById(id).value = '');
    els['lead-form'].classList.remove('hidden');
    els['lead-form'].querySelectorAll('.grid-2, .consent, #lead-submit').forEach(n => n.classList.remove('hidden'));
    els['lead-success'].classList.add('hidden');
    els['lead-error'].classList.add('hidden');
    renderSticky(false);
    $$('.type-card').forEach(c => c.classList.remove('selected'));
    showStep(1);
  }

  /* ─── Toast ─── */
  function toast(msg, isError) {
    els['toast'].textContent = msg;
    els['toast'].classList.toggle('error', !!isError);
    els['toast'].classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els['toast'].classList.remove('show'), 2600);
  }

  /* ─── Инициализация ─── */
  async function init() {
    cacheEls();
    bind();
    try {
      const r = await fetch('/api/prices');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      state.prices = await r.json();
      populateCeilingTypes();
      updateHints();
      scheduleRecalc();
    } catch (e) {
      els['calc-error'].classList.remove('hidden');
    }
  }

  function populateCeilingTypes() {
    const sel = els['in-ceiling-type'];
    sel.innerHTML = '';
    (state.prices.ceilingTypes || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.label;
      opt.textContent = c.label + ' — ' + c.pricePerM2.toLocaleString('ru-RU') + ' ₽/м²';
      sel.appendChild(opt);
    });
    if (!sel.value) sel.value = (state.prices.ceilingTypes || [])[0]?.label || '';
  }

  function updateHints() {
    const minCeil = (state.prices.ceilingTypes || []).reduce((m, c) => Math.min(m, c.pricePerM2), Infinity);
    if (Number.isFinite(minCeil)) {
      const h = $('.type-card[data-type="ceiling"] .t-price');
      if (h) h.textContent = 'от ' + minCeil.toLocaleString('ru-RU') + ' ₽/м²';
    }
    const wp = state.prices.iks && state.prices.iks.wallpaperPerSqm || 0;
    const inst = state.prices.iksInstall && state.prices.iksInstall.fabricPerSqm && state.prices.iksInstall.fabricPerSqm.clientRate || 0;
    if (wp + inst > 0) {
      const h = $('.type-card[data-type="walls"] .t-price');
      if (h) h.textContent = 'от ' + (wp + inst).toLocaleString('ru-RU') + ' ₽/м²';
    }
  }

  function bind() {
    $$('.type-card').forEach(c => c.addEventListener('click', () => selectType(c.dataset.type)));

    els['btn-back-size'].addEventListener('click', () => showStep(1));
    els['btn-next-size'].addEventListener('click', gotoOpts);
    els['btn-back-opts'].addEventListener('click', () => showStep(2));
    els['btn-next-opts'].addEventListener('click', () => { recalc(); showStep(4); });

    ['in-length', 'in-width', 'in-height'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        markError(document.getElementById(id), false);
        scheduleRecalc();
      });
    });
    els['in-ceiling-type'].addEventListener('change', scheduleRecalc);

    els['btn-pdf'].addEventListener('click', downloadPdf);
    els['sticky-pdf'].addEventListener('click', downloadPdf);
    els['sticky-cta'].addEventListener('click', () => {
      showStep(4);
      $('.lead').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    els['btn-restart'].addEventListener('click', resetAll);
    els['lead-form'].addEventListener('submit', submitLead);

    els['lead-phone'].addEventListener('input', () => {
      const v = els['lead-phone'].value.replace(/[^\d+]/g, '').slice(0, 16);
      els['lead-phone'].value = v;
    });
  }

  window.CalcApp = { recalc, resetAll };
  document.addEventListener('DOMContentLoaded', init);
})();