const db = require('../../lib/db');

const insertInspection = (q, client) =>
  db.one(
    `INSERT INTO quality_inspections (surplus_id, lot_id, category_code, inspected_by, image_path, image_features, sensor_snapshot,
       food_temp_c, hours_since_prep, vision_score, freshness_score, scw_hours, verdict, explanation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [q.surplusId ?? null, q.lotId ?? null, q.categoryCode, q.inspectedBy, q.imagePath ?? null, q.imageFeatures ?? null, q.sensorSnapshot ?? null,
      q.foodTempC, q.hoursSincePrep, q.visionScore ?? null, q.freshnessScore, q.scwHours, q.verdict, q.explanation],
    client
  );

const list = (siteIds, limit) =>
  db.query(
    `SELECT q.*, u.full_name AS inspector, sl.title AS surplus_title, c.name AS category_name,
       COALESCE(sl.site_id, l.site_id) AS site_id
     FROM quality_inspections q JOIN food_categories c ON c.code = q.category_code
     LEFT JOIN users u ON u.id = q.inspected_by LEFT JOIN surplus_listings sl ON sl.id = q.surplus_id LEFT JOIN inventory_lots l ON l.id = q.lot_id
     WHERE ($1::int[] IS NULL OR COALESCE(sl.site_id, l.site_id) = ANY($1) OR (sl.id IS NULL AND l.id IS NULL))
     ORDER BY q.inspected_at DESC LIMIT $2`,
    [siteIds, limit]
  );

const setLabel = (id, label) => db.one('UPDATE quality_inspections SET human_label = $2 WHERE id = $1 RETURNING id, human_label', [id, label]);

const labelled = () => db.query('SELECT image_features, human_label FROM quality_inspections WHERE human_label IS NOT NULL AND image_features IS NOT NULL');

const insertModel = (m) => db.one('INSERT INTO quality_models (samples, accuracy, params) VALUES ($1,$2,$3) RETURNING id, trained_at, samples, accuracy', [m.samples, m.accuracy, m.params]);
const latestModel = () => db.one('SELECT * FROM quality_models ORDER BY trained_at DESC LIMIT 1');

module.exports = { insertInspection, list, setLabel, labelled, insertModel, latestModel };
