import { api } from '../api.js';
import { html, raw, h, $, fmt, options, table, badge, errorToast, withBusy, modal, formData } from '../ui.js';
import { chart, palette, alpha } from '../charts.js';
import { on } from '../live.js';
import { store, donorSites } from '../store.js';

const inRange = (u, t) => t == null || ((u.min_temp_c == null || t >= u.min_temp_c) && (u.max_temp_c == null || t <= u.max_temp_c));

function unitCard(u, latest) {
  const t = latest.temp_c;
  const ok = inRange(u, t?.value);
  return html`<div class="card" data-unit="${u.id}">
    <div class="card-head"><div><h3>${u.name}</h3><p>${u.site_name} · ${fmt.title(u.unit_type)}</p></div>${t ? badge(ok ? 'safe' : 'critical', ok ? 'in range' : 'out of range') : badge('', 'no sensor')}</div>
    <div class="row" style="gap:22px;align-items:flex-end">
      <div class="kpi"><span class="label">Temperature</span><span class="value" data-m="temp_c" style="color:${ok ? 'inherit' : 'var(--danger)'}">${t ? fmt.n(t.value, 1) : '—'}<small>°C</small></span><span class="sub">range ${u.min_temp_c ?? '–'}…${u.max_temp_c ?? '–'} °C</span></div>
      ${latest.humidity ? h`<div class="kpi"><span class="label">Humidity</span><span class="value" data-m="humidity" style="font-size:20px">${fmt.n(latest.humidity.value)}<small>%</small></span></div>` : ''}
      ${latest.nh3_ppm ? h`<div class="kpi"><span class="label">NH₃</span><span class="value" data-m="nh3_ppm" style="font-size:20px">${fmt.n(latest.nh3_ppm.value, 1)}<small>ppm</small></span></div>` : ''}
      ${latest.co2_ppm ? h`<div class="kpi"><span class="label">CO₂</span><span class="value" data-m="co2_ppm" style="font-size:20px">${fmt.n(latest.co2_ppm.value)}<small>ppm</small></span></div>` : ''}
    </div>
    <div class="chart-box short" style="margin-top:10px"><canvas data-chart="${u.id}"></canvas></div>
    <small class="faint" data-seen>${t ? `updated ${fmt.ago(t.recorded_at)}` : ''}</small></div>`;
}

async function drawUnitChart(canvas, unit, device) {
  if (!device) return;
  const rows = await api.get(`/iot/devices/${device.id}/series?metric=temp_c&hours=24`);
  const p = palette();
  const c = chart(canvas, 'line', {
    labels: rows.map((r) => fmt.time(r.t)),
    datasets: [
      { label: 'Temperature °C', data: rows.map((r) => r.v), borderColor: p.info, backgroundColor: alpha(p.info, 0.08), fill: true, pointRadius: 0, tension: 0.3, borderWidth: 1.5 },
      ...(unit.max_temp_c != null ? [{ label: 'Max', data: rows.map(() => unit.max_temp_c), borderColor: p.danger, borderDash: [4, 4], pointRadius: 0, borderWidth: 1 }] : []),
      ...(unit.min_temp_c != null ? [{ label: 'Min', data: rows.map(() => unit.min_temp_c), borderColor: p.warn, borderDash: [4, 4], pointRadius: 0, borderWidth: 1 }] : []),
    ],
  }, { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false }, x: { ticks: { maxTicksLimit: 6, color: p.faint } } } });
  return c;
}

function registerDevice(sites, units, done) {
  const m = modal({
    title: 'Register IoT device',
    body: html`<form class="form" id="dev"><div class="field"><label>Device ID</label><input name="device_uid" placeholder="e.g. ENV-K1-4" required><span class="hint">Printed on the ESP32 node / used in its firmware config</span></div>
      <div class="form-row"><div class="field"><label>Type</label><select name="device_type">${raw(['env_sensor', 'gas_sensor', 'thermal_probe', 'machine_meter', 'gps_tracker'].map((t) => `<option value="${t}">${fmt.title(t)}</option>`).join(''))}</select></div>
      <div class="field"><label>Site</label><select name="site_id">${raw(options(sites, sites[0]?.id))}</select></div></div>
      <div class="field"><label>Storage unit</label><select name="storage_unit_id">${raw(options(units, '', { blank: '—', labelKey: (u) => `${u.site_name} · ${u.name}` }))}</select></div></form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">Register</button>',
  });
  m.el.querySelector('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
    const d = formData(m.el.querySelector('#dev'));
    for (const k of ['site_id', 'storage_unit_id']) if (d[k]) d[k] = Number(d[k]);
    const dev = await api.post('/iot/devices', d);
    m.close();
    modal({ title: 'Device registered', body: html`<p>Configure the device with these credentials. <b>The key is shown only once.</b></p><div class="callout mono">POST ${location.origin}/api/iot/ingest<br>x-device-id: ${dev.device_uid}<br>x-device-key: ${dev.apiKey}</div><p class="muted">Body: <span class="mono">{"metrics":{"temp_c":3.4,"humidity":82}}</span></p>` });
    done();
  }).catch(errorToast);
}

export async function render(root) {
  const [units, devices, latest, sites] = await Promise.all([store.storageUnits(), api.get('/iot/devices'), api.get('/iot/latest'), donorSites()]);
  const byUnit = {};
  for (const r of latest.filter((x) => x.storage_unit_id)) (byUnit[r.storage_unit_id] ||= {})[r.metric] = r;
  const breaches = units.filter((u) => !inRange(u, byUnit[u.id]?.temp_c?.value)).length;
  root.innerHTML = html`<div class="page-head"><div><h1>IoT cold chain</h1><p>Temperature, humidity and spoilage-gas (NH₃/CO₂) telemetry from storage units, streamed live.</p></div><button class="btn" id="reg">Register device</button></div>
    ${breaches ? raw(html`<div class="alert-strip"><b>${breaches} unit(s) out of range</b><marquee scrollamount="4">${raw(units.filter((u) => !inRange(u, byUnit[u.id]?.temp_c?.value)).map((u) => html`<span>● ${u.site_name} · ${u.name}: ${fmt.n(byUnit[u.id].temp_c.value, 1)} °C</span>`).join(''))}</marquee></div>`) : ''}
    <div class="grid g3" id="units">${raw(units.map((u) => unitCard(u, byUnit[u.id] || {})).join(''))}</div>
    <div class="card" style="margin-top:16px"><div class="card-head"><div><h3>Devices</h3><p>${devices.length} registered</p></div></div>
      ${raw(table([{ label: 'Device', render: (d) => h`<span class="mono">${d.device_uid}</span>` }, { label: 'Type', render: (d) => fmt.title(d.device_type) }, { label: 'Site', key: 'site_name' }, { label: 'Attached to', render: (d) => d.storage_name || d.machine_name || '—' },
        { label: 'Last seen', render: (d) => (d.last_seen_at ? h`${badge(Date.now() - new Date(d.last_seen_at) < 600000 ? 'safe' : 'warning', Date.now() - new Date(d.last_seen_at) < 600000 ? 'online' : 'silent')} <small class="muted">${fmt.ago(d.last_seen_at)}</small>` : badge('', 'never')) }], devices))}</div>`;
  const envDevice = (unitId) => devices.find((d) => d.storage_unit_id === unitId && ['env_sensor', 'thermal_probe'].includes(d.device_type));
  const charts = new Map();
  await Promise.all(units.map(async (u) => charts.set(u.id, await drawUnitChart(root.querySelector(`[data-chart="${u.id}"]`), u, envDevice(u.id)))));
  on('telemetry', (t) => {
    const card = root.querySelector(`[data-unit="${t.storageUnitId}"]`);
    if (!card) return;
    for (const r of t.readings) {
      const el = card.querySelector(`[data-m="${r.metric}"]`);
      if (el) el.firstChild.textContent = fmt.n(r.value, r.metric === 'temp_c' || r.metric === 'nh3_ppm' ? 1 : 0);
      if (r.metric === 'temp_c') {
        const unit = units.find((u) => u.id === t.storageUnitId);
        el.style.color = inRange(unit, r.value) ? 'inherit' : 'var(--danger)';
        const c = charts.get(t.storageUnitId);
        if (c) { c.data.labels.push(fmt.time(r.recordedAt)); c.data.datasets.forEach((ds, i) => ds.data.push(i === 0 ? r.value : ds.data[ds.data.length - 1])); c.update('none'); }
      }
    }
    card.querySelector('[data-seen]').textContent = 'updated just now';
  });
  $('#reg', root).onclick = () => registerDevice(sites, units, () => window.dispatchEvent(new Event('fs:navigate')));
}
