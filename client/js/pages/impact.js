import { api, session, qs } from '../api.js';
import { html, raw, h, $, fmt, table, badge, kpi } from '../ui.js';
import { chart, palette, alpha } from '../charts.js';
import { icon } from '../icons.js';

const PERIODS = [[30, '30 days'], [90, '90 days'], [180, '6 months'], [365, '12 months']];

function drawMonthly(canvas, monthly) {
  const p = palette();
  const months = [...new Set(monthly.map((m) => m.month))];
  const series = (ch) => months.map((mo) => monthly.find((m) => m.month === mo && m.channel === ch)?.kg || 0);
  chart(canvas, 'bar', { labels: months, datasets: [
    { label: 'Donated to NGOs', data: series('donation'), backgroundColor: alpha(p.brand, 0.8), borderRadius: 4, stack: 's' },
    { label: 'Sold to secondary buyers', data: series('secondary_sale'), backgroundColor: alpha(p.info, 0.7), borderRadius: 4, stack: 's' },
  ] }, { scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'kg', color: p.faint } } } });
}

function drawOutcomes(canvas, r) {
  const p = palette();
  chart(canvas, 'doughnut', { labels: ['Donated', 'Sold', 'Composted / biogas', 'Expired unclaimed'], datasets: [{ data: [r.donatedKg, r.soldKg, r.compostedKg, r.expiredKg], backgroundColor: [p.brand, p.info, p.warn, p.danger], borderWidth: 0 }] },
    { cutout: '62%', scales: { x: { display: false }, y: { display: false } }, plugins: { legend: { position: 'right' } } });
}

function equivalents(m) {
  const trees = m.headline.netCo2eAvoidedKg / 21; // ~21 kg CO2 absorbed per mature tree per year
  const households = m.headline.waterSavedLitres / (135 * 5 * 365); // 135 L/person/day (CPHEEO), 5-person household, 1 year
  return html`<div class="callout green">That is roughly the yearly CO₂ uptake of <b>${fmt.n(trees)}</b> trees and a year's water for <b>${fmt.n(households)}</b> households.</div>`;
}

export async function render(root, { params }) {
  const days = Number(params.days) || 90;
  const from = new Date(Date.now() - days * 86400000).toLocaleDateString('en-CA');
  const [m, handoffs] = await Promise.all([api.get(`/sustainability/metrics${qs({ from })}`), api.get(`/sustainability/handoffs${qs({ from })}`)]);
  const r = m.redistribution;
  const pv = m.prevention;
  root.innerHTML = html`<div class="page-head"><div><h1>Sustainability & ESG</h1><p>All figures are computed from operational records × configurable factors, for BRSR Principle 6 and FSSAI surplus-food reporting.</p></div>
    <div class="row"><div class="tabs" style="margin:0;border:0">${raw(PERIODS.map(([d, l]) => `<button data-days="${d}" class="${d === days ? 'active' : ''}">${l}</button>`).join(''))}</div>
    <a class="btn primary" href="/api/sustainability/report.pdf${qs({ from, access_token: session.token })}" target="_blank" rel="noopener">${raw(icon('download'))} ESG report (PDF)</a></div></div>
    <div class="stack">
      <div class="grid g3">${kpi('Food saved', fmt.kg(m.headline.foodSavedKg), `${fmt.kg(pv.preventedKg)} never over-cooked + ${fmt.kg(r.donatedKg + r.soldKg)} redistributed`)}${kpi('Meals to people in need', fmt.n(m.headline.mealsServed), `${fmt.kg(r.donatedKg)} donated`)}${kpi('Net emissions avoided', fmt.n(m.headline.netCo2eAvoidedKg / 1000, 1), `after ${fmt.n(m.logistics.transportCo2e)} kg delivery emissions`, 't CO₂e')}</div>
      <div class="grid g3">${kpi('Virtual water conserved', fmt.n(m.headline.waterSavedLitres / 1e6, 1), 'embedded in food not wasted', 'ML')}${kpi('Farmland conserved', fmt.n(m.headline.landSavedM2 / 10000, 2), 'land needed to grow it', 'ha')}${kpi('Financial benefit', fmt.inr(m.headline.moneySaved), `${fmt.inr(pv.costSaved)} avoided cooking + ${fmt.inr(r.secondaryRevenue)} sales`)}</div>
      ${raw(equivalents(m))}
      <div class="grid g-2-1"><div class="card"><div class="card-head"><h3>Food redistributed per month</h3></div><div class="chart-box"><canvas id="monthly"></canvas></div></div>
        <div class="card"><div class="card-head"><h3>Where listed surplus went</h3></div><div class="chart-box"><canvas id="outcomes"></canvas></div></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><div><h3>Waste prevention at source</h3><p>Kitchens, prepared vs served</p></div></div>
          <table class="data"><tbody><tr><td>Overproduction with static planning</td><td class="r"><b>${pv.baselineOverproductionPct ?? '—'}%</b></td></tr><tr><td>Overproduction with FoodSync forecasts</td><td class="r"><b class="delta-good">${pv.currentOverproductionPct ?? '—'}%</b></td></tr>
          <tr><td>Portions not cooked unnecessarily</td><td class="r">${fmt.n(pv.preventedPortions)}</td></tr><tr><td>Edible leftover logged</td><td class="r">${fmt.kg(pv.leftoverKg)}</td></tr><tr><td>Plate waste logged</td><td class="r">${fmt.kg(pv.plateWasteKg)}</td></tr></tbody></table></div>
        <div class="card"><div class="card-head"><div><h3>Processing — environmental</h3><p>BRSR Principle 6 indicators</p></div></div>
          <table class="data"><tbody><tr><td>Energy consumed</td><td class="r">${fmt.n(m.processing.energy_kwh)} kWh</td></tr><tr><td>Energy intensity</td><td class="r">${fmt.n(m.processing.energyPerKg, 3)} kWh/kg</td></tr><tr><td>Scope 2 emissions</td><td class="r">${fmt.n(m.processing.scope2Co2e / 1000, 1)} t CO₂e</td></tr>
          <tr><td>Yield</td><td class="r">${fmt.pct(m.processing.yieldPct)}</td></tr><tr><td>Process scrap</td><td class="r">${fmt.kg(m.processing.scrap_kg)}</td></tr></tbody></table></div></div>
      <div class="grid g2"><div class="card"><div class="card-head"><h3>Beneficiary organisations</h3></div>${raw(table([{ label: 'Recipient', key: 'name' }, { label: 'Type', render: (x) => badge(x.org_type === 'ngo' ? 'donation' : 'secondary_sale', fmt.title(x.org_type)) }, { label: 'Deliveries', r: true, render: (x) => x.deliveries }, { label: 'Food', r: true, render: (x) => fmt.kg(x.kg) }], m.recipients))}</div>
        <div class="card"><div class="card-head"><div><h3>FSSAI surplus distribution register</h3><p>Every hand-off with temperature at receipt</p></div></div>${raw(table([{ label: 'When', render: (x) => fmt.dt(x.completed_at) }, { label: 'Donor → recipient', render: (x) => h`${x.donor}<br><small class="muted">→ ${x.recipient}</small>` }, { label: 'kg', r: true, render: (x) => fmt.n(x.quantity_kg, 1) }, { label: '°C', r: true, render: (x) => fmt.n(x.food_temp_c, 1) }, { label: '', render: (x) => badge(x.status === 'done' ? 'safe' : 'unsafe', x.status === 'done' ? 'accepted' : 'rejected') }], handoffs.slice(0, 100)))}</div></div>
      <div class="card"><h4>Factors used</h4><p class="mono" style="margin:6px 0 0">${Object.entries(m.factors).map(([k, v]) => `${k} = ${v}`).join(' · ')}</p><p class="faint" style="font-size:12px;margin:6px 0 0">Per-category CO₂e, water and land footprints are editable in Administration → Food categories. Validate factors before external disclosure.</p></div>
    </div>`;
  drawMonthly($('#monthly', root), m.monthly);
  drawOutcomes($('#outcomes', root), r);
  root.querySelectorAll('[data-days]').forEach((b) => (b.onclick = () => { location.hash = `#/impact?days=${b.dataset.days}`; }));
}
