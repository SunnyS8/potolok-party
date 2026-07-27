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
};

function ensureFile() {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaults, null, 2), 'utf-8');
}

function getAll() {
  ensureFile();
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function save(data) {
  ensureFile();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
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
  };
}

module.exports = { getAll, save, getCeilingPrice, getOptionPrice, getProfilePrice, formatPriceList, getAiPriceContext, defaults };
