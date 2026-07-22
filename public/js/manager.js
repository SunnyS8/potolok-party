(function() {
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
      const res = await fetch('/api/analytics/dashboard');
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
      sourceBody.innerHTML = Object.entries(data.leads.bySource).map(([source, count]) =>
        `<tr><td>${source}</td><td>${count}</td></tr>`
      ).join('');
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  }

  // Load leads
  async function loadLeads() {
    try {
      const res = await fetch('/api/leads');
      const leads = await res.json();
      const body = document.getElementById('leadsBody');
      body.innerHTML = leads.slice(0, 50).map(l => {
        const statusBadge = `badge-${l.status === 'new' ? 'new' : l.status === 'deal' ? 'deal' : l.status === 'won' ? 'won' : l.status === 'lost' ? 'lost' : 'new'}`;
        const statusLabel = l.status === 'new' ? 'Новый' : l.status === 'deal' ? 'В работе' : l.status === 'won' ? 'Выигран' : l.status === 'lost' ? 'Потерян' : l.status;
        return `<tr><td>${l.id}</td><td>${l.name || '—'}</td><td>${l.phone || '—'}</td><td>${l.source || '—'}</td><td>${l.ceilingType || '—'}</td><td><span class="badge ${statusBadge}">${statusLabel}</span></td><td>${l.created_at ? new Date(l.created_at).toLocaleDateString('ru-RU') : '—'}</td></tr>`;
      }).join('') || '<tr><td colspan="7">Нет лидов</td></tr>';
    } catch (e) {
      console.error('Leads load error:', e);
    }
  }

  // Load deals
  async function loadDeals() {
    try {
      const res = await fetch('/api/crm/deals');
      const deals = await res.json();
      const body = document.getElementById('dealsBody');
      body.innerHTML = deals.slice(0, 50).map(d => {
        const stageLabel = d.status === 'negotiation' ? 'Переговоры' : d.status === 'measurement_scheduled' ? 'Замер назначен' : d.status === 'measurement_done' ? 'Замер выполнен' : d.status === 'won' ? 'Выиграна' : d.status === 'lost' ? 'Потеряна' : d.status;
        const badgeClass = d.status === 'won' ? 'badge-won' : d.status === 'lost' ? 'badge-lost' : d.status === 'measurement_scheduled' ? 'badge-measure' : 'badge-deal';
        return `<tr><td>${d.id}</td><td>#${d.leadId || '—'}</td><td>${d.ceilingType || '—'}</td><td>${d.estimatedPrice ? d.estimatedPrice.toLocaleString() + ' ₽' : '—'}</td><td><span class="badge ${badgeClass}">${stageLabel}</span></td><td class="deal-actions">
          <select onchange="updateDealStatus(${d.id}, this.value)">
            <option value="negotiation" ${d.status === 'negotiation' ? 'selected' : ''}>Переговоры</option>
            <option value="measurement_scheduled" ${d.status === 'measurement_scheduled' ? 'selected' : ''}>Замер назначен</option>
            <option value="measurement_done" ${d.status === 'measurement_done' ? 'selected' : ''}>Замер выполнен</option>
            <option value="won" ${d.status === 'won' ? 'selected' : ''}>Выиграна</option>
            <option value="lost" ${d.status === 'lost' ? 'selected' : ''}>Потеряна</option>
          </select>
        </td><td>${d.created_at ? new Date(d.created_at).toLocaleDateString('ru-RU') : '—'}</td></tr>`;
      }).join('') || '<tr><td colspan="7">Нет сделок</td></tr>';
      window.updateDealStatus = async (id, status) => {
        await fetch(`/api/crm/deal/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        loadDeals();
        loadDashboard();
      };
    } catch (e) {
      console.error('Deals load error:', e);
    }
  }

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
      const res = await fetch('/api/calculator/advanced', {
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
      const res = await fetch('/api/calculator/quote', {
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
      const res = await fetch('/api/assistant/chat', {
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
      const res = await fetch('/api/assistant/template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data: { name: '{Имя}', ceilingType: '{Тип}', total: 0 } })
      });
      const data = await res.json();
      addAssistantMsg('bot', data.text);
    } catch (e) {
      addAssistantMsg('bot', 'Ошибка загрузки шаблона');
    }
  });

  // Initial load
  loadDashboard();
  loadLeads();
  loadDeals();

  // Refresh data when switching sections
  document.querySelectorAll('.mgr-sidebar a').forEach(link => {
    link.addEventListener('click', () => {
      const section = link.dataset.section;
      if (section === 'dashboard') loadDashboard();
      if (section === 'leads') loadLeads();
      if (section === 'deals') loadDeals();
    });
  });
})();
