const OpenAI = require('openai');

const prices = require('./prices');

function buildSystemPrompt() {
  const p = prices.getAll();
  const priceLines = p.ceilingTypes.map(c => `- ${c.label} — от ${c.pricePerM2} ₽/м²`);
  const extraLines = p.options.map(o => `- ${o.label} — ${o.price} ₽/${o.unit}`);
  extraLines.push(`- ${p.profile.label} — ${p.profile.price} ₽/${p.profile.unit}`);
  // Add SIS walls pricing
  const sis = p.sis;
  if (sis && sis.components && sis.components.fabric) {
    priceLines.push(`- Архитектурный текстиль (стены) — от ${p.sis.components.fabric.price !== undefined ? p.sis.components.fabric.price : 0} ₽/м² (базовая ткань)`);
    // Note: actual SIS pricing is more complex - we'll show a base price
  }

  return `Ты — дружелюбный помощник компании «Потолок Пати» — мы занимаемя потолками и архитектурным текстилем (стенами) «ID System»;

  Отвечай кратко, по делу, на русском языке. Используй эмодзи умеренно.

  Твои задачи:
  1. Отвечать на вопросы клиентов о типах потолков, стенах, ценах, сроках, установке.
  2. Собирать контактные данные: имя, телефон, площадь, тип потолка или стен, нужны ли светильники.
  3. Если клиент готов — предложить вызвать замерщика.

  Прайс (ориентировочный, за м² с установкой):
  ${priceLines.join('\n')}

  Дополнительно:
  ${extraLines.join('\n')}

  Стены (архитектурный текстиль ID System) считаются по индивидуальному проекту — базовая стоимость ткани от 1200 ₽/м² + монтаж.

  Периметр комнаты для расчёта L = 2*(ширина+длина)

  Сроки: замер — на следующий день, установка — через 1-3 дня после замера.
  Гарантия: 10 лет на полотно, 5 лет на монтаж.

  Если не знаешь точного ответа — предложи уточнить у менеджера и оставь контакт для связи.

  Не выдумывай цены — используй только указанные выше. Если нужно посчитать — напиши примерный расчёт.`;
}

function buildCalcPrompt() {
  const p = prices.getAll();
  const priceLines = p.ceilingTypes.map(c => `- ${c.label} — ${c.pricePerM2} ₽`);
  const extraLines = p.options.map(o => `- ${o.label} — ${o.price} ₽/${o.unit}`);

  return `Ты — калькулятор стоимости натяжных потолков. 
Клиент выбрал конфигурацию. Объясни понятным языком, из чего сложилась цена.
Напиши кратко, по пунктам. В конце укажи итоговую сумму. Не используй Markdown-разметку, только простой текст. Используй эмодзи умеренно.

Формат ответа:
Тип потолка: ...
Площадь: ... м²
Цена за полотно: ... ₽
Дополнительно: ...
Итого: ~... ₽

Примерные цены за м²:
${priceLines.join('\n')}

Дополнительно:
${extraLines.join('\n')}`;
}

// Состояние баланса (in-memory, сбрасывается при перезапуске)
let lowBalance = false;
let freeModelExhausted = false;

let client;

function getClient() {
  if (client) return client;

  // Hubris (приоритет)
  if (process.env.HUBRIS_API_KEY) {
    client = new OpenAI({
      apiKey: process.env.HUBRIS_API_KEY,
      baseURL: process.env.HUBRIS_BASE_URL || 'https://hubris.pw/v1',
    });
    return client;
  }

  // OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey !== 'sk-your-key-here') {
    client = new OpenAI({ apiKey: openaiKey });
    return client;
  }

  return null;
}

function useHubris() {
  return !!process.env.HUBRIS_API_KEY;
}

function getPrimaryModel() {
  if (useHubris()) {
    return process.env.HUBRIS_MODEL || 'deepseek-v4-flash-free';
  }
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function getFreeModel() {
  return process.env.HUBRIS_FREE_MODEL || 'hubris/free';
}

function getActiveModel() {
  if (lowBalance && useHubris()) return getFreeModel();
  return getPrimaryModel();
}

function getProviderName() {
  if (useHubris()) return 'Hubris';
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-key-here') return 'OpenAI';
  return null;
}

function isBalanceError(err) {
  const status = err.status;
  const msg = (err.message || '').toLowerCase();
  if (status === 402) return true;
  if (status === 429 && msg.includes('insufficient_quota')) return true;
  if (msg.includes('insufficient balance')) return true;
  if (msg.includes('insufficient credits')) return true;
  if (msg.includes('balance')) return true;
  return false;
}

function isRateLimitError(err) {
  const status = err.status;
  const msg = (err.message || '').toLowerCase();
  if (status === 429 && msg.includes('daily_limit')) return true;
  if (status === 429 && msg.includes('free-tier')) return true;
  return false;
}

async function tryCompletion(messages, system, maxTokens, temperature) {
  const ai = getClient();
  if (!ai) return null;

  const model = getActiveModel();
  const fullMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;

  try {
    const response = await ai.chat.completions.create({
      model,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature,
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.error('AI error [' + model + ']:', err.status, err.message);
    throw err;
  }
}

async function chat(messages) {
  if (!getClient()) {
    return { role: 'assistant', content: fallbackChatResponse(messages) };
  }

  const lastMessages = messages.slice(-10);
  const useFree = lowBalance || freeModelExhausted;

  try {
    const content = await tryCompletion(lastMessages, buildSystemPrompt(), 600, 0.7);
    return { role: 'assistant', content };
  } catch (err) {
    if (!useFree && useHubris() && isBalanceError(err)) {
      lowBalance = true;
      console.log('Баланс Hubris на нуле, переключаюсь на бесплатную модель');
      try {
        const content = await tryCompletion(lastMessages, buildSystemPrompt(), 600, 0.7);
        return { role: 'assistant', content };
      } catch (freeErr) {
        console.error('Бесплатная модель тоже не ответила:', freeErr.message);
        if (isRateLimitError(freeErr)) {
          freeModelExhausted = true;
        }
        return { role: 'assistant', content: fallbackChatResponse(messages) };
      }
    }

    if (isRateLimitError(err)) {
      freeModelExhausted = true;
    }

    return { role: 'assistant', content: fallbackChatResponse(messages) };
  }
}

async function calculatePrice(ceilingType, area, options) {
  if (!getClient()) {
    return fallbackCalcResponse(ceilingType, area, options);
  }

  const optionsText = options.map(o => o.name + ': ' + o.value).join(', ') || 'нет';
  const userMessages = [
    { role: 'user', content: 'Тип потолка: ' + ceilingType + ', площадь: ' + area + ' м², опции: ' + optionsText }
  ];

  const useFree = lowBalance || freeModelExhausted;

  try {
    return await tryCompletion(userMessages, buildCalcPrompt(), 500, 0.5);
  } catch (err) {
    if (!useFree && useHubris() && isBalanceError(err)) {
      lowBalance = true;
      console.log('Баланс Hubris на нуле (калькулятор), переключаюсь на бесплатную модель');
      try {
        return await tryCompletion(userMessages, buildCalcPrompt(), 500, 0.5);
      } catch (freeErr) {
        if (isRateLimitError(freeErr)) freeModelExhausted = true;
        return fallbackCalcResponse(ceilingType, area, options);
      }
    }
    if (isRateLimitError(err)) freeModelExhausted = true;
    return fallbackCalcResponse(ceilingType, area, options);
  }
}

function fallbackChatResponse(messages) {
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';

  if (lastMsg.includes('цен') || lastMsg.includes('стоил') || lastMsg.includes('прайс') || lastMsg.includes('сколько')) {
    return 'Вот наш прайс:\n• Матовый ПВХ — от 450 ₽/м²\n• Глянцевый ПВХ — от 500 ₽/м²\n• Сатиновый — от 550 ₽/м²\n• Тканевый — от 750 ₽/м²\n• Двухуровневый — от 950 ₽/м²\n\nЦена зависит от площади и доп. опций. Хотите примерный расчёт?';
  }
  if (lastMsg.includes('срок') || lastMsg.includes('долго') || lastMsg.includes('быстро') || lastMsg.includes('когда')) {
    return 'Замер — на следующий день после заявки. Установка — через 1–3 дня после замера. Всё аккуратно и быстро!';
  }
  if (lastMsg.includes('расчёт') || lastMsg.includes('расчет') || lastMsg.includes('рассчит')) {
    return 'Отлично, посчитаем! Подскажите:\n1. Площадь помещения (м²)\n2. Тип потолка (матовый, глянцевый, сатиновый, тканевый или двухуровневый)\n\nА ещё можете посчитать сами в калькуляторе на сайте — это займёт минуту.';
  }
  if (lastMsg.includes('позвон') || lastMsg.includes('звон') || lastMsg.includes('перезвон')) {
    return 'Конечно! Оставьте номер телефона — перезвоним в течение 15 минут в рабочее время (9:00–20:00).';
  }
  if (lastMsg.includes('замер') || lastMsg.includes('заявк') || lastMsg.includes('вызов')) {
    return 'Отлично! Для вызова замерщика напишите, пожалуйста:\n1. Ваше имя\n2. Телефон\n3. Примерная площадь комнаты\n4. Какой тип потолка интересует?';
  }
  if (lastMsg.includes('гарант')) {
    return 'Даём гарантию 10 лет на полотно и 5 лет на монтаж. Никаких трещин и провисаний!';
  }
  if (lastMsg.includes('свет') || lastMsg.includes('люстр') || lastMsg.includes('ламп')) {
    return 'Можем установить встраиваемые светильники — 500 ₽/шт, или смонтировать люстру — 1 500 ₽. Сколько точек света планируете?';
  }
  if (lastMsg.includes('тканев') || lastMsg.includes('матов') || lastMsg.includes('глянц') || lastMsg.includes('сатин')) {
    return 'У каждого типа свои плюсы:\n• Матовый — классика, без бликов\n• Глянцевый — визуально увеличивает комнату\n• Сатиновый — мягкий перламутровый блеск\n• Тканевый — дышит, похож на идеальную штукатурку\n\nКакой вариант больше нравится?';
  }
  return 'Здравствуйте! Я помощник компании «Потолок Пати» 🏠\n\nМогу рассказать о типах потолков, сориентировать по цене, вызвать замерщика. Что вас интересует?';
}

function fallbackCalcResponse(ceilingType, area, options) {
  const prices = {
    'Матовый ПВХ': 450,
    'Глянцевый ПВХ': 500,
    'Сатиновый ПВХ': 550,
    'Тканевый': 750,
    'Двухуровневый': 950,
  };

  const basePrice = prices[ceilingType] || 500;
  const canvasPrice = basePrice * area;
  let extraPrice = 0;
  let extraDetails = [];

  for (const opt of options) {
    if (opt.name === 'Встраиваемые светильники') {
      const count = parseInt(opt.value) || 0;
      extraPrice += count * 500;
      extraDetails.push(count + ' × светильник = ' + (count * 500) + ' ₽');
    }
    if (opt.name === 'Монтаж люстры') {
      extraPrice += 1500;
      extraDetails.push('Монтаж люстры = 1 500 ₽');
    }
    if (opt.name === 'Обвод труб') {
      const count = parseInt(opt.value) || 1;
      extraPrice += count * 350;
      extraDetails.push('Обвод ' + count + ' тр. = ' + (count * 350) + ' ₽');
    }
    if (opt.name === 'Маскировка карниза') {
      const len = parseFloat(opt.value) || 0;
      extraPrice += len * 400;
      extraDetails.push('Карниз ' + len + ' м = ' + Math.round(len * 400) + ' ₽');
    }
  }

  const total = canvasPrice + extraPrice;
  return 'Тип потолка: ' + ceilingType + '\n'
    + 'Площадь: ' + area + ' м²\n'
    + 'Цена за полотно: ' + Math.round(canvasPrice) + ' ₽\n'
    + 'Дополнительно: ' + (extraDetails.length ? extraDetails.join(', ') : 'нет') + '\n'
    + 'Итого: ~' + Math.round(total) + ' ₽\n\n'
    + 'Это ориентировочная цена. Точная — после замера. Хотите вызвать замерщика?';
}

function getLowBalance() { return lowBalance; }

module.exports = { chat, calculatePrice, getModel: getActiveModel, getProviderName, getLowBalance, tryCompletion, getClient };
