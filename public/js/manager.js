(function() {
  if (location.search.includes('demo') && !localStorage.getItem('auth_token')) {
    localStorage.setItem('auth_token', 'demo');
  }
  const authToken = localStorage.getItem('auth_token');
  let role = 'guest';

  function renderRoleBadges() {
    const labels = { manager: 'Менеджер', demo: 'Демо-режим (только чтение)', guest: 'Гостевой просмотр' };
    const cls = { manager: 'manager', demo: 'demo', guest: 'guest' };
    ['roleBadgeLeads', 'roleBadgeDeals'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = labels[role] || '';
      if (el) el.className = 'role-badge ' + (cls[role] || 'guest');
    });
  }

  async function apiFetch(url, options) {
    const headers = { ...(options?.headers || {}) };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login.html'; return; }
    return res;
  }

  function canWrite() { return role === 'manager'; }

  fetch('/api/auth/role')
    .then(r => r.json())
    .then(data => {
      role = data.role || 'guest';
      renderRoleBadges();
      loadDashboard();
      loadLeads();
      loadDeals();
      loadPrices();
    })
    .catch(() => {
      role = 'guest';
      renderRoleBadges();
      loadDashboard();
      loadLeads();
      loadDeals();
      loadPrices();
    });
  // Navigation
  document.querySelectorAll('.mgr-sidebar a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.mgr-sidebar a').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.mgr-section').forEach(s => s.classList.remove('active'));
      link.classList.add('active');
      const section = document.getElementById('section-' + link.dataset.section);
      if (section) section.classList.add('active');
    });
  });

  // Load dashboard
  async function loadDashboard() {
    try {
      const res = await apiFetch('/api/analytics/dashboard');
      const data = await res.json();

      document.getElementById('statLeadsTotal').textContent = data.leads.total;
      document.getElementById('statLeadsToday').textContent = data.leads.today;
      document.getElementById('statDealsActive').textContent = data.deals.total;
      document.getElementById('statConversion').textContent = data.conversion.leadToDeal + '%';
      document.getElementById('statCalcTotal').textContent = data.calculator.total;
      document.getElementById('statAvgDeal').textContent = data.deals.avgValue ? data.deals.avgValue.toLocaleString() + ' ₽' : '—';

      const typesBody = document.getElementById('popularTypesBody');
      typesBody.innerHTML = data.calculator.popularTypes.map(([type, count]) =>
        `<tr><td>${type}</td><td>${count}</td></tr>`
      ).join('') || '<tr><td colspan="2">Нет данных</td></tr>';

      const sourceBody = document.getElementById('sourceStatsBody');
      const srcConv = data.conversion?.bySource || {};
      const srcNames = { calculator: 'Калькулятор', website: 'Сайт', chat: 'Чат', widget: 'Виджет', landing: 'Лендинг', crm: 'CRM', unknown: 'Неизвестно' };
      sourceBody.innerHTML = Object.entries(data.leads.bySource).map(([source, count]) => {
        const c = srcConv[source] || { deals: 0, won: 0, rate: 0 };
        const rateColor = c.rate >= 50 ? 'var(--accent-success)' : c.rate >= 25 ? 'var(--accent-warning)' : 'var(--text-secondary)';
        return `<tr><td>${srcNames[source] || source}</td><td>${count}</td><td>${c.deals}</td><td>${c.won}</td><td style="font-weight:600;color:${rateColor}">${c.rate}%</td></tr>`;
      }).join('') || '<tr><td colspan="5">Нет данных</td></tr>';

      renderTrendChart(data.trend);
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  }

  function renderTrendChart(trend) {
    const svg = document.getElementById('trendChart');
    if (!svg) return;
    const leads = trend?.leads30 || [];
    const deals = trend?.deals30 || [];
    if (!leads.length) return;

    const W = 600, H = 180, padL = 8, padR = 8, padT = 10, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const maxVal = Math.max(1, ...leads.map(p => p.count), ...deals.map(p => p.count));
    const step = innerW / (leads.length - 1 || 1);

    const x = (i) => padL + i * step;
    const y = (v) => padT + innerH - (v / maxVal) * innerH;

    const leadsPath = leads.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(' ');
    const dealsPath = deals.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(' ');

    const leadsArea = `${leadsPath} L${x(leads.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

    let html = `
      <defs>
        <linearGradient id="trendLeadFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#5B8A8C" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#5B8A8C" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${[0, 0.5, 1].map(f => {
        const gy = padT + innerH * f;
        return `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#E2E8F0" stroke-width="1"/>`;
      }).join('')}
      <path d="${leadsArea}" fill="url(#trendLeadFill)"/>
      <path d="${leadsPath}" fill="none" stroke="#5B8A8C" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${dealsPath}" fill="none" stroke="#22C55E" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    `;
    const every = Math.ceil(leads.length / 10);
    leads.forEach((p, i) => {
      if (i % every !== 0 && i !== leads.length - 1) return;
      html += `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="9" fill="#94A3B8" text-anchor="middle">${p.date.slice(5)}</text>`;
    });
    svg.innerHTML = html;
  }

  // Load leads
  let currentLeadFilters = { q: '', status: '' };
  async function loadLeads() {
    try {
      const params = new URLSearchParams();
      if (currentLeadFilters.q) params.set('q', currentLeadFilters.q);
      if (currentLeadFilters.status) params.set('status', currentLeadFilters.status);
      const res = await apiFetch('/api/leads?' + params.toString());
      if (!res) return;
      const leads = await res.json();
      const body = document.getElementById('leadsBody');
      body.innerHTML = leads.slice(0, 200).map(l => {
        const statusBadge = `badge-${l.status === 'new' ? 'new' : l.status === 'deal' ? 'deal' : l.status === 'won' ? 'won' : l.status === 'lost' ? 'lost' : 'new'}`;
        const statusLabel = l.status === 'new' ? 'Новый' : l.status === 'deal' ? 'В работе' : l.status === 'won' ? 'Выигран' : l.status === 'lost' ? 'Потерян' : l.status;
        const writeBtn = canWrite()
          ? `<button onclick="viewLead(${l.id})">Открыть</button><button onclick="convertLeadToDeal(${l.id})">В сделку</button>`
          : `<button onclick="viewLead(${l.id})">Открыть</button>`;
        return `<tr><td>${l.id}</td><td>${l.name || '—'}</td><td>${l.phone || '—'}</td><td>${l.source || '—'}</td><td>${l.ceilingType || '—'}</td><td><span class="badge ${statusBadge}">${statusLabel}</span></td><td>${l.created_at ? new Date(l.created_at).toLocaleDateString('ru-RU') : '—'}</td><td><div class="row-actions">${writeBtn}</div></td></tr>`;
      }).join('') || '<tr><td colspan="8">Нет лидов</td></tr>';
    } catch (e) {
      console.error('Leads load error:', e);
    }
  }

  // Load deals
  let currentDealFilters = { q: '', status: '' };
  async function loadDeals() {
    try {
      const params = new URLSearchParams();
      if (currentDealFilters.q) params.set('q', currentDealFilters.q);
      if (currentDealFilters.status) params.set('status', currentDealFilters.status);
      const res = await apiFetch('/api/crm/deals?' + params.toString());
      if (!res) return;
      const deals = await res.json();
      const body = document.getElementById('dealsBody');
      body.innerHTML = deals.slice(0, 200).map(d => {
        const stageLabel = d.status === 'negotiation' ? 'Переговоры' : d.status === 'measurement_scheduled' ? 'Замер назначен' : d.status === 'measurement_done' ? 'Замер выполнен' : d.status === 'won' ? 'Выиграна' : d.status === 'lost' ? 'Потеряна' : d.status;
        const badgeClass = d.status === 'won' ? 'badge-won' : d.status === 'lost' ? 'badge-lost' : d.status === 'measurement_scheduled' ? 'badge-measure' : 'badge-deal';
        const statusSelect = canWrite()
          ? `<select onchange="updateDealStatus(${d.id}, this.value)">
            <option value="negotiation" ${d.status === 'negotiation' ? 'selected' : ''}>Переговоры</option>
            <option value="measurement_scheduled" ${d.status === 'measurement_scheduled' ? 'selected' : ''}>Замер назначен</option>
            <option value="measurement_done" ${d.status === 'measurement_done' ? 'selected' : ''}>Замер выполнен</option>
            <option value="won" ${d.status === 'won' ? 'selected' : ''}>Выиграна</option>
            <option value="lost" ${d.status === 'lost' ? 'selected' : ''}>Потеряна</option>
          </select>`
          : `<span class="badge ${badgeClass}">${stageLabel}</span>`;
        return `<tr><td>${d.id}</td><td>#${d.leadId || '—'}</td><td>${d.ceilingType || '—'}</td><td>${d.estimatedPrice ? d.estimatedPrice.toLocaleString() + ' ₽' : '—'}</td><td>${statusSelect}</td><td class="deal-actions"><button onclick="viewDeal(${d.id})">Открыть</button></td><td>${d.created_at ? new Date(d.created_at).toLocaleDateString('ru-RU') : '—'}</td></tr>`;
      }).join('') || '<tr><td colspan="7">Нет сделок</td></tr>';
      window.updateDealStatus = async (id, status) => {
        if (!canWrite()) { alert('Демо-доступ: изменение недоступно'); return; }
        await apiFetch(`/api/crm/deal/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        loadDeals();
        loadDashboard();
      };
    } catch (e) {
      console.error('Deals load error:', e);
    }
  }

  // ─── Фильтры и поиск ─────────────────────────────────────
  const leadSearchEl = document.getElementById('leadSearch');
  const leadStatusEl = document.getElementById('leadStatusFilter');
  const dealSearchEl = document.getElementById('dealSearch');
  const dealStatusEl = document.getElementById('dealStatusFilter');

  let searchTimer = null;
  function onSearchChange(getValue, setFilters, reload) {
    return () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const f = setFilters();
        f.q = getValue().trim();
        reload();
      }, 300);
    };
  }

  if (leadSearchEl) leadSearchEl.addEventListener('input', onSearchChange(() => leadSearchEl.value, () => currentLeadFilters, loadLeads));
  if (leadStatusEl) leadStatusEl.addEventListener('change', () => { currentLeadFilters.status = leadStatusEl.value; loadLeads(); });
  if (dealSearchEl) dealSearchEl.addEventListener('input', onSearchChange(() => dealSearchEl.value, () => currentDealFilters, loadDeals));
  if (dealStatusEl) dealStatusEl.addEventListener('change', () => { currentDealFilters.status = dealStatusEl.value; loadDeals(); });

  // Advanced calculator
  const widthInput = document.getElementById('advWidth');
  const lengthInput = document.getElementById('advLength');
  const areaSlider = document.getElementById('advAreaSlider');
  const areaSpan = document.getElementById('advArea');

  function updateArea() {
    const area = parseFloat(widthInput.value) * parseFloat(lengthInput.value);
    areaSlider.value = Math.round(area);
    areaSpan.textContent = Math.round(area);
  }
  widthInput.addEventListener('input', updateArea);
  lengthInput.addEventListener('input', updateArea);
  areaSlider.addEventListener('input', () => {
    areaSpan.textContent = areaSlider.value;
  });

  document.getElementById('advCalcBtn').addEventListener('click', async () => {
    const params = {
      ceilingType: document.getElementById('advCeilingType').value,
      width: parseFloat(widthInput.value) || 4,
      length: parseFloat(lengthInput.value) || 5,
      area: parseFloat(areaSlider.value) || 20,
      spots: parseInt(document.getElementById('advSpots').value) || 0,
      chandelier: document.getElementById('advChandelier').checked,
      ledStrip: parseFloat(document.getElementById('advLedStrip').value) || 0,
      pipeBypass: parseInt(document.getElementById('advPipes').value) || 0,
      cornice: parseFloat(document.getElementById('advCornice').value) || 0,
      hatch: parseInt(document.getElementById('advHatch').value) || 0,
      vent: parseInt(document.getElementById('advVent').value) || 0,
      niche: parseFloat(document.getElementById('advNiche').value) || 0,
    };

    const loading = document.getElementById('advLoading');
    const result = document.getElementById('advResult');
    const quoteText = document.getElementById('advQuoteText');
    loading.style.display = 'block';
    result.style.display = 'none';
    quoteText.style.display = 'none';

    try {
      const res = await apiFetch('/api/calculator/advanced', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params)
      });
      const data = await res.json();
      document.getElementById('advResultText').textContent =
        `Тип: ${data.ceilingType}\nПлощадь: ${data.area} м² (${data.width}×${data.length})\nПолотно: ${data.canvasPrice.toLocaleString()} ₽\nПрофиль: ${data.profilePrice.toLocaleString()} ₽\n` +
        (data.extras.length ? `Дополнительно:\n  ${data.extras.join('\n  ')}\n` : '') +
        `━━━━━━━━━━━━━━━━\nИТОГО: ${data.total.toLocaleString()} ₽`;

      window._lastEstimate = { ...data, id: Date.now() };

      loading.style.display = 'none';
      result.style.display = 'block';

      document.getElementById('advClientName').dataset.estimateReady = '1';
    } catch (e) {
      loading.style.display = 'none';
      document.getElementById('advResultText').textContent = 'Ошибка расчёта. Попробуйте ещё раз.';
      result.style.display = 'block';
    }
  });

  document.getElementById('advQuoteBtn').addEventListener('click', async () => {
    const estimate = window._lastEstimate;
    const clientName = document.getElementById('advClientName').value.trim() || 'Клиент';
    if (!estimate) { alert('Сначала рассчитайте смету'); return; }

    try {
      const res = await apiFetch('/api/calculator/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimate, client: { name: clientName } })
      });
      const data = await res.json();
      const el = document.getElementById('advQuoteText');
      el.textContent = data.text;
      el.style.display = 'block';
    } catch (e) {
      alert('Ошибка генерации КП');
    }
  });

  // Assistant
  const assistantMsgs = document.getElementById('assistantMsgs');
  const assistantInput = document.getElementById('assistantInput');
  const assistantSend = document.getElementById('assistantSend');
  let assistantLoading = false;
  let assistantHistory = [];

  function addAssistantMsg(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    assistantMsgs.appendChild(div);
    assistantMsgs.scrollTop = assistantMsgs.scrollHeight;
  }

  async function askAssistant(text) {
    if (assistantLoading || !text.trim()) return;
    assistantLoading = true;
    assistantSend.disabled = true;
    assistantInput.disabled = true;

    addAssistantMsg('user', text.trim());
    assistantInput.value = '';
    assistantHistory.push({ role: 'user', content: text });

    try {
      const res = await apiFetch('/api/assistant/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: assistantHistory.slice(-10) })
      });
      const data = await res.json();
      assistantHistory.push({ role: 'assistant', content: data.reply });
      addAssistantMsg('bot', data.reply);
    } catch (e) {
      addAssistantMsg('bot', 'Ошибка связи');
    } finally {
      assistantLoading = false;
      assistantSend.disabled = false;
      assistantInput.disabled = false;
      assistantInput.focus();
    }
  }

  assistantSend.addEventListener('click', () => askAssistant(assistantInput.value));
  assistantInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') askAssistant(assistantInput.value);
  });

  document.getElementById('templateBtns').addEventListener('click', async (e) => {
    const btn = e.target.closest('.template-btn');
    if (!btn) return;
    const type = btn.dataset.template;
    try {
      const res = await apiFetch('/api/assistant/template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data: { name: '{Имя}', ceilingType: '{Тип}', total: 0 } })
      });
      const data = await res.json();
      addAssistantMsg('bot', data.text);
    } catch (e) {
      addAssistantMsg('bot', 'Ошибка загрузки шаблона');
    }
  });

  // Prices
  async function loadPrices() {
    try {
      const res = await apiFetch('/api/prices');
      const data = await res.json();

      const ceilingBody = document.getElementById('pricesCeilingBody');
      ceilingBody.innerHTML = data.ceilingTypes.map(c => `
        <tr>
          <td>${c.label}</td>
          <td><span class="price-edit" data-type="ceiling" data-id="${c.id}" data-field="pricePerM2" contenteditable>${c.pricePerM2}</span></td>
          <td>₽/м²</td>
          <td><button class="price-del" data-endpoint="ceiling/${c.id}" title="Удалить">✕</button></td>
        </tr>
      `).join('');

      const profileBody = document.getElementById('pricesProfileBody');
      profileBody.innerHTML = `
        <tr>
          <td>${data.profile.label}</td>
          <td><span class="price-edit" data-type="profile" data-field="price" contenteditable>${data.profile.price}</span></td>
          <td>₽/м</td>
        </tr>
      `;

      const iksBody = document.getElementById('pricesIksBody');
      if (data.iks) {
        const iksCompany = data.iksCompany || {};
        const iksLabels = {
          wallpaperPerSqm: 'Полотно MSD / м²', profileBase: 'Профиль ID базовый',
          profileInnerCorner: 'ID внутр. угол', profileOuterCorner: 'ID внешн. угол',
          profileShadowBaseboard: 'Плинтус ID теневой', profileWallCeiling: 'ID стена-потолок',
          profileSeparator: 'ID разделительный', tonlosAcousticFelt: 'TÖNLOS ACOUSTIC FELT',
          tonlosHeavyFelt: 'TÖNLOS HEAVY FELT', fintek150: 'Fintek 150',
          insertID: 'Вставка ID (короб 100 м)', insertType1: 'Закладная тип 1',
          insertType2: 'Закладная тип 2', insertType3: 'Закладная тип 3',
          adhesiveLiquidPer5L: 'Клей жидкий TÖNLOS 5 л', adhesiveSprayPer650ml: 'Клей аэрозоль TÖNLOS 650 мл',
        };
        const iksUnits = {
          wallpaperPerSqm: '₽/м²', profileBase: '₽/шт', profileInnerCorner: '₽/шт',
          profileOuterCorner: '₽/шт', profileShadowBaseboard: '₽/шт', profileWallCeiling: '₽/шт',
          profileSeparator: '₽/шт', tonlosAcousticFelt: '₽/уп', tonlosHeavyFelt: '₽/уп',
          fintek150: '₽/уп', insertID: '₽/короб', insertType1: '₽/шт', insertType2: '₽/шт',
          insertType3: '₽/шт', adhesiveLiquidPer5L: '₽/канистра', adhesiveSprayPer650ml: '₽/баллон',
        };
        iksBody.innerHTML = Object.entries(iksLabels).map(([k, label]) => `
          <tr>
            <td>${label}</td>
            <td><span class="price-edit" data-type="ikscompany" data-ikskey="${k}" contenteditable>${iksCompany[k] ?? ''}</span></td>
            <td><span class="price-edit" data-type="iks" data-ikskey="${k}" contenteditable>${data.iks[k] ?? ''}</span></td>
            <td>${iksUnits[k] || ''}</td>
          </tr>
        `).join('');
      }

      const iksInstallBody = document.getElementById('pricesIksInstallBody');
      if (data.iksInstall && iksInstallBody) {
        iksInstallBody.innerHTML = Object.entries(data.iksInstall).map(([k, v]) => {
          if (typeof v !== 'object') {
            return `<tr><td>Доплата за высоту (&gt;3.5 м)</td><td colspan="2"><span class="price-edit" data-type="iksinstall" data-wkey="${k}" data-wfield="value" contenteditable>${v}</span></td><td>%</td></tr>`;
          }
          return `<tr>
            <td>${v.label}</td>
            <td><span class="price-edit" data-type="iksinstall" data-wkey="${k}" data-wfield="companyRate" contenteditable>${v.companyRate}</span></td>
            <td><span class="price-edit" data-type="iksinstall" data-wkey="${k}" data-wfield="clientRate" contenteditable>${v.clientRate}</span></td>
            <td>₽/${v.unit}</td>
          </tr>`;
        }).join('');
      }

      const sisBody = document.getElementById('pricesSisBody');
      if (data.sis) {
        const c = data.sis.components || {};
        sisBody.innerHTML = Object.entries(c).map(([k, v]) => `
          <tr>
            <td>${v.label}</td>
            <td><span class="price-edit" data-type="sis" data-sis-comp="${k}" contenteditable>${v.price}</span></td>
            <td>${v.unit}</td>
            <td><button class="price-del" data-endpoint="sis/component/${k}" title="Удалить">✕</button></td>
          </tr>
        `).join('') + `
          <tr><td>${data.sis.soundproofLabel}</td><td><span class="price-edit" data-type="sis" data-field="soundproofPrice" contenteditable>${data.sis.soundproofPrice}</span></td><td>₽/м²</td><td></td></tr>
        `;
      }

      const optionsBody = document.getElementById('pricesOptionsBody');
      optionsBody.innerHTML = data.options.map(o => `
        <tr>
          <td>${o.label}</td>
          <td>${o.unit}</td>
          <td><span class="price-edit" data-type="option" data-id="${o.id}" data-field="price" contenteditable>${o.price}</span></td>
          <td><button class="price-del" data-endpoint="option/${o.id}" title="Удалить">✕</button></td>
        </tr>
      `).join('');

      const upgradesBody = document.getElementById('pricesUpgradesBody');
      if (data.upgrades) {
        upgradesBody.innerHTML = data.upgrades.map(u => {
          const display = u.type === 'percent' ? '%' : '₽';
          return `<tr>
            <td>${u.label}<br><span style="font-size:11px;color:#6B7280">${u.desc}</span></td>
            <td><span class="price-edit" data-type="upgrade" data-id="${u.id}" contenteditable>${u.price}</span> ${display}</td>
            <td></td>
          </tr>`;
        }).join('');
      }

      // ─── Add-row forms ─────────────────────────────────────
      const makeAddBtn = (label, placeholder, fields, endpoint) => {
        const btn = document.createElement('button');
        btn.className = 'price-add';
        btn.textContent = '+ ' + label;
        btn.addEventListener('click', () => {
          const vals = {};
          fields.forEach(f => { vals[f.key] = prompt(f.label + (f.placeholder ? ' (' + f.placeholder + ')' : ''), f.default || ''); if (!vals[f.key]) return; });
          if (!vals[fields[0].key]) return;
          apiFetch('/api/prices/' + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) })
            .then(() => loadPrices())
            .catch(e => alert('Ошибка: ' + e.message));
        });
        return btn;
      };

      document.getElementById('pricesCeilingBody').parentElement.parentElement.after(
        makeAddBtn('Добавить тип потолка', 'Название', [{ key: 'label', label: 'Название' }, { key: 'pricePerM2', label: 'Цена за м²', default: '0' }], 'ceiling')
      );
      document.getElementById('pricesOptionsBody').parentElement.parentElement.after(
        makeAddBtn('Добавить опцию', 'Название', [{ key: 'label', label: 'Название' }, { key: 'unit', label: 'Ед.изм', default: 'шт' }, { key: 'price', label: 'Цена', default: '0' }], 'option')
      );
      document.getElementById('pricesSisBody').parentElement.parentElement.after(
        makeAddBtn('Добавить компонент СИС', 'Название', [{ key: 'label', label: 'Название' }, { key: 'unit', label: 'Ед.изм', default: 'м' }, { key: 'price', label: 'Цена', default: '0' }], 'sis/component')
      );

      // ─── Blur save ────────────────────────────────────────
      document.querySelectorAll('.price-edit').forEach(el => {
        el.addEventListener('blur', async function() {
          const newVal = parseFloat(this.textContent.trim());
          if (isNaN(newVal) || newVal < 0) { this.textContent = this.dataset.orig; return; }
          const type = this.dataset.type;
          const id = this.dataset.id;
          const field = this.dataset.field;
          const body = { [field]: newVal };
          let url;
          if (type === 'ceiling') url = `/api/prices/ceiling/${id}`;
          else if (type === 'option') url = `/api/prices/option/${id}`;
          else if (type === 'profile') url = `/api/prices/profile`;
          else if (type === 'sis') {
            url = `/api/prices/sis`;
            const comp = this.dataset.sisComp;
            if (comp) body = { component: comp, price: newVal };
          }
          const ikskey = this.dataset.ikskey;
          if (ikskey && type === 'iks') { url = `/api/prices/iks`; body = { [ikskey]: newVal }; }
          if (ikskey && type === 'ikscompany') { url = `/api/prices/iks-company`; body = { [ikskey]: newVal }; }
          if (type === 'iksinstall') {
            const wkey = this.dataset.wkey;
            const wfield = this.dataset.wfield;
            url = `/api/prices/iks-install/${wkey}`;
            body = { [wfield]: newVal };
            if (wfield === 'value') body = { value: newVal };
          }
          if (type === 'upgrade') url = `/api/prices/upgrades/${id}`;
          try {
            await apiFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          } catch (e) { console.error('Save price error:', e); this.textContent = this.dataset.orig; }
        });
        el.addEventListener('focus', function() { this.dataset.orig = this.textContent; });
      });

      // ─── Delete buttons ────────────────────────────────────
      document.querySelectorAll('.price-del').forEach(btn => {
        btn.addEventListener('click', async function() {
          const endpoint = this.dataset.endpoint;
          const row = this.closest('tr');
          const name = row?.querySelector('td')?.textContent?.trim() || 'эту позицию';
          if (!confirm(`Удалить «${name}»?`)) return;
          try {
            await apiFetch('/api/prices/' + endpoint, { method: 'DELETE' });
            loadPrices();
          } catch (e) { alert('Ошибка удаления: ' + e.message); }
        });
      });
    } catch (e) {
      console.error('Prices load error:', e);
    }
  }

  // ─── Модалка деталей ─────────────────────────────────────
  const overlay = document.getElementById('modalOverlay');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  function openModal(title) {
    modalTitle.textContent = title;
    overlay.classList.add('open');
  }
  function closeModal() { overlay.classList.remove('open'); }
  document.getElementById('modalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  function esc(v) { return String(v == null ? '' : v).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function renderComments(container, comments) {
    if (!comments || !comments.length) {
      container.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary);">История пуста</p>';
      return;
    }
    container.innerHTML = comments.map(c => `
      <div class="comment-item">
        <div class="c-meta">${esc(c.author)} · ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
        <div class="c-text">${esc(c.text)}</div>
      </div>
    `).join('');
  }

  function commentFormHtml(entityType, id) {
    return `<div class="comment-form">
      <input type="text" id="commentInput-${id}" placeholder="Добавить комментарий..." maxlength="500">
      <button onclick="addComment(${id}, '${entityType}')">Добавить</button>
    </div>`;
  }

  window.addComment = async (id, entityType) => {
    if (!canWrite()) { alert('Демо-доступ: добавление комментариев недоступно'); return; }
    const input = document.getElementById('commentInput-' + id);
    const text = input.value.trim();
    if (!text) return;
    const res = await apiFetch(`/api/${entityType}/${id}/comment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, author: 'менеджер' })
    });
    if (res && res.ok) {
      input.value = '';
      if (entityType === 'lead') viewLead(id); else viewDeal(id);
    } else {
      alert('Ошибка сохранения комментария');
    }
  };

  // Просмотр лида
  window.viewLead = async (id) => {
    const res = await apiFetch('/api/lead/' + id + '/comments');
    if (!res) return;
    const data = await res.json();
    const l = data.lead;
    openModal('Лид #' + id);
    const statusLabels = { new: 'Новый', deal: 'В работе', won: 'Выигран', lost: 'Потерян' };
    modalBody.innerHTML = `
      <div class="modal-section">
        <div class="info-grid">
          <div class="field"><span class="k">Имя</span><span class="v">${esc(l.name || '—')}</span></div>
          <div class="field"><span class="k">Телефон</span><span class="v">${esc(l.phone || '—')}</span></div>
          <div class="field"><span class="k">Источник</span><span class="v">${esc(l.source || '—')}</span></div>
          <div class="field"><span class="k">Продукт</span><span class="v">${esc(l.productType || '—')}</span></div>
          <div class="field"><span class="k">Тип потолка</span><span class="v">${esc(l.ceilingType || '—')}</span></div>
          <div class="field"><span class="k">Площадь</span><span class="v">${l.area ? l.area + ' м²' : '—'}</span></div>
          <div class="field"><span class="k">Стены</span><span class="v">${l.hasWalls ? (l.wallSystem || 'СИС') + (l.wallArea ? ', ' + l.wallArea + ' м²' : '') : 'нет'}</span></div>
          <div class="field"><span class="k">Светильники</span><span class="v">${l.hasLights ? 'да' : '—'}</span></div>
          <div class="field"><span class="k">Статус</span><span class="v">${statusLabels[l.status] || l.status}</span></div>
          <div class="field"><span class="k">Дата</span><span class="v">${l.created_at ? new Date(l.created_at).toLocaleString('ru-RU') : '—'}</span></div>
        </div>
        ${l.notes ? `<div style="margin-top:0.75rem;font-size:0.85rem;color:var(--text-secondary);"><b>Комментарий клиента:</b> ${esc(l.notes)}</div>` : ''}
        ${canWrite() ? `<button class="btn btn-primary" style="margin-top:1rem;font-size:0.8125rem;" onclick="convertLeadToDeal(${id})">Создать сделку</button>` : ''}
      </div>
      <div class="modal-section">
        <h4>История и комментарии</h4>
        <div id="commentsContainer"></div>
        ${canWrite() ? commentFormHtml('lead', id) : ''}
      </div>
    `;
    renderComments(document.getElementById('commentsContainer'), data.comments);
  };

  // Просмотр сделки
  window.viewDeal = async (id) => {
    const res = await apiFetch('/api/deal/' + id + '/comments');
    if (!res) return;
    const data = await res.json();
    const d = data.deal;
    const lead = data.lead;
    openModal('Сделка #' + id);
    const stageLabels = { negotiation: 'Переговоры', measurement_scheduled: 'Замер назначен', measurement_done: 'Замер выполнен', won: 'Выиграна', lost: 'Потеряна' };
    modalBody.innerHTML = `
      <div class="modal-section">
        <div class="info-grid">
          <div class="field"><span class="k">Лид</span><span class="v">#${d.leadId ?? '—'}${lead ? ' · ' + esc(lead.name || '') : ''}</span></div>
          <div class="field"><span class="k">Телефон</span><span class="v">${esc(lead?.phone || '—')}</span></div>
          <div class="field"><span class="k">Тип потолка</span><span class="v">${esc(d.ceilingType || '—')}</span></div>
          <div class="field"><span class="k">Сумма</span><span class="v">${d.estimatedPrice ? d.estimatedPrice.toLocaleString() + ' ₽' : '—'}</span></div>
          <div class="field"><span class="k">Статус</span><span class="v">${stageLabels[d.status] || d.status}</span></div>
          <div class="field"><span class="k">Дата</span><span class="v">${d.created_at ? new Date(d.created_at).toLocaleString('ru-RU') : '—'}</span></div>
        </div>
        ${canWrite() ? `
        <div style="margin-top:1rem;display:flex;gap:0.5rem;align-items:center;">
          <select id="modalDealStatus" style="padding:0.4rem 0.6rem;border:1px solid var(--border-medium);border-radius:6px;font-size:0.8125rem;">
            ${Object.entries(stageLabels).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <button class="btn btn-primary" style="font-size:0.8125rem;" onclick="changeDealStatusModal(${id})">Сохранить</button>
        </div>` : ''}
      </div>
      <div class="modal-section">
        <h4>История и комментарии</h4>
        <div id="commentsContainer"></div>
        ${canWrite() ? commentFormHtml('deal', id) : ''}
      </div>
    `;
    renderComments(document.getElementById('commentsContainer'), data.comments);
  };

  window.changeDealStatusModal = async (id) => {
    const status = document.getElementById('modalDealStatus').value;
    await apiFetch(`/api/crm/deal/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    viewDeal(id);
    loadDeals();
    loadDashboard();
  };

  // Быстрый переход лид → сделка
  window.convertLeadToDeal = async (leadId) => {
    if (!canWrite()) { alert('Демо-доступ: создание сделок недоступно'); return; }
    if (!confirm('Создать сделку из этого лида?')) return;
    const res = await apiFetch('/api/crm/deal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, ceilingType: '' })
    });
    if (res && res.ok) {
      alert('Сделка создана!');
      closeModal();
      loadLeads();
      loadDeals();
      loadDashboard();
    } else {
      alert('Ошибка создания сделки');
    }
  };

  // Экспорт
  window.exportLeads = (format) => {
    const params = new URLSearchParams();
    if (currentLeadFilters.q) params.set('q', currentLeadFilters.q);
    if (currentLeadFilters.status) params.set('status', currentLeadFilters.status);
    params.set('format', format);
    if (authToken) params.set('token', authToken);
    const url = '/api/leads/export?' + params.toString();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads.' + (format === 'xlsx' ? 'xlsx' : 'csv');
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  window.exportDeals = (format) => {
    const params = new URLSearchParams();
    params.set('format', format);
    if (authToken) params.set('token', authToken);
    const url = '/api/crm/deals/export?' + params.toString();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deals.' + (format === 'xlsx' ? 'xlsx' : 'csv');
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Refresh data when switching sections
  document.querySelectorAll('.mgr-sidebar a').forEach(link => {
    link.addEventListener('click', () => {
      const section = link.dataset.section;
      if (section === 'dashboard') loadDashboard();
      if (section === 'leads') loadLeads();
      if (section === 'deals') loadDeals();
      if (section === 'prices') loadPrices();
    });
  });
})();
