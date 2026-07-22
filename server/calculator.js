const db = require('./db');
const ai = require('./ai');

const PRICES = {
  'Матовый ПВХ': 450, 'Глянцевый ПВХ': 500, 'Сатиновый ПВХ': 550, 'Тканевый': 750, 'Двухуровневый': 950,
};

const OPTION_PRICES = {
  spot: 500, chandelier: 1500, ledStrip: 350, pipeBypass: 350, cornice: 400, hatch: 800, vent: 600, niche: 1200,
};

function calcLocalEstimate(params) {
  const basePrice = PRICES[params.ceilingType] || 500;
  const perimeter = 2 * (params.width + params.length);
  const canvasPrice = basePrice * params.area;
  let extras = [];
  let extraTotal = 0;

  if (params.spots > 0) { const c = params.spots * 500; extras.push(`${params.spots}× светильник = ${c} ₽`); extraTotal += c; }
  if (params.chandelier) { extras.push('Люстра = 1 500 ₽'); extraTotal += 1500; }
  if (params.ledStrip > 0) { const c = params.ledStrip * 350; extras.push(`LED лента ${params.ledStrip} м = ${c} ₽`); extraTotal += c; }
  if (params.pipeBypass > 0) { const c = params.pipeBypass * 350; extras.push(`Обвод труб ${params.pipeBypass} шт = ${c} ₽`); extraTotal += c; }
  if (params.cornice > 0) { const c = params.cornice * 400; extras.push(`Карниз ${params.cornice} м = ${c} ₽`); extraTotal += c; }
  if (params.hatch > 0) { const c = params.hatch * 800; extras.push(`Ревиз. люк ${params.hatch} шт = ${c} ₽`); extraTotal += c; }
  if (params.vent > 0) { const c = params.vent * 600; extras.push(`Вент. решётка ${params.vent} шт = ${c} ₽`); extraTotal += c; }
  if (params.niche > 0) { const c = params.niche * 1200; extras.push(`Ниша ${params.niche} м = ${c} ₽`); extraTotal += c; }

  const profilePrice = perimeter * 250;
  extras.push(`Профиль ${perimeter} м = ${profilePrice} ₽`);
  extraTotal += profilePrice;

  const total = canvasPrice + extraTotal;
  return { canvasPrice, profilePrice, extraTotal, total, extras, perimeter };
}

async function generateEstimate(params) {
  const local = calcLocalEstimate(params);

  const optionsDesc = [];
  if (params.spots > 0) optionsDesc.push(`Встраиваемые светильники: ${params.spots} шт`);
  if (params.chandelier) optionsDesc.push('Монтаж люстры');
  if (params.ledStrip > 0) optionsDesc.push(`LED-лента: ${params.ledStrip} м`);
  if (params.pipeBypass > 0) optionsDesc.push(`Обвод труб: ${params.pipeBypass} шт`);
  if (params.cornice > 0) optionsDesc.push(`Маскировка карниза: ${params.cornice} м`);
  if (params.hatch > 0) optionsDesc.push(`Ревизионный люк: ${params.hatch} шт`);
  if (params.vent > 0) optionsDesc.push(`Вентиляционная решётка: ${params.vent} шт`);
  if (params.niche > 0) optionsDesc.push(`Ниша: ${params.niche} м`);

  const userMsg = `Составь смету для натяжного потолка:
Тип: ${params.ceilingType}
Площадь: ${params.area} м²
Ширина: ${params.width} м, Длина: ${params.length} м (периметр: ${local.perimeter} м)
Опции: ${optionsDesc.join(', ') || 'нет'}
Цена полотна: ${local.canvasPrice} ₽
Профиль: ${local.perimeter} м × 250 ₽ = ${local.profilePrice} ₽
Доп. работы: ${local.extraTotal} ₽
Итого: ${local.total} ₽

Напиши официальную смету для клиента. Раздели на разделы: полотно, профиль, доп. работы, итог. Без Markdown, простой текст.`;

  try {
    const aiText = await ai.calculatePrice(params.ceilingType, params.area, []);
    const estimate = {
      ...local,
      ceilingType: params.ceilingType,
      area: params.area,
      width: params.width,
      length: params.length,
      options: optionsDesc,
      aiText: aiText || null,
    };
    db.saveCalcRequest({ ceilingType: params.ceilingType, area: params.area, options: JSON.stringify(optionsDesc), estimatedPrice: local.total });
    db.trackEvent('estimate_generated', { ceilingType: params.ceilingType, area: params.area, total: local.total });
    return estimate;
  } catch (e) {
    return { ...local, ceilingType: params.ceilingType, area: params.area, options: optionsDesc, aiText: null };
  }
}

function generateQuoteText(estimate, client) {
  const lines = [
    '='.repeat(40),
    'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
    'Натяжные потолки — Потолок Пати',
    '='.repeat(40),
    '',
    `Клиент: ${client.name || '—'}`,
    `Тип потолка: ${estimate.ceilingType}`,
    `Площадь: ${estimate.area} м² (${estimate.width}×${estimate.length} м)`,
    '',
    '--- СМЕТА ---',
    `Полотно: ${estimate.canvasPrice.toLocaleString()} ₽`,
    `Монтажный профиль: ${estimate.profilePrice.toLocaleString()} ₽`,
  ];

  if (estimate.extras.length > 0) {
    lines.push('Дополнительно:');
    estimate.extras.forEach(e => lines.push(`  • ${e}`));
  }

  lines.push('', `ИТОГО: ${estimate.total.toLocaleString()} ₽`);
  lines.push('', 'Включает: материалы, доставку, установку.');
  lines.push('Цена фиксируется после замера.', '');
  lines.push('='.repeat(40));
  lines.push('Потолок Пати · потолокпати.рф');

  return lines.join('\n');
}

module.exports = { generateEstimate, generateQuoteText, calcLocalEstimate };
