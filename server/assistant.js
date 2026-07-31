const ai = require('./ai');
const db = require('./db');
const prices = require('./prices');

function buildFAQ() {
  const p = prices.getAll();
  const ceil = id => p.ceilingTypes.find(c => c.id === id);
  const opt = id => p.options.find(o => o.id === id);
  const pr = p.profile;

  return [
    { q: ['срок', 'долго', 'быстро', 'когда'], a: 'Замер — на следующий день после заявки. Установка — через 1–3 дня после замера.' },
    { q: ['гарант'], a: 'Гарантия 10 лет на полотно, 5 лет на монтаж.' },
    { q: ['свет', 'люстр', 'ламп', 'spot', 'точк'], a: 'Встраиваемые светильники — ' + opt('spot').price + ' р/шт, люстра — ' + opt('chandelier').price + ' р, LED-лента — ' + opt('ledStrip').price + ' р/м.' },
    { q: ['тканев', 'матов', 'глянц', 'сатин'], a: 'Матовый — без бликов. Глянцевый — увеличивает пространство. Сатиновый — перламутр. Тканевый — дышит, как штукатурка.' },
    { q: ['профиль', 'baguette', 'багет'], a: 'Стандартный стеновой профиль — ' + pr.price + ' р/м. Потолочный (для парящих) — от 350 р/м. Цветной алюминий — от 400 р/м.' },
    { q: ['люк', 'hatch', 'ревиз'], a: 'Ревизионный люк — ' + opt('hatch').price + ' р/шт. Устанавливается в нишу или в полотно.' },
    { q: ['карниз', 'cornice', 'штор'], a: 'Маскировка карниза — ' + opt('corniceMask').price + ' р/м. Ниша для штор — от ' + opt('niche').price + ' р/м.' },
    { q: ['труб', 'pipe', 'обвод'], a: 'Обвод трубы отопления — ' + opt('pipeBypass').price + ' р/шт.' },
    { q: ['вент', 'vent', 'решёт'], a: 'Вентиляционная решётка — ' + opt('vent').price + ' р/шт.' },
    { q: ['двухуровн', 'two.level', '2 ур'], a: 'Двухуровневый потолок — от ' + ceil('twolevel').pricePerM2 + ' р/м2. Цена зависит от сложности конструкции.' },
    { q: ['пар', 'flying', 'парящ'], a: 'Парящий потолок со светодиодной лентой по периметру. Дороже стандартного на 300–500 р/м.' },
    { q: ['цена', 'стоил', 'прайс', 'сколько'], a: 'Цены: ' + p.ceilingTypes.map(function(c) { return c.label.toLowerCase() + ' от ' + c.pricePerM2 + ' р/м2'; }).join(', ') + '.' },
  ];
}

async function askAssistant(messages, context) {
  if (!ai.getClient()) {
    return fallbackAnswer(messages[messages.length - 1]?.content || '');
  }

  const ctx = await buildContext(context);
  const contextBlock = ctx ? '\nКонтекст (текущие данные CRM):\n' + ctx : '';

  const systemPrompt = 'Ты — ассистент менеджера по продажам натяжных потолков «Потолок Пати».' + contextBlock + '\n\nТвои задачи:\n1. Помогать менеджеру отвечать клиентам — давать готовые формулировки для мессенджеров\n2. Подсказывать варианты решений под задачу клиента\n3. Отвечать на FAQ по продукции\n4. Помогать составлять КП и сообщения\n\nВажно:\n- Отвечай кратко, конкретно\n- Если нужен текст для клиента — оберни его в кавычки\n- Если вопрос не по теме — предложи уточнить\n- Цены указывай только из прайса компании\n- Если спрашивают про конкретного клиента/лид — используй данные из контекста, но не выдумывай то, чего там нет';

  try {
    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)];
    const content = await ai.tryCompletion(fullMessages, null, 800, 0.5);
    return { role: 'assistant', content };
  } catch (err) {
    return { role: 'assistant', content: fallbackAnswer(messages[messages.length - 1]?.content || '') };
  }
}

async function buildContext(userContext) {
  try {
    const leads = db.getLeads();
    const deals = db.getDeals();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);

    const todayLeads = leads.filter(l => (l.created_at || '').slice(0, 10) === today);
    const yesterdayLeads = leads.filter(l => (l.created_at || '').slice(0, 10) === yesterday);
    const statusCounts = {};
    leads.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
    const dealStages = {};
    deals.forEach(d => { dealStages[d.status] = (dealStages[d.status] || 0) + 1; });

    const lastLeads = leads.slice(0, 8).map(l => {
      const label = { new: 'новый', deal: 'в работе', won: 'выигран', lost: 'потерян' };
      return '#' + l.id + ' ' + (l.name || '—') + ' (' + (l.phone || '—') + '), ' + (l.source || '—') + ', ' + (label[l.status] || l.status || '—');
    }).join('\n  ');

    const lastDeals = deals.slice(0, 8).map(d => {
      const label = { negotiation: 'переговоры', measurement_scheduled: 'замер', measurement_done: 'замер выполнен', won: 'выиграна', lost: 'потеряна' };
      return '#' + d.id + ' лид#' + (d.leadId ?? '—') + ' ' + (d.ceilingType || '—') + ' ' + (d.estimatedPrice ? d.estimatedPrice.toLocaleString('ru-RU') + ' ₽' : '') + ' ' + (label[d.status] || d.status || '—');
    }).join('\n  ');

    const p = prices.getAll();
    const priceLines = p.ceilingTypes.map(c => c.label + ' — ' + c.pricePerM2 + ' ₽/м²').join(', ');

    return '- Всего лидов: ' + leads.length
      + '\n- Новых сегодня: ' + todayLeads.length + (yesterdayLeads.length ? ' (вчера: ' + yesterdayLeads.length + ')' : '')
      + '\n- Лиды по статусам: ' + (Object.keys(statusCounts).length ? Object.entries(statusCounts).map(([k, v]) => k + ': ' + v).join(', ') : 'нет')
      + '\n- Сделок всего: ' + deals.length
      + '\n- Сделки по стадиям: ' + (Object.keys(dealStages).length ? Object.entries(dealStages).map(([k, v]) => k + ': ' + v).join(', ') : 'нет')
      + '\n- Последние лиды:\n  ' + (lastLeads || 'нет')
      + '\n- Последние сделки:\n  ' + (lastDeals || 'нет')
      + '\n- Прайс: ' + priceLines;
  } catch (e) {
    return '';
  }
}

function fallbackAnswer(text) {
  const lower = text.toLowerCase();
  const faq = buildFAQ();

  for (const item of faq) {
    if (item.q.some(k => lower.includes(k))) return item.a;
  }

  return 'Чем могу помочь? Могу подсказать цены, сроки, помочь с текстом для клиента или составить КП. Напишите ваш вопрос.';
}

function generateMessageTemplate(type, data) {
  const templates = {
    measurement_confirmation: function(d) {
      return 'Здравствуйте, ' + d.name + '! Запись на замер confirmed на ' + (d.date || 'завтра') + ' в ' + (d.time || '10:00') + '. Замерщик приедет по адресу: ' + (d.address || 'уточним') + '. Ориентировочная длительность — 30 мин. С собой: рулетка, стремянка, образцы. До встречи!';
    },
    quote_followup: function(d) {
      return 'Здравствуйте, ' + d.name + '! Отправили вам смету на ' + (d.ceilingType || 'потолок') + '. Сумма: ' + (d.total ? d.total.toLocaleString() + ' р' : 'по смете') + '. Готовы ответить на вопросы и согласовать удобное время для замера.';
    },
    installation_reminder: function(d) {
      return 'Напоминаем: установка потолка завтра в ' + (d.time || '10:00') + ' по адресу: ' + (d.address || 'уточнённому') + '. Монтаж займёт 2–4 часа. Пожалуйста, освободите комнату от мебели по возможности. По вопросам: +7 (XXX) XXX-XX-XX';
    },
    lead_first: function(d) {
      return 'Здравствуйте, ' + d.name + '! Спасибо за заявку на потолок. Подскажите, какой тип потолка вас интересует и какая площадь комнаты? Могу сразу сделать примерный расчёт.';
    },
    bundle_offer: function(d) {
      const ceiling = d.ceilingTotal ? d.ceilingTotal.toLocaleString('ru-RU') + ' ₽' : 'по смете';
      const walls = d.wallsTotal ? d.wallsTotal.toLocaleString('ru-RU') + ' ₽' : 'по смете';
      const discount = d.discount ? d.discount.toLocaleString('ru-RU') + ' ₽' : '12%';
      const total = d.total ? d.total.toLocaleString('ru-RU') + ' ₽' : 'по смете';
      return 'Здравствуйте, ' + d.name + '! Посчитали комплекс «Потолки + Система Идеальных Стен» для вашего объекта:\n\n• Потолок (' + (d.ceilingType || 'выбранный тип') + '): ' + ceiling + '\n• Стены СИС (' + (d.wallsArea || 'ваша площадь') + ' м²): ' + walls + '\n• Комплексная скидка: -' + discount + '\n\nИтого комплекс: ' + total + '\n\nТак вы экономите на одном монтаже и получаете единый стиль интерьера. Хотите, зафиксирую расчёт и согласуем замер?';
    },
  };

  const fn = templates[type];
  return fn ? fn(data) : null;
}

module.exports = { askAssistant, generateMessageTemplate, buildFAQ };
