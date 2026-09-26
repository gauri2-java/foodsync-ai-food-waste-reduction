// IoT + fleet simulator. Stands in for the ESP32 sensor nodes, machine energy meters and vehicle GPS
// until real hardware is connected — it talks to FoodSync only through the public device/driver APIs.
//   npm run simulate                 sensors + machines + vehicles on active trips
//   npm run simulate -- --breach     also force a cold-room temperature excursion
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const fs = require('fs');
const path = require('path');

const API = process.env.SIM_API_URL || `http://localhost:${process.env.PORT || 5000}`;
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_SEC || 30) * 1000;
const PASSWORD = process.env.SEED_PASSWORD || 'FoodSync@123';
const DEVICES_FILE = path.join(__dirname, 'devices.local.json');
const FORCE_BREACH = process.argv.includes('--breach');
const DRIVERS = ['driver1@foodsync.local', 'driver2@foodsync.local', 'driver3@foodsync.local'];

const log = (...a) => process.stdout.write(`[${new Date().toLocaleTimeString()}] ${a.join(' ')}\n`);
const noise = (sd) => (Math.random() + Math.random() + Math.random() - 1.5) * sd * 1.4;

async function post(url, body, headers = {}) {
  const res = await fetch(`${API}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return res.json();
}
async function get(url, token) {
  const res = await fetch(`${API}${url}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// ── Sensors ─────────────────────────────────────────────
function envReading(d, tick) {
  const p = d.profile;
  const hour = new Date().getHours();
  const diurnal = p.type === 'dry_store' || p.type === 'ambient' ? 2 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) : 0;
  const doorOpen = p.type === 'cold_room' && Math.random() < 0.04 ? 1.5 + Math.random() * 2 : 0;
  const breach = FORCE_BREACH && p.type === 'cold_room' && d.uid.endsWith('K1-1') ? Math.min(6, tick * 0.8) : 0;
  const metrics = { temp_c: +(p.base + diurnal + doorOpen + breach + noise(p.sd)).toFixed(2) };
  if (p.hum) metrics.humidity = +Math.min(99, p.hum - 8 + noise(2.5)).toFixed(1);
  return metrics;
}

function gasReading(d) {
  const drift = (Date.now() / 3600000) % 24 > 20 ? 6 : 0; // stock ageing overnight
  return { nh3_ppm: +Math.max(0, 7 + drift + noise(2)).toFixed(2), co2_ppm: Math.round(720 + drift * 40 + noise(70)) };
}

function machineReading(d) {
  const p = d.profile;
  const hour = new Date().getHours();
  const running = hour >= 6 && hour < 22;
  const fault = p.fault && Math.random() < 0.5 ? 1 : 0;
  const load = running ? 0.82 + noise(0.04) : 0.05 + noise(0.01);
  return {
    power_kw: +(p.ratedKw * load * (1 + 0.35 * fault)).toFixed(2),
    throughput_kgph: +(running ? p.ratedKgph * (0.9 + noise(0.04)) * (1 - 0.15 * fault) : 0).toFixed(1),
    temp_c: +((running ? 55 : 30) + noise(1.5) + 12 * fault).toFixed(1),
    vibration_mm_s: +((running ? 2.2 : 0.3) + noise(0.25) + 2.4 * fault).toFixed(2),
  };
}

async function sendSensors(devices, tick) {
  let ok = 0;
  for (const d of devices) {
    const metrics = d.profile.type === 'gas' ? gasReading(d) : d.profile.type === 'machine' ? machineReading(d) : envReading(d, tick);
    try {
      await post('/api/iot/ingest', { metrics }, { 'x-device-id': d.uid, 'x-device-key': d.apiKey });
      ok++;
    } catch (e) {
      log('!', d.uid, e.message);
    }
  }
  return ok;
}

// ── Vehicles: drive active trips along their planned geometry ─────────
const progress = new Map();
async function login(email) {
  return (await post('/api/auth/login', { email, password: PASSWORD })).token;
}

function interpolate(points, t) {
  if (points.length < 2) return points[0];
  const seg = Math.min(points.length - 2, Math.floor(t * (points.length - 1)));
  const f = t * (points.length - 1) - seg;
  const [a, b] = [points[seg], points[seg + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

async function moveVehicles(tokens) {
  for (const [email, token] of tokens) {
    const trips = await get('/api/logistics/trips?status=in_progress', token).catch(() => []);
    for (const trip of trips) {
      const t = Math.min(1, (progress.get(trip.id) || 0) + INTERVAL_MS / (trip.planned_minutes * 60000));
      progress.set(trip.id, t);
      const [lat, lng] = interpolate(trip.geometry, t);
      await post(`/api/logistics/vehicles/${trip.vehicle_id}/location`, { lat, lng }, { authorization: `Bearer ${token}` }).catch((e) => log('!', email, e.message));
      log('🚚', trip.registration, `trip #${trip.id}`, `${Math.round(t * 100)}%`);
    }
  }
}

async function main() {
  if (!fs.existsSync(DEVICES_FILE)) throw new Error('simulator/devices.local.json not found — run `npm run db:seed` first');
  const devices = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
  const tokens = new Map();
  for (const email of DRIVERS) tokens.set(email, await login(email).catch(() => null));
  for (const [e, t] of tokens) if (!t) tokens.delete(e);
  log(`Simulating ${devices.length} devices and ${tokens.size} drivers against ${API} every ${INTERVAL_MS / 1000}s${FORCE_BREACH ? ' (forcing cold-room breach)' : ''}`);
  let tick = 0;
  const loop = async () => {
    tick++;
    const ok = await sendSensors(devices, tick);
    log(`📡 ${ok}/${devices.length} devices reported`);
    await moveVehicles(tokens);
  };
  await loop();
  setInterval(() => loop().catch((e) => log('!', e.message)), INTERVAL_MS);
}

main().catch((e) => {
  log('Simulator failed:', e.message);
  process.exit(1);
});
