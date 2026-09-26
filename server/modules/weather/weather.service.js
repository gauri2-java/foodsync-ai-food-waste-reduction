// Daily weather per location from Open-Meteo (free, no API key): archive for history, forecast API for
// the next 7 days. Cached in Postgres; if the network is unavailable the forecaster simply runs without weather.
const repo = require('./weather.repository');
const config = require('../../config');
const logger = require('../../lib/logger');
const { isoDate, addDays } = require('../../lib/time');

const keyOf = (v) => Math.round(v * 10) / 10; // ~11 km grid — one cache entry per neighbourhood

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  return res.json();
}

function parseDaily(json, source) {
  const d = json.daily || {};
  return (d.time || []).map((day, i) => ({ day, tempMax: d.temperature_2m_max[i], tempMin: d.temperature_2m_min[i], rainMm: d.precipitation_sum[i] ?? 0, source })).filter((r) => r.tempMax !== null);
}

async function fetchRemote(lat, lng, from, to) {
  const daily = 'daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto';
  const today = isoDate(new Date());
  const rows = [];
  if (from < today) {
    const end = to < today ? to : isoDate(addDays(new Date(), -1));
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${from}&end_date=${end}&${daily}`;
    rows.push(...parseDaily(await fetchJson(url), 'open-meteo-archive'));
  }
  if (to >= today) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&past_days=5&forecast_days=8&${daily}`;
    rows.push(...parseDaily(await fetchJson(url), 'open-meteo-forecast'));
  }
  return rows;
}

// Returns Map(day -> {tempMax, rainMm}); refreshes the cache when days are missing.
async function daily(lat, lng, from, to) {
  const latKey = keyOf(lat);
  const lngKey = keyOf(lng);
  let rows = await repo.range(latKey, lngKey, from, to);
  const expectedDays = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  const staleForecast = rows.some((r) => r.source === 'open-meteo-forecast' && r.day < isoDate(addDays(new Date(), -2)));
  if (config.weatherEnabled && (rows.length < expectedDays * 0.9 || staleForecast)) {
    try {
      await repo.upsertMany(latKey, lngKey, await fetchRemote(latKey, lngKey, from, to));
      rows = await repo.range(latKey, lngKey, from, to);
    } catch (err) {
      logger.warn({ err: err.message }, 'Weather fetch failed — continuing with cached/no weather');
    }
  }
  return new Map(rows.map((r) => [r.day, { tempMax: r.temp_max_c, rainMm: r.rain_mm, source: r.source }]));
}

module.exports = { daily };
