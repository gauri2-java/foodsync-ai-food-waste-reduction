const db = require('../../lib/db');

// Recent ratio of prepared to served portions per slot — the kitchen's current "static" practice.
const practiceRatios = (siteId, days) =>
  db.query(
    `SELECT meal_slot, sum(prepared_portions)::float / NULLIF(sum(served_portions), 0) AS ratio
     FROM meal_logs WHERE site_id = $1 AND log_date >= current_date - $2::int AND forecast_portions IS NULL
     GROUP BY meal_slot`,
    [siteId, days]
  );

const menuWithRecipes = (siteId, from, to) =>
  db.query(
    `SELECT p.plan_date AS date, p.meal_slot AS slot, m.id AS menu_item_id, m.name AS menu_item, m.portion_kg,
       r.ingredient_id, i.name AS ingredient, i.unit, i.unit_cost, r.qty_per_portion
     FROM menu_plan p JOIN menu_items m ON m.id = p.menu_item_id
     JOIN recipe_lines r ON r.menu_item_id = m.id JOIN ingredients i ON i.id = r.ingredient_id
     WHERE p.site_id = $1 AND p.plan_date BETWEEN $2 AND $3 ORDER BY p.plan_date, p.meal_slot`,
    [siteId, from, to]
  );

module.exports = { practiceRatios, menuWithRecipes };
