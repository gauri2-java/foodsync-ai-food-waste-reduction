const db = require('../../lib/db');

const listVehicles = (orgId) =>
  db.query(
    `SELECT v.*, u.full_name AS driver_name, s.name AS depot_name, s.lat AS depot_lat, s.lng AS depot_lng, o.name AS org_name
     FROM vehicles v JOIN organizations o ON o.id = v.org_id LEFT JOIN users u ON u.id = v.driver_user_id LEFT JOIN sites s ON s.id = v.depot_site_id
     WHERE ($1::int IS NULL OR v.org_id = $1 OR o.org_type = 'logistics') ORDER BY v.registration`,
    [orgId]
  );

const findVehicle = (id, client) => db.one('SELECT * FROM vehicles WHERE id = $1', [id], client);

const insertVehicle = (v) =>
  db.one(
    `INSERT INTO vehicles (org_id, depot_site_id, registration, capacity_kg, refrigerated, driver_user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [v.org_id, v.depot_site_id ?? null, v.registration, v.capacity_kg, v.refrigerated ?? false, v.driver_user_id ?? null]
  );

const setVehicleStatus = (id, status, client) => db.one('UPDATE vehicles SET status = $2 WHERE id = $1 RETURNING *', [id, status], client);
const setVehicleLocation = (id, lat, lng) => db.one('UPDATE vehicles SET last_lat = $2, last_lng = $3, last_ping_at = now() WHERE id = $1 RETURNING id, last_lat, last_lng, last_ping_at, org_id, driver_user_id', [id, lat, lng]);

const availableVehicles = (orgId) =>
  db.query(
    `SELECT v.*, COALESCE(v.last_lat, s.lat) AS start_lat, COALESCE(v.last_lng, s.lng) AS start_lng
     FROM vehicles v JOIN organizations o ON o.id = v.org_id LEFT JOIN sites s ON s.id = v.depot_site_id
     WHERE v.status = 'available' AND ($1::int IS NULL OR v.org_id = $1 OR o.org_type = 'logistics') AND COALESCE(v.last_lat, s.lat) IS NOT NULL`,
    [orgId]
  );

// Matched listings not yet on an active trip.
const pendingDeliveries = (siteIds) =>
  db.query(
    `SELECT sl.id, sl.title, sl.quantity_kg, sl.safe_until, sl.site_id, sl.assigned_site_id, sl.category_code, c.is_cooked,
       ps.lat AS p_lat, ps.lng AS p_lng, ds.lat AS d_lat, ds.lng AS d_lng
     FROM surplus_listings sl JOIN sites ps ON ps.id = sl.site_id JOIN sites ds ON ds.id = sl.assigned_site_id
     JOIN food_categories c ON c.code = sl.category_code
     WHERE sl.status = 'matched' AND ($1::int[] IS NULL OR sl.site_id = ANY($1))
       AND NOT EXISTS (SELECT 1 FROM trip_stops ts JOIN trips t ON t.id = ts.trip_id WHERE ts.surplus_id = sl.id AND t.status IN ('planned','in_progress'))`,
    [siteIds]
  );

const insertTrip = (t, client) =>
  db.one('INSERT INTO trips (vehicle_id, planned_km, planned_minutes, geometry, optimizer) VALUES ($1,$2,$3,$4,$5) RETURNING *', [t.vehicleId, t.km, t.minutes, JSON.stringify(t.geometry), t.optimizer], client);

const insertStop = (s, client) =>
  db.one(
    `INSERT INTO trip_stops (trip_id, seq, stop_type, surplus_id, site_id, eta, deadline, handoff_token_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [s.tripId, s.seq, s.type, s.surplusId, s.siteId, s.eta, s.deadline, s.tokenHash ?? null],
    client
  );

const TRIP_SELECT = `SELECT t.*, v.registration, v.capacity_kg, v.refrigerated, v.driver_user_id, v.org_id AS vehicle_org_id, v.last_lat, v.last_lng, v.last_ping_at,
    u.full_name AS driver_name FROM trips t JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN users u ON u.id = v.driver_user_id`;

const listTrips = ({ siteIds, driverId, status, limit }) =>
  db.query(
    `${TRIP_SELECT} WHERE ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.trip_id = t.id AND ts.site_id = ANY($1)))
       AND ($2::int IS NULL OR v.driver_user_id = $2) AND ($3::text[] IS NULL OR t.status = ANY($3))
     ORDER BY t.created_at DESC LIMIT $4`,
    [siteIds, driverId, status, limit]
  );

const findTrip = (id, client) => db.one(`${TRIP_SELECT} WHERE t.id = $1`, [id], client);

const stopsForTrip = (tripId, client) =>
  db.query(
    `SELECT ts.*, s.name AS site_name, s.lat, s.lng, s.address, s.org_id, so.org_type AS site_org_type, sl.title, sl.quantity_kg, sl.portions, sl.prepared_at, sl.category_code, c.is_cooked
     FROM trip_stops ts JOIN sites s ON s.id = ts.site_id JOIN organizations so ON so.id = s.org_id JOIN surplus_listings sl ON sl.id = ts.surplus_id JOIN food_categories c ON c.code = sl.category_code
     WHERE ts.trip_id = $1 ORDER BY ts.seq`,
    [tripId],
    client
  );

const findStop = (id, client) =>
  db.one(
    `SELECT ts.*, t.vehicle_id, t.status AS trip_status, s.org_id AS site_org_id, so.org_type AS site_org_type, sl.prepared_at, sl.category_code, sl.portions, c.is_cooked
     FROM trip_stops ts JOIN trips t ON t.id = ts.trip_id JOIN sites s ON s.id = ts.site_id JOIN organizations so ON so.id = s.org_id
     JOIN surplus_listings sl ON sl.id = ts.surplus_id JOIN food_categories c ON c.code = sl.category_code WHERE ts.id = $1 FOR UPDATE OF ts`,
    [id],
    client
  );

const completeStop = (id, f, client) =>
  db.one(
    `UPDATE trip_stops SET status = $2, completed_at = now(), food_temp_c = $3, received_portions = $4, notes = $5 WHERE id = $1 RETURNING *`,
    [id, f.status, f.foodTempC ?? null, f.receivedPortions ?? null, f.notes ?? null],
    client
  );

const setStopToken = (id, hash, client) => db.query('UPDATE trip_stops SET handoff_token_hash = $2 WHERE id = $1', [id, hash], client);

const openStopCount = (tripId, client) => db.one(`SELECT count(*)::int AS n FROM trip_stops WHERE trip_id = $1 AND status = 'pending'`, [tripId], client);
const setTripStatus = (id, status, client) =>
  db.one(
    `UPDATE trips SET status = $2, started_at = CASE WHEN $2 = 'in_progress' THEN now() ELSE started_at END,
       completed_at = CASE WHEN $2 IN ('completed','cancelled') THEN now() ELSE completed_at END WHERE id = $1 RETURNING *`,
    [id, status],
    client
  );
const setListingStatus = (id, status, client) => db.one('UPDATE surplus_listings SET status = $2 WHERE id = $1 RETURNING id, status', [id, status], client);

module.exports = {
  listVehicles, findVehicle, insertVehicle, setVehicleStatus, setVehicleLocation, availableVehicles, pendingDeliveries,
  insertTrip, insertStop, listTrips, findTrip, stopsForTrip, findStop, completeStop, setStopToken, openStopCount, setTripStatus, setListingStatus,
};
