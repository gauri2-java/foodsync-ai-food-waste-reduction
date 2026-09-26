// Driver app (mobile-first): run the trip, share GPS, record pickup temperatures, show hand-off QR codes.
import { api } from '../api.js';
import { html, raw, h, $, fmt, badge, errorToast, withBusy, toast, modal } from '../ui.js';
import { createMap, siteIcon, fit } from '../map.js';
import { icon } from '../icons.js';

let watchId = null;
let lastSent = 0;
function stopSharing() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}
window.addEventListener('hashchange', stopSharing);

function shareLocation(vehicleId, statusEl, marker) {
  if (!navigator.geolocation) { statusEl.textContent = 'Location not available on this device'; return; }
  watchId = navigator.geolocation.watchPosition((pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    marker?.setLatLng([lat, lng]);
    if (Date.now() - lastSent < 15000) return;
    lastSent = Date.now();
    api.post(`/logistics/vehicles/${vehicleId}/location`, { lat, lng }).then(() => { statusEl.textContent = `Location shared ${fmt.time(new Date())}`; }).catch(() => { statusEl.textContent = 'Location upload failed'; });
  }, (err) => { statusEl.textContent = err.message; }, { enableHighAccuracy: true, maximumAge: 10000 });
}

async function showQr(stop) {
  const q = await api.get(`/logistics/stops/${stop.id}/qr`);
  modal({ title: `Hand-off · ${stop.site_name}`, body: html`<div class="qr-box"><img src="${q.qrDataUrl}" alt="Hand-off QR code"><div class="muted">Ask the recipient to scan this code.</div><div>Stop <b>#${stop.id}</b> · code <span class="mono">${q.token}</span></div></div>` });
}

// Compost/biogas facilities have no app user, so the driver confirms the drop directly.
async function compostDrop(stop, reload) {
  const q = await api.get(`/logistics/stops/${stop.id}/qr`);
  const m = modal({
    title: `Drop at ${stop.site_name}`,
    body: html`<div class="field"><label>Food temperature at drop-off °C</label><input type="number" step="0.1" id="ct"></div>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="ok">Confirm drop-off</button>',
  });
  m.el.querySelector('#ok').onclick = (e) => withBusy(e.currentTarget, async () => {
    await api.post(`/logistics/stops/${stop.id}/handoff`, { token: q.token, food_temp_c: Number(m.el.querySelector('#ct').value || 0) });
    m.close();
    toast('Drop-off recorded', 'ok');
    reload();
  }).catch(errorToast);
}

function stopRow(s, tripStatus) {
  const action = s.status !== 'pending' ? badge(s.status)
    : tripStatus !== 'in_progress' ? h`<span class="muted">start trip first</span>`
    : s.stop_type === 'pickup' ? h`<div class="row" style="gap:6px"><input type="number" step="0.1" placeholder="°C" data-temp="${s.id}" style="width:80px"><button class="btn sm primary" data-pickup="${s.id}">Picked up</button></div>`
    : h`<button class="btn sm primary" data-qr="${s.id}">${raw(icon('qr'))} Show QR</button>`;
  return html`<div class="list-item"><span class="badge ${s.stop_type === 'pickup' ? 'blue' : 'green'}">${s.seq}</span>
    <div style="flex:1;min-width:0"><b>${s.stop_type === 'pickup' ? 'Pick up' : 'Deliver'} · ${s.site_name}</b><br><small class="muted">${s.title} · ${fmt.kg(s.quantity_kg)} · ETA ${fmt.time(s.eta)} · deadline ${fmt.time(s.deadline)}</small>
    ${s.address ? h`<br><a class="faint" style="font-size:12px" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}">${raw(icon('pin'))} Navigate</a>` : ''}</div>${action}</div>`;
}

async function renderTrip(el, trip, reload) {
  const t = await api.get(`/logistics/trips/${trip.id}`);
  el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>Trip #${t.id} · ${t.registration}</h3><p>${fmt.n(t.planned_km, 1)} km · ${fmt.n(t.planned_minutes)} min planned</p></div>
      ${t.status === 'planned' ? h`<button class="btn primary" id="start">Start trip</button>` : badge(t.status)}</div>
    <div class="map short" id="dmap"></div>
    <div class="row" style="margin:10px 0"><button class="btn sm" id="share">${raw(icon('pin'))} Share my location</button><small class="muted" id="gps"></small></div>
    <div class="list">${raw(t.stops.map((s) => stopRow(s, t.status)).join(''))}</div></div>`;
  const map = createMap($('#dmap', el));
  window.L.polyline(t.geometry, { color: '#1f7a4d', weight: 4 }).addTo(map);
  t.stops.forEach((s) => window.L.marker([s.lat, s.lng], { icon: siteIcon(s.stop_type === 'pickup' ? 'kitchen' : 'ngo_center', String(s.seq)) }).bindPopup(s.site_name).addTo(map));
  const me = window.L.marker(t.geometry[0], { icon: siteIcon('vehicle') }).addTo(map);
  fit(map, t.geometry);
  $('#start', el)?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => { await api.post(`/logistics/trips/${t.id}/start`); reload(); }).catch(errorToast));
  $('#share', el).onclick = () => { stopSharing(); shareLocation(t.vehicle_id, $('#gps', el), me); };
  el.querySelectorAll('[data-pickup]').forEach((b) => (b.onclick = () => {
    const temp = el.querySelector(`[data-temp="${b.dataset.pickup}"]`).value;
    if (temp === '') return toast('Enter the food temperature from the probe', 'error');
    withBusy(b, async () => { await api.post(`/logistics/stops/${b.dataset.pickup}/pickup`, { food_temp_c: Number(temp) }); toast('Pickup confirmed', 'ok'); reload(); }).catch(errorToast);
  }));
  el.querySelectorAll('[data-qr]').forEach((b) => (b.onclick = () => {
    const stop = t.stops.find((s) => s.id === Number(b.dataset.qr));
    (stop.site_org_type === 'compost' ? compostDrop(stop, reload) : showQr(stop)).catch(errorToast);
  }));
}

export async function render(root) {
  stopSharing();
  const trips = await api.get('/logistics/trips?status=planned,in_progress');
  const done = await api.get('/logistics/trips?status=completed&limit=10');
  root.innerHTML = html`<div class="page-head"><div><h1>My trips</h1><p>Pick up surplus food, keep it at safe temperature, and hand over with a QR code.</p></div></div>
    <div class="stack" id="active">${trips.length ? '' : raw('<div class="card empty">No trips assigned. New routes appear here when the dispatcher optimises pickups.</div>')}</div>
    <h3 style="margin:18px 0 8px">Recently completed</h3>
    <div class="card">${raw(done.length ? html`<div class="list">${raw(done.map((t) => html`<div class="list-item"><div style="flex:1">Trip #${t.id} · ${t.registration}<br><small class="muted">${fmt.n(t.planned_km, 1)} km · ${fmt.dt(t.completed_at)}</small></div>${badge('completed')}</div>`).join(''))}</div>` : '<div class="empty">None yet</div>')}</div>`;
  const reload = () => window.dispatchEvent(new Event('fs:navigate'));
  const holder = $('#active', root);
  for (const trip of trips) {
    const el = document.createElement('div');
    holder.append(el);
    await renderTrip(el, trip, reload);
  }
}
