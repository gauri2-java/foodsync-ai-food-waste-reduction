const db = require('../../lib/db');

const surplusPipeline = (siteIds) =>
  db.query(
    `SELECT status, count(*)::int AS n, COALESCE(sum(quantity_kg), 0)::float AS kg FROM surplus_listings
     WHERE ($1::int[] IS NULL OR site_id = ANY($1) OR assigned_site_id = ANY($1)) AND created_at > now() - interval '7 days'
     GROUP BY status`,
    [siteIds]
  );

const todayMeals = (siteIds) =>
  db.one(
    `SELECT COALESCE(sum(served_portions), 0)::int AS served, COALESCE(sum(prepared_portions), 0)::int AS prepared,
       COALESCE(sum(leftover_kg), 0)::float AS leftover_kg
     FROM meal_logs WHERE log_date = current_date AND ($1::int[] IS NULL OR site_id = ANY($1))`,
    [siteIds]
  );

const tripCounts = (siteIds) =>
  db.query(
    `SELECT t.status, count(*)::int AS n FROM trips t WHERE t.created_at > now() - interval '2 days'
       AND ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.trip_id = t.id AND ts.site_id = ANY($1))) GROUP BY t.status`,
    [siteIds]
  );

const deviceHealth = (siteIds) =>
  db.one(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE last_seen_at > now() - interval '10 minutes')::int AS online
     FROM devices WHERE active AND device_type <> 'gps_tracker' AND ($1::int[] IS NULL OR site_id = ANY($1))`,
    [siteIds]
  );

const recentActivity = (limit) =>
  db.query(
    `SELECT a.occurred_at, a.action, a.entity, a.entity_id, a.payload, u.full_name AS actor
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.action IN ('surplus.accept','trip.start','trip.pickup','forecast.train','quality.inspect','logistics.optimize','production_run.record')
     ORDER BY a.id DESC LIMIT $1`,
    [limit]
  );

// Operational events (hand-offs and new listings) straight from the records they produce.
const recentOperations = (limit) =>
  db.query(
    `SELECT * FROM (
       SELECT ts.completed_at AS at, 'handoff' AS kind, rs.name AS recipient, ds.name AS donor, sl.quantity_kg AS kg, ts.food_temp_c AS temp, ts.status, ts.received_portions AS portions
       FROM trip_stops ts JOIN surplus_listings sl ON sl.id = ts.surplus_id JOIN sites rs ON rs.id = ts.site_id JOIN sites ds ON ds.id = sl.site_id
       WHERE ts.stop_type = 'dropoff' AND ts.status IN ('done','failed')
       UNION ALL
       SELECT sl.created_at, 'listing', NULL, s.name, sl.quantity_kg, NULL, sl.status, sl.portions
       FROM surplus_listings sl JOIN sites s ON s.id = sl.site_id
     ) x WHERE at IS NOT NULL ORDER BY at DESC LIMIT $1`,
    [limit]
  );

const publicTotals = () =>
  db.one(
    `SELECT
       COALESCE((SELECT sum(quantity_kg) FROM surplus_listings WHERE status = 'delivered' AND channel = 'donation'), 0)::float AS donated_kg,
       COALESCE((SELECT sum(quantity_kg) FROM surplus_listings WHERE status = 'delivered'), 0)::float AS delivered_kg,
       COALESCE((SELECT sum(received_portions) FROM trip_stops WHERE stop_type = 'dropoff' AND status = 'done'), 0)::int AS portions_received,
       (SELECT count(*) FROM organizations WHERE org_type = 'ngo' AND verified)::int AS ngos,
       (SELECT count(*) FROM organizations WHERE org_type IN ('institution','processor'))::int AS donors,
       (SELECT count(*) FROM sites WHERE site_type = 'kitchen')::int AS kitchens,
       (SELECT count(*) FROM trip_stops WHERE stop_type = 'dropoff' AND status = 'done')::int AS deliveries`
  );

const publicOrganizations = () => db.query(`SELECT id, name, org_type FROM organizations ORDER BY org_type, name`);

module.exports = { surplusPipeline, todayMeals, tripCounts, deviceHealth, recentActivity, recentOperations, publicTotals, publicOrganizations };
