const db = require('./db');
const ai = require('./ai');
const prices = require('./prices');

function calcLocalEstimate(params) {
  const basePrice = prices.getCeilingPrice(params.ceilingType);
  const perimeter = 2 * (params.width + params.length);
  const canvasPrice = basePrice * params.area;
  let extras = [];
  let extraTotal = 0;

  const spotPrice = prices.getOptionPrice('spot');
  if (params.spots > 0) { const c = params.spots * spotPrice; extras.push(`${params.spots}× светильник = ${c} ₽`); extraTotal += c; }

  const chandelierPrice = prices.getOptionPrice('chandelier');
  if (params.chandelier) { extras.push(`Люстра = ${chandelierPrice} ₽`); extraTotal += chandelierPrice; }

  const ledPrice = prices.getOptionPrice('ledStrip');
  if (params.ledStrip > 0) { const c = params.ledStrip * ledPrice; extras.push(`LED лента ${params.ledStrip} м = ${c} ₽`); extraTotal += c; }

  const pipePrice = prices.getOptionPrice('pipeBypass');
  if (params.pipeBypass > 0) { const c = params.pipeBypass * pipePrice; extras.push(`Обвод труб ${params.pipeBypass} шт = ${c} ₽`); extraTotal += c; }

  const cornicePrice = prices.getOptionPrice('corniceMask');
  if (params.cornice > 0) { const c = params.cornice * cornicePrice; extras.push(`Карниз ${params.cornice} м = ${c} ₽`); extraTotal += c; }

  const hatchPrice = prices.getOptionPrice('hatch');
  if (params.hatch > 0) { const c = params.hatch * hatchPrice; extras.push(`Ревиз. люк ${params.hatch} шт = ${c} ₽`); extraTotal += c; }

  const ventPrice = prices.getOptionPrice('vent');
  if (params.vent > 0) { const c = params.vent * ventPrice; extras.push(`Вент. решётка ${params.vent} шт = ${c} ₽`); extraTotal += c; }

  const nichePrice = prices.getOptionPrice('niche');
  if (params.niche > 0) { const c = params.niche * nichePrice; extras.push(`Ниша ${params.niche} м = ${c} ₽`); extraTotal += c; }

  const profilePrice = prices.getProfilePrice();
  const profileTotal = perimeter * profilePrice;
  extras.push(`Профиль ${perimeter} м × ${profilePrice} ₽ = ${profileTotal} ₽`);
  extraTotal += profileTotal;

  const total = canvasPrice + extraTotal;
  return { canvasPrice, profilePrice: profileTotal, extraTotal, total, extras, perimeter };
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

  try {
    const aiText = await ai.calculatePrice(params.ceilingType, params.area, []);
    const estimate = { ...local, ceilingType: params.ceilingType, area: params.area, width: params.width, length: params.length, options: optionsDesc, aiText: aiText || null };
    db.saveCalcRequest({ ceilingType: params.ceilingType, area: params.area, options: JSON.stringify(optionsDesc), estimatedPrice: local.total });
    db.trackEvent('estimate_generated', { ceilingType: params.ceilingType, area: params.area, total: local.total });
    return estimate;
  } catch (e) {
    return { ...local, ceilingType: params.ceilingType, area: params.area, options: optionsDesc, aiText: null };
  }
}

function generateQuoteText(estimate, client) {
  const lines = [
    '='.repeat(40), 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', 'Натяжные потолки — Потолок Пати', '='.repeat(40), '',
    `Клиент: ${client.name || '—'}`, `Тип потолка: ${estimate.ceilingType}`, `Площадь: ${estimate.area} м² (${estimate.width}×${estimate.length} м)`, '',
    '--- СМЕТА ---', `Полотно: ${estimate.canvasPrice.toLocaleString()} ₽`, `Монтажный профиль: ${estimate.profilePrice.toLocaleString()} ₽`,
  ];

  if (estimate.extras.length > 0) {
    lines.push('Дополнительно:'); estimate.extras.forEach(e => lines.push(`  • ${e}`));
  }

  lines.push('', `ИТОГО: ${estimate.total.toLocaleString()} ₽`);
  lines.push('', 'Включает: материалы, доставку, установку.');
  lines.push('Цена фиксируется после замера.', '');
  lines.push('='.repeat(40));
  lines.push('Потолок Пати · потолокпати.рф');
  return lines.join('\n');
}

module.exports = { generateEstimate, generateQuoteText, calcLocalEstimate };
