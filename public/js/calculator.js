let activeTab = 'ceiling';
let lastCalcId = null;
let wallPrices = null;
let upgradesData = [];
let baseTotal = 0;

// Load prices from server
fetch('/api/prices').then(r => r.json()).then(d => {
  wallPrices = d.walls || null;
  if (d.upgrades) upgradesData = d.upgrades;
}).catch(() => {});

function isCombined() { return activeTab === 'combined'; }
function isWalls() { return activeTab === 'walls'; }
function isCeiling() { return activeTab === 'ceiling'; }

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    activeTab = tab.dataset.tab;
    document.getElementById('result').classList.remove('show');
    document.getElementById('leadForm').style.display = 'none';
  });
});

// Expand lead form after result
function showLeadForm() { document.getElementById('leadForm').style.display = 'block'; }

// Sliders
function bindSlider(id, displayId, suffix) {
  const slider = document.getElementById(id);
  const display = document.getElementById(displayId);
  if (slider && display) {
    slider.addEventListener('input', () => { display.textContent = slider.value + ' ' + suffix; });
  }
}
bindSlider('areaSlider', 'areaValue', 'м²');
bindSlider('wallAreaSlider', 'wallAreaValue', 'м²');
bindSlider('perimeterSlider', 'perimeterValue', 'м');
bindSlider('combinedAreaSlider', 'combinedAreaValue', 'м²');
bindSlider('combinedWallSlider', 'combinedWallValue', 'м²');
bindSlider('combinedPerimeterSlider', 'combinedPerimeterValue', 'м');

// Option toggles
document.querySelectorAll('.option-item').forEach(item => {
  item.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    item.classList.toggle('active');
  });
});

// Color pickers
function initColorPicker(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.color-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.color-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });
}
initColorPicker('tab-walls');
initColorPicker('combinedProfileColor');

// Parse query params
const params = new URLSearchParams(window.location.search);
if (params.get('tab') === 'combined' || params.get('tab') === 'walls') {
  const target = params.get('tab');
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.tab === target) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    if (c.id === 'tab-' + target) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
  activeTab = target;
}

// Calc button
document.getElementById('calcBtn').addEventListener('click', async () => {
  const loading = document.getElementById('loading');
  const result = document.getElementById('result');
  loading.classList.add('show');
  result.classList.remove('show');
  document.getElementById('leadForm').style.display = 'none';
  lastCalcId = null;

  try {
    if (isCeiling()) await calcCeiling();
    else if (isWalls()) await calcWalls();
    else await calcCombined();
    showLeadForm();
  } catch (err) {
    result.textContent = 'Ошибка расчёта. Попробуйте ещё раз.';
    result.classList.add('show');
  } finally {
    loading.classList.remove('show');
  }
});

function getActiveOptions(prefix) {
  const opts = [];
  document.querySelectorAll('#' + prefix + ' .option-item.active').forEach(item => {
    const opt = item.dataset.option;
    const input = item.querySelector('input');
    const val = input ? input.value : '1';
    if (opt === 'lights') opts.push({ name: 'Встраиваемые светильники', value: val, id: 'lights' });
    if (opt === 'chandelier') opts.push({ name: 'Монтаж люстры', value: '1', id: 'chandelier' });
    if (opt === 'pipes') opts.push({ name: 'Обвод труб', value: val, id: 'pipes' });
    if (opt === 'cornice') opts.push({ name: 'Маскировка карниза', value: val, id: 'cornice' });
  });
  return opts;
}

function fmt(n) { return (n || 0).toLocaleString('ru-RU'); }
function roundTo(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function calcCeiling() {
  const ceilingType = document.getElementById('ceilingType').value;
  const area = parseFloat(document.getElementById('areaSlider').value);
  const options = getActiveOptions('tab-ceiling');
  const optMap = Object.fromEntries(options.map(o => [o.id, o.value]));

  const res = await fetch('/api/calculator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ceilingType,
      area,
      options,
      spots: parseInt(optMap['lights']) || 0,
      chandelier: optMap.hasOwnProperty('chandelier'),
      pipeBypass: parseInt(optMap['pipes']) || 0,
      cornice: parseFloat(optMap['cornice']) || 0,
      ledStrip: parseFloat(optMap['ledStrip']) || 0,
      hatch: parseInt(optMap['hatch']) || 0,
      vent: parseInt(optMap['vent']) || 0,
      niche: parseFloat(optMap['niche']) || 0,
    })
  });
  const data = await res.json();
  if (data.calcId) lastCalcId = data.calcId;

  const resultNode = document.getElementById('result');
  const html = [];
  if (data.total !== undefined) {
    html.push('<div style="margin-bottom:18px;padding:18px;background:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0;">');
    html.push('<div style="font-size:14px;color:#475569;margin-bottom:10px;">Ориентировочная смета</div>');
    html.push('<div style="display:grid;grid-template-columns:1fr auto;gap:10px;font-size:14px;color:#334155;line-height:1.75;">');
    html.push('<div>Полотно:</div><div>' + (data.canvasPrice || 0).toLocaleString('ru-RU') + ' ₽</div>');
    html.push('<div>Дополнительные работы:</div><div>' + (data.extraTotal || 0).toLocaleString('ru-RU') + ' ₽</div>');
    if (Array.isArray(data.extras) && data.extras.length) {
      html.push('<div style="grid-column:1 / -1;padding-top:10px;color:#475569;">Дополнительно:</div>');
      html.push('<div style="grid-column:1 / -1;font-size:13px;color:#475569;">' + escapeHtml(data.extras.join(', ')) + '</div>');
    }
    html.push('<div style="grid-column:1 / -1;margin-top:16px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:18px;font-weight:700;color:#0F172A;">Итого: ' + (data.total || 0).toLocaleString('ru-RU') + ' ₽</div>');
    html.push('</div></div>');
  }

  if (data.explanation) {
    html.push('<div style="font-size:14px;line-height:1.8;color:#334155;padding:0 2px;">' + escapeHtml(data.explanation).replace(/\n/g, '<br>') + '</div>');
  }

  resultNode.innerHTML = html.join('');
  resultNode.classList.add('show');

  if (data.total !== undefined) {
    showUpgrades(data.total);
  } else {
    const cp = { 'Матовый ПВХ':450, 'Глянцевый ПВХ':500, 'Сатиновый ПВХ':550, 'Тканевый':750, 'Двухуровневый':950 }[ceilingType] || 500;
    const ot = options.reduce((s, o) => s + (parseInt(o.value)||1) * ({lights:500,chandelier:1500,pipes:350,cornice:400}[o.id]||0), 0);
    showUpgrades(cp * area + ot + 250 * Math.sqrt(area) * 4);
  }
}

async function calcWalls() {
  const area = parseFloat(document.getElementById('wallAreaSlider').value);
  const perimeter = parseFloat(document.getElementById('perimeterSlider').value);
  const soundproof = document.querySelector('#tab-walls .option-item[data-option="soundproof"].active') !== null;
  const paintable = document.querySelector('#tab-walls .option-item[data-option="paintable"].active') !== null;
  const color = document.querySelector('#tab-walls .color-opt.active')?.dataset.color || 'Белый мат';

  const height = perimeter > 0 ? area / perimeter : 2.7;
  const body = {
    height: roundTo(height, 2),
    perimeter,
    wallArea: area,
    soundproof,
    paintable,
    color,
    rollWidth: 3.2,
    sockets: [],
    includeGlue: true,
    includeSpray: false,
  };

  const res = await fetch('/api/walls/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error || 'Ошибка расчёта');

  const resultNode = document.getElementById('result');
  const html = [];
  html.push('<div style="margin-bottom:18px;padding:18px;background:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0;">');
  html.push('<div style="font-size:14px;color:#475569;margin-bottom:10px;">Стены</div>');
  html.push('<div style="display:grid;grid-template-columns:1fr auto;gap:10px;font-size:14px;color:#334155;line-height:1.75;">');
  html.push('<div>Площадь стен:</div><div>' + fmt(data.wallArea) + ' м²</div>');
  html.push('<div>Периметр:</div><div>' + fmt(data.perimeter) + ' м</div>');
  html.push('<div>Высота:</div><div>' + fmt(data.height) + ' м</div>');
  html.push('<div>Рулонов:</div><div>' + fmt(data.summary?.rollCount || 0) + '</div>');
  html.push('<div>Итого:</div><div><strong>' + fmt(data.totalClient) + ' ₽</strong></div>');
  html.push('</div></div>');

  if (Array.isArray(data.materials) && data.materials.length) {
    html.push('<div style="font-size:13px;color:#475569;line-height:1.75;padding:0 2px;">');
    data.materials.slice(0, 5).forEach(m => {
      html.push('<div>' + escapeHtml(m.name) + ': ' + fmt(m.quantity) + ' ' + escapeHtml(m.unit) + ' × ' + fmt(m.unitPrice) + ' ₽ = <strong>' + fmt(m.total) + ' ₽</strong></div>');
    });
    if (data.materials.length > 5) {
      html.push('<div style="margin-top:8px;color:#64748B;">...ещё ' + (data.materials.length - 5) + ' позиций</div>');
    }
    html.push('</div>');
  }

  resultNode.innerHTML = html.join('');
  resultNode.classList.add('show');
  showUpgrades(data.totalClient);
}

async function calcCombined() {
  const ceilingType = document.getElementById('combinedCeilingType').value;
  const area = parseFloat(document.getElementById('combinedAreaSlider').value);
  const wallArea = parseFloat(document.getElementById('combinedWallSlider').value);
  const perimeter = parseFloat(document.getElementById('combinedPerimeterSlider').value);
  const color = document.querySelector('#combinedProfileColor .color-opt.active')?.dataset.color || 'Белый мат';

  const body = {
    ceilingType,
    area,
    width: Math.sqrt(area),
    length: area / Math.sqrt(area),
    hasWalls: true,
    wallArea,
    wallPerimeter: perimeter,
    spots: 4,
    chandelier: true,
  };

  const res = await fetch('/api/calculator/combined', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  let html = '';
  if (data.combined.bundleDiscount > 0) {
    html += '<div style="background:linear-gradient(135deg,rgba(52,211,153,0.1),rgba(91,138,140,0.1));border:1px solid rgba(52,211,153,0.25);border-radius:16px;padding:20px;margin-bottom:16px;text-align:center">';
    html += '<div style="font-size:13px;color:#6B7280">Итого со скидкой за комплекс</div>';
    html += '<div style="font-size:36px;font-weight:800;color:#34D399;margin:4px 0">' + fmt(data.combined.finalTotal) + ' ₽</div>';
    html += '<div style="font-size:13px;color:#6B7280">Скидка ' + data.combined.discountPercent + '% — экономия <strong style="color:#34D399">' + fmt(data.combined.bundleDiscount) + ' ₽</strong></div>';
    html += '</div>';
  }

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;line-height:1.7">';

  html += '<div style="background:#F9FAFB;border-radius:12px;padding:16px">';
  html += '<h3 style="font-size:1rem;font-weight:600;margin-bottom:8px">⬜ Потолок</h3>';
  html += '<div>' + data.ceiling.type + '</div>';
  html += '<div>' + fmt(data.ceiling.area) + ' м²</div>';
  html += '<div style="font-size:1.1rem;font-weight:700;margin-top:4px">' + fmt(data.ceiling.total) + ' ₽</div>';
  html += '</div>';

  html += '<div style="background:#F9FAFB;border-radius:12px;padding:16px">';
  html += '<h3 style="font-size:1rem;font-weight:600;margin-bottom:8px">🧱 Стены</h3>';
  html += '<div>' + fmt(data.walls.area) + ' м²</div>';
  html += '<div>материалы + монтаж</div>';
  html += '<div style="font-size:1.1rem;font-weight:700;margin-top:4px">' + fmt(data.walls.total) + ' ₽</div>';
  html += '</div>';

  html += '</div>';

  if (data.messages && data.messages.upsell) {
    html += '<div style="margin-top:12px;padding:12px;background:#E8F0EE;border-radius:10px;font-size:13px;color:#4D7A7C;text-align:center">💡 ' + data.messages.upsell + '</div>';
  }

  document.getElementById('result').innerHTML = html;
  document.getElementById('result').classList.add('show');
  const ft = document.querySelector('#result div[style*="36px"]');
  if (ft) ft.classList.add('price-total-anim');
  showUpgrades(data.combined.finalTotal);
}
// ─── Upgrades (доп. услуги) ────────────────────────────────────
function showUpgrades(baseAmount) {
  baseTotal = baseAmount;
  const section = document.getElementById('upgradesSection');
  const list = document.getElementById('upgradesList');
  if (!section || !list) return;
  section.style.display = 'block';
  list.innerHTML = upgradesData.map(u => {
    const displayPrice = u.type === 'percent' ? '+' + u.price + '%' : u.price.toLocaleString('ru-RU') + ' ₽';
    return '<label class="upgrade-item" data-id="' + u.id + '">' +
      '<input type="checkbox" class="upgrade-check" data-id="' + u.id + '">' +
      '<div class="upgrade-content" style="flex:1">' +
      '<div class="upgrade-label" style="font-weight:600;font-size:14px">' + u.label + '</div>' +
      '<div style="font-size:12px;color:#6B7280">' + u.desc + '</div></div>' +
      '<div style="font-weight:700;font-size:14px;color:#5B8A8C">' + displayPrice + '</div>' +
      '</label>';
  }).join('');
  document.getElementById('upgradesTotal').style.display = 'none';
  document.querySelectorAll('.upgrade-check').forEach(cb => {
    cb.addEventListener('change', recalcUpgradesTotal);
  });
}

function recalcUpgradesTotal() {
  let extra = 0;
  document.querySelectorAll('.upgrade-check:checked').forEach(cb => {
    const u = upgradesData.find(x => x.id === cb.dataset.id);
    if (!u) return;
    if (u.type === 'fixed') extra += u.price;
    if (u.type === 'percent') extra += baseTotal * u.price / 100;
  });
  const el = document.getElementById('upgradesTotal');
  if (extra > 0) {
    el.style.display = 'block';
    document.getElementById('upgradesTotalValue').textContent = (baseTotal + extra).toLocaleString('ru-RU') + ' ₽';
  } else {
    el.style.display = 'none';
  }
}

function getSelectedUpgrades() {
  const selected = [];
  document.querySelectorAll('.upgrade-check:checked').forEach(cb => {
    const u = upgradesData.find(x => x.id === cb.dataset.id);
    if (u) selected.push({ id: u.id, label: u.label, price: u.type === 'fixed' ? u.price : Math.round(baseTotal * u.price / 100) });
  });
  return selected;
}

// Lead form
document.getElementById('leadBtn').addEventListener('click', async () => {
  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  if (!name || !phone) { alert('Заполните имя и телефон'); return; }

  let productType = 'ceiling';
  let ceilingType = '';
  let area = 0;
  let wallArea = 0;
  let hasWalls = 0;

  if (isCeiling()) {
    productType = 'ceiling';
    ceilingType = document.getElementById('ceilingType').value;
    area = parseFloat(document.getElementById('areaSlider').value);
  } else if (isWalls()) {
    productType = 'walls';
    ceilingType = 'Система Идеальных Стен (СИС)';
    area = parseFloat(document.getElementById('wallAreaSlider').value);
  } else {
    productType = 'combined';
    ceilingType = document.getElementById('combinedCeilingType').value;
    area = parseFloat(document.getElementById('combinedAreaSlider').value);
    wallArea = parseFloat(document.getElementById('combinedWallSlider').value);
    hasWalls = 1;
  }

  const selUpgrades = getSelectedUpgrades();
  const res = await fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, phone, source: productType === 'combined' ? 'combined_calc' : 'calculator',
      productType, ceilingType, area, hasWalls, wallArea,
      upgrades: selUpgrades.length ? JSON.stringify(selUpgrades) : '',
    })
  });
  const data = await res.json();
  if (data.ok) {
    if (lastCalcId) {
      fetch('/api/calculator/' + lastCalcId + '/phone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      }).catch(() => {});
    }
    if (data.client && data.client.token) {
      localStorage.setItem('client_token', data.client.token);
    }
    showFormSuccess(document.getElementById('leadForm'));
    document.getElementById('leadForm').insertAdjacentHTML('afterend',
      '<div class="cabinet-link" style="margin-top:16px;padding:16px;background:#E8F0EE;border-radius:12px;text-align:center">' +
      '<p style="margin-bottom:8px;font-weight:600">Заявка отправлена!</p>' +
      '<a href="/client.html" class="btn btn-primary" style="display:inline-block">Перейти в личный кабинет</a>' +
      '</div>'
    );
  } else {
    alert('Ошибка. Попробуйте ещё раз.');
  }
});

// Enter key
document.getElementById('clientPhone').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('leadBtn').click(); });

// ─── Plan Uploader ────────────────────────────────────────────
const planUploadBtn = document.getElementById('planUploadBtn');
const planOverlay = document.getElementById('planOverlay');
const planCancelBtn = document.getElementById('planCancelBtn');
const planImageInput = document.getElementById('planImageInput');
const planDropZone = document.getElementById('planDropZone');
const planCanvas = document.getElementById('planCanvas');
const planCanvasWrap = document.getElementById('planCanvasWrap');
const planToolbar = document.getElementById('planToolbar');
const planInfo = document.getElementById('planInfo');
const planPerimeter = document.getElementById('planPerimeter');
const planArea = document.getElementById('planArea');
const planWallArea = document.getElementById('planWallArea');
const planApplyBtn = document.getElementById('planApplyBtn');
const planConfirmBtn = document.getElementById('planConfirmPoint');
const planUndoBtn = document.getElementById('planUndoPoint');
const planClearBtn = document.getElementById('planClearPoints');
const planRefLength = document.getElementById('planReferenceLength');
const planRefSegment = document.getElementById('planRefSegment');
const planPointsContainer = document.getElementById('planPointsContainer');

let planState = { points: [], img: null, scale: 0, perimeter: 0, area: 0, wallArea: 0, refSet: false };

function openPlanUploader() { planOverlay.classList.add('show'); }
function closePlanUploader() { planOverlay.classList.remove('show'); }

planUploadBtn.addEventListener('click', openPlanUploader);
planCancelBtn.addEventListener('click', closePlanUploader);
planOverlay.addEventListener('click', (e) => { if (e.target === planOverlay) closePlanUploader(); });

// Drop zone / file picker
planDropZone.addEventListener('click', () => planImageInput.click());
planDropZone.addEventListener('dragover', (e) => { e.preventDefault(); planDropZone.style.borderColor = '#5B8A8C'; });
planDropZone.addEventListener('dragleave', () => { planDropZone.style.borderColor = '#D1D5DB'; });
planDropZone.addEventListener('drop', (e) => {
  e.preventDefault(); planDropZone.style.borderColor = '#D1D5DB';
  if (e.dataTransfer.files.length) loadPlanImage(e.dataTransfer.files[0]);
});
planImageInput.addEventListener('change', () => {
  if (planImageInput.files.length) loadPlanImage(planImageInput.files[0]);
});

function loadPlanImage(file) {
  if (!file.type.startsWith('image/')) { alert('Пожалуйста, загрузите изображение'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      planState.img = img;
      planState.points = [];
      planState.refSet = false;
      planDropZone.style.display = 'none';
      planCanvasWrap.style.display = 'block';
      planToolbar.style.display = 'flex';
      planInfo.style.display = 'none';
      planApplyBtn.disabled = true;
      renderPlanCanvas();
      renderPlanPoints();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderPlanCanvas() {
  const img = planState.img;
  if (!img) return;
  const rect = planCanvasWrap.getBoundingClientRect();
  const maxW = rect.width - 4 || 760;
  const scale = Math.min(maxW / img.width, 600 / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  planCanvas.width = w;
  planCanvas.height = h;
  planCanvas.style.width = w + 'px';
  planCanvas.style.height = h + 'px';
  planCanvasWrap.style.minHeight = h + 'px';
  const ctx = planCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  drawPlanOverlay(ctx, w, h);
}

function drawPlanOverlay(ctx, w, h) {
  const pts = planState.points;
  if (pts.length < 2) return;
  ctx.strokeStyle = '#5B8A8C';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  pts.forEach((p, i) => { ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y); });
  if (pts.length >= 3) ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Dimension labels on each segment
  ctx.fillStyle = '#1F2933';
  ctx.font = '12px Inter, sans-serif';
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    if (planState.scale > 0) {
      const segLen = dist(pts[i], pts[j]) * planState.scale;
      const mx = (pts[i].x + pts[j].x) / 2;
      const my = (pts[i].y + pts[j].y) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const txt = segLen.toFixed(1) + 'м';
      const tw = ctx.measureText(txt).width;
      ctx.fillRect(mx - tw/2 - 4, my - 9, tw + 8, 18);
      ctx.fillStyle = '#1F2933';
      ctx.fillText(txt, mx - tw/2, my + 4);
    }
    // Segment number
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('(' + (i + 1) + ')', pts[i].x + 6, pts[i].y - 6);
  }
}

function renderPlanPoints() {
  planPointsContainer.innerHTML = '';
  planState.points.forEach((p, i) => {
    const dot = document.createElement('div');
    dot.className = 'plan-point';
    dot.style.left = p.x + 'px';
    dot.style.top = p.y + 'px';
    dot.title = 'Точка ' + (i + 1);
    dot.addEventListener('click', () => {
      if (confirm('Удалить точку ' + (i + 1) + '?')) {
        planState.points.splice(i, 1);
        updatePlan();
      }
    });
    planPointsContainer.appendChild(dot);
  });
}

function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

// Canvas click to add point
planCanvas.addEventListener('click', (e) => {
  if (planState.points.length >= 30) { alert('Максимум 30 точек'); return; }
  const rect = planCanvas.getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * (planCanvas.width / rect.width));
  const y = Math.round((e.clientY - rect.top) * (planCanvas.height / rect.height));
  planState.points.push({ x, y });
  updatePlan();
});

planConfirmBtn.addEventListener('click', () => {
  if (planState.points.length < 3) { alert('Отметьте минимум 3 угла комнаты'); return; }
  const ref = parseFloat(planRefLength.value);
  if (!ref || ref <= 0) { alert('Укажите известную длину одной из стен'); return; }
  const segIdx = parseInt(planRefSegment.value);
  if (isNaN(segIdx) || segIdx < 0 || segIdx >= planState.points.length) { alert('Выберите отрезок для привязки'); return; }
  const p1 = planState.points[segIdx];
  const p2 = planState.points[(segIdx + 1) % planState.points.length];
  const pxDist = dist(p1, p2);
  if (pxDist < 1) { alert('Опорный отрезок слишком короткий'); return; }
  planState.scale = ref / pxDist;
  planState.refSet = true;
  calcPlan();
});

planUndoBtn.addEventListener('click', () => {
  if (planState.points.length === 0) return;
  planState.points.pop();
  updatePlan();
});

planClearBtn.addEventListener('click', () => {
  if (confirm('Очистить все точки?')) {
    planState.points = [];
    planState.refSet = false;
    planState.scale = 0;
    updatePlan();
  }
});

planRefLength.addEventListener('input', () => {
  if (planState.refSet && planState.points.length >= 3) calcPlan();
});

planRefSegment.addEventListener('change', () => {
  if (planState.refSet && planState.points.length >= 3) calcPlan();
});

function updatePlan() {
  renderPlanCanvas();
  renderPlanPoints();
  // Update segment selector
  planRefSegment.innerHTML = '';
  for (let i = 0; i < planState.points.length; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = 'Отрезок ' + (i + 1) + ' (точка ' + (i + 1) + ' → ' + ((i + 1) % planState.points.length + 1) + ')';
    planRefSegment.appendChild(opt);
  }
  planRefSegment.style.display = planState.points.length >= 2 ? '' : 'none';
  if (planState.refSet && planState.points.length >= 3) calcPlan();
  else { planInfo.style.display = 'none'; planApplyBtn.disabled = true; }
}

function calcPlan() {
  if (planState.points.length < 3 || !planState.scale) return;
  const pts = planState.points;

  // Perimeter
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    perim += dist(pts[i], pts[j]);
  }
  perim *= planState.scale;

  // Area (shoelace formula)
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const area = Math.abs(area2) / 2 * planState.scale * planState.scale;

  // Estimate wall area (perimeter * 2.7m height)
  const wallAreaEst = perim * 2.7;

  planState.perimeter = Math.round(perim * 100) / 100;
  planState.area = Math.round(area * 100) / 100;
  planState.wallArea = Math.round(wallAreaEst * 100) / 100;

  planPerimeter.textContent = planState.perimeter.toFixed(1);
  planArea.textContent = planState.area.toFixed(1);
  planWallArea.textContent = planState.wallArea.toFixed(1);
  planInfo.style.display = 'grid';
  planApplyBtn.disabled = false;

  renderPlanCanvas();
}

// Apply to calculator
planApplyBtn.addEventListener('click', () => {
  if (planState.area <= 0 && planState.perimeter <= 0) return;
  const area = planState.area;
  const perim = planState.perimeter;
  const wallAreaEst = planState.wallArea;

  if (isCeiling() || isCombined()) {
    // Fill ceiling fields
    const slider = document.getElementById(isCombined() ? 'combinedAreaSlider' : 'areaSlider');
    const display = document.getElementById(isCombined() ? 'combinedAreaValue' : 'areaValue');
    if (slider) {
      slider.value = Math.min(Math.max(Math.round(area), parseInt(slider.min)), parseInt(slider.max));
      display.textContent = slider.value + ' м²';
    }
  }

  if (isWalls() || isCombined()) {
    const wallSlider = document.getElementById(isCombined() ? 'combinedWallSlider' : 'wallAreaSlider');
    const wallDisplay = document.getElementById(isCombined() ? 'combinedWallValue' : 'wallAreaValue');
    if (wallSlider) {
      wallSlider.value = Math.min(Math.max(Math.round(wallAreaEst * 0.7), parseInt(wallSlider.min)), parseInt(wallSlider.max));
      wallDisplay.textContent = wallSlider.value + ' м²';
    }
    const perimSlider = document.getElementById(isCombined() ? 'combinedPerimeterSlider' : 'perimeterSlider');
    const perimDisplay = document.getElementById(isCombined() ? 'combinedPerimeterValue' : 'perimeterValue');
    if (perimSlider) {
      perimSlider.value = Math.min(Math.max(Math.round(perim), parseInt(perimSlider.min)), parseInt(perimSlider.max));
      perimDisplay.textContent = perimSlider.value + ' м';
    }
  }

  closePlanUploader();
  const toast = document.getElementById('toast') || (() => {
    const t = document.createElement('div'); t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1F2933;color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;z-index:2000;box-shadow:0 4px 20px rgba(0,0,0,0.2)';
    document.body.appendChild(t); return t;
  })();
  toast.textContent = '✅ Размеры из плана загружены: ' + area.toFixed(1) + ' м² потолок, периметр ' + perim.toFixed(1) + ' м';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
});
