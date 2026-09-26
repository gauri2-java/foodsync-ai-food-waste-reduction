const db = require('../../lib/db');

const insertModel = (m) =>
  db.one(
    `INSERT INTO forecast_models (series_key, train_rows, mape, baseline_mape, rmse, residual_sd, params)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, series_key, trained_at, train_rows, mape, baseline_mape, rmse, residual_sd`,
    [m.seriesKey, m.trainRows, m.mape, m.baselineMape, m.rmse, m.residualSd, m.params]
  );

const latestModel = (seriesKey) => db.one('SELECT * FROM forecast_models WHERE series_key = $1 ORDER BY trained_at DESC LIMIT 1', [seriesKey]);

const modelHistory = (prefix) =>
  db.query(
    `SELECT id, series_key, trained_at, train_rows, mape, baseline_mape, rmse FROM forecast_models
     WHERE series_key LIKE $1 ORDER BY trained_at DESC LIMIT 50`,
    [`${prefix}%`]
  );

async function insertForecasts(modelId, seriesKey, rows) {
  for (const r of rows) {
    await db.query(
      `INSERT INTO forecasts (model_id, series_key, target_date, predicted, lower_bound, upper_bound, drivers) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (series_key, target_date, model_id) DO NOTHING`,
      [modelId, seriesKey, r.date, r.predicted, r.lower, r.upper, JSON.stringify(r.drivers)]
    );
  }
}

const forecastsFor = (modelId) => db.query('SELECT target_date AS date, predicted, lower_bound AS lower, upper_bound AS upper, drivers FROM forecasts WHERE model_id = $1 ORDER BY target_date', [modelId]);

// Forecast vs actual for past days (uses the most recent forecast issued before each day).
const accuracyLog = (siteId, from) =>
  db.query(
    `SELECT ml.log_date AS date, ml.meal_slot AS slot, ml.served_portions AS actual, ml.prepared_portions AS prepared, f.predicted
     FROM meal_logs ml
     LEFT JOIN LATERAL (
       SELECT predicted FROM forecasts WHERE series_key = 'kitchen:' || ml.site_id || ':' || ml.meal_slot AND target_date = ml.log_date
       ORDER BY created_at DESC LIMIT 1) f ON true
     WHERE ml.site_id = $1 AND ml.log_date >= $2 ORDER BY ml.log_date, ml.meal_slot`,
    [siteId, from]
  );

const productSeries = (productId) =>
  db.query('SELECT run_date AS date, sum(dispatched_kg)::float AS y FROM production_runs WHERE product_id = $1 GROUP BY run_date ORDER BY run_date', [productId]);

const productSite = (productId) =>
  db.one(
    `SELECT p.*, s.id AS site_id, s.lat, s.lng FROM products p
     JOIN production_runs r ON r.product_id = p.id JOIN production_lines l ON l.id = r.line_id JOIN sites s ON s.id = l.site_id
     WHERE p.id = $1 LIMIT 1`,
    [productId]
  );

module.exports = { insertModel, latestModel, modelHistory, insertForecasts, forecastsFor, accuracyLog, productSeries, productSite };
