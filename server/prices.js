const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : process.env.VERCEL === '1'
    ? '/tmp/potolok-data'
    : path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'prices.json');

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
  upgrades: [
    { id: 'visualization', label: '3D-визуализация', type: 'fixed', price: 2900, unit: 'шт', desc: 'Фотореалистичный рендер комнаты до монтажа' },
    { id: 'expressSurvey', label: 'Срочный замер', type: 'fixed', price: 1500, unit: 'шт', desc: 'Выезд на следующий день' },
  ],
  iks: {
    wallpaperPerSqm: 1200,
    profileBase: 450,
    profileInnerCorner: 480,
    profileOuterCorner: 480,
    profileShadowBaseboard: 520,
    profileWallCeiling: 490,
    profileSeparator: 510,
    tonlosAcousticFelt: 1800,
    tonlosHeavyFelt: 2400,
    fintek150: 3500,
    insertID: 2200,
    insertType1: 85,
    insertType2: 120,
    insertType3: 140,
    adhesiveLiquidPer5L: 4500,
    adhesiveSprayPer650ml: 850,
  },
  // Себестоимость материалов IKS (те же ключи, что в iks — клиентские цены)
  iksCompany: {
    wallpaperPerSqm: 650,
    profileBase: 240,
    profileInnerCorner: 260,
    profileOuterCorner: 260,
    profileShadowBaseboard: 280,
    profileWallCeiling: 265,
    profileSeparator: 275,
    tonlosAcousticFelt: 1000,
    tonlosHeavyFelt: 1350,
    fintek150: 2000,
    insertID: 1200,
    insertType1: 45,
    insertType2: 65,
    insertType3: 75,
    adhesiveLiquidPer5L: 2500,
    adhesiveSprayPer650ml: 450,
  },
  // Расценки монтажа стен (себестоимость / клиент)
  iksInstall: {
    fabricPerSqm: { label: 'Монтаж полотна', unit: 'м²', companyRate: 200, clientRate: 400 },
    profilePerM: { label: 'Монтаж профиля', unit: 'м', companyRate: 90, clientRate: 200 },
    opening: { label: 'Оформление проёма', unit: 'шт', companyRate: 250, clientRate: 600 },
    cutout: { label: 'Вырез под элемент', unit: 'шт', companyRate: 100, clientRate: 250 },
    column: { label: 'Огибание колонны', unit: 'шт', companyRate: 400, clientRate: 900 },
    beam: { label: 'Огибание балки', unit: 'шт', companyRate: 350, clientRate: 800 },
    niche: { label: 'Оформление ниши', unit: 'шт', companyRate: 300, clientRate: 700 },
    heightSurchargePct: 15,
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
  if (!data.upgrades) data.upgrades = defaults.upgrades;
  if (!data.iks) data.iks = defaults.iks;
  if (!data.iksCompany) data.iksCompany = defaults.iksCompany;
  if (!data.iksInstall) data.iksInstall = defaults.iksInstall;
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

function getSisPrices() {
  return getAll().sis || defaults.sis;
}

function getUpgrades() {
  return getAll().upgrades || defaults.upgrades;
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
    upgrades: data.upgrades,
  };
}

module.exports = { getAll, save, getCeilingPrice, getOptionPrice, getProfilePrice, getSisPrices, getUpgrades, formatPriceList, getAiPriceContext, defaults };
