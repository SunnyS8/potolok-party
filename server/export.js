const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

function round2(v) { return Math.round(v * 100) / 100; }

function generateWallPdf(project, calcResult) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, font: 'Helvetica' });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const s = calcResult.summary;
      const p = calcResult.pricing;
      const isCompany = false; // default to client prices

      // Header
      doc.fontSize(18).text('Потолок Пати — Натяжные стены', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text('Проект: ' + (project.name || '—') + '  |  ' + (project.address || '—'), { align: 'center' });
      doc.fillColor('#000');
      doc.moveDown(0.8);

      // Divider
      doc.moveTo(40, doc.y).lineTo(520, doc.y).stroke('#ddd');
      doc.moveDown(0.5);

      // Summary
      doc.fontSize(13).font('Helvetica-Bold').text('Сводка');
      doc.fontSize(10).font('Helvetica');
      const summaryLines = [
        'Стен: ' + s.wallCount,
        'Общая площадь стен: ' + s.totalWallArea.toFixed(2) + ' м²',
        'Площадь проёмов: ' + s.openingArea.toFixed(2) + ' м²',
        'Чистая площадь: ' + s.netArea.toFixed(2) + ' м²',
        'Полотно с запасом (' + s.wastePercent + '%): ' + s.canvasArea.toFixed(2) + ' м²',
        'Периметр: ' + s.perimeter.toFixed(2) + ' м',
        'Высота: ' + s.height.toFixed(2) + ' м',
      ];
      summaryLines.forEach(l => doc.text('• ' + l, { indent: 10 }));
      doc.moveDown(0.8);

      // Pricing
      doc.fontSize(13).font('Helvetica-Bold').text('Смета');
      doc.fontSize(10).font('Helvetica');
      const total = isCompany ? p.totalCompany : p.totalClient;
      const matTotal = isCompany ? p.materialCostCompany : p.materialCostClient;
      const instTotal = isCompany ? p.installCostCompany : p.installCostClient;

      const pricingLines = [
        'Материалы: ' + matTotal.toLocaleString() + ' ₽',
        'Монтаж: ' + instTotal.toLocaleString() + ' ₽',
        '',
        'ИТОГО: ' + total.toLocaleString() + ' ₽',
      ];
      pricingLines.forEach(l => doc.text(l, { indent: 10 }));
      doc.moveDown(0.8);

      // BOM
      doc.fontSize(13).font('Helvetica-Bold').text('Спецификация (BOM)');
      doc.fontSize(10).font('Helvetica');
      doc.moveDown(0.3);

      // Table header
      const bomLeft = 40;
      const bomCols = [200, 60, 60, 100, 100];
      const bomHeaders = ['Материал', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
      let bx = bomLeft;
      doc.font('Helvetica-Bold').fontSize(9);
      bomHeaders.forEach((h, i) => { doc.text(h, bx, doc.y, { width: bomCols[i], align: i === 0 ? 'left' : 'right' }); bx += bomCols[i]; });
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(9);

      calcResult.bom.forEach(m => {
        bx = bomLeft;
        const price = isCompany ? m.companyPrice : m.clientPrice;
        const totalPrice = isCompany ? m.totalCompany : m.totalClient;
        const vals = [m.name, m.quantity.toString(), m.unit, price.toLocaleString() + ' ₽', totalPrice.toLocaleString() + ' ₽'];
        vals.forEach((v, i) => { doc.text(v, bx, doc.y, { width: bomCols[i], align: i === 0 ? 'left' : 'right' }); bx += bomCols[i]; });
        doc.moveDown(0.2);
      });

      doc.moveDown(0.5);

      // Per-wall breakdown
      doc.fontSize(13).font('Helvetica-Bold').text('Раскладка по стенам');
      doc.fontSize(9).font('Helvetica');
      doc.moveDown(0.3);
      calcResult.walls.forEach(w => {
        doc.font('Helvetica-Bold').fontSize(10).text('Стена ' + (w.index + 1) + ' — ' + w.width.toFixed(2) + 'x' + w.height.toFixed(2) + ' м');
        doc.font('Helvetica').fontSize(9);
        const wallTotal = isCompany ? w.wallTotalCompany : w.wallTotalClient;
        doc.text('  Площадь: ' + w.wallArea.toFixed(2) + ' м²  |  Проёмы: ' + w.openingArea.toFixed(2) + ' м²  |  Чистая: ' + w.netArea.toFixed(2) + ' м²  |  Сумма: ' + wallTotal.toLocaleString() + ' ₽');
        doc.moveDown(0.3);
      });

      // Footer
      doc.moveDown(1);
      doc.moveTo(40, doc.y).lineTo(520, doc.y).stroke('#ddd');
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#999').text('Потолок Пати · потолокпати.рф · ' + new Date().toLocaleDateString('ru-RU'), { align: 'center' });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function generateWallXlsx(project, calcResult) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Потолок Пати';
  wb.created = new Date();

  // Sheet 1: Summary
  const ws1 = wb.addWorksheet('Сводка');
  ws1.columns = [
    { header: 'Параметр', key: 'param', width: 30 },
    { header: 'Значение', key: 'value', width: 20 },
  ];
  const s = calcResult.summary;
  const p = calcResult.pricing;
  ws1.addRows([
    { param: 'Проект', value: project.name || '—' },
    { param: 'Адрес', value: project.address || '—' },
    { param: 'Стен', value: s.wallCount },
    { param: 'Общая площадь стен, м²', value: round2(s.totalWallArea) },
    { param: 'Площадь проёмов, м²', value: round2(s.openingArea) },
    { param: 'Чистая площадь, м²', value: round2(s.netArea) },
    { param: 'Полотно с запасом, м²', value: round2(s.canvasArea) },
    { param: 'Периметр, м', value: round2(s.perimeter) },
    { param: 'Высота, м', value: round2(s.height) },
    { param: '', value: '' },
    { param: 'Себестоимость материалов, ₽', value: round2(p.materialCostCompany) },
    { param: 'Себестоимость монтажа, ₽', value: round2(p.installCostCompany) },
    { param: 'ИТОГО себестоимость, ₽', value: round2(p.totalCompany) },
    { param: '', value: '' },
    { param: 'Розничная цена материалов, ₽', value: round2(p.materialCostClient) },
    { param: 'Розничная цена монтажа, ₽', value: round2(p.installCostClient) },
    { param: 'ИТОГО розница, ₽', value: round2(p.totalClient) },
    { param: 'Прибыль, ₽', value: round2(p.profit) },
    { param: 'Маржа, %', value: round2(p.margin) },
  ]);

  // Sheet 2: BOM
  const ws2 = wb.addWorksheet('BOM');
  ws2.columns = [
    { header: 'Материал', key: 'name', width: 35 },
    { header: 'Количество', key: 'qty', width: 12 },
    { header: 'Ед.', key: 'unit', width: 8 },
    { header: 'Себестоимость', key: 'companyPrice', width: 14 },
    { header: 'Розница', key: 'clientPrice', width: 14 },
    { header: 'Сумма себест.', key: 'totalCompany', width: 16 },
    { header: 'Сумма розница', key: 'totalClient', width: 16 },
  ];
  calcResult.bom.forEach(m => {
    ws2.addRow({
      name: m.name, qty: m.quantity, unit: m.unit,
      companyPrice: m.companyPrice, clientPrice: m.clientPrice,
      totalCompany: round2(m.totalCompany), totalClient: round2(m.totalClient),
    });
  });

  // Sheet 3: Per wall
  const ws3 = wb.addWorksheet('По стенам');
  ws3.columns = [
    { header: 'Стена', key: 'wall', width: 10 },
    { header: 'Ширина, м', key: 'width', width: 12 },
    { header: 'Высота, м', key: 'height', width: 12 },
    { header: 'Площадь, м²', key: 'area', width: 12 },
    { header: 'Проёмы, м²', key: 'openings', width: 12 },
    { header: 'Чистая, м²', key: 'net', width: 12 },
    { header: 'Объектов', key: 'objects', width: 10 },
    { header: 'Себестоимость, ₽', key: 'totalCompany', width: 16 },
    { header: 'Розница, ₽', key: 'totalClient', width: 16 },
  ];
  calcResult.walls.forEach(w => {
    ws3.addRow({
      wall: 'Стена ' + (w.index + 1),
      width: round2(w.width),
      height: round2(w.height),
      area: round2(w.wallArea),
      openings: round2(w.openingArea),
      net: round2(w.netArea),
      objects: w.openingCount + w.columnCount + w.beamCount + w.nicheCount + w.cutoutCount,
      totalCompany: round2(w.wallTotalCompany),
      totalClient: round2(w.wallTotalClient),
    });
  });

  // Sheet 4: Cut list
  if (calcResult.cutList && calcResult.cutList.length > 0) {
    const ws4 = wb.addWorksheet('Резы');
    ws4.columns = [
      { header: 'Стена', key: 'wall', width: 10 },
      { header: 'Элемент', key: 'element', width: 20 },
      { header: 'Размер', key: 'size', width: 20 },
    ];
    calcResult.cutList.forEach(c => {
      ws4.addRow({
        wall: 'Стена ' + (c.wall + 1),
        element: c.element,
        size: c.width ? c.width.toFixed(2) + '×' + c.height.toFixed(2) + ' м' : c.length.toFixed(2) + ' м',
      });
    });
  }

  return await wb.xlsx.writeBuffer();
}

module.exports = { generateWallPdf, generateWallXlsx };
