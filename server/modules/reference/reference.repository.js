const db = require('../../lib/db');

const listCategories = () => db.query('SELECT * FROM food_categories ORDER BY is_cooked DESC, name');
const findCategory = (code) => db.one('SELECT * FROM food_categories WHERE code = $1', [code]);

const upsertCategory = (c) =>
  db.one(
    `INSERT INTO food_categories (code, name, is_cooked, shelf_life_ref_h, ref_temp_c, q10, co2e_per_kg, water_l_per_kg, land_m2_per_kg, cost_per_kg)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (code) DO UPDATE SET name=$2, is_cooked=$3, shelf_life_ref_h=$4, ref_temp_c=$5, q10=$6, co2e_per_kg=$7, water_l_per_kg=$8, land_m2_per_kg=$9, cost_per_kg=$10
     RETURNING *`,
    [c.code, c.name, c.is_cooked, c.shelf_life_ref_h, c.ref_temp_c, c.q10, c.co2e_per_kg, c.water_l_per_kg, c.land_m2_per_kg, c.cost_per_kg]
  );

const listIngredients = () => db.query('SELECT i.*, c.name AS category_name FROM ingredients i JOIN food_categories c ON c.code = i.category_code ORDER BY i.name');

const insertIngredient = (i) =>
  db.one('INSERT INTO ingredients (name, unit, category_code, unit_cost) VALUES ($1,$2,$3,$4) RETURNING *', [i.name, i.unit || 'kg', i.category_code, i.unit_cost || 0]);

const listEvents = ({ from, to, siteId }) =>
  db.query(
    `SELECT e.*, s.name AS site_name FROM calendar_events e LEFT JOIN sites s ON s.id = e.site_id
     WHERE e.event_date BETWEEN $1 AND $2 AND ($3::int IS NULL OR e.site_id IS NULL OR e.site_id = $3)
     ORDER BY e.event_date`,
    [from, to, siteId || null]
  );

const insertEvent = (e) =>
  db.one(
    'INSERT INTO calendar_events (site_id, event_date, event_type, title, attendance_factor) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [e.site_id || null, e.event_date, e.event_type, e.title, e.attendance_factor ?? null]
  );

const deleteEvent = (id) => db.one('DELETE FROM calendar_events WHERE id = $1 RETURNING id', [id]);

module.exports = { listCategories, findCategory, upsertCategory, listIngredients, insertIngredient, listEvents, insertEvent, deleteEvent };
