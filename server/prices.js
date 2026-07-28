const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'prices.json');

const defaults = {
  ceilingTypes: [
    { id: 'matte', label: 'Матовый ПВХ', pricePerM2: 450 },
    { id: 'glossy', label: 'Глянцевый ПВХ', pricePerM2: 500 },
    { id: 'satin', label: 'Сатиновый ПВХ', pricePerM2: 550 },
    { id: 'fabric', label: 'Тканевый', pricePerM2: 750 },
    { id: 'twolevel', label: 'Двухуровневый', pricePerM2: 950 },
  ],
  options: [
    { id: 'spot', label: 'Встраиваемый светильник', unit: 'шт', price: 500 },
    { id: 'chandelier', label: 'Монтаж люстры', unit: 'шт', price: 1500 },
    { id: 'ledStrip', label: 'LED-лента', unit: 'м', price: 350 },
    { id: 'pipeBypass', label: 'Обвод трубы отопления', unit: 'шт', price: 350 },
    { id: 'corniceMask', label: 'Маскировка карниза', unit: 'м', price: 400 },
    { id: 'hatch', label: 'Ревизионный люк', unit: 'шт', price: 800 },
    { id: 'vent', label: 'Вентиляционная решётка', unit: 'шт', price: 600 },
    { id: 'niche', label: 'Ниша для штор', unit: 'м', price: 1200 },
  ],
  profile: { label: 'Монтажный профиль', unit: 'м', price: 250 },
  sis: {
    components: {
      profile: { label: 'Профиль ID System', unit: 'м', price: 0 },
      fabric: { label: 'Архитектурный текстиль', unit: 'м²', price: 0 },
      damper: { label: 'Демпферные вставки', unit: 'м', price: 0 },
    },
    soundproofPrice: 1200,
    soundproofLabel: 'Звукоизоляция ЮНИТ ПРЕМИУМ',
    paintableLabel: 'Полотно под покраску',
    colors: ['Белый мат', 'Чёрный мат', 'Белый муар', 'Чёрный муар'],
  },
  walls: {
    materials: {
      fabric: { label: 'Полотно натяжное (Tönlos Heavy Felt)', unit: 'м²', companyPrice: 480, clientPrice: 950, wastePercent: 10 },
      topProfile: { label: 'Профиль верхний (потолочный)', unit: 'м', companyPrice: 120, clientPrice: 300 },
      bottomProfile: { label: 'Профиль нижний (теневой)', unit: 'м', companyPrice: 110, clientPrice: 280 },
      cornerInternal: { label: 'Уголок внутренний', unit: 'шт', companyPrice: 45, clientPrice: 120 },
      cornerExternal: { label: 'Уголок внешний', unit: 'шт', companyPrice: 55, clientPrice: 150 },
      substrate: { label: 'Подложка Tönlos', unit: 'м²', companyPrice: 90, clientPrice: 200 },
      adhesive: { label: 'Клей Tönlos', unit: 'шт', companyPrice: 350, clientPrice: 700, perMeters: 15 },
      embeddedPart: { label: 'Закладная под объект', unit: 'шт', companyPrice: 80, clientPrice: 250 },
    },
    installation: {
      wallFabric: { label: 'Монтаж полотна', unit: 'м²', companyRate: 200, clientRate: 400 },
      topProfile: { label: 'Монтаж верхнего профиля', unit: 'м', companyRate: 90, clientRate: 200 },
      bottomProfile: { label: 'Монтаж нижнего профиля', unit: 'м', companyRate: 80, clientRate: 180 },
      corner: { label: 'Оформление угла', unit: 'шт', companyRate: 150, clientRate: 350 },
      opening: { label: 'Оформление проёма', unit: 'шт', companyRate: 250, clientRate: 600 },
      column: { label: 'Огибание колонны', unit: 'шт', companyRate: 400, clientRate: 900 },
      beam: { label: 'Огибание балки', unit: 'шт', companyRate: 350, clientRate: 800 },
      niche: { label: 'Оформление ниши', unit: 'шт', companyRate: 300, clientRate: 700 },
      cutout: { label: 'Вырез под элемент', unit: 'шт', companyRate: 100, clientRate: 250 },
      heightSurcharge: { label: 'Доплата за высоту (>3.5м)', unit: '%', companyRate: 15, clientRate: 15 },
    },
    objectTreatments: {
      door: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      window: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      battery: { treatment: 'cutout', installRate: 'cutout', needsEmbed: false },
      tv: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      socket: { treatment: 'cutout', installRate: 'cutout', needsEmbed: false },
      switch: { treatment: 'cutout', installRate: 'cutout', needsEmbed: false },
      slopeWindow: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      slopeBalcony: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      balconyRight: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      balconyLeft: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      balconyDouble: { treatment: 'bypass', installRate: 'opening', needsEmbed: true },
      columnRect: { treatment: 'wrap', installRate: 'column', needsEmbed: false },
      columnRound: { treatment: 'wrap', installRate: 'column', needsEmbed: false },
      beam: { treatment: 'wrap', installRate: 'beam', needsEmbed: false },
      boxNiche: { treatment: 'bypass', installRate: 'niche', needsEmbed: true },
      cutout: { treatment: 'cutout', installRate: 'cutout', needsEmbed: false },
    },
  },
};

function ensureFile() {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaults, null, 2), 'utf-8');
}

function getAll() {
  ensureFile();
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!data.sis) {
    data.sis = defaults.sis;
  } else if (data.sis.basePrice !== undefined && !data.sis.components) {
    data.sis.components = {
      profile: { label: 'Профиль ID System', unit: 'м', price: 0 },
      fabric: { label: 'Архитектурный текстиль', unit: 'м²', price: 0 },
      damper: { label: 'Демпферные вставки', unit: 'м', price: 0 },
    };
    delete data.sis.basePrice;
    delete data.sis.baseLabel;
    delete data.sis.baseUnit;
  }
  if (!data.sis.components) data.sis.components = defaults.sis.components;
  return data;
}

function save(data) {
  ensureFile();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  try { require('./iks-calculator').resetPriceCache(); } catch (_) {}
}

function getCeilingPrice(label) {
  const data = getAll();
  const found = data.ceilingTypes.find(c => c.label === label);
  return found ? found.pricePerM2 : 500;
}

function getOptionPrice(id) {
  const data = getAll();
  const found = data.options.find(o => o.id === id);
  return found ? found.price : 0;
}

function getProfilePrice() {
  return getAll().profile.price;
}

function getWallPrices() {
  return getAll().walls || defaults.walls;
}

function saveWallPrices(wallData) {
  const data = getAll();
  data.walls = wallData;
  save(data);
}

function getSisPrices() {
  return getAll().sis || defaults.sis;
}

function formatPriceList() {
  const data = getAll();
  const lines = data.ceilingTypes.map(c => `- ${c.label} — от ${c.pricePerM2} ₽/м²`);
  lines.push('');
  lines.push('Дополнительно:');
  data.options.forEach(o => lines.push(`- ${o.label} — ${o.price} ₽/${o.unit}`));
  lines.push(`- ${data.profile.label} — ${data.profile.price} ₽/${data.profile.unit}`);
  return lines.join('\n');
}

function getAiPriceContext() {
  const data = getAll();
  return {
    ceilingTypes: data.ceilingTypes.map(c => ({ label: c.label, price: c.pricePerM2 })),
    options: data.options.map(o => ({ label: o.label, price: o.price, unit: o.unit })),
    profile: data.profile,
    sis: {
      components: data.sis.components,
      soundproofPrice: data.sis.soundproofPrice,
    },
  };
}

module.exports = { getAll, save, getCeilingPrice, getOptionPrice, getProfilePrice, getWallPrices, saveWallPrices, getSisPrices, formatPriceList, getAiPriceContext, defaults };
