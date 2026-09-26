import { api } from '../api.js';
import { html, raw, h, $, fmt, table, badge, errorToast, withBusy, toast, modal, kpi, formData, options } from '../ui.js';
import { chart, palette, alpha, lineStyle, barStyle, stackStyle } from '../charts.js';
import { openSurplusForm } from '../components/surplusForm.js';

function findingsCard(findings) {
  return html`<div class="card"><div class="card-head"><div><h3>Detected inefficiencies</h3><p>Rules over the last 30 days of production records</p></div></div>
    ${findings.length ? raw(html`<div class="list">${raw(findings.map((f) => html`<div class="list-item"><span class="dot ${f.severity}"></span><div>${f.text}<br><small class="muted">${fmt.title(f.kind)}</small></div></div>`).join(''))}</div>`) : raw('<div class="empty">All lines within targets</div>')}</div>`;
}

function anomalyCard(a) {
  const flagged = a.machines.filter((m) => m.anomalous);
  return html`<div class="card"><div class="card-head"><div><h3>Machine health · Isolation Forest</h3><p>Unsupervised anomaly score on power, throughput, temperature, vibration and energy/kg (72 h). Alert above ${a.threshold}.</p></div>${flagged.length ? badge('critical', `${flagged.length} anomalous`) : badge('safe', 'normal')}</div>
    <div class="grid g3">${raw(a.machines.map((m) => html`<div class="card" style="padding:12px;${m.anomalous ? 'border-color:var(--danger)' : ''}">
      <div class="row between"><b>${m.name}</b>${m.anomalous ? badge('critical', fmt.n(m.latestScore, 2)) : badge('', m.latestScore != null ? fmt.n(m.latestScore, 2) : '—')}</div>
      <small class="muted">${m.line_name}</small>${m.reason ? h`<div class="delta-bad" style="font-size:12px;margin-top:4px">${m.reason}</div>` : ''}
      <div class="chart-box" style="height:70px;margin-top:6px"><canvas data-m="${m.id}"></canvas></div></div>`).join(''))}</div></div>`;
}

function drawAnomalies(root, a) {
  const p = palette();
  for (const m of a.machines) {
    const c = root.querySelector(`[data-m="${m.id}"]`);
    if (!c || !m.points.length) continue;
    const color = m.anomalous ? p.status.critical : p.series[0];
    chart(c, 'line', { labels: m.points.map((x) => fmt.time(x.t)), datasets: [
      { label: 'Anomaly score', data: m.points.map((x) => x.score), ...lineStyle(color, { borderWidth: 1.5, tension: 0.2, fill: true, backgroundColor: alpha(color, 0.08) }) },
      { label: 'Alert threshold', data: m.points.map(() => a.threshold), borderColor: p.neutral, borderWidth: 1, borderDash: [3, 3], pointRadius: 0 },
    ] }, { plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, min: 0.3, max: 0.85 } } });
  }
}

function drawTrend(canvas, trend) {
  const p = palette();
  chart(canvas, 'bar', {
    labels: trend.map((t) => fmt.date(t.date)),
    datasets: [
      { label: 'Good output', data: trend.map((t) => Math.round(t.outputKg / 10) / 100), ...stackStyle(p.series[0], { stack: 'k' }) },
      { label: 'Scrap', data: trend.map((t) => Math.round(t.scrapKg / 10) / 100), ...stackStyle(p.series[1], { stack: 'k' }) },
    ],
  }, { plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt.n(c.parsed.y, 2)} t` } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => `${v} t` } } } });
}

function drawOee(canvas, trend, target) {
  const p = palette();
  chart(canvas, 'line', {
    labels: trend.map((t) => fmt.date(t.date)),
    datasets: [
      { label: 'OEE', data: trend.map((t) => +(t.oee * 100).toFixed(1)), ...lineStyle(p.series[0]) },
      { label: 'Target', data: trend.map(() => target * 100), borderColor: p.neutral, borderWidth: 1, borderDash: [4, 4], pointRadius: 0, hideInLegend: true },
    ],
  }, { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y}%` } } }, scales: { y: { min: 40, max: 100, ticks: { callback: (v) => `${v}%`, stepSize: 20 } } } });
}

function drawPareto(canvas, pareto) {
  const p = palette();
  chart(canvas, 'bar', { labels: pareto.map((d) => fmt.title(d.reason)), datasets: [{ label: 'Downtime', data: pareto.map((d) => d.minutes), ...barStyle(p.series[0], { borderSkipped: 'start' }) }] },
    { indexAxis: 'y', layout: { padding: { right: 56 } }, plugins: { fsValueLabels: { format: (v) => `${fmt.n(v)} min` }, tooltip: { callbacks: { label: (c) => ` ${fmt.n(c.parsed.x)} minutes` } } }, scales: { x: { grid: { color: alpha('#000000', 0.06) }, ticks: { callback: (v) => `${v} min` } }, y: { grid: { display: false } } } });
}

async function drawProductForecast(canvas, productId) {
  const f = await api.get(`/forecast/product/${productId}`);
  const p = palette();
  chart(canvas, 'line', { labels: f.predictions.map((x) => fmt.day(x.date)), datasets: [
    { label: 'Forecast demand', data: f.predictions.map((x) => x.predicted), ...lineStyle(p.series[0], { pointRadius: 3 }) },
    { label: '80% range', data: f.predictions.map((x) => x.upper), borderWidth: 0, backgroundColor: alpha(p.series[0], 0.14), fill: '+1', pointRadius: 0 },
    { label: 'low', data: f.predictions.map((x) => x.lower), borderWidth: 0, pointRadius: 0, fill: false },
  ] }, { plugins: { legend: { labels: { filter: (i) => i.text !== 'low' } }, tooltip: { filter: (i) => i.dataset.label === 'Forecast demand', callbacks: { label: (c) => ` ${fmt.n(c.parsed.y)} kg dispatched` } } }, scales: { y: { beginAtZero: false, ticks: { callback: (v) => `${fmt.n(v)} kg` } } } });
  return f.model;
}

function recordRun(lines, products, done) {
  const today = new Date().toLocaleDateString('en-CA');
  const m = modal({
    title: 'Record production run',
    body: html`<form class="form" id="rf"><div class="form-row"><div class="field"><label>Line</label><select name="line_id">${raw(options(lines))}</select></div><div class="field"><label>Product</label><select name="product_id">${raw(options(products))}</select></div><div class="field"><label>Date</label><input type="date" name="run_date" value="${today}"></div></div>
      <div class="form-row"><div class="field"><label>Planned output kg</label><input type="number" name="planned_output_kg" required></div><div class="field"><label>Raw input kg</label><input type="number" name="input_kg" required></div><div class="field"><label>Good output kg</label><input type="number" name="output_kg" required></div></div>
      <div class="form-row"><div class="field"><label>Scrap / rejects kg</label><input type="number" name="scrap_kg" required></div><div class="field"><label>Dispatched kg</label><input type="number" name="dispatched_kg"></div><div class="field"><label>Energy kWh</label><input type="number" name="energy_kwh" required></div></div>
      <div class="form-row"><div class="field"><label>Planned minutes</label><input type="number" name="planned_minutes" value="480"></div><div class="field"><label>Running minutes</label><input type="number" name="run_minutes" required></div></div></form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">Save run</button>',
  });
  m.el.querySelector('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
    const d = formData(m.el.querySelector('#rf'));
    d.line_id = Number(d.line_id); d.product_id = Number(d.product_id);
    const r = await api.post('/processing/runs', d);
    m.close();
    toast(`Yield ${fmt.pct(r.kpi.yieldPct)} · OEE ${fmt.pct(r.kpi.oee * 100, 0)}`, 'ok');
    done();
  }).catch(errorToast);
}

function recordDowntime(lines, done) {
  const machines = lines.flatMap((l) => l.machines.map((mc) => ({ ...mc, label: `${l.name} · ${mc.name}` })));
  const m = modal({
    title: 'Log downtime',
    body: html`<form class="form" id="df"><div class="field"><label>Machine</label><select name="machine_id">${raw(options(machines, '', { labelKey: 'label' }))}</select></div>
      <div class="form-row"><div class="field"><label>Reason</label><select name="reason">${raw(['breakdown', 'changeover', 'no_material', 'cleaning', 'power_failure', 'quality_hold', 'other'].map((r) => `<option value="${r}">${fmt.title(r)}</option>`).join(''))}</select></div><div class="field"><label>Started</label><input type="datetime-local" name="started_at" required></div><div class="field"><label>Ended</label><input type="datetime-local" name="ended_at"></div></div>
      <div class="field"><label>Notes</label><input name="notes"></div></form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">Save</button>',
  });
  m.el.querySelector('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
    const d = formData(m.el.querySelector('#df'));
    d.machine_id = Number(d.machine_id);
    d.started_at = new Date(d.started_at).toISOString();
    if (d.ended_at) d.ended_at = new Date(d.ended_at).toISOString();
    await api.post('/processing/downtime', d);
    m.close();
    done();
  }).catch(errorToast);
}

const RUN_COLS = [
  { label: 'Date', render: (r) => fmt.day(r.run_date) }, { label: 'Line / product', render: (r) => h`${r.line_name}<br><small class="muted">${r.product_name}</small>` },
  { label: 'Input', r: true, render: (r) => fmt.kg(r.input_kg) }, { label: 'Output', r: true, render: (r) => fmt.kg(r.output_kg) },
  { label: 'Yield', r: true, render: (r) => { const y = (100 * r.output_kg) / r.input_kg; return h`<span class="${y < r.std_yield_pct - 2 ? 'delta-bad' : ''}">${fmt.pct(y)}</span>`; } },
  { label: 'kWh/kg', r: true, render: (r) => fmt.n(r.energy_kwh / r.output_kg, 2) },
  { label: 'Excess', r: true, render: (r) => { const x = r.output_kg - r.dispatched_kg; return x > 50 ? h`<button class="btn sm" data-surplus="${r.id}">${fmt.kg(x)} → list</button>` : fmt.kg(Math.max(0, x)); } },
];

export async function render(root, { user }) {
  const [o, a, lines, products, runs] = await Promise.all([api.get('/processing/overview?days=30'), api.get('/processing/anomalies'), api.get('/processing/lines'), api.get('/processing/products'), api.get('/processing/runs?days=14')]);
  const canEdit = ['plant_manager', 'admin'].includes(user.role);
  const t = o.totals;
  root.innerHTML = html`<div class="page-head"><div><h1>Processing units</h1><p>Line efficiency, raw-material losses, energy, downtime and live machine health.</p></div>
    ${canEdit ? raw('<div class="row"><button class="btn" id="dt">Log downtime</button><button class="btn primary" id="run">Record run</button></div>') : ''}</div>
    <div class="stack"><div class="grid g4">${kpi('Output · 30 d', fmt.kg(t.outputKg), `${t.runs} runs`)}${kpi('Average OEE', fmt.n(t.oee * 100, 0), 'availability × performance × quality', '%')}${kpi('Scrap cost', fmt.inr(t.scrapCost), `${fmt.kg(t.scrapKg)} rejected`)}${kpi('Produced beyond demand', fmt.kg(t.overproductionKg), `${fmt.n(o.downtimeMinutes)} min downtime`)}</div>
    ${raw(anomalyCard(a))}
    <div class="grid g-2-1"><div class="card"><div class="card-head"><div><h3>Daily production</h3><p>Good output vs scrap, tonnes</p></div></div><div class="chart-box"><canvas id="trend"></canvas></div><div class="card-head" style="margin:18px 0 6px"><div><h3>Overall equipment effectiveness</h3><p>Daily average across lines · dashed line = target</p></div></div><div class="chart-box short"><canvas id="oee"></canvas></div></div>${raw(findingsCard(o.findings))}</div>
    <div class="grid g2"><div class="card"><div class="card-head"><h3>Lines · 30 days</h3></div>${raw(table([{ label: 'Line', key: 'line' }, { label: 'Yield', r: true, render: (l) => h`${fmt.pct(l.yieldPct)} <small class="muted">std ${fmt.pct(l.stdYieldPct)}</small>` }, { label: 'OEE', r: true, render: (l) => fmt.pct(l.oee * 100, 0) }, { label: 'kWh/kg', r: true, render: (l) => h`${fmt.n(l.energyPerKg, 2)} <small class="muted">std ${fmt.n(l.stdEnergyPerKg, 2)}</small>` }, { label: 'Scrap', r: true, render: (l) => fmt.kg(l.scrapKg) }], o.lines))}</div>
      <div class="card"><div class="card-head"><h3>Downtime Pareto</h3></div><div class="chart-box"><canvas id="pareto"></canvas></div></div></div>
    <div class="grid g-1-2"><div class="card"><div class="card-head"><div><h3>Product demand forecast</h3><p id="pf-meta"></p></div><select id="prod" style="width:auto">${raw(options(products))}</select></div><div class="chart-box"><canvas id="pf"></canvas></div></div>
      <div class="card"><div class="card-head"><div><h3>Recent runs</h3><p>List excess finished goods for secondary buyers</p></div></div><div id="runs"></div></div></div></div>`;
  drawTrend($('#trend', root), o.trend);
  drawOee($('#oee', root), o.trend, o.oeeTarget);
  drawPareto($('#pareto', root), o.downtimePareto);
  drawAnomalies(root, a);
  const loadForecast = async (id) => {
    const c = $('#pf', root);
    window.Chart.getChart(c)?.destroy();
    try { const m = await drawProductForecast(c, id); $('#pf-meta', root).textContent = `MAPE ${fmt.n(m.mape, 1)}% vs naive ${fmt.n(m.baseline_mape, 1)}%`; } catch (e) { $('#pf-meta', root).textContent = e.message; }
  };
  $('#prod', root).onchange = (e) => loadForecast(e.target.value);
  const initial = runs[0]?.product_id ?? products[0]?.id;
  if (initial) { $('#prod', root).value = initial; loadForecast(initial); }
  const runsEl = $('#runs', root);
  runsEl.innerHTML = table(RUN_COLS, runs);
  runsEl.querySelectorAll('[data-surplus]').forEach((b) => (b.onclick = () => {
    const r = runs.find((x) => x.id === Number(b.dataset.surplus));
    openSurplusForm({ site_id: r.site_id, production_run_id: r.id, title: `Excess ${r.product_name} — ${r.run_date}`, quantity_kg: Math.round(r.output_kg - r.dispatched_kg), category_code: r.category_code, prepared_at: `${r.run_date}T18:00:00` });
  }));
  const reload = () => window.dispatchEvent(new Event('fs:navigate'));
  $('#run', root)?.addEventListener('click', () => recordRun(lines, products, reload));
  $('#dt', root)?.addEventListener('click', () => recordDowntime(lines, reload));
}
