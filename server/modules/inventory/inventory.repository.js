const db = require('../../lib/db');

const listStorageUnits = (siteIds) =>
  db.query(
    `SELECT su.*, s.name AS site_name FROM storage_units su JOIN sites s ON s.id = su.site_id
     WHERE ($1::int[] IS NULL OR su.site_id = ANY($1)) ORDER BY s.name, su.name`,
    [siteIds]
  );

const findStorageUnit = (id) => db.one('SELECT * FROM storage_units WHERE id = $1', [id]);

const insertStorageUnit = (u) =>
  db.one(
    'INSERT INTO storage_units (site_id, name, unit_type, min_temp_c, max_temp_c, max_humidity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [u.site_id, u.name, u.unit_type, u.min_temp_c ?? null, u.max_temp_c ?? null, u.max_humidity ?? null]
  );

const LOT_SELECT = `SELECT l.*, i.name AS ingredient, i.unit, i.category_code, i.unit_cost, su.name AS storage_name, s.name AS site_name,
  EXTRACT(EPOCH FROM (l.expires_at - now())) / 3600 AS hours_to_expiry
  FROM inventory_lots l JOIN ingredients i ON i.id = l.ingredient_id JOIN sites s ON s.id = l.site_id
  LEFT JOIN storage_units su ON su.id = l.storage_unit_id`;

const listLots = ({ siteIds, status }) =>
  db.query(`${LOT_SELECT} WHERE ($1::int[] IS NULL OR l.site_id = ANY($1)) AND ($2::text IS NULL OR l.status = $2) ORDER BY l.expires_at`, [siteIds, status || null]);

const findLot = (id, client) => db.one(`${LOT_SELECT} WHERE l.id = $1`, [id], client);

const insertLot = (l) =>
  db.one(
    `INSERT INTO inventory_lots (site_id, ingredient_id, storage_unit_id, lot_code, qty, received_at, expires_at, supplier)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now()),$7,$8) RETURNING *`,
    [l.site_id, l.ingredient_id, l.storage_unit_id ?? null, l.lot_code, l.qty, l.received_at ?? null, l.expires_at, l.supplier ?? null]
  );

const updateLot = (id, qty, status, client) =>
  db.one('UPDATE inventory_lots SET qty = $2, status = $3 WHERE id = $1 RETURNING *', [id, qty, status], client);

// Stock usable on a given day (not expired by then), FEFO order.
const availableLots = (siteId, onDate) =>
  db.query(
    `SELECT l.id, l.ingredient_id, l.qty, l.expires_at FROM inventory_lots l
     WHERE l.site_id = $1 AND l.status = 'available' AND l.qty > 0 AND l.expires_at > $2::date ORDER BY l.expires_at`,
    [siteId, onDate]
  );

const expiringLots = (withinHours) =>
  db.query(`${LOT_SELECT} WHERE l.status = 'available' AND l.qty > 0 AND l.expires_at < now() + make_interval(hours => $1) ORDER BY l.expires_at`, [withinHours]);

module.exports = { listStorageUnits, findStorageUnit, insertStorageUnit, listLots, findLot, insertLot, updateLot, availableLots, expiringLots };
