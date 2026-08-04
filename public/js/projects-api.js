// Флюкс | СИС — клиентский API для работы с проектами (единая сущность).
// Используется всеми ролями: дизайнер, дилер, монтажник, менеджер.
(function (global) {
  const TOKEN = () => (window.FluxAuth ? FluxAuth.getToken() : '');

  function hdrs() {
    const h = { 'Content-Type': 'application/json' };
    const t = TOKEN();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  async function req(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: hdrs(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Ошибка запроса');
    return json;
  }

  const Projects = {
    list(params) {
      const q = params ? new URLSearchParams(params).toString() : '';
      return req('GET', '/api/projects' + (q ? '?' + q : ''));
    },
    get(id) {
      return req('GET', '/api/projects/' + id);
    },
    create(data) {
      return req('POST', '/api/projects', data);
    },
    update(id, data) {
      return req('PUT', '/api/projects/' + id, data);
    },
    setStatus(id, status, comment) {
      return req('PATCH', '/api/projects/' + id + '/status', { status, comment });
    },
    addItem(id, item) {
      return req('POST', '/api/projects/' + id + '/items', item);
    },
    removeItem(id, itemId) {
      return req('DELETE', '/api/projects/' + id + '/items/' + itemId);
    },
    remove(id) {
      return req('DELETE', '/api/projects/' + id);
    },
    stats() {
      return req('GET', '/api/projects/stats');
    },
  };

  // ─── UI-хелперы ────────────────────────────────────────────
  const fmtMoney = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₽';

  const STATUS_META = {
    design: { label: 'Проектирование', color: '#5B8A8C' },
    quoted: { label: 'Выдано КП', color: '#8A6DBF' },
    paid: { label: 'Оплачено', color: '#7DAB7D' },
    supply: { label: 'Закупка', color: '#D4A574' },
    install: { label: 'Монтаж', color: '#5B8A8C' },
    done: { label: 'Сдан', color: '#2F7D5B' },
    archive: { label: 'Архив', color: '#9A9690' },
  };

  function statusBadge(status) {
    const m = STATUS_META[status] || { label: status || '—', color: '#888' };
    return '<span class="prj-badge" style="--c:' + m.color + '">' + m.label + '</span>';
  }

  // Три ценовых колонки из totals
  function totalsRow(totals, level) {
    const t = totals || {};
    const pick = { retail: t.retail, distributor: t.distributor, cost: t.cost };
    return {
      area: t.area,
      retail: t.retail,
      distributor: t.distributor,
      cost: t.cost,
      shown: level === 'cost' ? t.cost : level === 'distributor' ? t.distributor : t.retail,
    };
  }

  // Список доступных переходов для роли из server-справочника
  // (упрощённо: следующий статус по цепочке)
  const CHAIN = ['design', 'quoted', 'paid', 'supply', 'install', 'done', 'archive'];

  function nextStatus(current) {
    const i = CHAIN.indexOf(current);
    return i >= 0 && i < CHAIN.length - 1 ? CHAIN[i + 1] : null;
  }

  global.FluxProjects = { Projects, fmtMoney, statusBadge, totalsRow, STATUS_META, CHAIN, nextStatus };
})(window);