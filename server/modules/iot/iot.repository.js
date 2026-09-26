const db = require('../../lib/db');

const listDevices = (siteIds) =>
  db.query(
    `SELECT d.id, d.device_uid, d.site_id, d.storage_unit_id, d.machine_id, d.device_type, d.last_seen_at, d.active,
       s.name AS site_name, su.name AS storage_name, m.name AS machine_name
     FROM devices d JOIN sites s ON s.id = d.site_id LEFT JOIN storage_units su ON su.id = d.storage_unit_id LEFT JOIN machines m ON m.id = d.machine_id
     WHERE ($1::int[] IS NULL OR d.site_id = ANY($1)) ORDER BY s.name, d.device_uid`,
    [siteIds]
  );

const findByUid = (uid) => db.one('SELECT * FROM devices WHERE device_uid = $1 AND active', [uid]);

const insertDevice = (d) =>
  db.one(
    `INSERT INTO devices (device_uid, site_id, storage_unit_id, machine_id, device_type, api_key_hash) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, device_uid, site_id, storage_unit_id, machine_id, device_type`,
    [d.device_uid, d.site_id, d.storage_unit_id ?? null, d.machine_id ?? null, d.device_type, d.api_key_hash]
  );

async function insertReadings(deviceId, readings) {
  if (!readings.length) return;
  const values = [];
  const params = [deviceId];
  readings.forEach((r, i) => {
    params.push(r.recordedAt, r.metric, r.value);
    values.push(`($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`);
  });
  await db.query(`INSERT INTO sensor_readings (device_id, recorded_at, metric, value) VALUES ${values.join(',')}`, params);
  await db.query('UPDATE devices SET last_seen_at = GREATEST(COALESCE(last_seen_at, to_timestamp(0)), $2) WHERE id = $1', [deviceId, readings[readings.length - 1].recordedAt]);
}

const readings = (deviceId, metric, sinceHours) =>
  db.query(
    `SELECT recorded_at AS t, value AS v FROM sensor_readings WHERE device_id = $1 AND metric = $2 AND recorded_at > now() - make_interval(hours => $3)
     ORDER BY recorded_at`,
    [deviceId, metric, sinceHours]
  );

// Latest value of each metric per device.
const latestByDevice = (siteIds) =>
  db.query(
    `SELECT DISTINCT ON (r.device_id, r.metric) r.device_id, r.metric, r.value, r.recorded_at, d.storage_unit_id, d.machine_id, d.site_id
     FROM sensor_readings r JOIN devices d ON d.id = r.device_id
     WHERE r.recorded_at > now() - interval '6 hours' AND ($1::int[] IS NULL OR d.site_id = ANY($1))
     ORDER BY r.device_id, r.metric, r.recorded_at DESC`,
    [siteIds]
  );

const latestForStorage = (storageUnitId) =>
  db.query(
    `SELECT DISTINCT ON (r.metric) r.metric, r.value, r.recorded_at FROM sensor_readings r JOIN devices d ON d.id = r.device_id
     WHERE d.storage_unit_id = $1 AND r.recorded_at > now() - interval '2 hours' ORDER BY r.metric, r.recorded_at DESC`,
    [storageUnitId]
  );

// Did every temperature reading in the window fall outside the range?
const sustainedBreach = (storageUnitId, minutes, minTemp, maxTemp) =>
  db.one(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE value < $3 OR value > $4)::int AS out_of_range, avg(value)::float AS avg_temp
     FROM sensor_readings r JOIN devices d ON d.id = r.device_id
     WHERE d.storage_unit_id = $1 AND r.metric = 'temp_c' AND r.recorded_at > now() - make_interval(mins => $2)`,
    [storageUnitId, minutes, minTemp ?? -1000, maxTemp ?? 1000]
  );

const silentDevices = (minutes) =>
  db.query(
    `SELECT d.*, s.name AS site_name FROM devices d JOIN sites s ON s.id = d.site_id
     WHERE d.active AND d.device_type <> 'gps_tracker' AND (d.last_seen_at IS NULL OR d.last_seen_at < now() - make_interval(mins => $1))`,
    [minutes]
  );

module.exports = { listDevices, findByUid, insertDevice, insertReadings, readings, latestByDevice, latestForStorage, sustainedBreach, silentDevices };
