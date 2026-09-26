const db = require('../../lib/db');

const listMenuItems = (orgId) =>
  db.query(
    `SELECT m.*, c.name AS category_name,
       COALESCE(json_agg(json_build_object('ingredient_id', i.id, 'name', i.name, 'unit', i.unit, 'qty_per_portion', r.qty_per_portion, 'unit_cost', i.unit_cost))
         FILTER (WHERE i.id IS NOT NULL), '[]') AS recipe
     FROM menu_items m JOIN food_categories c ON c.code = m.category_code
     LEFT JOIN recipe_lines r ON r.menu_item_id = m.id LEFT JOIN ingredients i ON i.id = r.ingredient_id
     WHERE ($1::int IS NULL OR m.org_id = $1) GROUP BY m.id, c.name ORDER BY m.name`,
    [orgId || null]
  );

const insertMenuItem = (m, client) =>
  db.one('INSERT INTO menu_items (org_id, name, category_code, portion_kg) VALUES ($1,$2,$3,$4) RETURNING *', [m.org_id, m.name, m.category_code, m.portion_kg], client);

const insertRecipeLine = (menuItemId, line, client) =>
  db.query('INSERT INTO recipe_lines (menu_item_id, ingredient_id, qty_per_portion) VALUES ($1,$2,$3)', [menuItemId, line.ingredient_id, line.qty_per_portion], client);

const listMenuPlan = (siteId, from, to) =>
  db.query(
    `SELECT p.*, m.name AS menu_item, m.portion_kg, m.category_code FROM menu_plan p JOIN menu_items m ON m.id = p.menu_item_id
     WHERE p.site_id = $1 AND p.plan_date BETWEEN $2 AND $3 ORDER BY p.plan_date, p.meal_slot, m.name`,
    [siteId, from, to]
  );

const upsertMenuPlan = (p) =>
  db.one(
    `INSERT INTO menu_plan (site_id, plan_date, meal_slot, menu_item_id, planned_portions) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (site_id, plan_date, meal_slot, menu_item_id) DO UPDATE SET planned_portions = EXCLUDED.planned_portions RETURNING *`,
    [p.site_id, p.plan_date, p.meal_slot, p.menu_item_id, p.planned_portions ?? null]
  );

const deleteMenuPlan = (id) => db.one('DELETE FROM menu_plan WHERE id = $1 RETURNING id, site_id', [id]);

const listMealLogs = (siteId, from, to) =>
  db.query('SELECT * FROM meal_logs WHERE site_id = $1 AND log_date BETWEEN $2 AND $3 ORDER BY log_date DESC, meal_slot', [siteId, from, to]);

const findMealLog = (id) => db.one('SELECT ml.*, s.name AS site_name FROM meal_logs ml JOIN sites s ON s.id = ml.site_id WHERE ml.id = $1', [id]);

const upsertMealLog = (m) =>
  db.one(
    `INSERT INTO meal_logs (site_id, log_date, meal_slot, headcount, prepared_portions, served_portions, leftover_kg, plate_waste_kg, forecast_portions, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (site_id, log_date, meal_slot) DO UPDATE SET headcount=$4, prepared_portions=$5, served_portions=$6,
       leftover_kg=$7, plate_waste_kg=$8, forecast_portions=COALESCE($9, meal_logs.forecast_portions)
     RETURNING *`,
    [m.site_id, m.log_date, m.meal_slot, m.headcount, m.prepared_portions, m.served_portions, m.leftover_kg ?? 0, m.plate_waste_kg ?? 0, m.forecast_portions ?? null, m.created_by]
  );

// Daily demand series for one site/slot, used to train the forecaster.
const demandSeries = (siteId, slot) =>
  db.query('SELECT log_date AS date, served_portions AS y FROM meal_logs WHERE site_id = $1 AND meal_slot = $2 ORDER BY log_date', [siteId, slot]);

const wasteTrend = (siteIds, from) =>
  db.query(
    `SELECT log_date AS date, sum(prepared_portions)::int AS prepared, sum(served_portions)::int AS served,
       sum(leftover_kg)::float AS leftover_kg, sum(plate_waste_kg)::float AS plate_waste_kg, sum(headcount)::int AS headcount
     FROM meal_logs WHERE ($1::int[] IS NULL OR site_id = ANY($1)) AND log_date >= $2
     GROUP BY log_date ORDER BY log_date`,
    [siteIds, from]
  );

const slotsForSite = (siteId) => db.query('SELECT DISTINCT meal_slot FROM meal_logs WHERE site_id = $1', [siteId]);

module.exports = {
  listMenuItems, insertMenuItem, insertRecipeLine, listMenuPlan, upsertMenuPlan, deleteMenuPlan,
  listMealLogs, findMealLog, upsertMealLog, demandSeries, wasteTrend, slotsForSite,
};
