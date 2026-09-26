const db = require('../../lib/db');

const outcomesByCategory = (siteIds, from, to) =>
  db.query(
    `SELECT sl.channel, sl.status, sl.category_code, c.name AS category_name, c.co2e_per_kg, c.water_l_per_kg, c.land_m2_per_kg, c.cost_per_kg,
       sum(sl.quantity_kg)::float AS kg, count(*)::int AS listings, COALESCE(sum(sl.sale_price), 0)::float AS revenue
     FROM surplus_listings sl JOIN food_categories c ON c.code = sl.category_code
     WHERE ($1::int[] IS NULL OR sl.site_id = ANY($1) OR sl.assigned_site_id = ANY($1)) AND sl.created_at::date BETWEEN $2 AND $3
     GROUP BY sl.channel, sl.status, sl.category_code, c.name, c.co2e_per_kg, c.water_l_per_kg, c.land_m2_per_kg, c.cost_per_kg`,
    [siteIds, from, to]
  );

// Kitchen practice before FoodSync planning (forecast_portions NULL) vs with it, per site.
const kitchenPractice = (siteIds, from, to) =>
  db.query(
    `SELECT site_id,
       sum(prepared_portions) FILTER (WHERE forecast_portions IS NULL)::float AS base_prepared,
       sum(served_portions) FILTER (WHERE forecast_portions IS NULL)::float AS base_served,
       sum(prepared_portions) FILTER (WHERE forecast_portions IS NOT NULL AND log_date BETWEEN $2 AND $3)::float AS fs_prepared,
       sum(served_portions) FILTER (WHERE forecast_portions IS NOT NULL AND log_date BETWEEN $2 AND $3)::float AS fs_served,
       sum(leftover_kg) FILTER (WHERE log_date BETWEEN $2 AND $3)::float AS leftover_kg,
       sum(plate_waste_kg) FILTER (WHERE log_date BETWEEN $2 AND $3)::float AS plate_waste_kg
     FROM meal_logs WHERE ($1::int[] IS NULL OR site_id = ANY($1)) GROUP BY site_id`,
    [siteIds, from, to]
  );

const avgCookedMeal = (siteIds) =>
  db.one(
    `SELECT avg(m.portion_kg)::float AS portion_kg, avg(c.cost_per_kg)::float AS cost_per_kg, avg(c.co2e_per_kg)::float AS co2e_per_kg,
       avg(c.water_l_per_kg)::float AS water_l_per_kg, avg(c.land_m2_per_kg)::float AS land_m2_per_kg
     FROM menu_items m JOIN food_categories c ON c.code = m.category_code
     WHERE ($1::int[] IS NULL OR m.org_id IN (SELECT org_id FROM sites WHERE id = ANY($1)))`,
    [siteIds]
  );

const tripKm = (siteIds, from, to) =>
  db.one(
    `SELECT COALESCE(sum(COALESCE(t.actual_km, t.planned_km)), 0)::float AS km, count(*)::int AS trips FROM trips t
     WHERE t.status = 'completed' AND t.completed_at::date BETWEEN $2 AND $3
       AND ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.trip_id = t.id AND ts.site_id = ANY($1)))`,
    [siteIds, from, to]
  );

const handoffs = (siteIds, from, to) =>
  db.query(
    `SELECT ts.completed_at, ts.status, ts.food_temp_c, ts.received_portions, ts.notes, sl.title, sl.quantity_kg, sl.channel,
       donor.name AS donor, rcp.name AS recipient
     FROM trip_stops ts JOIN surplus_listings sl ON sl.id = ts.surplus_id JOIN sites donor ON donor.id = sl.site_id JOIN sites rcp ON rcp.id = ts.site_id
     WHERE ts.stop_type = 'dropoff' AND ts.status IN ('done','failed') AND ts.completed_at::date BETWEEN $2 AND $3
       AND ($1::int[] IS NULL OR sl.site_id = ANY($1) OR ts.site_id = ANY($1))
     ORDER BY ts.completed_at DESC`,
    [siteIds, from, to]
  );

const processing = (siteIds, from, to) =>
  db.one(
    `SELECT COALESCE(sum(r.energy_kwh), 0)::float AS energy_kwh, COALESCE(sum(r.output_kg), 0)::float AS output_kg,
       COALESCE(sum(r.scrap_kg), 0)::float AS scrap_kg, COALESCE(sum(r.input_kg), 0)::float AS input_kg
     FROM production_runs r JOIN production_lines l ON l.id = r.line_id
     WHERE ($1::int[] IS NULL OR l.site_id = ANY($1)) AND r.run_date BETWEEN $2 AND $3`,
    [siteIds, from, to]
  );

const monthlyDiverted = (siteIds, from, to) =>
  db.query(
    `SELECT to_char(date_trunc('month', sl.created_at), 'YYYY-MM') AS month, sl.channel, sum(sl.quantity_kg)::float AS kg
     FROM surplus_listings sl WHERE sl.status = 'delivered' AND ($1::int[] IS NULL OR sl.site_id = ANY($1) OR sl.assigned_site_id = ANY($1))
       AND sl.created_at::date BETWEEN $2 AND $3 GROUP BY 1, 2 ORDER BY 1`,
    [siteIds, from, to]
  );

const recipientBreakdown = (siteIds, from, to) =>
  db.query(
    `SELECT rs.name, o.org_type, sum(sl.quantity_kg)::float AS kg, count(*)::int AS deliveries
     FROM surplus_listings sl JOIN sites rs ON rs.id = sl.assigned_site_id JOIN organizations o ON o.id = rs.org_id
     WHERE sl.status = 'delivered' AND ($1::int[] IS NULL OR sl.site_id = ANY($1) OR sl.assigned_site_id = ANY($1)) AND sl.created_at::date BETWEEN $2 AND $3
     GROUP BY rs.name, o.org_type ORDER BY kg DESC`,
    [siteIds, from, to]
  );

module.exports = { outcomesByCategory, kitchenPractice, avgCookedMeal, tripKm, handoffs, processing, monthlyDiverted, recipientBreakdown };
