// ─── IKS Wallpaper Calculator ──────────────────────────────────
// Портирован из iks-wallpaper-calculator (React/TypeScript → Node.js)
// Оригинал: https://github.com/SunnyS8/iks-wallpaper-calculator

// ─── File-based prices ──────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const pricesFile = path.join(__dirname, '..', 'data', 'prices.json');

let pricesCache = null;

function getPrices() {
  if (pricesCache) return pricesCache;
  try {
    const data = JSON.parse(fs.readFileSync(pricesFile, 'utf-8'));
    pricesCache = data.iks || {};
    return pricesCache;
  } catch (e) {
    return {};
  }
}

function price(key, fallback) {
  const p = getPrices();
  return p[key] !== undefined ? p[key] : fallback;
}

function resetPriceCache() { pricesCache = null; }

// ─── Constants ──────────────────────────────────────────────────
const ROLL_WIDTHS = () => price('rollWidths', [2.6, 2.7, 2.8, 3.2]);
const MAX_ROLL_LENGTH = () => price('maxRollLength', 70);
const CUT_ALLOWANCE = () => price('cutAllowance', 0.2);
const GLUE_RATE = 0.07;
const GLUE_CAN_LITERS = 5;
const GLUE_SPRAY_ML = 650;
const INSERT_ID_BOX_METERS = 100;
const PROFILE_LAMELLA_LENGTH = 2;

const PROFILE_SKUS = ['AP5994', 'AP5995', 'AP5996', 'AP5997', 'AP5998', 'AP5999'];

const PROFILES = [
  { sku: 'AP5994', article: 'АП 5994', name: 'Профиль ID базовый', priceKey: 'profileBase' },
  { sku: 'AP5995', article: 'АП 5995', name: 'Профиль ID внутренний угол', priceKey: 'profileInnerCorner' },
  { sku: 'AP5996', article: 'АП 5996', name: 'Профиль ID внешний угол', priceKey: 'profileOuterCorner' },
  { sku: 'AP5997', article: 'АП 5997', name: 'Плинтус ID теневой', priceKey: 'profileShadowBaseboard' },
  { sku: 'AP5998', article: 'АП 5998', name: 'Профиль ID стена-потолок', priceKey: 'profileWallCeiling' },
  { sku: 'AP5999', article: 'АП 5999', name: 'Профиль ID разделительный', priceKey: 'profileSeparator' },
];

const INSULATION_PRODUCTS = {
  tonlosAcoustic: { name: 'TÖNLOS ACOUSTIC FELT', length: 8, width: 1, height: 0.014, priceKey: 'tonlosAcousticFelt' },
  tonlosHeavy: { name: 'TÖNLOS HEAVY FELT', length: 5, width: 0.75, height: 0.013, priceKey: 'tonlosHeavyFelt' },
  fintek150: { name: 'Fintek 150', length: 45, width: 1.5, height: 0.017, priceKey: 'fintek150' },
};

const SOCKET_INSERT_TYPES = [
  { type: 1, name: 'Закладная одинарная (тип 1)', priceKey: 'insertType1' },
  { type: 2, name: 'Закладная боковая для групп (тип 2)', priceKey: 'insertType2' },
  { type: 3, name: 'Закладная внутренняя для групп (тип 3)', priceKey: 'insertType3' },
];

// ─── Math utilities ────────────────────────────────────────────
function round2(v) { return Math.round(v * 100) / 100; }
function ceilInt(v) { return Math.ceil(v - 1e-9); }
function roundMoney(v) { return Math.round(v * 100) / 100; }
function sumBy(items, fn) { return items.reduce((acc, item) => acc + fn(item), 0); }

// ─── Wall fabric calculation ───────────────────────────────────
function getCutLength(lengthM) { return round2(lengthM + CUT_ALLOWANCE()); }

function fabricPiecesFromWall(wall) {
  if (wall.drapingMode !== 'zoned') {
    const cutLength = getCutLength(wall.lengthL);
    return [{
      wallId: wall.id, wallLabel: wall.label,
      rollWidth: wall.rollWidth, cutLength,
      areaSqm: round2(cutLength * wall.rollWidth),
    }];
  }
  return (wall.zones || []).map(zone => {
    const cutLength = getCutLength(zone.length);
    return {
      wallId: wall.id, zoneId: zone.id,
      wallLabel: zone.label ? `${wall.label} — ${zone.label}` : wall.label,
      rollWidth: zone.rollWidth, cutLength,
      areaSqm: round2(cutLength * zone.rollWidth),
    };
  });
}

function fabricPiecesFromWalls(walls) { return walls.flatMap(fabricPiecesFromWall); }

// ─── Roll packing (First-Fit Decreasing) ───────────────────────
function packRolls(pieces) {
  const byWidth = new Map();
  for (const piece of pieces) {
    const list = byWidth.get(piece.rollWidth) || [];
    list.push(piece);
    byWidth.set(piece.rollWidth, list);
  }
  const packed = [];
  for (const [rollWidth, group] of byWidth) {
    const sorted = [...group].sort((a, b) => b.cutLength - a.cutLength);
    const bins = [];
    for (const piece of sorted) {
      let placed = false;
      for (const bin of bins) {
        if (bin.used + piece.cutLength <= MAX_ROLL_LENGTH() + 1e-9) {
          bin.used = round2(bin.used + piece.cutLength);
          bin.cuts.push({ cutLength: piece.cutLength, wallLabel: piece.wallLabel });
          placed = true;
          break;
        }
      }
      if (!placed) {
        bins.push({ used: piece.cutLength, cuts: [{ cutLength: piece.cutLength, wallLabel: piece.wallLabel }] });
      }
    }
    bins.forEach((bin, index) => {
      packed.push({
        rollWidth, rollIndex: index + 1,
        usedLength: round2(bin.used),
        leftoverLength: round2(MAX_ROLL_LENGTH() - bin.used),
        cuts: bin.cuts,
      });
    });
  }
  return packed;
}

// ─── Profile calculation ───────────────────────────────────────
function metersToLamellas(meters) {
  if (meters <= 0) return { lamellasCount: 0, purchasedMeters: 0 };
  const lamellasCount = ceilInt(meters / PROFILE_LAMELLA_LENGTH);
  return { lamellasCount, purchasedMeters: lamellasCount * PROFILE_LAMELLA_LENGTH };
}

function calculateProfiles(walls) {
  const metersBySku = Object.fromEntries(PROFILE_SKUS.map(s => [s, 0]));
  for (const wall of walls) {
    for (const profile of PROFILES) {
      metersBySku[profile.sku] += wall.profileMeters?.[profile.sku] || 0;
    }
    metersBySku.AP5994 += wall.openingsBaseMeters || 0;
  }
  // Separator for zoned walls
  const sepMeters = round2(sumBy(walls, w => {
    if (w.drapingMode === 'zoned' && (w.zones || []).length >= 2) {
      return round2((w.zones.length - 1) * w.heightH);
    }
    return 0;
  }));
  metersBySku.AP5999 = round2(metersBySku.AP5999 + sepMeters);

  return PROFILES.map(profile => {
    const inputMeters = round2(metersBySku[profile.sku]);
    const { lamellasCount, purchasedMeters } = metersToLamellas(inputMeters);
    return {
      sku: profile.sku, article: profile.article, name: profile.name,
      inputMeters, lamellasCount, purchasedMeters,
      unitPrice: price(profile.priceKey, 0),
    };
  }).filter(p => p.lamellasCount > 0);
}

function totalPurchasedProfileMeters(aggregates) {
  return round2(aggregates.reduce((s, p) => s + p.purchasedMeters, 0));
}

// ─── Insulation calculation ────────────────────────────────────
function totalWallArea(walls) {
  return round2(walls.reduce((sum, w) => sum + w.lengthL * w.heightH, 0));
}

function calculateInsulation(walls, insulationType) {
  if (insulationType === 'none') return null;
  const product = INSULATION_PRODUCTS[insulationType];
  if (!product) return null;
  const totalArea = totalWallArea(walls);
  const packArea = round2(product.length * product.width);
  const packs = ceilInt(totalArea / packArea);
  return {
    type: insulationType, name: product.name, packs, packArea,
    unitPrice: price(product.priceKey, 0),
    total: packs * price(product.priceKey, 0),
  };
}

// ─── Adhesive calculation ──────────────────────────────────────
function calculateAdhesive(totalAreaSqm, includeLiquid, includeSpray) {
  const litersNeeded = round2(totalAreaSqm * GLUE_RATE);
  const mlNeeded = litersNeeded * 1000;
  const liquidCans = includeLiquid ? ceilInt(litersNeeded / GLUE_CAN_LITERS) : 0;
  const sprayCans = includeSpray ? ceilInt(mlNeeded / GLUE_SPRAY_ML) : 0;
  return {
    litersNeeded, liquidCans, sprayCans,
    liquidTotal: liquidCans * price('adhesiveLiquidPer5L', 4500),
    sprayTotal: sprayCans * price('adhesiveSprayPer650ml', 850),
  };
}

// ─── Insert ID calculation ──────────────────────────────────────
function calculateInsertIdBoxes(totalProfileMeters) {
  if (totalProfileMeters <= 0) return { boxes: 0, purchasedMeters: 0, leftoverMeters: 0 };
  const boxes = ceilInt(totalProfileMeters / INSERT_ID_BOX_METERS);
  const purchasedMeters = boxes * INSERT_ID_BOX_METERS;
  return { boxes, purchasedMeters, leftoverMeters: purchasedMeters - totalProfileMeters };
}

function insertIdUnitPrice() { return price('insertID', 2200); }

// ─── Socket inserts calculation ────────────────────────────────
function calculateSockets(points) {
  const byType = new Map();
  for (const point of points) {
    if (point.count > 0) byType.set(point.type, (byType.get(point.type) || 0) + point.count);
  }
  return SOCKET_INSERT_TYPES.map(meta => {
    const quantity = byType.get(meta.type) || 0;
    const unitPrice = price(meta.priceKey, 0);
    return { type: meta.type, name: meta.name, quantity, unitPrice, total: quantity * unitPrice };
  }).filter(line => line.quantity > 0);
}

// ─── Full calculation ──────────────────────────────────────────
function runFullCalculation(input) {
  const materials = [];
  const remnants = [];
  let idCounter = 0;
  const nextId = () => `line-${++idCounter}`;

  const walls = input.walls || [];
  const socketPoints = input.socketPoints || [];
  const insulationType = input.insulationType || 'none';
  const includeLiquidGlue = input.includeLiquidGlue !== false;
  const includeSprayGlue = input.includeSprayGlue || false;

  const pieces = fabricPiecesFromWalls(walls);
  const packed = packRolls(pieces);
  const totalArea = totalWallArea(walls);

  // Fabric: rolls by width
  const rollsByWidth = new Map();
  for (const roll of packed) {
    rollsByWidth.set(roll.rollWidth, (rollsByWidth.get(roll.rollWidth) || 0) + 1);
  }
  for (const [width, count] of rollsByWidth) {
    const usedSqm = round2(sumBy(pieces.filter(p => p.rollWidth === width), p => p.areaSqm));
    const purchasedSqm = count * MAX_ROLL_LENGTH() * width;
    const leftoverSqm = round2(purchasedSqm - usedSqm);
    materials.push({
      id: nextId(), name: `Бесшовное полотно MSD, ширина ${width} м`,
      sku: `MSD-${width}`, unit: 'м²', quantity: usedSqm,
      unitPrice: price('wallpaperPerSqm', 1200), total: roundMoney(usedSqm * price('wallpaperPerSqm', 1200)),
      note: `Рулонов: ${count} × ${MAX_ROLL_LENGTH()} м`,
    });
    if (leftoverSqm > 0.001) {
      remnants.push({
        id: nextId(), name: `Остаток полотна MSD ${width} м`,
        unit: 'м²', leftoverQty: leftoverSqm,
        unitPrice: price('wallpaperPerSqm', 1200), totalRub: roundMoney(leftoverSqm * price('wallpaperPerSqm', 1200)),
      });
    }
  }

  // Profiles
  const profiles = calculateProfiles(walls);
  for (const profile of profiles) {
    materials.push({
      id: nextId(), name: profile.name, sku: profile.article,
      unit: 'шт', quantity: profile.lamellasCount,
      unitPrice: profile.unitPrice, total: roundMoney(profile.lamellasCount * profile.unitPrice),
      note: `Ламель 2 пог. м, закуплено ${profile.purchasedMeters} м`,
    });
  }

  // Insert ID
  const totalProfileM = totalPurchasedProfileMeters(profiles);
  const insertId = calculateInsertIdBoxes(totalProfileM);
  if (insertId.boxes > 0) {
    const unitPrice = insertIdUnitPrice();
    materials.push({
      id: nextId(), name: 'Вставка ID (короб 100 м)', sku: 'ID-INSERT',
      unit: 'уп', quantity: insertId.boxes, unitPrice, total: roundMoney(insertId.boxes * unitPrice),
    });
    if (insertId.leftoverMeters > 0.001) {
      remnants.push({
        id: nextId(), name: 'Остаток вставки ID', unit: 'м',
        leftoverQty: round2(insertId.leftoverMeters), unitPrice: round2(unitPrice / 100),
        totalRub: roundMoney(insertId.leftoverMeters * (unitPrice / 100)),
      });
    }
  }

  // Residuals from rolls
  for (const roll of packed) {
    if (roll.leftoverLength > 0.001) {
      remnants.push({
        id: nextId(), name: `Остаток рулона ${roll.rollWidth} м (#${roll.rollIndex})`,
        unit: 'м', leftoverQty: roll.leftoverLength,
        unitPrice: round2(price('wallpaperPerSqm', 1200) * roll.rollWidth),
        totalRub: roundMoney(roll.leftoverLength * price('wallpaperPerSqm', 1200) * roll.rollWidth),
      });
    }
  }

  // Socket inserts
  for (const socket of calculateSockets(socketPoints)) {
    materials.push({
      id: nextId(), name: socket.name, unit: 'шт',
      quantity: socket.quantity, unitPrice: socket.unitPrice, total: socket.total,
    });
  }

  // Wooden inserts
  if (input.woodenInsertCount > 0) {
    materials.push({
      id: nextId(), name: 'Деревянные закладные 15 мм', unit: 'шт',
      quantity: input.woodenInsertCount, unitPrice: 0, total: 0, note: 'Цена по запросу',
    });
  }

  // Insulation
  const insulation = calculateInsulation(walls, insulationType);
  if (insulation) {
    materials.push({
      id: nextId(), name: insulation.name, unit: 'уп',
      quantity: insulation.packs, unitPrice: insulation.unitPrice,
      total: insulation.total, note: `Площадь покрытия упаковки: ${insulation.packArea} м²`,
    });
  }

  // Adhesive
  const adhesive = calculateAdhesive(totalArea, includeLiquidGlue, includeSprayGlue);
  if (adhesive.liquidCans > 0) {
    materials.push({
      id: nextId(), name: 'Жидкий клей TÖNLOS, канистра 5 л', unit: 'шт',
      quantity: adhesive.liquidCans, unitPrice: price('adhesiveLiquidPer5L', 4500),
      total: adhesive.liquidTotal, note: `Потребность ~${adhesive.litersNeeded} л`,
    });
  }
  if (adhesive.sprayCans > 0) {
    materials.push({
      id: nextId(), name: 'Аэрозольный клей TÖNLOS, 650 мл', unit: 'шт',
      quantity: adhesive.sprayCans, unitPrice: price('adhesiveSprayPer650ml', 850),
      total: adhesive.sprayTotal,
    });
  }

  const grandTotalRub = roundMoney(sumBy(materials, m => m.total));
  const remnantsTotalRub = roundMoney(sumBy(remnants, r => r.totalRub));

  return {
    materials, remnants, remnantsTotalRub, grandTotalRub, totalAreaSqm: totalArea,
    profiles, packed, pieces, walls: walls.length,
  };
}

// ─── Simplified wrapper for quick estimate ─────────────────────
function quickEstimate(params) {
  const wallCount = params.wallCount || 1;
  const totalLength = params.totalLength || 10;
  const height = params.height || 2.7;
  const rollWidth = params.rollWidth || 3.2;
  const includeInsulation = params.insulationType || 'none';
  const avgLength = totalLength / wallCount;

  const walls = Array.from({ length: wallCount }, (_, i) => ({
    id: `wall-${i}`,
    label: `Стена ${i + 1}`,
    lengthL: round2(avgLength),
    heightH: height,
    rollWidth,
    drapingMode: 'single',
    zones: [],
    profileMeters: {
      AP5994: round2(avgLength),
      AP5995: 1,
      AP5996: 1,
      AP5997: round2(avgLength),
      AP5998: round2(avgLength),
      AP5999: 0,
    },
    openingsBaseMeters: params.openingsBaseMeters || 0,
  }));

  return runFullCalculation({
    walls,
    socketPoints: params.sockets || [],
    woodenInsertCount: params.woodenInserts || 0,
    insulationType: includeInsulation,
    includeLiquidGlue: params.includeGlue !== false,
    includeSprayGlue: params.includeSpray || false,
  });
}

module.exports = {
  runFullCalculation, quickEstimate, calculateProfiles, totalPurchasedProfileMeters,
  fabricPiecesFromWalls, packRolls, totalWallArea,
  calculateInsulation, calculateAdhesive, calculateInsertIdBoxes, calculateSockets,
  price, resetPriceCache, PROFILES, ROLL_WIDTHS, MAX_ROLL_LENGTH, CUT_ALLOWANCE,
  PROFILE_SKUS, INSULATION_PRODUCTS, SOCKET_INSERT_TYPES,
  round2, ceilInt, roundMoney, sumBy,
};
