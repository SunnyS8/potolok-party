const db = require('./db');
const prices = require('./prices');

// ─── Справочники ─────────────────────────────────────────────

const PROJECT_STATUSES = [
  'design',   // дизайнер создаёт, подбирает ткани
  'quoted',   // выдано КП, клиент его смотрит
  'paid',     // предоплата, тариф зафиксирован
  'supply',   // закупка материалов (дилер)
  'install',  // монтаж, фотоотчёт
  'done',     // сдача, гарантия 30 лет
  'archive',  // закрыт
];

const STATUS_LABELS = {
  design: 'Проектирование',
  quoted: 'Выдано КП',
  paid: 'Оплачено',
  supply: 'Закупка',
  install: 'Монтаж',
  done: 'Сдан',
  archive: 'Архив',
};

const ROLES = ['designer', 'client', 'dealer', 'installer', 'manager'];

const ROLE_LABELS = {
  designer: 'Дизайнер',
  client: 'Клиент',
  dealer: 'Дилер',
  installer: 'Монтажник',
  manager: 'Менеджер',
};

// Явные разрешения переходов по ролям.
// Ключ: роль → { from: [разрешённые to] }. Менеджер может всё.
const ROLE_TRANSITIONS = {
  designer:  { design: ['quoted'], quoted: ['design'] },
  client:    { quoted: ['paid'] },
  dealer:    { supply: ['install'] },
  installer: { install: ['done'], done: ['install'], supply: ['install'] },
};

// ─── Помощники ───────────────────────────────────────────────

function normalizeProject(data) {
  const base = {
    name: '',
    address: '',
    customer: { name: '', phone: '', email: '' },
    assigned: { designer: '', dealer: '', installer: '', manager: '' },
    role: 'designer',
    status: 'design',
    pricingLevel: 'retail',
    items: [],
    photos: [],
    notes: '',
    leadId: null,
    dealId: null,
    history: [],
  };
  return { ...base, ...data, customer: { ...base.customer, ...(data.customer || {}) }, assigned: { ...base.assigned, ...(data.assigned || {}) } };
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Права и валидация статусов ──────────────────────────────

// Проверка: разрешена ли роль совершить переход from → to
function isAllowedTransition(role, from, to) {
  if (role === 'manager') return true;
  const map = ROLE_TRANSITIONS[role];
  if (!map || !map[from]) return false;
  return map[from].includes(to);
}

// Только роли с записью могут менять проект (кроме клиента — он не редактирует смету)
const WRITE_ROLES = ['designer', 'dealer', 'installer', 'manager'];

function canEdit(role) {
  return WRITE_ROLES.includes(role);
}

// ─── Цены: розница / дилер / себестоимость ──────────────────

function unitPrice(item, level) {
  // item может содержать явную цену для уровня
  if (item && item.priceByLevel && item.priceByLevel[level] != null) return Number(item.priceByLevel[level]);
  const base = item && item.price != null ? Number(item.price) : 0;
  if (level === 'distributor') return Math.round(base * 0.85); // маржа дилера 15%
  if (level === 'cost') return Math.round(base * 0.7);         // себестоимость
  return base;
}

function recalcTotals(project) {
  const items = Array.isArray(project.items) ? project.items : [];
  let area = 0;
  const totals = { area: 0, retail: 0, distributor: 0, cost: 0 };
  for (const item of items) {
    const qty = Number(item.qty || item.quantity || 1);
    const unit = unitPrice(item, project.pricingLevel);
    totals.retail += unitPrice(item, 'retail') * qty;
    totals.distributor += unitPrice(item, 'distributor') * qty;
    totals.cost += unitPrice(item, 'cost') * qty;
    if (item.type === 'wall' || item.type === 'ceiling') area += qty;
  }
  totals.area = Math.round(area * 10) / 10;
  project.totals = totals;
  return project;
}

// ─── API бизнес-логики ───────────────────────────────────────

function createProject(data, role) {
  const project = normalizeProject(data);
  project.role = role || data.role || 'designer';
  project.status = 'design';
  project.createdByRole = role || 'designer';
  project.history.push({
    at: new Date().toISOString(),
    role,
    action: 'created',
    status: 'design',
    comment: 'Проект создан',
  });
  const saved = db.saveProject(project);
  db.trackEvent('project_created', { projectId: saved.id, role });
  return saved;
}

function listProjects(role, opts) {
  const all = db.getProjects();
  let list = all;
  const { status, role: roleFilter, q } = opts || {};
  if (status) list = list.filter(p => p.status === status);
  if (roleFilter) list = list.filter(p => p.role === roleFilter || p.assigned[roleFilter]);
  if (q) {
    const needle = String(q).toLowerCase().trim();
    list = list.filter(p =>
      String(p.id) === needle
      || (p.name || '').toLowerCase().includes(needle)
      || (p.customer && (p.customer.name || '').toLowerCase().includes(needle))
      || (p.address || '').toLowerCase().includes(needle)
    );
  }
  // manager видит все; остальные — только свои назначенные
  if (role && role !== 'manager' && role !== 'demo') {
    list = list.filter(p =>
      p.role === role
      || p.assigned[role]
      || (role === 'client' && p.customer && p.customer.phone)
    );
  }
  return list.map(recalcTotals);
}

function getProject(id) {
  const p = db.getProjectById(Number(id));
  if (!p) return null;
  return recalcTotals(normalizeProject(p));
}

// Проекты, привязанные к телефону клиента (для кабинета клиента)
function getProjectsByCustomerPhone(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  if (!cleaned) return [];
  const all = db.getProjects();
  return all
    .filter(p => p && p.customer && p.customer.phone && p.customer.phone.replace(/\D/g, '').includes(cleaned))
    .map(recalcTotals);
}

function updateProject(id, data, role) {
  const project = getProject(id);
  if (!project) throw new Error('Проект не найден');
  if (!canEdit(role)) throw new Error('Нет прав на изменение проекта');
  const merged = normalizeProject({ ...project, ...data, id: project.id });
  recalcTotals(merged);
  const saved = db.updateProject(id, merged);
  db.trackEvent('project_updated', { projectId: id, role });
  return saved;
}

function addItem(projectId, item, role) {
  const project = getProject(projectId);
  if (!project) throw new Error('Проект не найден');
  if (!canEdit(role)) throw new Error('Нет прав на изменение проекта');
  const newItem = {
    id: genId(),
    type: item.type || 'wall',
    label: item.label || '',
    qty: Number(item.qty || 1),
    unit: item.unit || 'м',
    price: Number(item.price || 0),
    params: item.params || {},
  };
  if (item.priceByLevel) newItem.priceByLevel = item.priceByLevel;
  project.items = Array.isArray(project.items) ? project.items : [];
  project.items.push(newItem);
  recalcTotals(project);
  const saved = db.updateProject(projectId, project);
  return { item: newItem, project: saved };
}

function removeItem(projectId, itemId, role) {
  const project = getProject(projectId);
  if (!project) throw new Error('Проект не найден');
  if (!canEdit(role)) throw new Error('Нет прав на изменение проекта');
  project.items = (project.items || []).filter(i => String(i.id) !== String(itemId));
  recalcTotals(project);
  return db.updateProject(projectId, project);
}

function transitionStatus(projectId, toStatus, role, comment) {
  const project = getProject(projectId);
  if (!project) throw new Error('Проект не найден');
  if (!PROJECT_STATUSES.includes(toStatus)) throw new Error('Неизвестный статус');

  const from = project.status;
  if (from === toStatus) return project;

  // Проверка цепочки: переход возможен только между соседними статусами,
  // либо из следующего статуса обратно (для правок/возвратов).
  const iFrom = PROJECT_STATUSES.indexOf(from);
  const iTo = PROJECT_STATUSES.indexOf(toStatus);
  const isAdjacent = Math.abs(iTo - iFrom) === 1;
  if (!isAdjacent) throw new Error(`Недопустимый переход ${from} → ${toStatus}`);

  if (!isAllowedTransition(role, from, toStatus)) {
    throw new Error(`Роль ${role} не может выполнить переход ${from} → ${toStatus}`);
  }

  project.status = toStatus;
  project.history = Array.isArray(project.history) ? project.history : [];
  project.history.push({
    at: new Date().toISOString(),
    role,
    action: 'status',
    from,
    status: toStatus,
    comment: comment || `Переход: ${STATUS_LABELS[from] || from} → ${STATUS_LABELS[toStatus] || toStatus}`,
  });
  recalcTotals(project);
  const saved = db.updateProject(projectId, project);
  db.trackEvent('project_status_changed', { projectId, from, to: toStatus, role });
  return saved;
}

function deleteProject(id, role) {
  if (role !== 'manager') throw new Error('Удалять проекты может только менеджер');
  const ok = db.deleteProject(Number(id));
  if (ok) db.trackEvent('project_deleted', { projectId: id });
  return ok;
}

function stats() {
  const projects = db.getProjects();
  const byStatus = {};
  for (const s of PROJECT_STATUSES) byStatus[s] = 0;
  let sum = 0;
  for (const p of projects) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    if (p.totals && p.totals.retail) sum += p.totals.retail;
  }
  return { total: projects.length, byStatus, totalRetail: Math.round(sum) };
}

module.exports = {
  PROJECT_STATUSES,
  STATUS_LABELS,
  ROLES,
  ROLE_LABELS,
  createProject,
  listProjects,
  getProject,
  getProjectsByCustomerPhone,
  updateProject,
  addItem,
  removeItem,
  transitionStatus,
  deleteProject,
  stats,
  recalcTotals,
};
