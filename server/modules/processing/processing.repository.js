const db = require('../../lib/db');

const listProducts = (orgId) =>
  db.query(
    `SELECT p.*, i.name AS raw_material, c.name AS category_name FROM products p LEFT JOIN ingredients i ON i.id = p.raw_material_id
     JOIN food_categories c ON c.code = p.category_code WHERE ($1::int IS NULL OR p.org_id = $1) ORDER BY p.name`,
    [orgId]
  );

const insertProduct = (p) =>
  db.one(
    `INSERT INTO products (org_id, name, category_code, raw_material_id, std_yield_pct, std_energy_kwh_per_kg, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [p.org_id, p.name, p.category_code, p.raw_material_id ?? null, p.std_yield_pct, p.std_energy_kwh_per_kg, p.unit_price]
  );

const listLines = (siteIds) =>
  db.query(
    `SELECT l.*, s.name AS site_name, COALESCE(json_agg(json_build_object('id', m.id, 'name', m.name, 'machine_type', m.machine_type, 'rated_kw', m.rated_kw) ORDER BY m.id)
       FILTER (WHERE m.id IS NOT NULL), '[]') AS machines
     FROM production_lines l JOIN sites s ON s.id = l.site_id LEFT JOIN machines m ON m.line_id = l.id
     WHERE ($1::int[] IS NULL OR l.site_id = ANY($1)) GROUP BY l.id, s.name ORDER BY s.name, l.name`,
    [siteIds]
  );

const findLine = (id) => db.one('SELECT * FROM production_lines WHERE id = $1', [id]);
const insertLine = (l) => db.one('INSERT INTO production_lines (site_id, name, rated_kgph) VALUES ($1,$2,$3) RETURNING *', [l.site_id, l.name, l.rated_kgph]);
const insertMachine = (m) => db.one('INSERT INTO machines (line_id, name, machine_type, rated_kw) VALUES ($1,$2,$3,$4) RETURNING *', [m.line_id, m.name, m.machine_type, m.rated_kw]);
const findMachine = (id) => db.one('SELECT m.*, l.site_id FROM machines m JOIN production_lines l ON l.id = m.line_id WHERE m.id = $1', [id]);

const insertRun = (r) =>
  db.one(
    `INSERT INTO production_runs (line_id, product_id, run_date, planned_output_kg, input_kg, output_kg, scrap_kg, dispatched_kg, planned_minutes, run_minutes, energy_kwh)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [r.line_id, r.product_id, r.run_date, r.planned_output_kg, r.input_kg, r.output_kg, r.scrap_kg, r.dispatched_kg ?? 0, r.planned_minutes, r.run_minutes, r.energy_kwh]
  );

const listRuns = (siteIds, from, limit) =>
  db.query(
    `SELECT r.*, l.name AS line_name, l.site_id, l.rated_kgph, p.name AS product_name, p.std_yield_pct, p.std_energy_kwh_per_kg, p.unit_price, p.category_code, COALESCE(i.unit_cost, 0) AS raw_cost_per_kg
     FROM production_runs r JOIN production_lines l ON l.id = r.line_id JOIN products p ON p.id = r.product_id LEFT JOIN ingredients i ON i.id = p.raw_material_id
     WHERE ($1::int[] IS NULL OR l.site_id = ANY($1)) AND r.run_date >= $2 ORDER BY r.run_date DESC, l.name LIMIT $3`,
    [siteIds, from, limit]
  );

const findRun = (id) => db.one('SELECT r.*, l.site_id, p.name AS product_name, p.category_code FROM production_runs r JOIN production_lines l ON l.id = r.line_id JOIN products p ON p.id = r.product_id WHERE r.id = $1', [id]);

const downtime = (siteIds, from) =>
  db.query(
    `SELECT d.*, m.name AS machine_name, l.name AS line_name, l.site_id,
       EXTRACT(EPOCH FROM (COALESCE(d.ended_at, now()) - d.started_at)) / 60 AS minutes
     FROM downtime_events d JOIN machines m ON m.id = d.machine_id JOIN production_lines l ON l.id = m.line_id
     WHERE ($1::int[] IS NULL OR l.site_id = ANY($1)) AND d.started_at >= $2 ORDER BY d.started_at DESC`,
    [siteIds, from]
  );

const insertDowntime = (d) =>
  db.one('INSERT INTO downtime_events (machine_id, started_at, ended_at, reason, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *', [d.machine_id, d.started_at, d.ended_at ?? null, d.reason, d.notes ?? null]);

const closeDowntime = (id) => db.one('UPDATE downtime_events SET ended_at = now() WHERE id = $1 AND ended_at IS NULL RETURNING *', [id]);

// One row per minute with each telemetry metric as a column.
const machineTelemetry = (machineId, hours) =>
  db.query(
    `SELECT date_trunc('minute', r.recorded_at) AS t,
       avg(value) FILTER (WHERE metric = 'power_kw') AS power_kw,
       avg(value) FILTER (WHERE metric = 'throughput_kgph') AS throughput_kgph,
       avg(value) FILTER (WHERE metric = 'temp_c') AS temp_c,
       avg(value) FILTER (WHERE metric = 'vibration_mm_s') AS vibration_mm_s
     FROM sensor_readings r JOIN devices d ON d.id = r.device_id
     WHERE d.machine_id = $1 AND r.recorded_at > now() - make_interval(hours => $2) GROUP BY 1 ORDER BY 1`,
    [machineId, hours]
  );

const machinesWithMeters = (siteIds) =>
  db.query(
    `SELECT DISTINCT m.id, m.name, m.rated_kw, l.name AS line_name, l.site_id FROM machines m JOIN production_lines l ON l.id = m.line_id
     JOIN devices d ON d.machine_id = m.id WHERE ($1::int[] IS NULL OR l.site_id = ANY($1))`,
    [siteIds]
  );

module.exports = {
  listProducts, insertProduct, listLines, findLine, insertLine, insertMachine, findMachine, insertRun, listRuns, findRun,
  downtime, insertDowntime, closeDowntime, machineTelemetry, machinesWithMeters,
};
