const repo = require('./forecast.repository');
const kitchenRepo = require('../kitchen/kitchen.repository');
const directory = require('../directory/directory.service');
const reference = require('../reference/reference.service');
const weather = require('../weather/weather.service');
const settings = require('../settings/settings.service');
const audit = require('../audit/audit.service');
const forecaster = require('../../ml/forecaster');
const logger = require('../../lib/logger');
const { badRequest } = require('../../lib/errors');
const { isoDate, addDays, parseDate } = require('../../lib/time');

const MODEL_MAX_AGE_H = 20;

async function calendarMap(siteId, from, to) {
  const events = await reference.listEvents({ from, to, siteId });
  const map = new Map();
  for (const e of events) {
    const cur = map.get(e.event_date) || { events: {}, attendanceFactor: 1 };
    cur.events[e.event_type] = true;
    if (e.attendance_factor !== null) cur.attendanceFactor = Math.min(cur.attendanceFactor, e.attendance_factor);
    cur.titles = [...(cur.titles || []), e.title];
    map.set(e.event_date, cur);
  }
  return map;
}

// Joins the raw series with calendar + weather context for both history and the future horizon.
async function buildContext(site, series, horizonDays) {
  const from = series[0].date;
  const lastDate = series[series.length - 1].date;
  const to = isoDate(addDays(parseDate(lastDate), horizonDays));
  const [cal, wx] = await Promise.all([calendarMap(site.id, from, to), weather.daily(site.lat, site.lng, from, to)]);
  const enrich = (date) => {
    const c = cal.get(date) || { events: {}, attendanceFactor: 1 };
    const w = wx.get(date) || {};
    return { date, events: c.events, attendanceFactor: c.attendanceFactor, eventTitles: c.titles || [], tempMax: w.tempMax ?? null, rainMm: w.rainMm ?? 0 };
  };
  const history = series.map((r) => ({ ...enrich(r.date), y: r.y }));
  const future = [];
  for (let k = 1; k <= horizonDays; k++) future.push(enrich(isoDate(addDays(parseDate(lastDate), k))));
  return { history, future };
}

async function loadSeries(seriesKey) {
  const [kind, id, slot] = seriesKey.split(':');
  if (kind === 'kitchen') {
    const site = await directory.getSite(Number(id));
    return { site, series: await kitchenRepo.demandSeries(site.id, slot) };
  }
  if (kind === 'product') {
    const p = await repo.productSite(Number(id));
    if (!p) throw badRequest('Product has no production history yet');
    return { site: { id: p.site_id, lat: p.lat, lng: p.lng }, series: await repo.productSeries(p.id) };
  }
  throw badRequest(`Unknown series '${seriesKey}'`);
}

async function trainSeries(seriesKey, actor) {
  const cfg = await settings.get('forecast');
  const { site, series } = await loadSeries(seriesKey);
  if (series.length < 60) throw badRequest(`Series ${seriesKey} has only ${series.length} days of history; at least 60 are needed`);
  const staleDays = (Date.now() - parseDate(series[series.length - 1].date)) / 86400000;
  if (staleDays > 14) throw badRequest(`No data for ${Math.floor(staleDays)} days (off-season or inactive) — nothing to forecast`);
  const { history, future } = await buildContext(site, series, cfg.horizonDays);
  const result = forecaster.train(history, { holdoutDays: cfg.holdoutDays });
  const model = await repo.insertModel({ seriesKey, ...result.metrics, params: result.model });
  const predictions = forecaster.predict(result.model, history, future, cfg.serviceLevelZ)
    .map((p) => ({ ...p, eventTitles: future.find((f) => f.date === p.date)?.eventTitles || [] }));
  await repo.insertForecasts(model.id, seriesKey, predictions);
  logger.info({ seriesKey, mape: result.metrics.mape.toFixed(2), baseline: result.metrics.baselineMape.toFixed(2) }, 'forecast model trained');
  if (actor) await audit.record(actor, 'forecast.train', 'forecast_model', model.id, { seriesKey, mape: +result.metrics.mape.toFixed(2) });
  return { model, predictions, holdout: result.holdout };
}

// Reuse a recent model's stored forecasts; retrain if stale or missing.
async function ensureForecast(seriesKey) {
  const latest = await repo.latestModel(seriesKey);
  const ageH = latest ? (Date.now() - new Date(latest.trained_at)) / 3600000 : Infinity;
  if (ageH > MODEL_MAX_AGE_H) return trainSeries(seriesKey);
  const { params, ...model } = latest;
  return { model, predictions: await repo.forecastsFor(latest.id) };
}

async function kitchenForecast(siteId, scope) {
  directory.assertSiteInScope(scope, siteId);
  const slots = (await kitchenRepo.slotsForSite(siteId)).map((r) => r.meal_slot);
  const results = [];
  for (const slot of slots) {
    try {
      results.push({ slot, ...(await ensureForecast(`kitchen:${siteId}:${slot}`)) });
    } catch (err) {
      results.push({ slot, error: err.message });
    }
  }
  return results;
}

async function retrainSite(siteId, actor, scope) {
  directory.assertSiteInScope(scope, siteId);
  const slots = (await kitchenRepo.slotsForSite(siteId)).map((r) => r.meal_slot);
  const out = [];
  for (const slot of slots) out.push({ slot, ...(await trainSeries(`kitchen:${siteId}:${slot}`, actor)) });
  return out;
}

async function accuracy(siteId, days, scope) {
  directory.assertSiteInScope(scope, siteId);
  return repo.accuracyLog(siteId, isoDate(addDays(new Date(), -(days || 30))));
}

const productForecast = (productId) => ensureForecast(`product:${productId}`);
const modelHistory = (prefix) => repo.modelHistory(prefix || '');

module.exports = { trainSeries, ensureForecast, kitchenForecast, retrainSite, accuracy, productForecast, modelHistory };
