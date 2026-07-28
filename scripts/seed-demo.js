// Скрипт заполнения демо-данными для презентации на потолок party
// Запуск: node scripts/seed-demo.js
const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '..', 'data');

function write(fn, data) {
  fs.writeFileSync(path.join(dataDir, fn), JSON.stringify(data, null, 2), 'utf-8');
  console.log('  ✓', fn, `(${Array.isArray(data) ? data.length : Object.keys(data).length} записей)`);
}

// ─── Лиды (leads) ──────────────────────────────────────────────
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

const leads = [
  { id: 1, name: 'Елена Кузнецова', phone: '+7 (916) 432-11-09', email: 'elena.k@yandex.ru', source: 'calculator', productType: 'combined', ceilingType: 'Матовый ПВХ', area: 18, hasWalls: true, wallArea: 36, wallSystem: 'sis', hasLights: true, lightsCount: 4, notes: 'Хочу комплекс потолок+стены в спальне 18 м². Интересует звукоизоляция стен.', status: 'won', created_at: daysAgo(14), updated_at: daysAgo(1) },
  { id: 2, name: 'Алексей Воронов', phone: '+7 (903) 555-23-44', email: 'voronov@mail.ru', source: 'chat', productType: 'ceiling', ceilingType: 'Тканевый', area: 22, hasWalls: false, hasLights: true, lightsCount: 6, notes: 'Гостиная 22 м², тканевый потолок, 6 светильников. Интересует парящий профиль.', status: 'measurement_scheduled', created_at: daysAgo(5), updated_at: daysAgo(2) },
  { id: 3, name: 'Ольга Морозова', phone: '+7 (985) 777-88-99', email: 'omorozova@gmail.com', source: 'website', productType: 'walls', ceilingType: 'Система Идеальных Стен', area: 42, hasWalls: true, wallArea: 42, wallSystem: 'sis', hasLights: false, notes: 'Вся квартира-студия 42 м² — только стены СИС. Белый матовый текстиль, чёрный профиль.', status: 'negotiation', created_at: daysAgo(3), updated_at: daysAgo(1) },
  { id: 4, name: 'Дмитрий Соколов', phone: '+7 (926) 111-22-33', email: 'd.sokolov@bk.ru', source: 'calculator', productType: 'ceiling', ceilingType: 'Глянцевый ПВХ', area: 15, hasWalls: false, hasLights: true, lightsCount: 3, notes: 'Ванная 15 м², глянцевый ПВХ, 3 светильника. Нужен люк.', status: 'measurement_done', created_at: daysAgo(7), updated_at: daysAgo(3) },
  { id: 5, name: 'Анна Белова', phone: '+7 (915) 444-55-66', email: 'anna.belova@inbox.ru', source: 'chat', productType: 'combined', ceilingType: 'Сатиновый ПВХ', area: 26, hasWalls: true, wallArea: 52, wallSystem: 'sis', hasLights: true, lightsCount: 8, notes: 'Зал 26 м² + кухня. Сатиновый потолок, стены СИС с звукоизоляцией. Много света — 8 точек.', status: 'new', created_at: daysAgo(0.5), updated_at: daysAgo(0.5) },
  { id: 6, name: 'Сергей Павлов', phone: '+7 (968) 333-77-11', email: '', source: 'website', productType: 'walls', ceilingType: 'Система Идеальных Стен', area: 30, hasWalls: true, wallArea: 30, wallSystem: 'sis', hasLights: false, notes: 'Кабинет 30 м², стены СИС, чёрный муар. Без звукоизоляции.', status: 'installation_scheduled', created_at: daysAgo(10), updated_at: daysAgo(1) },
  { id: 7, name: 'Мария Титова', phone: '+7 (977) 666-00-22', email: 'maria.t@outlook.com', source: 'calculator', productType: 'ceiling', ceilingType: 'Матовый ПВХ', area: 12, hasWalls: false, hasLights: true, lightsCount: 2, notes: 'Детская 12 м², матовый ПВХ, 2 светильника, обвод труб.', status: 'new', created_at: daysAgo(0.2), updated_at: daysAgo(0.2) },
  { id: 8, name: 'Иван Петров', phone: '+7 (901) 888-99-00', email: 'ipetrov@ya.ru', source: 'chat', productType: 'combined', ceilingType: 'Двухуровневый', area: 35, hasWalls: true, wallArea: 60, wallSystem: 'sis', hasLights: true, lightsCount: 12, notes: 'Гостиная 35 м² с подсветкой парящего потолка. Стены СИС + Fintek 150 шумоизоляция.', status: 'measurement_scheduled', created_at: daysAgo(4), updated_at: daysAgo(2) },
  { id: 9, name: 'Наталья Григорьева', phone: '+7 (925) 222-44-66', email: '', source: 'website', productType: 'ceiling', ceilingType: 'Тканевый', area: 20, hasWalls: false, hasLights: true, lightsCount: 5, notes: 'Спальня 20 м², тканевый потолок Descor. Интересует скрытый карниз.', status: 'negotiation', created_at: daysAgo(6), updated_at: daysAgo(2) },
  { id: 10, name: 'Константин Смирнов', phone: '+7 (916) 111-55-77', email: 'ksmirnov@list.ru', source: 'calculator', productType: 'combined', ceilingType: 'Матовый ПВХ', area: 45, hasWalls: true, wallArea: 85, wallSystem: 'sis', hasLights: true, lightsCount: 16, notes: 'Коммерческое помещение 45 м². Матовый ПВХ, стены СИС с усиленной шумоизоляцией. Срочно.', status: 'new', created_at: daysAgo(0.1), updated_at: daysAgo(0.1) },
];

// ─── Сделки (deals) ─────────────────────────────────────────────
const deals = [
  { id: 1, leadId: 1, name: 'Елена Кузнецова', phone: '+7 (916) 432-11-09', ceilingType: 'Матовый ПВХ', area: 18, hasWalls: true, wallArea: 36, options: ['Встраиваемые светильники 4 шт', 'Звукоизоляция стен Tönlos'], estimatedPrice: 92300, profit: 28400, status: 'won', stage: 'Закрыто', created_at: daysAgo(13), updated_at: daysAgo(1) },
  { id: 2, leadId: 3, name: 'Ольга Морозова', phone: '+7 (985) 777-88-99', ceilingType: 'Система Идеальных Стен', area: 42, hasWalls: true, wallArea: 42, options: ['Белый матовый текстиль', 'Профиль чёрный мат'], estimatedPrice: 78100, profit: 21200, status: 'negotiation', stage: 'Согласование КП', created_at: daysAgo(3), updated_at: daysAgo(1) },
  { id: 3, leadId: 2, name: 'Алексей Воронов', phone: '+7 (903) 555-23-44', ceilingType: 'Тканевый', area: 22, hasWalls: false, options: ['Светильники 6 шт', 'Парящий профиль'], estimatedPrice: 41200, profit: 13800, status: 'measurement_scheduled', stage: 'Замер назначен на 30.07', created_at: daysAgo(5), updated_at: daysAgo(2) },
  { id: 4, leadId: 6, name: 'Сергей Павлов', phone: '+7 (968) 333-77-11', ceilingType: 'Система Идеальных Стен', area: 30, hasWalls: true, wallArea: 30, options: ['Чёрный муар'], estimatedPrice: 53400, profit: 16100, status: 'installation_scheduled', stage: 'Монтаж 01.08', created_at: daysAgo(10), updated_at: daysAgo(1) },
  { id: 5, leadId: 8, name: 'Иван Петров', phone: '+7 (901) 888-99-00', ceilingType: 'Двухуровневый', area: 35, hasWalls: true, wallArea: 60, options: ['Подсветка парящего потолка', 'Fintek 150 шумоизоляция', '12 светильников'], estimatedPrice: 157800, profit: 46200, status: 'measurement_scheduled', stage: 'Замер 31.07', created_at: daysAgo(4), updated_at: daysAgo(2) },
];

// ─── Расчёты (calculator_requests) ──────────────────────────────
const calcRequests = [
  { id: 1, name: 'Елена Кузнецова', phone: '+7 (916) 432-11-09', ceilingType: 'Матовый ПВХ', area: 18, width: 4, length: 4.5, options: JSON.stringify([{ name: 'Светильники', price: 2000 }]), productType: 'combined', hasWalls: true, wallArea: 36, total: 82700, source: 'calculator', created_at: daysAgo(14) },
  { id: 2, name: 'Алексей Воронов', phone: '+7 (903) 555-23-44', ceilingType: 'Тканевый', area: 22, width: 5, length: 4.4, options: JSON.stringify([{ name: 'Светильники', price: 3000 }, { name: 'Парящий профиль', price: 4500 }]), productType: 'ceiling', total: 41200, source: 'calculator', created_at: daysAgo(6) },
  { id: 3, name: 'Ольга Морозова', phone: '+7 (985) 777-88-99', ceilingType: 'Система Идеальных Стен', area: 42, options: JSON.stringify([{ name: 'Профиль чёрный мат' }]), productType: 'walls', hasWalls: true, wallArea: 42, total: 78100, source: 'calculator', created_at: daysAgo(3) },
  { id: 4, name: 'Дмитрий Соколов', phone: '+7 (926) 111-22-33', ceilingType: 'Глянцевый ПВХ', area: 15, width: 3, length: 5, options: JSON.stringify([{ name: 'Светильники', price: 1500 }, { name: 'Люк', price: 800 }]), productType: 'ceiling', total: 18900, source: 'calculator', created_at: daysAgo(7) },
  { id: 5, name: 'Мария Титова', phone: '+7 (977) 666-00-22', ceilingType: 'Матовый ПВХ', area: 12, width: 3, length: 4, options: JSON.stringify([{ name: 'Светильники', price: 1000 }, { name: 'Обвод труб', price: 350 }]), productType: 'ceiling', total: 12100, source: 'website', created_at: daysAgo(1) },
  { id: 6, name: 'Иван Петров', phone: '+7 (901) 888-99-00', ceilingType: 'Двухуровневый', area: 35, width: 7, length: 5, options: JSON.stringify([{ name: 'Светильники', price: 6000 }, { name: 'Подсветка', price: 8400 }]), productType: 'combined', hasWalls: true, wallArea: 60, total: 157800, source: 'calculator', created_at: daysAgo(4) },
  { id: 7, name: 'Наталья Григорьева', phone: '+7 (925) 222-44-66', ceilingType: 'Тканевый', area: 20, width: 4, length: 5, options: JSON.stringify([{ name: 'Светильники', price: 2500 }, { name: 'Скрытый карниз', price: 1600 }]), productType: 'ceiling', total: 32100, source: 'website', created_at: daysAgo(6) },
  { id: 8, name: 'Анна Белова', phone: '+7 (915) 444-55-66', ceilingType: 'Сатиновый ПВХ', area: 26, width: 5.5, length: 4.7, options: JSON.stringify([{ name: 'Светильники', price: 4000 }]), productType: 'combined', hasWalls: true, wallArea: 52, total: 104500, source: 'calculator', created_at: daysAgo(1) },
  { id: 9, name: 'Константин Смирнов', phone: '+7 (916) 111-55-77', ceilingType: 'Матовый ПВХ', area: 45, width: 9, length: 5, options: JSON.stringify([{ name: 'Светильники', price: 8000 }, { name: 'Усиленная шумоизоляция', price: 13500 }]), productType: 'combined', hasWalls: true, wallArea: 85, total: 211400, source: 'calculator', created_at: daysAgo(0.5) },
  { id: 10, name: 'Сергей Павлов', phone: '+7 (968) 333-77-11', ceilingType: 'Система Идеальных Стен', area: 30, options: JSON.stringify([{ name: 'Чёрный муар' }]), productType: 'walls', hasWalls: true, wallArea: 30, total: 53400, source: 'calculator', created_at: daysAgo(10) },
];

// ─── Задачи (tasks) ─────────────────────────────────────────────
const tasks = [
  { id: 1, title: 'Напомнить о замере — Алексей Воронов', description: 'Запись на замер гостиной 22 м². Подтвердить за день.', dealId: 3, leadId: 2, assignee: 'Менеджер', status: 'pending', dueDate: daysAgo(-1), created_at: daysAgo(3) },
  { id: 2, title: 'Отправить КП — Ольга Морозова', description: 'Сформировать КП на СИС 42 м², чёрный профиль.', dealId: 2, leadId: 3, assignee: 'Менеджер', status: 'pending', dueDate: daysAgo(0), created_at: daysAgo(2) },
  { id: 3, title: 'Подготовить материалы — заказ Сергей Павлов', description: 'Чёрный муар 30 м², профиль ID System.', dealId: 4, leadId: 6, assignee: 'Кладовщик', status: 'done', dueDate: daysAgo(-2), created_at: daysAgo(8) },
  { id: 4, title: 'Связаться — Анна Белова', description: 'Новая заявка комплекс потолок+стены. Уточнить детали.', leadId: 5, assignee: 'Менеджер', status: 'pending', dueDate: daysAgo(0), created_at: daysAgo(0.5) },
  { id: 5, title: 'Согласовать смету — Иван Петров', description: 'Двухуровневый 35 м² + СИС 60 м² с Fintek 150.', dealId: 5, leadId: 8, assignee: 'Менеджер', status: 'in_progress', dueDate: daysAgo(-1), created_at: daysAgo(3) },
  { id: 6, title: 'Закуп материалов — комплекс Смирнов', description: 'Матовый ПВХ 45 м² + СИС 85 м². Проверить наличие MSD.', leadId: 10, assignee: 'Снабженец', status: 'pending', dueDate: daysAgo(1), created_at: daysAgo(0.1) },
];

// ─── Коммерческие предложения (quotes) ──────────────────────────
const quotes = [
  { id: 1, dealId: 1, text: 'Коммерческое предложение\n\nКлиент: Елена Кузнецова\nОбъект: Спальня 18 м²\n\n1. Потолок матовый ПВХ — 18 м² × 450 ₽ = 8 100 ₽\n2. Профиль монтажный — 17 м × 250 ₽ = 4 250 ₽\n3. Светильники встраиваемые 4 шт × 500 ₽ = 2 000 ₽\n4. Система Идеальных Стен — 36 м² × 1 200 ₽ = 43 200 ₽\n5. Профили ID System (6 типов) — 18 600 ₽\n6. Звукоизоляция Tönlos — 8 400 ₽\n7. Монтаж СИС — 16 200 ₽\n\nИтого: 92 300 ₽\nВ том числе НДС: не облагается\nГарантия: 10 лет на текстиль, 5 лет на работы', created_at: daysAgo(12) },
  { id: 2, dealId: 5, text: 'Коммерческое предложение\n\nКлиент: Иван Петров\nОбъект: Гостиная 35 м² (потолок + стены)\n\n1. Потолок двухуровневый — 35 м² × 950 ₽ = 33 250 ₽\n2. Подсветка парящего потолка — 17 м × 500 ₽ = 8 500 ₽\n3. Светильники 12 шт × 500 ₽ = 6 000 ₽\n4. Система Идеальных Стен — 60 м² × 1 200 ₽ = 72 000 ₽\n5. Профили ID System — 28 400 ₽\n6. Fintek 150 шумоизоляция — 6 000 ₽\n7. Комплексная скидка 12% — -18 936 ₽\n\nИтого: 164 814 ₽ → со скидкой 157 800 ₽\nЭкономия: 18 936 ₽', created_at: daysAgo(1) },
];

// ─── Аналитика (analytics_events) ───────────────────────────────
const events = [
  { id: 1, type: 'lead_created', leadId: 1, detail: 'Заявка потолки+стены (18 м²)', created_at: daysAgo(14) },
  { id: 2, type: 'lead_created', leadId: 2, detail: 'Заявка тканевый потолок (22 м²)', created_at: daysAgo(5) },
  { id: 3, type: 'lead_created', leadId: 3, detail: 'Заявка СИС (42 м²)', created_at: daysAgo(3) },
  { id: 4, type: 'deal_created', dealId: 1, detail: 'Создана сделка Елена Кузнецова', created_at: daysAgo(13) },
  { id: 5, type: 'deal_status', dealId: 1, detail: 'Статус: won', created_at: daysAgo(1) },
  { id: 6, type: 'lead_created', leadId: 5, detail: 'Заявка комплекс (26 м² + 52 м²)', created_at: daysAgo(0.5) },
  { id: 7, type: 'lead_created', leadId: 10, detail: 'Заявка коммерческое помещение 45 м²', created_at: daysAgo(0.1) },
  { id: 8, type: 'deal_created', dealId: 5, detail: 'Создана сделка Иван Петров 157 800 ₽', created_at: daysAgo(3) },
  { id: 9, type: 'calc_view', detail: 'Просмотр калькулятора', count: 28, created_at: daysAgo(1) },
  { id: 10, type: 'calc_view', detail: 'Просмотр калькулятора', count: 42, created_at: daysAgo(0) },
];

// ─── Запись файлов ──────────────────────────────────────────────
console.log('Заполнение демо-данными...');
write('leads.json', leads);
write('deals.json', deals);
write('calculator_requests.json', calcRequests);
write('tasks.json', tasks);
write('quotes.json', quotes);
write('analytics_events.json', events);
console.log('Готово! 10 лидов, 5 сделок, 10 расчётов, 6 задач, 2 КП, 10 событий.');
