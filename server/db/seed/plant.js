// Food processing plant: products, lines, machines, 6 months of production runs, downtime and
// 72 h of machine telemetry — including one developing fault for the anomaly detector to find.
const { insertMany } = require('./bulk');
const { createDevice } = require('./facilities');
const { isoDate, addDays } = require('../../lib/time');

const PRODUCTS = [
  { key: 'chips', name: 'Salted potato chips', cat: 'processed_snack', raw: 'Chipping potato', yield: 27, kwh: 1.6, price: 220, line: 'Chips line', rated: 250, baseDemand: 1500, seasonal: null,
    machines: [['Peeler', 'peeler', 15], ['Slicer', 'slicer', 5.5], ['Continuous fryer', 'fryer', 45]] },
  { key: 'pulp', name: 'Mango pulp (aseptic)', cat: 'fruit_pulp', raw: 'Mango (Totapuri)', yield: 58, kwh: 0.35, price: 95, line: 'Pulp line', rated: 600, baseDemand: 3600, seasonal: [3, 6],
    machines: [['Destoner', 'destoner', 7.5], ['Pulper-finisher', 'pulper', 11], ['Pasteuriser', 'pasteuriser', 30]] },
  { key: 'rusk', name: 'Milk rusk', cat: 'bakery', raw: 'Refined flour (maida)', yield: 96, kwh: 0.9, price: 110, line: 'Bakery line', rated: 180, baseDemand: 1050, seasonal: null,
    machines: [['Spiral mixer', 'mixer', 11], ['Tunnel oven', 'oven', 40], ['Flow-wrap packer', 'packer', 4]] },
];

const DOWNTIME_REASONS = ['breakdown', 'changeover', 'no_material', 'cleaning', 'power_failure', 'quality_hold'];

function runFor(p, date, lastDemand, rng) {
  const dow = date.getDay();
  const demand = p.baseDemand * (dow === 6 ? 1.15 : dow === 1 ? 0.9 : 1) * rng.normal(1, 0.09);
  const plannedOut = (lastDemand ?? p.baseDemand) * 1.12; // planner over-produces "to be safe"
  const downtime = rng.chance(0.22) ? rng.int(15, 110) : rng.int(0, 12);
  const runMin = 480 - downtime;
  const output = Math.min(plannedOut, p.rated * (runMin / 60) * rng.normal(0.9, 0.05)) * rng.normal(1, 0.02);
  const yieldPct = p.yield * rng.normal(1, 0.035) * (rng.chance(0.08) ? 0.9 : 1);
  const input = output / (yieldPct / 100);
  const scrap = Math.min(input - output, input * rng.between(0.035, 0.1));
  const energy = output * p.kwh * rng.normal(1, 0.06) * (rng.chance(0.06) ? 1.25 : 1);
  const dispatched = Math.min(output, demand);
  return { demand, row: [plannedOut, input, output, scrap, dispatched, 480, runMin, energy].map((v) => +v.toFixed(1)), downtime };
}

async function seedRuns(client, p, lineId, productId, machineIds, days, rng) {
  const runs = [];
  const downtime = [];
  let lastDemand = null;
  for (let k = days; k >= 1; k--) {
    const date = addDays(new Date(), -k);
    const month = date.getMonth();
    if (date.getDay() === 0 || (p.seasonal && (month < p.seasonal[0] || month > p.seasonal[1]))) continue;
    const r = runFor(p, date, lastDemand, rng);
    lastDemand = r.demand;
    runs.push([lineId, productId, isoDate(date), ...r.row]);
    if (r.downtime > 14) {
      const start = new Date(date);
      start.setHours(rng.int(7, 16), rng.int(0, 59));
      downtime.push([rng.pick(machineIds), start, new Date(start.getTime() + r.downtime * 60000), rng.pick(DOWNTIME_REASONS)]);
    }
  }
  const inserted = await insertMany(client, 'production_runs', ['line_id', 'product_id', 'run_date', 'planned_output_kg', 'input_kg', 'output_kg', 'scrap_kg', 'dispatched_kg', 'planned_minutes', 'run_minutes', 'energy_kwh'], runs, { returning: 'id, run_date, output_kg, dispatched_kg' });
  await insertMany(client, 'downtime_events', ['machine_id', 'started_at', 'ended_at', 'reason'], downtime);
  return inserted;
}

// Operating 06:00–22:00, idle otherwise. `fault` ramps power/temperature up and throughput down over the last 2 h.
function telemetry(deviceId, machine, p, rng, fault) {
  const rows = [];
  const now = Date.now();
  for (let t = now - 72 * 3600000; t <= now; t += 2 * 60000) {
    const hour = new Date(t).getHours();
    const running = hour >= 6 && hour < 22;
    const faultLevel = fault ? Math.max(0, 1 - (now - t) / (2 * 3600000)) : 0;
    const load = running ? rng.normal(0.82, 0.04) : rng.normal(0.05, 0.01);
    const tput = running ? p.rated * rng.normal(0.9, 0.04) * (1 - 0.18 * faultLevel) : 0;
    rows.push(
      [deviceId, new Date(t), 'power_kw', +(machine[2] * load * (1 + 0.38 * faultLevel)).toFixed(2)],
      [deviceId, new Date(t), 'throughput_kgph', +tput.toFixed(1)],
      [deviceId, new Date(t), 'temp_c', +((running ? 55 : 30) + rng.normal(0, 1.5) + 14 * faultLevel).toFixed(1)],
      [deviceId, new Date(t), 'vibration_mm_s', +((running ? 2.2 : 0.3) + rng.normal(0, 0.25) + 2.5 * faultLevel).toFixed(2)],
    );
  }
  return rows;
}

async function seedPlant(client, ids, rng, devices, days) {
  const ing = new Map((await client.query('SELECT id, name FROM ingredients')).rows.map((r) => [r.name, r.id]));
  const runsByProduct = {};
  for (const p of PRODUCTS) {
    const prod = await client.query('INSERT INTO products (org_id, name, category_code, raw_material_id, std_yield_pct, std_energy_kwh_per_kg, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [ids.orgs.agro, p.name, p.cat, ing.get(p.raw), p.yield, p.kwh, p.price]);
    const line = await client.query('INSERT INTO production_lines (site_id, name, rated_kgph) VALUES ($1,$2,$3) RETURNING id', [ids.sites.plant, p.line, p.rated]);
    const machineIds = [];
    for (const [i, m] of p.machines.entries()) {
      const mr = await client.query('INSERT INTO machines (line_id, name, machine_type, rated_kw) VALUES ($1,$2,$3,$4) RETURNING id', [line.rows[0].id, m[0], m[1], m[2]]);
      machineIds.push(mr.rows[0].id);
      const dev = await createDevice(client, `MTR-${p.key}-${i + 1}`.toUpperCase(), ids.sites.plant, 'machine_meter', { machineId: mr.rows[0].id });
      devices.push({ ...dev, profile: { type: 'machine', ratedKw: m[2], ratedKgph: p.rated, fault: m[1] === 'fryer' } });
      await insertMany(client, 'sensor_readings', ['device_id', 'recorded_at', 'metric', 'value'], telemetry(dev.id, m, p, rng, m[1] === 'fryer'), { chunk: 1000 });
    }
    runsByProduct[p.key] = { productId: prod.rows[0].id, category: p.cat, name: p.name, runs: await seedRuns(client, p, line.rows[0].id, prod.rows[0].id, machineIds, days, rng) };
  }
  return runsByProduct;
}

module.exports = { seedPlant };
