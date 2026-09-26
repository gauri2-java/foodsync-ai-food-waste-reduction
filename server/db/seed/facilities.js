// Storage units, IoT devices (with API keys for the simulator), recent sensor history and stock lots.
const crypto = require('crypto');
const { insertMany } = require('./bulk');

const KITCHEN_UNITS = [
  { name: 'Walk-in cold room', type: 'cold_room', min: 0, max: 5, hum: 90, base: 3.2, sd: 0.4, gas: true },
  { name: 'Dry store', type: 'dry_store', min: 10, max: 32, hum: 65, base: 27, sd: 1.2 },
  { name: 'Hot holding cabinet', type: 'hot_holding', min: 60, max: 90, hum: null, base: 68, sd: 1.5 },
];
const PLANT_UNITS = [
  { name: 'Raw material cold store', type: 'cold_room', min: 2, max: 8, hum: 95, base: 5, sd: 0.5, gas: true },
  { name: 'Pulp chiller', type: 'cold_room', min: 0, max: 4, hum: null, base: 2.4, sd: 0.3 },
  { name: 'Finished goods store', type: 'ambient', min: 10, max: 30, hum: 60, base: 26, sd: 1.0 },
];

const hashKey = (k) => crypto.createHash('sha256').update(k).digest('hex');

async function createDevice(client, uid, siteId, type, { storageUnitId = null, machineId = null } = {}) {
  const apiKey = crypto.randomBytes(24).toString('base64url');
  const r = await client.query('INSERT INTO devices (device_uid, site_id, storage_unit_id, machine_id, device_type, api_key_hash, last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING id', [uid, siteId, storageUnitId, machineId, type, hashKey(apiKey)]);
  return { id: r.rows[0].id, uid, apiKey, type, siteId, storageUnitId, machineId };
}

function envHistory(deviceId, unit, rng, hours = 24, stepMin = 5) {
  const rows = [];
  const now = Date.now();
  for (let t = now - hours * 3600000; t <= now; t += stepMin * 60000) {
    const hour = new Date(t).getHours();
    const diurnal = unit.type === 'dry_store' || unit.type === 'ambient' ? 2 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) : 0;
    const doorOpen = unit.type === 'cold_room' && rng.chance(0.02) ? rng.between(1.5, 3) : 0;
    rows.push([deviceId, new Date(t), 'temp_c', +(unit.base + diurnal + doorOpen + rng.normal(0, unit.sd)).toFixed(2)]);
    if (unit.hum) rows.push([deviceId, new Date(t), 'humidity', +Math.min(99, unit.hum - 8 + rng.normal(0, 2.5)).toFixed(1)]);
  }
  return rows;
}

function gasHistory(deviceId, rng, hours = 24, stepMin = 5) {
  const rows = [];
  for (let t = Date.now() - hours * 3600000; t <= Date.now(); t += stepMin * 60000) {
    rows.push([deviceId, new Date(t), 'nh3_ppm', +Math.max(0, rng.normal(7, 2)).toFixed(2)], [deviceId, new Date(t), 'co2_ppm', Math.round(rng.normal(720, 70))]);
  }
  return rows;
}

async function seedStorage(client, siteId, siteKey, units, rng, devices) {
  const unitIds = {};
  const readings = [];
  for (const [i, u] of units.entries()) {
    const row = await client.query('INSERT INTO storage_units (site_id, name, unit_type, min_temp_c, max_temp_c, max_humidity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [siteId, u.name, u.type, u.min, u.max, u.hum]);
    unitIds[u.type] = unitIds[u.type] || row.rows[0].id;
    const env = await createDevice(client, `ENV-${siteKey}-${i + 1}`.toUpperCase(), siteId, 'env_sensor', { storageUnitId: row.rows[0].id });
    devices.push({ ...env, profile: { base: u.base, sd: u.sd, hum: u.hum, type: u.type } });
    readings.push(...envHistory(env.id, u, rng));
    if (u.gas) {
      const gas = await createDevice(client, `GAS-${siteKey}-${i + 1}`.toUpperCase(), siteId, 'gas_sensor', { storageUnitId: row.rows[0].id });
      devices.push({ ...gas, profile: { type: 'gas' } });
      readings.push(...gasHistory(gas.id, rng));
    }
  }
  await insertMany(client, 'sensor_readings', ['device_id', 'recorded_at', 'metric', 'value'], readings, { chunk: 1000 });
  return unitIds;
}

const SHELF_DAYS = { fresh_produce: [4, 8], fruits: [4, 9], dairy_raw: [2, 4], grains_pulses: [90, 240] };

// Stock lots sized to ~4 days of consumption; a few deliberately close to expiry.
async function seedLots(client, siteId, siteKey, unitIds, dailyUse, rng) {
  const ingredients = (await client.query('SELECT id, name, category_code FROM ingredients')).rows;
  const rows = [];
  for (const ing of ingredients) {
    const use = dailyUse.get(ing.name);
    if (!use) continue;
    const [minD, maxD] = SHELF_DAYS[ing.category_code] || [30, 90];
    for (let n = 0; n < 2; n++) {
      const receivedDaysAgo = rng.int(0, Math.max(0, Math.floor(minD * 0.6)));
      const nearExpiry = rng.chance(0.12);
      const expiresInH = nearExpiry ? rng.between(8, 40) : (rng.between(minD, maxD) - receivedDaysAgo) * 24;
      const storage = ['fresh_produce', 'fruits', 'dairy_raw'].includes(ing.category_code) ? unitIds.cold_room : unitIds.dry_store;
      rows.push([siteId, ing.id, storage, `${siteKey.toUpperCase()}-${ing.id}-${n + 1}`, +(use * rng.between(2, 5)).toFixed(2), new Date(Date.now() - receivedDaysAgo * 86400000), new Date(Date.now() + Math.max(8, expiresInH) * 3600000), rng.pick(['Mandi Fresh Traders', 'Agro Wholesale Co.', 'Dairy Co-op Union'])]);
    }
  }
  await insertMany(client, 'inventory_lots', ['site_id', 'ingredient_id', 'storage_unit_id', 'lot_code', 'qty', 'received_at', 'expires_at', 'supplier'], rows);
}

module.exports = { KITCHEN_UNITS, PLANT_UNITS, seedStorage, seedLots, createDevice };
