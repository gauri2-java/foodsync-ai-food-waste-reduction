const crypto = require('crypto');
const repo = require('./iot.repository');
const inventoryRepo = require('../inventory/inventory.repository');
const directory = require('../directory/directory.service');
const alerts = require('../alerts/alerts.service');
const settings = require('../settings/settings.service');
const audit = require('../audit/audit.service');
const { publish } = require('../../lib/eventBus');
const { validate, oneOf } = require('../../lib/validate');
const { unauthorized, badRequest } = require('../../lib/errors');

const DEVICE_TYPES = ['env_sensor', 'gas_sensor', 'machine_meter', 'gps_tracker', 'thermal_probe'];
const METRICS = ['temp_c', 'humidity', 'nh3_ppm', 'co2_ppm', 'ch4_ppm', 'power_kw', 'energy_kwh', 'throughput_kgph', 'status', 'vibration_mm_s'];

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

const listDevices = (scope) => repo.listDevices(scope.siteIds);

// Returns the plaintext API key exactly once; only its hash is stored.
async function registerDevice(body, actor, scope) {
  const data = validate(body, { device_uid: 'string', site_id: 'int', storage_unit_id: 'int?', machine_id: 'int?', device_type: 'string' });
  oneOf(data.device_type, DEVICE_TYPES, 'device_type');
  directory.assertSiteInScope(scope, data.site_id);
  const apiKey = crypto.randomBytes(24).toString('base64url');
  const device = await repo.insertDevice({ ...data, api_key_hash: hashKey(apiKey) });
  await audit.record(actor, 'device.register', 'device', device.id, { uid: device.device_uid, type: device.device_type });
  return { ...device, apiKey };
}

async function authenticateDevice(uid, apiKey) {
  const device = uid && apiKey ? await repo.findByUid(uid) : null;
  const expected = device ? Buffer.from(device.api_key_hash, 'hex') : null;
  if (!device || !crypto.timingSafeEqual(expected, Buffer.from(hashKey(apiKey), 'hex'))) throw unauthorized('Unknown device or bad API key');
  return device;
}

function normaliseReadings(body) {
  const now = new Date();
  const list = Array.isArray(body.readings) ? body.readings : Object.entries(body.metrics || {}).map(([metric, value]) => ({ metric, value, recorded_at: body.recorded_at }));
  if (!list.length || list.length > 500) throw badRequest('Send 1–500 readings');
  return list.map((r) => {
    if (!METRICS.includes(r.metric)) throw badRequest(`Unknown metric '${r.metric}'`);
    const value = Number(r.value);
    if (!Number.isFinite(value)) throw badRequest(`Invalid value for ${r.metric}`);
    const recordedAt = r.recorded_at ? new Date(r.recorded_at) : now;
    if (Number.isNaN(recordedAt.getTime()) || recordedAt > new Date(now.getTime() + 300000)) throw badRequest('Invalid recorded_at');
    return { metric: r.metric, value, recordedAt };
  }).sort((a, b) => a.recordedAt - b.recordedAt);
}

async function checkStorageBreach(device) {
  if (!device.storage_unit_id) return;
  const unit = await inventoryRepo.findStorageUnit(device.storage_unit_id);
  if (!unit || (unit.min_temp_c === null && unit.max_temp_c === null)) return;
  const { breachMinutes } = await settings.get('iot');
  const w = await repo.sustainedBreach(unit.id, breachMinutes, unit.min_temp_c, unit.max_temp_c);
  const ref = `storage:${unit.id}`;
  if (w.n >= 2 && w.out_of_range === w.n) {
    await alerts.raise({
      siteId: unit.site_id, type: 'cold_chain_breach', severity: 'critical',
      title: `${unit.name} out of range for ${breachMinutes}+ min (avg ${w.avg_temp.toFixed(1)} °C)`,
      detail: `Allowed ${unit.min_temp_c ?? '–'}…${unit.max_temp_c ?? '–'} °C. Inspect stock; the SCW of items inside is shortened.`,
      entityRef: ref,
    });
  } else if (w.n && w.out_of_range === 0) await alerts.resolve('cold_chain_breach', ref);
}

async function ingest(uid, apiKey, body) {
  const device = await authenticateDevice(uid, apiKey);
  const rows = normaliseReadings(body);
  await repo.insertReadings(device.id, rows);
  await checkStorageBreach(device);
  publish('telemetry', { deviceId: device.id, siteId: device.site_id, storageUnitId: device.storage_unit_id, machineId: device.machine_id, readings: rows.slice(-10) });
  await alerts.resolve('device_offline', `device:${device.id}`);
  return { accepted: rows.length };
}

async function series(deviceId, metric, hours, scope) {
  const devices = await repo.listDevices(scope.siteIds);
  if (!devices.some((d) => d.id === deviceId)) throw badRequest('Device not in your scope');
  return repo.readings(deviceId, metric, Math.min(hours || 24, 24 * 14));
}

const latest = (scope) => repo.latestByDevice(scope.siteIds);

// Latest env/gas values for a storage unit, shaped for the shelf-life model.
async function storageSnapshot(storageUnitId) {
  const rows = await repo.latestForStorage(storageUnitId);
  return rows.length ? Object.fromEntries(rows.map((r) => [r.metric, r.value])) : null;
}

async function scanOffline() {
  const { offlineMinutes } = await settings.get('iot');
  for (const d of await repo.silentDevices(offlineMinutes)) {
    await alerts.raise({ siteId: d.site_id, type: 'device_offline', severity: 'warning', title: `Sensor ${d.device_uid} offline`, detail: `No data from ${d.site_name} for over ${offlineMinutes} minutes.`, entityRef: `device:${d.id}` });
  }
}

module.exports = { DEVICE_TYPES, listDevices, registerDevice, ingest, series, latest, storageSnapshot, scanOffline };
