const calc = require('./calculator');
const iks = require('./iks-calculator');
const prices = require('./prices');

const BUNDLE_DISCOUNT = 0.12;

function round2(v) { return Math.round(v * 100) / 100; }

function calcCombined(params) {
  const ceilingParams = {
    ceilingType: params.ceilingType || 'Матовый ПВХ',
    area: parseFloat(params.area) || 18,
    width: parseFloat(params.width) || 4,
    length: parseFloat(params.length) || 4.5,
    spots: parseInt(params.spots) || 0,
    chandelier: params.chandelier || false,
    ledStrip: parseFloat(params.ledStrip) || 0,
    pipeBypass: parseInt(params.pipeBypass) || 0,
    cornice: parseFloat(params.cornice) || 0,
    hatch: parseInt(params.hatch) || 0,
    vent: parseInt(params.vent) || 0,
    niche: parseFloat(params.niche) || 0,
  };

  const ceilingResult = calc.calcLocalEstimate(ceilingParams);

  let wallResult = null;
  let wallDetail = null;

  if (params.hasWalls || params.wallArea > 0) {
    const wallArea = parseFloat(params.wallArea) || 30;
    const perimeter = parseFloat(params.wallPerimeter) || 22;
    const height = parseFloat(params.wallHeight) || 2.7;
    const wallCount = Math.max(1, Math.round(perimeter / 3));

    // Use IKS calculator for per-m² pricing baseline
    const iksResult = iks.quickEstimate({
      wallCount,
      totalLength: perimeter,
      height,
      rollWidth: params.rollWidth || 3.2,
      insulationType: params.insulationType || 'none',
      openingsBaseMeters: params.openingsBaseMeters || 0,
      sockets: params.sockets || [],
      woodenInserts: params.woodenInserts || 0,
      includeGlue: params.includeGlue !== false,
      includeSpray: params.includeSpray || false,
    });

    // Scale to user-specified wall area
    const baseArea = iksResult.totalAreaSqm;
    const scale = baseArea > 0 ? wallArea / baseArea : 1;
    const scaledTotal = round2(iksResult.grandTotalRub * scale);

    wallResult = iksResult;
    wallDetail = {
      area: wallArea,
      total: scaledTotal,
      breakdown: {
        perMeter: round2(scaledTotal / Math.max(wallArea, 1)),
        profiles: iksResult.profiles.length,
        rolls: iksResult.packed.length,
      },
      iksBreakdown: iksResult.materials.map(m => ({
        name: m.name, quantity: round2(m.quantity * scale), unit: m.unit, total: round2(m.total * scale),
      })),
    };
  }

  const ceilingTotal = ceilingResult.total;
  const wallTotal = wallDetail ? wallDetail.total : 0;
  const combinedTotal = round2(ceilingTotal + wallTotal);
  const discount = wallDetail ? round2(combinedTotal * BUNDLE_DISCOUNT) : 0;
  const finalTotal = round2(combinedTotal - discount);

  return {
    ceiling: {
      type: ceilingParams.ceilingType,
      area: ceilingParams.area,
      total: ceilingTotal,
      breakdown: ceilingResult,
    },
    walls: wallDetail,
    iksDetail: wallResult ? {
      materials: wallResult.materials,
      profiles: wallResult.profiles,
      packed: wallResult.packed,
      pieces: wallResult.pieces,
    } : null,
    combined: {
      subtotal: combinedTotal,
      bundleDiscount: discount,
      discountPercent: Math.round(BUNDLE_DISCOUNT * 100),
      finalTotal: finalTotal,
    },
    messages: wallDetail ? {
      saving: `При заказе потолков + стен вы экономите ${discount.toLocaleString('ru-RU')} ₽`,
      upsell: `Система Идеальных Стен (СИС): ${wallResult.profiles.length} типов профилей ID System, раскрой ${wallResult.packed.length} рулонов по 70 м`,
    } : {
      upsell: 'Хотите идеальные стены? Добавьте СИС — от 1 200 ₽/м²',
    },
  };
}

module.exports = { calcCombined };
