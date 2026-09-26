// ESG / compliance PDF: BRSR (SEBI) Principle-6 style environmental indicators plus the FSSAI
// surplus-food distribution register, with the audit-chain head hash for tamper evidence.
const PDFDocument = require('pdfkit');
const sustainability = require('./sustainability.service');
const audit = require('../audit/audit.service');
const directoryRepo = require('../directory/directory.repository');

const INK = '#1f2a24';
const MUTED = '#5c6b63';
const ACCENT = '#1f7a4d';
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
const rs = (n) => `Rs ${fmt(n)}`;

function heading(doc, text) {
  doc.x = doc.page.margins.left;
  doc.moveDown(0.8).fillColor(ACCENT).fontSize(13).font('Helvetica-Bold').text(text).moveDown(0.3);
  doc.strokeColor('#d6e2da').lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke().moveDown(0.4);
  doc.fillColor(INK).font('Helvetica').fontSize(10);
}

function table(doc, headers, rows, widths) {
  const x0 = doc.page.margins.left;
  const drawRow = (cells, bold) => {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const y = doc.y;
    let x = x0;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(bold ? MUTED : INK);
    cells.forEach((c, i) => {
      doc.text(String(c ?? '—'), x + 2, y, { width: widths[i] - 4, height: 11, lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + 15;
  };
  drawRow(headers, true);
  rows.forEach((r) => drawRow(r, false));
  doc.x = x0;
  doc.moveDown(0.3);
}

function kv(doc, pairs) {
  table(doc, ['Indicator', 'Value', 'Basis'], pairs, [200, 110, 205]);
}

function summarySection(doc, m) {
  heading(doc, '1. Headline impact');
  kv(doc, [
    ['Food saved from waste', `${fmt(m.headline.foodSavedKg)} kg`, 'Prevented overproduction + redistributed'],
    ['Meals provided to beneficiaries', fmt(m.headline.mealsServed), `Donated kg / ${m.factors.portionKg} kg per meal`],
    ['Net GHG avoided', `${fmt(m.headline.netCo2eAvoidedKg)} kg CO2e`, 'Landfill + embodied, minus transport'],
    ['Virtual water conserved', `${fmt(m.headline.waterSavedLitres)} L`, 'Category water footprints'],
    ['Agricultural land conserved', `${fmt(m.headline.landSavedM2)} m2`, 'Category land footprints'],
    ['Financial benefit', rs(m.headline.moneySaved), 'Avoided cooking cost + secondary sales'],
  ]);
}

function principle6Section(doc, m) {
  heading(doc, '2. BRSR Principle 6 — environmental indicators');
  kv(doc, [
    ['Energy consumed (processing)', `${fmt(m.processing.energy_kwh)} kWh`, 'Production run meters'],
    ['Energy intensity', `${fmt(m.processing.energyPerKg, 3)} kWh/kg`, 'Per kg of output'],
    ['Scope 2 emissions', `${fmt(m.processing.scope2Co2e)} kg CO2e`, `${m.factors.gridCo2PerKwh} kg/kWh grid factor`],
    ['Processing yield', `${fmt(m.processing.yieldPct, 1)} %`, 'Output / raw input'],
    ['Process scrap generated', `${fmt(m.processing.scrap_kg)} kg`, 'Production records'],
    ['Kitchen overproduction (before)', m.prevention.baselineOverproductionPct === null ? 'n/a' : `${m.prevention.baselineOverproductionPct} %`, 'Prepared vs served, pre-forecast'],
    ['Kitchen overproduction (with FoodSync)', m.prevention.currentOverproductionPct === null ? 'n/a' : `${m.prevention.currentOverproductionPct} %`, 'Prepared vs served, forecast-planned'],
    ['Waste recovered — donation', `${fmt(m.redistribution.donatedKg)} kg`, 'Verified QR hand-offs'],
    ['Waste recovered — secondary sale', `${fmt(m.redistribution.soldKg)} kg`, 'Verified QR hand-offs'],
    ['Waste recovered — compost/biogas', `${fmt(m.redistribution.compostedKg)} kg`, 'Routed to facility'],
    ['Surplus expired unclaimed', `${fmt(m.redistribution.expiredKg)} kg`, 'Listings past safe window'],
    ['Logistics distance / emissions', `${fmt(m.logistics.km)} km / ${fmt(m.logistics.transportCo2e)} kg`, `${m.factors.vehicleCo2PerKm} kg CO2e/km`],
  ]);
}

function registerSection(doc, handoffs) {
  heading(doc, '3. FSSAI surplus food distribution register');
  doc.fontSize(9).fillColor(MUTED).text('Food Safety and Standards (Recovery and Distribution of Surplus Food) Regulations, 2019 — record of each hand-off with temperature at receipt.').moveDown(0.4);
  table(doc, ['Date', 'Donor', 'Recipient', 'Item', 'kg', 'Temp °C', 'Result'],
    handoffs.slice(0, 200).map((h) => [new Date(h.completed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }), h.donor, h.recipient, h.title, fmt(h.quantity_kg, 1), h.food_temp_c ?? '—', h.status === 'done' ? 'Accepted' : 'Rejected']),
    [70, 90, 95, 120, 40, 45, 55]);
}

async function render(query, scope) {
  const [m, handoffs, chain, orgRow] = await Promise.all([sustainability.metrics(query, scope), sustainability.handoffs(query, scope), audit.verify(), scope.orgId ? directoryRepo.findOrganization(scope.orgId) : null]);
  const org = orgRow?.name;
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'FoodSync ESG & Food Waste Report' } });
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(20).text('FoodSync — ESG & Food Waste Report');
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`${org || 'All organisations'}  ·  Period ${m.period.from} to ${m.period.to}  ·  Generated ${new Date().toLocaleString('en-IN')}`);
  summarySection(doc, m);
  principle6Section(doc, m);
  registerSection(doc, handoffs);
  heading(doc, '4. Data integrity');
  doc.x = doc.page.margins.left;
  doc.text(`Audit chain: ${chain.valid ? 'VALID' : `BROKEN at entry ${chain.brokenAt}`} — ${chain.checked} entries verified.`);
  if (chain.head) doc.font('Courier').fontSize(8).text(`Head hash: ${chain.head}`).font('Helvetica');
  doc.moveDown().fontSize(8).fillColor(MUTED).text(`Emission and resource factors used: ${JSON.stringify(m.factors)}. Category footprints are configurable under Admin → Food categories. Figures are computed from operational records and should be validated before external disclosure.`);
  return doc;
}

module.exports = { render };
