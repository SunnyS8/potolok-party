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

  const contextBlock = context ? '\nКонтекст (текущие данные):\n- Всего лидов: ' + (context.totalLeads || '—') + '\n- Новых сегодня: ' + (context.todayLeads || '—') + '\n- Активных сделок: ' + (context.activeDeals || '—') + '\n- Последний лид: ' + (context.lastLead || '—') + '\n' : '';

  const systemPrompt = 'Ты — ассистент менеджера по продажам натяжных потолков «Потолок Пати».' + contextBlock + '\n\nТвои задачи:\n1. Помогать менеджеру отвечать клиентам — давать готовые формулировки для мессенджеров\n2. Подсказывать варианты решений под задачу клиента\n3. Отвечать на FAQ по продукции\n4. Помогать составлять КП и сообщения\n\nВажно:\n- Отвечай кратко, конкретно\n- Если нужен текст для клиента — оберни его в кавычки\n- Если вопрос не по теме — предложи уточнить\n- Цены указывай только из прайса компании';

  try {
    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)];
    const content = await ai.tryCompletion(fullMessages, null, 800, 0.5);
    return { role: 'assistant', content };
  } catch (err) {
    return { role: 'assistant', content: fallbackAnswer(messages[messages.length - 1]?.content || '') };
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
  };

  const fn = templates[type];
  return fn ? fn(data) : null;
}

module.exports = { askAssistant, generateMessageTemplate, buildFAQ };
