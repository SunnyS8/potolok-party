const prices = require('./prices');

function round2(v) { return Math.round(v * 100) / 100; }

function calc(project) {
  const walls = project.walls || [];
  const wallPrices = prices.getWallPrices();
  const mat = wallPrices.materials;
  const inst = wallPrices.installation;
  const objTreat = wallPrices.objectTreatments || {};
  const height = parseFloat(project.height) || 2.7;
  const wastePct = parseFloat(project.wastePercent) || mat.fabric.wastePercent || 10;
  const activeOnly = project.activeWallsOnly || false;

  // Filter walls
  const activeWalls = activeOnly ? walls.filter(w => w.active !== false) : walls;

  // Per-wall calculations
  const wallResults = activeWalls.map(w => calcWall(w, height, mat, inst, objTreat));

  // Sum totals
  const totals = wallResults.reduce((acc, w) => {
    acc.wallArea += w.wallArea;
    acc.openingArea += w.openingArea;
    acc.netArea += w.netArea;
    acc.canvasArea += w.canvasArea;
    acc.topProfile += w.topProfile;
    acc.bottomProfile += w.bottomProfile;
    acc.cornerCount += w.cornerCount;
    acc.openingCount += w.openingCount;
    acc.embedCount += w.embedCount;
    acc.columnCount += w.columnCount;
    acc.beamCount += w.beamCount;
    acc.nicheCount += w.nicheCount;
    acc.cutoutCount += w.cutoutCount;
    acc.fabricCostCompany += w.fabricCostCompany;
    acc.fabricCostClient += w.fabricCostClient;
    acc.topProfileCostCompany += w.topProfileCostCompany;
    acc.topProfileCostClient += w.topProfileCostClient;
    acc.bottomProfileCostCompany += w.bottomProfileCostCompany;
    acc.bottomProfileCostClient += w.bottomProfileCostClient;
    acc.cornerCostCompany += w.cornerCostCompany;
    acc.cornerCostClient += w.cornerCostClient;
    acc.substrateCostCompany += w.substrateCostCompany;
    acc.substrateCostClient += w.substrateCostClient;
    acc.adhesiveCostCompany += w.adhesiveCostCompany;
    acc.adhesiveCostClient += w.adhesiveCostClient;
    acc.embedCostCompany += w.embedCostCompany;
    acc.embedCostClient += w.embedCostClient;
    acc.mountFabricCompany += w.mountFabricCompany;
    acc.mountFabricClient += w.mountFabricClient;
    acc.mountTopProfileCompany += w.mountTopProfileCompany;
    acc.mountTopProfileClient += w.mountTopProfileClient;
    acc.mountBottomProfileCompany += w.mountBottomProfileCompany;
    acc.mountBottomProfileClient += w.mountBottomProfileClient;
    acc.mountCornerCompany += w.mountCornerCompany;
    acc.mountCornerClient += w.mountCornerClient;
    acc.mountOpeningCompany += w.mountOpeningCompany;
    acc.mountOpeningClient += w.mountOpeningClient;
    acc.mountColumnCompany += w.mountColumnCompany;
    acc.mountColumnClient += w.mountColumnClient;
    acc.mountBeamCompany += w.mountBeamCompany;
    acc.mountBeamClient += w.mountBeamClient;
    acc.mountNicheCompany += w.mountNicheCompany;
    acc.mountNicheClient += w.mountNicheClient;
    acc.mountCutoutCompany += w.mountCutoutCompany;
    acc.mountCutoutClient += w.mountCutoutClient;
    return acc;
  }, {
    wallArea: 0, openingArea: 0, netArea: 0, canvasArea: 0,
    topProfile: 0, bottomProfile: 0,
    cornerCount: 0, openingCount: 0, embedCount: 0,
    columnCount: 0, beamCount: 0, nicheCount: 0, cutoutCount: 0,
    fabricCostCompany: 0, fabricCostClient: 0,
    topProfileCostCompany: 0, topProfileCostClient: 0,
    bottomProfileCostCompany: 0, bottomProfileCostClient: 0,
    cornerCostCompany: 0, cornerCostClient: 0,
    substrateCostCompany: 0, substrateCostClient: 0,
    adhesiveCostCompany: 0, adhesiveCostClient: 0,
    embedCostCompany: 0, embedCostClient: 0,
    mountFabricCompany: 0, mountFabricClient: 0,
    mountTopProfileCompany: 0, mountTopProfileClient: 0,
    mountBottomProfileCompany: 0, mountBottomProfileClient: 0,
    mountCornerCompany: 0, mountCornerClient: 0,
    mountOpeningCompany: 0, mountOpeningClient: 0,
    mountColumnCompany: 0, mountColumnClient: 0,
    mountBeamCompany: 0, mountBeamClient: 0,
    mountNicheCompany: 0, mountNicheClient: 0,
    mountCutoutCompany: 0, mountCutoutClient: 0,
  });

  // Height surcharge
  let heightSurchargeCompany = 0;
  let heightSurchargeClient = 0;
  if (height > 3.5) {
    const pctH = inst.heightSurcharge.companyRate / 100;
    const mountTotalCompany = totals.mountFabricCompany + totals.mountTopProfileCompany + totals.mountBottomProfileCompany;
    heightSurchargeCompany = mountTotalCompany * pctH;
    const mountTotalClient = totals.mountFabricClient + totals.mountTopProfileClient + totals.mountBottomProfileClient;
    heightSurchargeClient = mountTotalClient * (inst.heightSurcharge.clientRate / 100);
  }

  // Total costs
  const materialCostCompany = round2(
    totals.fabricCostCompany + totals.topProfileCostCompany + totals.bottomProfileCostCompany
    + totals.cornerCostCompany + totals.substrateCostCompany + totals.adhesiveCostCompany + totals.embedCostCompany
  );
  const materialCostClient = round2(
    totals.fabricCostClient + totals.topProfileCostClient + totals.bottomProfileCostClient
    + totals.cornerCostClient + totals.substrateCostClient + totals.adhesiveCostClient + totals.embedCostClient
  );

  const installCostCompany = round2(
    totals.mountFabricCompany + totals.mountTopProfileCompany + totals.mountBottomProfileCompany
    + totals.mountCornerCompany + totals.mountOpeningCompany + totals.mountColumnCompany
    + totals.mountBeamCompany + totals.mountNicheCompany + totals.mountCutoutCompany
    + heightSurchargeCompany
  );
  const installCostClient = round2(
    totals.mountFabricClient + totals.mountTopProfileClient + totals.mountBottomProfileClient
    + totals.mountCornerClient + totals.mountOpeningClient + totals.mountColumnClient
    + totals.mountBeamClient + totals.mountNicheClient + totals.mountCutoutClient
    + heightSurchargeClient
  );

  const totalCompany = round2(materialCostCompany + installCostCompany);
  const totalClient = round2(materialCostClient + installCostClient);
  const profit = round2(totalClient - totalCompany);
  const margin = totalClient > 0 ? round2((profit / totalClient) * 100) : 0;

  // BOM
  const bom = buildBOM(totals, mat, height);

  // Cut list
  const cutList = buildCutList(wallResults);

  return {
    summary: {
      wallCount: activeWalls.length,
      totalWallArea: round2(totals.wallArea),
      openingArea: round2(totals.openingArea),
      netArea: round2(totals.netArea),
      canvasArea: round2(totals.canvasArea),
      wastePercent: wastePct,
      perimeter: round2(totals.topProfile),
      cornerCount: totals.cornerCount,
      height: height,
    },
    pricing: {
      materialCostCompany: materialCostCompany,
      materialCostClient: materialCostClient,
      installCostCompany: installCostCompany,
      installCostClient: installCostClient,
      heightSurchargeCompany: round2(heightSurchargeCompany),
      heightSurchargeClient: round2(heightSurchargeClient),
      totalCompany: totalCompany,
      totalClient: totalClient,
      profit: profit,
      margin: margin,
    },
    materials: {
      fabric: { name: mat.fabric.label, quantity: round2(totals.canvasArea), unit: mat.fabric.unit, companyPrice: mat.fabric.companyPrice, clientPrice: mat.fabric.clientPrice, totalCompany: round2(totals.fabricCostCompany), totalClient: round2(totals.fabricCostClient) },
      topProfile: { name: mat.topProfile.label, quantity: round2(totals.topProfile), unit: mat.topProfile.unit, companyPrice: mat.topProfile.companyPrice, clientPrice: mat.topProfile.clientPrice, totalCompany: round2(totals.topProfileCostCompany), totalClient: round2(totals.topProfileCostClient) },
      bottomProfile: { name: mat.bottomProfile.label, quantity: round2(totals.bottomProfile), unit: mat.bottomProfile.unit, companyPrice: mat.bottomProfile.companyPrice, clientPrice: mat.bottomProfile.clientPrice, totalCompany: round2(totals.bottomProfileCostCompany), totalClient: round2(totals.bottomProfileCostClient) },
      cornerInternal: { name: mat.cornerInternal.label, quantity: Math.ceil(totals.cornerCount / 2), unit: mat.cornerInternal.unit, companyPrice: mat.cornerInternal.companyPrice, clientPrice: mat.cornerInternal.clientPrice, totalCompany: round2(totals.cornerCostCompany), totalClient: round2(totals.cornerCostClient) },
      cornerExternal: { name: mat.cornerExternal.label, quantity: Math.ceil(totals.cornerCount / 2), unit: mat.cornerExternal.unit, companyPrice: mat.cornerExternal.companyPrice, clientPrice: mat.cornerExternal.clientPrice, totalCompany: 0, totalClient: 0 },
      substrate: { name: mat.substrate.label, quantity: round2(totals.canvasArea), unit: mat.substrate.unit, companyPrice: mat.substrate.companyPrice, clientPrice: mat.substrate.clientPrice, totalCompany: round2(totals.substrateCostCompany), totalClient: round2(totals.substrateCostClient) },
      adhesive: { name: mat.adhesive.label, quantity: Math.max(1, Math.ceil(totals.topProfile / mat.adhesive.perMeters)), unit: mat.adhesive.unit, companyPrice: mat.adhesive.companyPrice, clientPrice: mat.adhesive.clientPrice, totalCompany: round2(totals.adhesiveCostCompany), totalClient: round2(totals.adhesiveCostClient) },
      embeddedParts: { name: 'Закладные под объекты', quantity: totals.embedCount, unit: 'шт', companyPrice: mat.embeddedPart.companyPrice, clientPrice: mat.embeddedPart.clientPrice, totalCompany: round2(totals.embedCostCompany), totalClient: round2(totals.embedCostClient) },
    },
    bom: bom,
    cutList: cutList,
    walls: wallResults,
  };
}

function calcWall(w, h, mat, inst, objTreat) {
  const width = parseFloat(w.width) || 0;
  const height = parseFloat(w.height) || h || 2.7;
  const wallArea = round2(width * height);
  const objects = w.objects || [];
  const wastePct = mat.fabric.wastePercent || 10;

  let openingArea = 0;
  let openingCount = 0;
  let embedCount = 0;
  let columnCount = 0;
  let beamCount = 0;
  let nicheCount = 0;
  let cutoutCount = 0;
  let openings = [];

  objects.forEach(o => {
    const ow = parseFloat(o.width) || 0.5;
    const oh = parseFloat(o.height) || 0.5;
    const cnt = Math.max(1, parseInt(o.count) || 1);
    const oa = round2(ow * oh * cnt);
    openingArea += oa;
    openings.push({ type: o.type, area: oa, count: cnt, width: ow, height: oh });

    const treatCfg = objTreat[o.type] || { treatment: 'cutout', installRate: 'cutout', needsEmbed: false };

    if (treatCfg.installRate === 'opening') openingCount += cnt;
    else if (treatCfg.installRate === 'column') columnCount += cnt;
    else if (treatCfg.installRate === 'beam') beamCount += cnt;
    else if (treatCfg.installRate === 'niche') nicheCount += cnt;
    else cutoutCount += cnt;

    if (treatCfg.needsEmbed) embedCount += cnt;
  });

  const netArea = round2(wallArea - openingArea);
  const canvasArea = round2(netArea * (1 + wastePct / 100));

  // Top & bottom profile = wall width
  const topProfile = width;
  const bottomProfile = width;

  // Corner count (internal corners: 2 per wall, external: 0 for now — simplified)
  const cornerCount = 2;

  // Material costs
  const fabricCostCompany = round2(canvasArea * mat.fabric.companyPrice);
  const fabricCostClient = round2(canvasArea * mat.fabric.clientPrice);
  const topProfileCostCompany = round2(topProfile * mat.topProfile.companyPrice);
  const topProfileCostClient = round2(topProfile * mat.topProfile.clientPrice);
  const bottomProfileCostCompany = round2(bottomProfile * mat.bottomProfile.companyPrice);
  const bottomProfileCostClient = round2(bottomProfile * mat.bottomProfile.clientPrice);
  const cornerCostCompany = round2(cornerCount * mat.cornerInternal.companyPrice);
  const cornerCostClient = round2(cornerCount * mat.cornerInternal.clientPrice);
  const substrateCostCompany = round2(canvasArea * mat.substrate.companyPrice);
  const substrateCostClient = round2(canvasArea * mat.substrate.clientPrice);
  const adhesiveCostCompany = round2(Math.ceil(topProfile / mat.adhesive.perMeters) * mat.adhesive.companyPrice);
  const adhesiveCostClient = round2(Math.ceil(topProfile / mat.adhesive.perMeters) * mat.adhesive.clientPrice);
  const embedCostCompany = round2(embedCount * mat.embeddedPart.companyPrice);
  const embedCostClient = round2(embedCount * mat.embeddedPart.clientPrice);

  // Installation costs
  const mountFabricCompany = round2(netArea * inst.wallFabric.companyRate);
  const mountFabricClient = round2(netArea * inst.wallFabric.clientRate);
  const mountTopProfileCompany = round2(topProfile * inst.topProfile.companyRate);
  const mountTopProfileClient = round2(topProfile * inst.topProfile.clientRate);
  const mountBottomProfileCompany = round2(bottomProfile * inst.bottomProfile.companyRate);
  const mountBottomProfileClient = round2(bottomProfile * inst.bottomProfile.clientRate);
  const mountCornerCompany = round2(cornerCount * inst.corner.companyRate);
  const mountCornerClient = round2(cornerCount * inst.corner.clientRate);
  const mountOpeningCompany = round2(openingCount * inst.opening.companyRate);
  const mountOpeningClient = round2(openingCount * inst.opening.clientRate);
  const mountColumnCompany = round2(columnCount * inst.column.companyRate);
  const mountColumnClient = round2(columnCount * inst.column.clientRate);
  const mountBeamCompany = round2(beamCount * inst.beam.companyRate);
  const mountBeamClient = round2(beamCount * inst.beam.clientRate);
  const mountNicheCompany = round2(nicheCount * inst.niche.companyRate);
  const mountNicheClient = round2(nicheCount * inst.niche.clientRate);
  const mountCutoutCompany = round2(cutoutCount * inst.cutout.companyRate);
  const mountCutoutClient = round2(cutoutCount * inst.cutout.clientRate);

  return {
    index: w.index || 0,
    width: width,
    height: height,
    wallArea: wallArea,
    openingArea: openingArea,
    netArea: netArea,
    canvasArea: canvasArea,
    topProfile: topProfile,
    bottomProfile: bottomProfile,
    cornerCount: cornerCount,
    openingCount: openingCount,
    embedCount: embedCount,
    columnCount: columnCount,
    beamCount: beamCount,
    nicheCount: nicheCount,
    cutoutCount: cutoutCount,
    openings: openings,
    fabricCostCompany: fabricCostCompany,
    fabricCostClient: fabricCostClient,
    topProfileCostCompany: topProfileCostCompany,
    topProfileCostClient: topProfileCostClient,
    bottomProfileCostCompany: bottomProfileCostCompany,
    bottomProfileCostClient: bottomProfileCostClient,
    cornerCostCompany: cornerCostCompany,
    cornerCostClient: cornerCostClient,
    substrateCostCompany: substrateCostCompany,
    substrateCostClient: substrateCostClient,
    adhesiveCostCompany: adhesiveCostCompany,
    adhesiveCostClient: adhesiveCostClient,
    embedCostCompany: embedCostCompany,
    embedCostClient: embedCostClient,
    mountFabricCompany: mountFabricCompany,
    mountFabricClient: mountFabricClient,
    mountTopProfileCompany: mountTopProfileCompany,
    mountTopProfileClient: mountTopProfileClient,
    mountBottomProfileCompany: mountBottomProfileCompany,
    mountBottomProfileClient: mountBottomProfileClient,
    mountCornerCompany: mountCornerCompany,
    mountCornerClient: mountCornerClient,
    mountOpeningCompany: mountOpeningCompany,
    mountOpeningClient: mountOpeningClient,
    mountColumnCompany: mountColumnCompany,
    mountColumnClient: mountColumnClient,
    mountBeamCompany: mountBeamCompany,
    mountBeamClient: mountBeamClient,
    mountNicheCompany: mountNicheCompany,
    mountNicheClient: mountNicheClient,
    mountCutoutCompany: mountCutoutCompany,
    mountCutoutClient: mountCutoutClient,
    wallTotalCompany: round2(fabricCostCompany + topProfileCostCompany + bottomProfileCostCompany + cornerCostCompany + substrateCostCompany + adhesiveCostCompany + embedCostCompany + mountFabricCompany + mountTopProfileCompany + mountBottomProfileCompany + mountCornerCompany + mountOpeningCompany + mountColumnCompany + mountBeamCompany + mountNicheCompany + mountCutoutCompany),
    wallTotalClient: round2(fabricCostClient + topProfileCostClient + bottomProfileCostClient + cornerCostClient + substrateCostClient + adhesiveCostClient + embedCostClient + mountFabricClient + mountTopProfileClient + mountBottomProfileClient + mountCornerClient + mountOpeningClient + mountColumnClient + mountBeamClient + mountNicheClient + mountCutoutClient),
  };
}

function buildBOM(totals, mat) {
  const items = [];

  items.push({ name: mat.fabric.label, quantity: round2(totals.canvasArea), unit: mat.fabric.unit, companyPrice: mat.fabric.companyPrice, clientPrice: mat.fabric.clientPrice, totalCompany: round2(totals.fabricCostCompany), totalClient: round2(totals.fabricCostClient) });
  items.push({ name: mat.topProfile.label, quantity: round2(totals.topProfile), unit: mat.topProfile.unit, companyPrice: mat.topProfile.companyPrice, clientPrice: mat.topProfile.clientPrice, totalCompany: round2(totals.topProfileCostCompany), totalClient: round2(totals.topProfileCostClient) });
  items.push({ name: mat.bottomProfile.label, quantity: round2(totals.bottomProfile), unit: mat.bottomProfile.unit, companyPrice: mat.bottomProfile.companyPrice, clientPrice: mat.bottomProfile.clientPrice, totalCompany: round2(totals.bottomProfileCostCompany), totalClient: round2(totals.bottomProfileCostClient) });
  items.push({ name: mat.substrate.label, quantity: round2(totals.canvasArea), unit: mat.substrate.unit, companyPrice: mat.substrate.companyPrice, clientPrice: mat.substrate.clientPrice, totalCompany: round2(totals.substrateCostCompany), totalClient: round2(totals.substrateCostClient) });

  const adhesiveQty = Math.max(1, Math.ceil(totals.topProfile / mat.adhesive.perMeters));
  items.push({ name: mat.adhesive.label, quantity: adhesiveQty, unit: mat.adhesive.unit, companyPrice: mat.adhesive.companyPrice, clientPrice: mat.adhesive.clientPrice, totalCompany: round2(adhesiveQty * mat.adhesive.companyPrice), totalClient: round2(adhesiveQty * mat.adhesive.clientPrice) });

  const cornerInt = Math.ceil(totals.cornerCount / 2);
  if (cornerInt > 0) items.push({ name: mat.cornerInternal.label, quantity: cornerInt, unit: mat.cornerInternal.unit, companyPrice: mat.cornerInternal.companyPrice, clientPrice: mat.cornerInternal.clientPrice, totalCompany: round2(cornerInt * mat.cornerInternal.companyPrice), totalClient: round2(cornerInt * mat.cornerInternal.clientPrice) });

  const cornerExt = Math.ceil(totals.cornerCount / 2);
  if (cornerExt > 0) items.push({ name: mat.cornerExternal.label, quantity: cornerExt, unit: mat.cornerExternal.unit, companyPrice: mat.cornerExternal.companyPrice, clientPrice: mat.cornerExternal.clientPrice, totalCompany: round2(cornerExt * mat.cornerExternal.companyPrice), totalClient: round2(cornerExt * mat.cornerExternal.clientPrice) });

  if (totals.embedCount > 0) items.push({ name: 'Закладные под объекты', quantity: totals.embedCount, unit: 'шт', companyPrice: mat.embeddedPart.companyPrice, clientPrice: mat.embeddedPart.clientPrice, totalCompany: round2(totals.embedCostCompany), totalClient: round2(totals.embedCostClient) });

  return items;
}

function buildCutList(wallResults) {
  const cuts = [];
  wallResults.forEach(w => {
    if (w.width > 0) {
      cuts.push({ wall: w.index, element: 'Полотно', width: w.width, height: w.height, area: w.canvasArea, note: 'С запасом ' + round2((w.canvasArea / Math.max(w.netArea, 0.01) - 1) * 100) + '%' });
    }
    if (w.width > 0) {
      cuts.push({ wall: w.index, element: 'Профиль верхний', length: w.topProfile, note: '' });
      cuts.push({ wall: w.index, element: 'Профиль нижний', length: w.bottomProfile, note: '' });
    }
  });
  return cuts;
}

function calcFromRequest(body) {
  const project = {
    walls: body.walls || [],
    height: body.height,
    wastePercent: body.wastePercent,
    activeWallsOnly: body.activeWallsOnly,
  };
  return calc(project);
}

module.exports = { calc, calcFromRequest };
