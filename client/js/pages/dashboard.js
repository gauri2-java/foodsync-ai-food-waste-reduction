import { api } from '../api.js';
import { html, raw, h, $, fmt, kpi, badge, progress } from '../ui.js';
import { chart, palette, alpha, lineStyle } from '../charts.js';
import { renderNetworkMap } from '../components/networkMap.js';
import { store } from '../store.js';

const RECIPIENT_ROLES = ['ngo_coordinator', 'buyer'];

function alertStrip(alerts) {
  const critical = alerts.filter((a) => a.severity === 'critical');
  if (!critical.length) return '';
  return html`<div class="alert-strip"><b>${critical.length} critical</b><marquee scrollamount="4" onmouseover="this.stop()" onmouseout="this.start()">${raw(critical.map((a) => html`<span>● ${a.site_name ? `${a.site_name}: ` : ''}${a.title}</span>`).join(''))}</marquee><a class="btn sm" href="#/alerts">Review</a></div>`;
}

function impactRow(o) {
  const i = o.impact30d;
  return html`<div class="grid g4">
    ${kpi('Food saved · 30 days', fmt.kg(i.foodSavedKg), 'prevented + redistributed')}
    ${kpi('Meals to shelters', fmt.n(i.mealsServed), 'from verified donations')}
    ${kpi('Net CO₂e avoided', fmt.n(i.netCo2eAvoidedKg / 1000, 1), 'after delivery emissions', 't')}
    ${kpi('Money saved', fmt.inr(i.moneySaved), 'cooking cost avoided + sales')}
  </div>`;
}

function preventionCard(p) {
  const before = p.baselineOverproductionPct;
  const now = p.currentOverproductionPct;
  if (before == null) return html`<div class="card"><h3>Overproduction</h3><p class="muted">Not enough forecast-planned services yet.</p></div>`;
  const cut = before > 0 ? (100 * (before - now)) / before : 0;
  return html`<div class="card"><div class="card-head"><div><h3>Overproduction at source</h3><p>Prepared vs served portions</p></div>${badge('delivered', `−${fmt.n(cut, 0)}%`)}</div>
    <div class="stack" style="gap:12px">
      <div><div class="row between"><span class="muted">Static headcount planning</span><b class="num">${fmt.pct(before)}</b></div>${progress(Math.min(100, before * 2.5), 'red')}</div>
      <div><div class="row between"><span class="muted">FoodSync forecast planning</span><b class="num">${fmt.pct(now)}</b></div>${progress(Math.min(100, now * 2.5))}</div>
      <p class="muted" style="margin:0;font-size:12.5px">${fmt.n(p.preventedPortions)} portions (${fmt.kg(p.preventedKg)}) not cooked unnecessarily in the last 30 days.</p>
    </div></div>`;
}

function pipelineCard(o) {
  const by = Object.fromEntries(o.pipeline.map((p) => [p.status, p]));
  const stages = ['open', 'offered', 'matched', 'in_transit', 'delivered'];
  return html`<div class="card"><div class="card-head"><div><h3>Surplus pipeline · 7 days</h3><p>From listing to verified hand-off</p></div><a class="btn sm" href="#/surplus">Open</a></div>
    <table class="data"><tbody>${raw(stages.map((s) => html`<tr><td>${badge(s)}</td><td class="r">${by[s]?.n ?? 0}</td><td class="r muted">${fmt.kg(by[s]?.kg ?? 0)}</td></tr>`).join(''))}
    ${by.expired ? h`<tr><td>${badge('expired')}</td><td class="r">${by.expired.n}</td><td class="r muted">${fmt.kg(by.expired.kg)}</td></tr>` : ''}</tbody></table></div>`;
}

function opsRow(o) {
  const m = o.meals;
  const trips = Object.fromEntries(o.trips.map((t) => [t.status, t.n]));
  return html`<div class="grid g4">
    ${kpi("Today's meals served", fmt.n(m.served), m.prepared ? `${fmt.n(m.prepared)} prepared · ${fmt.pct((100 * (m.prepared - m.served)) / m.prepared)} surplus` : 'no services logged yet')}
    ${kpi('Leftover today', fmt.kg(m.leftover_kg), 'edible surplus logged')}
    ${kpi('Trips active', fmt.n((trips.planned || 0) + (trips.in_progress || 0)), `${trips.completed || 0} completed in 48 h`)}
    ${kpi('Sensors online', `${o.devices.online}/${o.devices.total}`, o.devices.total && o.devices.online < o.devices.total ? '<span class="delta-bad">some devices silent</span>' : 'all reporting')}
  </div>`;
}

async function drawTrend(el) {
  const trend = await api.get('/kitchen/waste-trend?days=90');
  if (!trend.length) { el.closest('.card').hidden = true; return; }
  const p = palette();
  const labels = trend.map((t) => fmt.date(t.date));
  const goLive = trend.find((t) => t.planned);
  chart(el, 'line', {
    labels,
    datasets: [{ label: 'Overproduction', data: trend.map((t) => (t.prepared ? +((100 * (t.prepared - t.served)) / t.prepared).toFixed(1) : null)), ...lineStyle(p.series[0], { fill: true, backgroundColor: alpha(p.series[0], 0.08) }) }],
  }, {
    plugins: { fsMarker: goLive ? { at: fmt.date(goLive.date), label: 'FoodSync planning starts' } : {}, tooltip: { callbacks: { label: (c) => ` Overproduction ${c.parsed.y}%` } } },
    scales: { y: { ticks: { callback: (v) => `${v}%` } } },
  });
}

async function drawNetwork(el) {
  const [sites, vehicles] = await Promise.all([store.allSites(), api.get('/logistics/vehicles').catch(() => [])]);
  renderNetworkMap(el, { sites, vehicles });
}

function recentAlerts(alerts) {
  if (!alerts.length) return '<div class="empty">No open alerts 🎉</div>';
  return html`<div class="list">${raw(alerts.slice(0, 7).map((a) => html`<div class="list-item"><span class="dot ${a.severity}"></span><div style="min-width:0"><div>${a.title}</div><small>${a.site_name || 'Network'} · ${fmt.ago(a.created_at)}</small></div></div>`).join(''))}</div>`;
}

async function renderOps(root, user) {
  const [o, alerts] = await Promise.all([api.get('/dashboard/overview'), api.get('/alerts?open=true&limit=50')]);
  root.innerHTML = html`
    <div class="page-head"><div><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.fullName.split(' ')[0]}</h1><p>${user.orgName || 'All organisations'} · live operations and impact</p></div>
      <div class="row"><a class="btn" href="#/impact">${'ESG report'}</a>${['kitchen_manager', 'plant_manager', 'admin'].includes(user.role) ? h`<a class="btn primary" href="#/surplus?new=1">List surplus</a>` : ''}</div></div>
    ${raw(alertStrip(alerts))}
    <div class="stack">
      ${raw(impactRow(o))}
      ${raw(opsRow(o))}
      <div class="grid g-2-1">
        <div class="card"><div class="card-head"><div><h3>Kitchen overproduction</h3><p>Share of prepared portions not served · last 90 days</p></div></div><div class="chart-box"><canvas id="trend"></canvas></div></div>
        ${raw(preventionCard(o.prevention30d))}
      </div>
      <div class="card net-card"><div class="card-head"><div><h3>Redistribution network</h3><p>Kitchens, processing plant, NGOs, buyers, compost facilities and live vehicles</p></div></div><div id="net-map"></div></div>
      <div class="grid g2">${raw(pipelineCard(o))}<div class="card"><div class="card-head"><h3>Open alerts</h3><a class="btn sm" href="#/alerts">All</a></div>${raw(recentAlerts(alerts))}</div></div>
    </div>`;
  await Promise.all([drawTrend($('#trend', root)), drawNetwork($('#net-map', root))]);
}

async function renderRecipient(root, user) {
  const [offers, metrics] = await Promise.all([api.get('/surplus?status=offered,matched,in_transit'), api.get('/sustainability/metrics')]);
  const pending = offers.filter((l) => l.status === 'offered');
  const incoming = offers.filter((l) => ['matched', 'in_transit'].includes(l.status));
  const received = metrics.recipients.reduce((s, r) => s + r.kg, 0);
  root.innerHTML = html`
    <div class="page-head"><div><h1>Welcome, ${user.fullName.split(' ')[0]}</h1><p>${user.orgName} · food offers and deliveries</p></div><a class="btn primary" href="#/receive">Receive a delivery</a></div>
    ${user.orgVerified === false ? raw('<div class="callout amber" style="margin-bottom:16px">Your organisation is awaiting verification by an administrator. You will start receiving offers once verified.</div>') : ''}
    <div class="stack">
      <div class="grid g4">${kpi('Offers waiting', pending.length, '<a href="#/offers">respond now</a>')}${kpi('Deliveries on the way', incoming.length)}${kpi('Food received · 90 days', fmt.kg(received))}${kpi('Deliveries · 90 days', fmt.n(metrics.recipients.reduce((s, r) => s + r.deliveries, 0)))}</div>
      <div class="card net-card"><div class="card-head"><h3>Network</h3></div><div id="net-map"></div></div>
    </div>`;
  await drawNetwork($('#net-map', root));
}

export async function render(root, { user }) {
  if (RECIPIENT_ROLES.includes(user.role)) return renderRecipient(root, user);
  return renderOps(root, user);
}
