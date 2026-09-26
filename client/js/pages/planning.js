import { api } from '../api.js';
import { html, raw, h, $, fmt, options, table, badge, errorToast, withBusy, toast, modal } from '../ui.js';
import { chart, palette, alpha } from '../charts.js';
import { kitchenSites } from '../store.js';

const SLOTS = ['breakfast', 'lunch', 'snacks', 'dinner'];

function driverChips(drivers = []) {
  return h`<div class="drivers">${raw(drivers.slice(0, 3).map((d) => html`<span class="driver-chip ${d.effect > 0 ? 'up' : 'down'}">${d.driver} ${d.effect > 0 ? '+' : ''}${fmt.n(d.effect)}</span>`).join(''))}</div>`;
}

function modelCards(models) {
  return html`<div class="grid g4">${raw(models.map((m) => {
    if (m.error) return html`<div class="card"><h4>${fmt.title(m.slot)}</h4><p class="muted">${m.error}</p></div>`;
    const better = m.baseline_mape ? (100 * (m.baseline_mape - m.mape)) / m.baseline_mape : 0;
    return html`<div class="card kpi"><span class="label">${fmt.title(m.slot)} model · holdout error</span>
      <span class="value">${fmt.n(m.mape, 1)}<small>% MAPE</small></span>
      <span class="sub">${better > 0 ? h`<span class="delta-good">${fmt.n(better, 0)}% better</span>` : h`<span class="delta-bad">${fmt.n(-better, 0)}% worse</span>`} than seasonal-naive (${fmt.n(m.baseline_mape, 1)}%) · ${m.train_rows} days · trained ${fmt.ago(m.trained_at)}</span></div>`;
  }).join(''))}</div>`;
}

function drawSlotChart(canvas, slot, accuracy, services) {
  const p = palette();
  const past = accuracy.filter((a) => a.slot === slot);
  const future = services.filter((s) => s.slot === slot);
  const labels = [...past.map((a) => a.date), ...future.map((f) => f.date)].map(fmt.date);
  const pad = (arr, before) => [...new Array(before).fill(null), ...arr];
  chart(canvas, 'line', {
    labels,
    datasets: [
      { label: 'Actual served', data: past.map((a) => a.actual), borderColor: p.text, pointRadius: 0, tension: 0.25, borderWidth: 1.6 },
      { label: 'Prepared', data: past.map((a) => a.prepared), borderColor: p.faint, pointRadius: 0, tension: 0.25, borderDash: [3, 3], borderWidth: 1.2 },
      { label: 'Forecast', data: [...past.map((a) => a.predicted ?? null), ...future.map((f) => f.predicted)], borderColor: p.brand, pointRadius: 2, tension: 0.25, borderWidth: 2 },
      { label: 'Upper band', data: pad(future.map((f) => f.upper), past.length), borderColor: 'transparent', backgroundColor: alpha(p.brand, 0.14), fill: '+1', pointRadius: 0 },
      { label: 'Lower band', data: pad(future.map((f) => f.lower), past.length), borderColor: 'transparent', pointRadius: 0, fill: false },
      { label: 'Cook plan', data: pad(future.map((f) => f.recommended), past.length), borderColor: p.warn, borderWidth: 1.5, pointStyle: 'rectRot', pointRadius: 3, showLine: false },
    ],
  }, { plugins: { legend: { labels: { filter: (i) => !i.text.includes('band'), color: p.muted, boxWidth: 10, usePointStyle: true } } }, scales: { y: { beginAtZero: false } } });
}

const PLAN_COLS = [
  { label: 'Service', render: (s) => h`<b>${fmt.day(s.date)}</b> <span class="muted">${fmt.title(s.slot)}</span>` },
  { label: 'Forecast', r: true, render: (s) => h`${fmt.n(s.predicted)} <small class="muted">(${fmt.n(s.lower)}–${fmt.n(s.upper)})</small>` },
  { label: 'Cook', r: true, render: (s) => h`<b>${fmt.n(s.recommended)}</b>` },
  { label: 'Old practice', r: true, render: (s) => fmt.n(s.staticPractice) },
  { label: 'Avoided', r: true, render: (s) => (s.avoidedPortions ? h`<span class="delta-good">${fmt.n(s.avoidedPortions)} · ${fmt.inr(s.avoidedCost)}</span>` : '—') },
  { label: 'Why', render: (s) => driverChips(s.drivers) },
  { label: 'Menu', render: (s) => (s.hasMenu ? h`<span class="muted">${s.items.map((i) => i.name).join(', ')}</span>` : badge('warning', 'no menu')) },
];

const PROC_COLS = [
  { label: 'Ingredient', key: 'ingredient' },
  { label: 'Needed (7 d)', r: true, render: (l) => `${fmt.n(l.required, 1)} ${l.unit}` },
  { label: 'To buy', r: true, render: (l) => (l.toBuy > 0 ? h`<b>${fmt.n(l.toBuy, 1)} ${l.unit}</b>` : h`<span class="muted">in stock</span>`) },
  { label: 'Order by', render: (l) => (l.buyBy ? fmt.day(l.buyBy) : '—') },
  { label: 'Est. cost', r: true, render: (l) => (l.estCost ? fmt.inr(l.estCost) : '—') },
];

function serviceDetail(s) {
  const rows = s.items.flatMap((i) => i.ingredients.map((g) => ({ item: i.name, ...g })));
  modal({
    wide: true,
    title: `${fmt.day(s.date)} · ${fmt.title(s.slot)}`,
    body: html`<div class="grid g3" style="margin-bottom:14px"><div class="kpi"><span class="label">Forecast diners</span><span class="value">${fmt.n(s.predicted)}</span></div><div class="kpi"><span class="label">Cook portions</span><span class="value">${fmt.n(s.recommended)}</span></div><div class="kpi"><span class="label">Avoided vs old practice</span><span class="value">${fmt.kg(s.avoidedKg)}</span></div></div>
      <h4 style="margin-bottom:6px">What moved the forecast</h4>${driverChips(s.drivers)}
      <h4 style="margin:16px 0 6px">Raw material for this service</h4>
      ${raw(table([{ label: 'Dish', key: 'item' }, { label: 'Ingredient', key: 'ingredient' }, { label: 'Quantity', r: true, render: (r) => `${fmt.n(r.qty, 2)} ${r.unit}` }], rows, { empty: 'Add a menu for this service in Meal service log → Menu plan.' }))}`,
  });
}

async function renderPlan(root, siteId) {
  const [plan, accuracy] = await Promise.all([api.get(`/forecast/kitchen/${siteId}/plan`), api.get(`/forecast/kitchen/${siteId}/accuracy?days=35`)]);
  const slots = SLOTS.filter((s) => plan.services.some((x) => x.slot === s));
  const avoidedKg = plan.services.reduce((a, s) => a + s.avoidedKg, 0);
  const avoidedCost = plan.services.reduce((a, s) => a + s.avoidedCost, 0);
  root.innerHTML = html`<div class="stack">
    ${raw(modelCards(plan.models))}
    <div class="card"><div class="card-head"><div><h3>Demand forecast</h3><p>Last 5 weeks actuals vs forecast, next 7 days with 80% prediction band and cook plan</p></div>
      <div class="tabs" style="margin:0;border:0">${raw(slots.map((s, i) => `<button data-slot="${s}" class="${i === 0 ? 'active' : ''}">${fmt.title(s)}</button>`).join(''))}</div></div>
      <div class="chart-box tall"><canvas id="fc"></canvas></div></div>
    <div class="card"><div class="card-head"><div><h3>Production plan · next 7 days</h3><p>Cook quantity covers ~90% of likely demand (configurable service level). Click a row for the recipe breakdown.</p></div>${badge('delivered', `${fmt.kg(avoidedKg)} · ${fmt.inr(avoidedCost)} avoided`)}</div><div id="plan-table"></div></div>
    <div class="grid g-2-1">
      <div class="card"><div class="card-head"><div><h3>Smart procurement</h3><p>Planned consumption netted against stock in first-expiry-first-out order</p></div></div>${raw(table(PROC_COLS, plan.procurement.lines))}</div>
      <div class="card"><div class="card-head"><div><h3>Stock at risk</h3><p>Expires within 3 days and not used by the plan</p></div></div>
        ${plan.procurement.expiringUnused.length ? raw(html`<div class="callout amber" style="margin-bottom:10px">${plan.procurement.expiringUnused.length} lots will expire unused — adjust the menu or list them as surplus.</div><a class="btn sm" href="#/inventory">Go to inventory</a>`) : raw('<div class="empty">No stock at risk</div>')}</div>
    </div></div>`;
  const tableEl = $('#plan-table', root);
  tableEl.innerHTML = table(PLAN_COLS, plan.services, { onRow: true });
  tableEl.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = () => serviceDetail(plan.services[Number(tr.dataset.i)])));
  let current = null;
  const draw = (slot) => { current?.destroy(); current = drawSlotChart($('#fc', root), slot, accuracy, plan.services); };
  root.querySelectorAll('[data-slot]').forEach((b) => (b.onclick = () => { root.querySelectorAll('[data-slot]').forEach((x) => x.classList.toggle('active', x === b)); draw(b.dataset.slot); }));
  if (slots.length) draw(slots[0]);
}

export async function render(root, { user, params }) {
  const sites = await kitchenSites();
  if (!sites.length) { root.innerHTML = '<div class="card empty">No kitchens in your organisation yet. Add one under Administration.</div>'; return; }
  const siteId = Number(params.site) || sites[0].id;
  root.innerHTML = html`<div class="page-head"><div><h1>Demand forecasting & production planning</h1><p>Hybrid model: additive seasonal regression (weekday, calendar, weather, recent level) + gradient-boosted trees on residuals, retrained daily.</p></div>
    <div class="row"><select id="site" style="width:auto">${raw(options(sites, siteId))}</select>${user.role !== 'auditor' ? raw('<button class="btn" id="retrain">Retrain now</button>') : ''}</div></div><div id="body"></div>`;
  const body = $('#body', root);
  const load = async (id) => { body.innerHTML = '<div class="loading"><div class="spinner"></div></div>'; await renderPlan(body, id).catch((e) => { body.innerHTML = html`<div class="card empty">${e.message}</div>`; }); };
  $('#site', root).onchange = (e) => { location.hash = `#/planning?site=${e.target.value}`; };
  const btn = $('#retrain', root);
  if (btn) btn.onclick = () => withBusy(btn, async () => { await api.post(`/forecast/kitchen/${siteId}/retrain`); toast('Models retrained on the latest data', 'ok'); await load(siteId); }).catch(errorToast);
  await load(siteId);
}
