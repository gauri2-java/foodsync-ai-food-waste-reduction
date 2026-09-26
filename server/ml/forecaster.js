// Hybrid demand forecaster:
//   stage 1 — additive ridge model (weekday, yearly seasonality, calendar events, weather, recent level)
//   stage 2 — gradient-boosted trees fitted on stage-1 residuals (non-linear interactions)
// Accuracy is measured on a time-ordered holdout and compared with a seasonal-naive baseline.
const { fitRidge, predictRidge } = require('./ridge');
const { fitGbm, predictGbm } = require('./gbm');
const { parseDate, isoDate, addDays } = require('../lib/time');

const EVENT_TYPES = ['holiday', 'exam', 'festival', 'vacation', 'special_event'];
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEVEL_WINDOW = 28;
const HORIZON = 7;

// Level = mean of the LEVEL_WINDOW observations ending HORIZON days before the target,
// so every feature is known at forecast time for any horizon ≤ 7 days.
function levelAt(seriesByDate, date) {
  const vals = [];
  for (let k = HORIZON; k < HORIZON + LEVEL_WINDOW; k++) {
    const v = seriesByDate.get(isoDate(addDays(parseDate(date), -k)));
    if (v !== undefined) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function rawFeatures(row, seriesByDate) {
  const d = parseDate(row.date);
  const doy = (d - new Date(d.getFullYear(), 0, 0)) / 86400000;
  const lag7 = seriesByDate.get(isoDate(addDays(d, -7)));
  const level = levelAt(seriesByDate, row.date);
  return {
    dow: d.getDay(),
    sinDoy: Math.sin((2 * Math.PI * doy) / 365.25),
    cosDoy: Math.cos((2 * Math.PI * doy) / 365.25),
    events: EVENT_TYPES.map((t) => (row.events?.[t] ? 1 : 0)),
    attendanceFactor: row.attendanceFactor ?? 1,
    tempMax: row.tempMax ?? null,
    rainMm: row.rainMm ?? 0,
    level,
    lag7: lag7 ?? level,
  };
}

// Linear design row. Weather is centred using training means so missing values contribute 0.
function linearRow(f, stats) {
  const dowOneHot = [1, 2, 3, 4, 5, 6].map((k) => (f.dow === k ? 1 : 0));
  const temp = f.tempMax === null ? 0 : (f.tempMax - stats.tempMean) / 10;
  return [1, ...dowOneHot, f.sinDoy, f.cosDoy, ...f.events, f.attendanceFactor - 1, temp, Math.min(f.rainMm, 80) / 10, f.level / stats.scale, f.lag7 / stats.scale];
}

const FEATURE_GROUPS = [
  { name: 'Base', cols: [0] },
  { name: 'Day of week', cols: [1, 2, 3, 4, 5, 6] },
  { name: 'Season', cols: [7, 8] },
  ...EVENT_TYPES.map((t, i) => ({ name: `Calendar: ${t.replace('_', ' ')}`, cols: [9 + i] })),
  { name: 'Attendance hint', cols: [14] },
  { name: 'Temperature', cols: [15] },
  { name: 'Rainfall', cols: [16] },
  { name: 'Recent level', cols: [17, 18] },
];

const treeRow = (f) => [f.dow, f.sinDoy, f.cosDoy, ...f.events, f.attendanceFactor, f.tempMax ?? -99, f.rainMm, f.level, f.lag7];

function buildDataset(history) {
  const seriesByDate = new Map(history.map((r) => [r.date, r.y]));
  const rows = [];
  for (const r of history) {
    const f = rawFeatures(r, seriesByDate);
    if (f.level !== null) rows.push({ date: r.date, y: r.y, f });
  }
  return { rows, seriesByDate };
}

function computeStats(rows) {
  const temps = rows.map((r) => r.f.tempMax).filter((t) => t !== null);
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  return { tempMean: mean(temps) || 30, scale: Math.max(1, mean(rows.map((r) => r.y))) };
}

function fitOn(rows, opts) {
  const stats = computeStats(rows);
  const Xl = rows.map((r) => linearRow(r.f, stats));
  stats.meanRow = Xl[0].map((_, j) => Xl.reduce((acc, row) => acc + row[j], 0) / Xl.length);
  const y = rows.map((r) => r.y);
  const beta = fitRidge(Xl, y, opts.lambda);
  const residuals = rows.map((r, i) => y[i] - predictRidge(beta, Xl[i]));
  const gbm = rows.length >= 40 ? fitGbm(rows.map((r) => treeRow(r.f)), residuals, opts.gbm) : { trees: [], learningRate: 0 };
  return { beta, gbm, stats };
}

function predictWith(model, f) {
  const lin = predictRidge(model.beta, linearRow(f, model.stats));
  return Math.max(0, lin + predictGbm(model.gbm, treeRow(f)));
}

function errorMetrics(actual, predicted) {
  const pairs = actual.map((a, i) => [a, predicted[i]]).filter(([a]) => a > 0);
  const mape = (100 * pairs.reduce((s, [a, p]) => s + Math.abs(a - p) / a, 0)) / Math.max(1, pairs.length);
  const rmse = Math.sqrt(pairs.reduce((s, [a, p]) => s + (a - p) ** 2, 0) / Math.max(1, pairs.length));
  return { mape, rmse };
}

function train(history, { holdoutDays = 14, lambda = 2.0, gbm = {} } = {}) {
  const { rows } = buildDataset(history);
  if (rows.length < holdoutDays + 30) throw new Error(`Need at least ${holdoutDays + 30} days of history with a ${LEVEL_WINDOW + HORIZON}-day warm-up; have ${rows.length}`);
  const trainRows = rows.slice(0, -holdoutDays);
  const testRows = rows.slice(-holdoutDays);
  const evalModel = fitOn(trainRows, { lambda, gbm });
  const preds = testRows.map((r) => predictWith(evalModel, r.f));
  const actual = testRows.map((r) => r.y);
  const holdout = errorMetrics(actual, preds);
  const baseline = errorMetrics(actual, testRows.map((r) => r.f.lag7));
  const residualSd = Math.sqrt(actual.reduce((s, a, i) => s + (a - preds[i]) ** 2, 0) / actual.length);
  const finalModel = fitOn(rows, { lambda, gbm });
  return {
    model: { ...finalModel, residualSd },
    metrics: { trainRows: rows.length, mape: holdout.mape, rmse: holdout.rmse, baselineMape: baseline.mape, residualSd },
    holdout: testRows.map((r, i) => ({ date: r.date, actual: r.y, predicted: +preds[i].toFixed(1) })),
  };
}

// Per-group contribution relative to the average training day — explains *why* a number moved.
function explain(model, f) {
  const row = linearRow(f, model.stats);
  return FEATURE_GROUPS.filter((g) => g.name !== 'Base')
    .map((g) => ({ driver: g.name, effect: +g.cols.reduce((s, c) => s + (row[c] - model.stats.meanRow[c]) * model.beta[c], 0).toFixed(1) }))
    .filter((d) => Math.abs(d.effect) >= 1)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}

// future: [{date, tempMax, rainMm, events, attendanceFactor}] — dates must be ≤ 7 days after the last history date.
function predict(model, history, future, z = 1.28) {
  const seriesByDate = new Map(history.map((r) => [r.date, r.y]));
  return future.map((row) => {
    const f = rawFeatures(row, seriesByDate);
    if (f.level === null) return null;
    const yhat = predictWith(model, f);
    const band = z * model.residualSd;
    return {
      date: row.date,
      weekday: DOW_NAMES[f.dow],
      predicted: +yhat.toFixed(1),
      lower: +Math.max(0, yhat - band).toFixed(1),
      upper: +(yhat + band).toFixed(1),
      drivers: explain(model, f),
    };
  }).filter(Boolean);
}

module.exports = { train, predict, HORIZON, EVENT_TYPES };
