// Recipient hand-off: scan the driver's QR (or type the code), record temperature and meals received.
import { api } from '../api.js';
import { html, raw, h, $, fmt, badge, errorToast, withBusy, toast, formData } from '../ui.js';
import { icon } from '../icons.js';

let stream = null;
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

window.addEventListener('hashchange', stopCamera);

async function scan(video, onCode) {
  if (!('BarcodeDetector' in window)) throw new Error('This browser cannot scan QR codes — type the stop number and code instead.');
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  video.hidden = false;
  await video.play();
  const tick = async () => {
    if (!stream) return;
    const codes = await detector.detect(video).catch(() => []);
    if (codes.length) { stopCamera(); video.hidden = true; onCode(codes[0].rawValue); return; }
    requestAnimationFrame(tick);
  };
  tick();
}

async function incomingStops() {
  const trips = await api.get('/logistics/trips?status=planned,in_progress');
  const details = await Promise.all(trips.map((t) => api.get(`/logistics/trips/${t.id}`)));
  return details.flatMap((t) => t.stops.filter((s) => s.stop_type === 'dropoff' && s.status === 'pending').map((s) => ({ ...s, trip: t })));
}

export async function render(root) {
  stopCamera();
  const stops = await incomingStops();
  root.innerHTML = html`<div class="page-head"><div><h1>Receive a delivery</h1><p>Scan the QR code on the driver's phone. The hand-off is only accepted if the code matches and the food passes the thermal safety check.</p></div></div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>Confirm hand-off</h3><button class="btn" id="scan">${raw(icon('camera'))} Scan QR</button></div>
        <video class="scanner" id="video" playsinline muted hidden></video>
        <form class="form" id="hf">
          <div class="form-row"><div class="field"><label>Stop number</label><input name="stop" type="number" required></div><div class="field"><label>Hand-off code</label><input name="token" required autocomplete="off"></div></div>
          <div class="form-row"><div class="field"><label>Food temperature at receipt °C</label><input name="food_temp_c" type="number" step="0.1" required><span class="hint">Cooked food should be ≥ 60 °C or ≤ 5 °C</span></div>
            <div class="field"><label>Meals received</label><input name="received_portions" type="number" min="0"></div></div>
          <div class="field"><label>Notes</label><input name="notes"></div>
          <button class="btn primary">Confirm receipt</button></form>
        <div id="out" style="margin-top:12px"></div></div>
      <div class="card"><div class="card-head"><h3>Expected deliveries</h3></div>
        ${stops.length ? raw(html`<div class="list">${raw(stops.map((s) => html`<div class="list-item"><div style="flex:1"><b>${s.title}</b><br><small class="muted">Stop #${s.id} · ${fmt.kg(s.quantity_kg)} · ${s.trip.registration} (${s.trip.driver_name || 'driver'}) · ETA ${fmt.time(s.eta)}</small></div>${badge(s.trip.status)}</div>`).join(''))}</div>`) : raw('<div class="empty">No deliveries on the way</div>')}</div>
    </div>`;
  const form = $('#hf', root);
  $('#scan', root).onclick = () => scan($('#video', root), (text) => {
    try { const d = JSON.parse(text); form.stop.value = d.stop; form.token.value = d.token; form.food_temp_c.focus(); toast('QR code read', 'ok'); } catch { toast('Not a FoodSync code', 'error'); }
  }).catch(errorToast);
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = formData(form);
    withBusy(form.querySelector('button'), async () => {
      const r = await api.post(`/logistics/stops/${d.stop}/handoff`, { token: d.token, food_temp_c: d.food_temp_c, received_portions: d.received_portions, notes: d.notes });
      $('#out', root).innerHTML = r.accepted
        ? html`<div class="callout green"><b>Hand-off verified.</b> Logged at ${fmt.time(r.completed_at)} in the tamper-evident register.</div>`
        : html`<div class="callout red"><b>Rejected:</b> ${r.reason}. The food has been routed to compost.</div>`;
      form.reset();
    }).catch(errorToast);
  };
}
