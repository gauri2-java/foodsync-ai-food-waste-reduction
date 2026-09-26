import { api } from '../api.js';
import { html, raw, h, $, fmt, table, badge, errorToast, withBusy, toast, modal, kpi, formData, options } from '../ui.js';
import { createMap, addSites, fit, siteIcon } from '../map.js';
import { on } from '../live.js';
import { store } from '../store.js';

const ROUTE_COLORS = ['#1f7a4d', '#2f6fb3', '#b7791f', '#7c3aed', '#dc2626', '#0d9488'];

function drawTrips(map, trips, layer) {
  layer.clearLayers();
  trips.forEach((t, i) => {
    if (!t.geometry?.length) return;
    const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
    window.L.polyline(t.geometry, { color, weight: 4, opacity: 0.8, dashArray: t.status === 'planned' ? '8 6' : null }).bindPopup(`<b>${t.registration}</b> · ${t.status}<br>${fmt.n(t.planned_km, 1)} km · ${fmt.n(t.planned_minutes)} min`).addTo(layer);
    t.geometry.slice(1).forEach((pt, k) => window.L.circleMarker(pt, { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(String(k + 1), { permanent: true, direction: 'center', className: 'stop-label' }).addTo(layer));
  });
}

function tripsTable(trips) {
  return table([
    { label: 'Trip', render: (t) => h`<b>#${t.id}</b> ${t.registration}<br><small class="muted">${t.driver_name || 'unassigned'}</small>` },
    { label: 'Status', render: (t) => badge(t.status) },
    { label: 'Distance', r: true, render: (t) => `${fmt.n(t.planned_km, 1)} km` },
    { label: 'Duration', r: true, render: (t) => `${fmt.n(t.planned_minutes)} min` },
    { label: 'Created', render: (t) => fmt.dt(t.created_at) },
  ], trips, { onRow: true, empty: 'No trips yet — optimise routes once surplus is claimed.' });
}

async function tripDetail(id) {
  const t = await api.get(`/logistics/trips/${id}`);
  modal({
    wide: true,
    title: `Trip #${t.id} · ${t.registration}`,
    body: html`<div class="row" style="margin-bottom:12px">${badge(t.status)}<span class="muted">${fmt.n(t.planned_km, 1)} km planned · ${t.refrigerated ? 'refrigerated' : 'ambient'} · capacity ${fmt.kg(t.capacity_kg)}</span></div>
      ${raw(table([{ label: '#', key: 'seq' }, { label: 'Stop', render: (s) => h`${badge(s.stop_type === 'pickup' ? 'planned' : 'delivered', s.stop_type)} ${s.site_name}` }, { label: 'Food', render: (s) => h`${s.title}<br><small class="muted">${fmt.kg(s.quantity_kg)}</small>` },
        { label: 'ETA', render: (s) => fmt.time(s.eta) }, { label: 'Deadline', render: (s) => fmt.time(s.deadline) }, { label: 'Temp', r: true, render: (s) => (s.food_temp_c != null ? `${fmt.n(s.food_temp_c, 1)} °C` : '—') }, { label: 'Status', render: (s) => badge(s.status) }], t.stops))}
      ${t.optimizer ? h`<p class="muted" style="margin-top:10px;font-size:12px">Solver: ${t.optimizer.algorithm}${t.optimizer.solveMs ? ` · ${fmt.n(t.optimizer.solveMs, 1)} ms` : ''}</p>` : ''}`,
  });
}

async function optimise(btn, reload) {
  await withBusy(btn, async () => {
    const r = await api.post('/logistics/optimize');
    const saved = r.stats.baselineKm - r.stats.optimizedKm;
    modal({
      title: 'Routes optimised',
      body: html`<div class="grid g3">${kpi('Trips created', r.trips.length)}${kpi('Route distance', fmt.n(r.stats.optimizedKm, 1), `vs ${fmt.n(r.stats.baselineKm, 1)} km one-trip-per-pickup`, 'km')}${kpi('Distance saved', fmt.n(Math.max(0, saved), 1), `${fmt.n(r.stats.solveMs, 1)} ms solve`, 'km')}</div>
        ${r.unassigned.length ? h`<div class="callout red" style="margin-top:12px">${r.unassigned.length} delivery(ies) cannot reach the recipient within the safe window — alert raised.</div>` : ''}
        <p class="muted" style="margin-top:12px">Pickup-and-delivery routing with vehicle capacity and hard deadlines at the end of each food's safe window (regret-2 insertion + relocate local search).</p>`,
    });
    reload();
  }).catch(errorToast);
}

function addVehicle(sites, done) {
  const m = modal({
    title: 'Add vehicle',
    body: html`<form class="form" id="vf"><div class="form-row"><div class="field"><label>Registration</label><input name="registration" required></div><div class="field"><label>Capacity (kg)</label><input name="capacity_kg" type="number" required></div></div>
      <div class="field"><label>Depot</label><select name="depot_site_id">${raw(options(sites, '', { blank: '—' }))}</select></div><label class="row"><input type="checkbox" name="refrigerated" style="width:auto"> Refrigerated</label></form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">Add</button>',
  });
  m.el.querySelector('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
    const d = formData(m.el.querySelector('#vf'));
    if (d.depot_site_id) d.depot_site_id = Number(d.depot_site_id);
    await api.post('/logistics/vehicles', d);
    m.close();
    toast('Vehicle added', 'ok');
    done();
  }).catch(errorToast);
}

export async function render(root, { user }) {
  const canDispatch = ['admin', 'kitchen_manager', 'plant_manager'].includes(user.role);
  const [sites, trips, vehicles, waiting] = await Promise.all([store.allSites(), api.get('/logistics/trips?limit=60'), api.get('/logistics/vehicles'), canDispatch ? api.get('/surplus?status=matched') : []]);
  const activeTrips = trips.filter((t) => ['planned', 'in_progress'].includes(t.status));
  root.innerHTML = html`<div class="page-head"><div><h1>Fleet & routes</h1><p>Perishability-aware routing: every drop-off must arrive before the food's safe window closes.</p></div>
    ${canDispatch ? raw(html`<div class="row"><button class="btn" id="add-veh">Add vehicle</button><button class="btn primary" id="opt" ${waiting.length ? '' : 'disabled'}>Optimise ${waiting.length} pickup(s)</button></div>`) : ''}</div>
    <div class="stack"><div class="grid g4">${kpi('Claimed, awaiting pickup', waiting.length, fmt.kg(waiting.reduce((s, l) => s + l.quantity_kg, 0)))}${kpi('Active trips', activeTrips.length)}${kpi('Vehicles available', vehicles.filter((v) => v.status === 'available').length, `of ${vehicles.length}`)}${kpi('Completed trips shown', trips.filter((t) => t.status === 'completed').length)}</div>
    <div class="grid g-2-1"><div class="card"><div class="card-head"><div><h3>Live map</h3><p>Dashed = planned, solid = in progress. Numbers are stop order.</p></div></div><div class="map" id="map"></div></div>
      <div class="card"><div class="card-head"><h3>Fleet</h3></div>${raw(table([{ label: 'Vehicle', render: (v) => h`<b>${v.registration}</b><br><small class="muted">${v.driver_name || '—'}</small>` }, { label: 'Capacity', r: true, render: (v) => fmt.kg(v.capacity_kg) }, { label: 'Status', render: (v) => h`${badge(v.status)}${v.refrigerated ? h` ${badge('info', '❄')}` : ''}` }, { label: 'Last ping', render: (v) => (v.last_ping_at ? fmt.ago(v.last_ping_at) : '—') }], vehicles))}</div></div>
    <div class="card"><div class="card-head"><h3>Trips</h3></div><div id="trips"></div></div></div>`;
  const map = createMap($('#map', root));
  addSites(map, sites);
  const routeLayer = window.L.layerGroup().addTo(map);
  drawTrips(map, activeTrips.length ? activeTrips : trips.slice(0, 3), routeLayer);
  fit(map, sites.map((s) => [s.lat, s.lng]));
  const vMarkers = new Map(vehicles.filter((v) => v.last_lat || v.depot_lat).map((v) => [v.id, window.L.marker([v.last_lat ?? v.depot_lat, v.last_lng ?? v.depot_lng], { icon: siteIcon('vehicle') }).bindPopup(v.registration).addTo(map)]));
  on('vehicle', (v) => vMarkers.get(v.id)?.setLatLng([v.lat, v.lng]));
  const reload = () => window.dispatchEvent(new Event('fs:navigate'));
  on('trips', () => setTimeout(reload, 300));
  const tEl = $('#trips', root);
  tEl.innerHTML = tripsTable(trips);
  tEl.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = () => tripDetail(trips[Number(tr.dataset.i)].id).catch(errorToast)));
  $('#opt', root)?.addEventListener('click', (e) => optimise(e.currentTarget, reload));
  $('#add-veh', root)?.addEventListener('click', () => addVehicle(sites.filter((s) => ['depot', 'kitchen', 'plant'].includes(s.site_type)), reload));
}
