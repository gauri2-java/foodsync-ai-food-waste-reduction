// Kitchen history: menus, calendar, weather and daily meal logs. Demand follows weekday, calendar,
// weather and noise; before GO_LIVE kitchens cook to a static headcount rule, after it to the forecast.
const catalog = require('./catalog');
const { insertMany } = require('./bulk');
const weather = require('../../modules/weather/weather.service');
const weatherRepo = require('../../modules/weather/weather.repository');
const { isoDate, addDays, parseDate } = require('../../lib/time');

const SLOT_RATE = { breakfast: 0.58, lunch: 0.8, snacks: 0.42, dinner: 0.76 };
const DOW_FACTOR = [0.7, 1.03, 1.0, 1.0, 0.99, 0.93, 0.82];
const SLOT_END_HOUR = { breakfast: 10, lunch: 15, snacks: 18, dinner: 22 };

async function seedMenus(client, orgIds) {
  const ing = new Map((await client.query('SELECT id, name FROM ingredients')).rows.map((r) => [r.name, r.id]));
  const byOrg = {};
  for (const orgId of orgIds) {
    byOrg[orgId] = {};
    for (const m of catalog.menuItems) {
      const row = await client.query('INSERT INTO menu_items (org_id, name, category_code, portion_kg) VALUES ($1,$2,$3,$4) RETURNING id', [orgId, m.name, m.category, m.portionKg]);
      byOrg[orgId][m.name] = { id: row.rows[0].id, portionKg: m.portionKg };
      for (const [name, qty] of Object.entries(m.recipe)) await client.query('INSERT INTO recipe_lines VALUES ($1,$2,$3)', [row.rows[0].id, ing.get(name), qty]);
    }
  }
  return byOrg;
}

function academicEvents(year, uniSites) {
  const ev = [];
  const span = (from, to, type, title, factor, sites) => {
    for (let d = parseDate(from); d <= parseDate(to); d = addDays(d, 1)) for (const s of sites) ev.push([s, isoDate(d), type, title, factor]);
  };
  span(`${year}-03-09`, `${year}-03-14`, 'exam', 'Mid-semester exams', null, uniSites);
  span(`${year}-05-04`, `${year}-05-14`, 'exam', 'End-semester exams', null, uniSites);
  span(`${year}-05-16`, `${year}-06-30`, 'vacation', 'Summer vacation', 0.3, uniSites);
  span(`${year}-09-21`, `${year}-09-26`, 'exam', 'Mid-semester exams', null, uniSites);
  span(`${year}-11-24`, `${year}-12-05`, 'exam', 'End-semester exams', null, uniSites);
  span(`${year}-12-22`, `${year}-12-31`, 'vacation', 'Winter break', 0.4, uniSites);
  span(`${year}-02-20`, `${year}-02-21`, 'special_event', 'Annual cultural fest', 1.25, uniSites);
  return ev;
}

async function seedCalendar(client, from, to, uniSites) {
  const rows = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    for (const [md, title] of catalog.fixedHolidays) rows.push([null, `${y}-${md}`, 'holiday', title, null]);
    rows.push(...academicEvents(y, uniSites));
  }
  for (const [date, title] of catalog.festivals) rows.push([null, date, 'festival', title, null]);
  const inRange = rows.filter((r) => r[1] >= isoDate(from) && r[1] <= isoDate(to));
  await insertMany(client, 'calendar_events', ['site_id', 'event_date', 'event_type', 'title', 'attendance_factor'], inRange);
  const bySite = new Map();
  for (const [siteId, date, type, , factor] of inRange) {
    const key = `${siteId ?? '*'}|${date}`;
    const cur = bySite.get(key) || { types: new Set(), factor: 1 };
    cur.types.add(type);
    if (factor) cur.factor = factor;
    bySite.set(key, cur);
  }
  return (siteId, date) => {
    const a = bySite.get(`*|${date}`);
    const b = bySite.get(`${siteId}|${date}`);
    return { types: new Set([...(a?.types || []), ...(b?.types || [])]), factor: b?.factor ?? a?.factor ?? 1 };
  };
}

function syntheticWeather(date, rng) {
  const d = parseDate(date);
  const doy = (d - new Date(d.getFullYear(), 0, 0)) / 86400000;
  const tempMax = 32 + 8 * Math.sin((2 * Math.PI * (doy - 80)) / 365) + rng.normal(0, 1.5);
  const monsoon = doy > 180 && doy < 270;
  return { tempMax, rainMm: monsoon && rng.chance(0.45) ? rng.between(2, 40) : rng.chance(0.05) ? rng.between(1, 10) : 0 };
}

function demandFor(site, slot, date, cal, wx, rng) {
  const dow = parseDate(date).getDay();
  let f = SLOT_RATE[slot] * DOW_FACTOR[dow] * cal.factor;
  if (cal.types.has('holiday')) f *= 0.6;
  if (cal.types.has('festival')) f *= slot === 'dinner' ? 0.7 : 0.55;
  if (cal.types.has('exam')) f *= { breakfast: 1.08, lunch: 1.04, snacks: 1.15, dinner: 1.1 }[slot];
  if (wx.rainMm > 10) f *= 1.05;
  if (wx.tempMax > 40 && slot === 'lunch') f *= 0.93;
  return Math.max(0, Math.round(site.headcount * f * rng.normal(1, 0.045)));
}

// Old practice: cook for enrolled headcount × slot rate + 20% buffer; only vacations are adjusted for.
const staticPlan = (site, slot, cal) => Math.round(site.headcount * SLOT_RATE[slot] * cal.factor * 1.2);

function isOpen(site, date, cal) {
  if (!site.weekdaysOnly) return true;
  const dow = parseDate(date).getDay();
  return dow !== 0 && dow !== 6 && !cal.types.has('holiday') && !cal.types.has('festival');
}

function mealRow(ctx, site, slot, date, goLive) {
  const cal = ctx.calendar(site.id, date);
  const wx = ctx.weather(site, date);
  const demand = demandFor(site, slot, date, cal, wx, ctx.rng);
  const planned = date >= goLive;
  const forecastPortions = planned ? Math.ceil(demand * ctx.rng.normal(1.05, 0.035)) : null;
  const prepared = planned ? Math.max(forecastPortions, Math.round(demand * 0.97)) : Math.max(staticPlan(site, slot, cal), Math.round(demand * 0.98));
  const served = Math.min(demand, prepared);
  const mealKg = ctx.mealKg(site, slot, date);
  const leftoverKg = +((prepared - served) * mealKg * 0.85).toFixed(1);
  const plateWaste = +(served * ctx.rng.normal(planned ? 0.022 : 0.03, 0.004)).toFixed(1);
  return [site.id, date, slot, demand, prepared, served, leftoverKg, Math.max(0, plateWaste), forecastPortions];
}

async function seedMealLogs(client, sites, ctx, historyDays, goLiveDays) {
  const today = new Date();
  const goLive = isoDate(addDays(today, -goLiveDays));
  const rows = [];
  for (let k = historyDays; k >= 0; k--) {
    const date = isoDate(addDays(today, -k));
    for (const site of sites) {
      if (!isOpen(site, date, ctx.calendar(site.id, date))) continue;
      for (const slot of site.slots) {
        if (k === 0 && today.getHours() < SLOT_END_HOUR[slot]) continue;
        rows.push(mealRow(ctx, site, slot, date, goLive));
      }
    }
  }
  return insertMany(client, 'meal_logs', ['site_id', 'log_date', 'meal_slot', 'headcount', 'prepared_portions', 'served_portions', 'leftover_kg', 'plate_waste_kg', 'forecast_portions'], rows, { returning: 'id, site_id, log_date, meal_slot, leftover_kg, served_portions, prepared_portions' });
}

async function seedMenuPlan(client, sites, menus, daysBack, daysAhead) {
  const rows = [];
  for (let k = -daysBack; k <= daysAhead; k++) {
    const d = addDays(new Date(), k);
    for (const site of sites) {
      for (const slot of site.slots) for (const name of catalog.menuRotation[slot][d.getDay()]) rows.push([site.id, isoDate(d), slot, menus[site.orgId][name].id]);
    }
  }
  await insertMany(client, 'menu_plan', ['site_id', 'plan_date', 'meal_slot', 'menu_item_id'], rows);
}

// Real Open-Meteo history where reachable; synthetic seasonal weather fills gaps and is stored too,
// so the forecaster later sees exactly the weather the demand was generated with.
async function loadWeather(sites, from, to, rng) {
  const cache = new Map();
  for (const s of sites) {
    const real = await weather.daily(s.lat, s.lng, isoDate(from), isoDate(to)).catch(() => new Map());
    const filled = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const day = isoDate(d);
      if (!real.has(day)) {
        const w = syntheticWeather(day, rng);
        real.set(day, w);
        filled.push({ day, tempMax: +w.tempMax.toFixed(1), tempMin: +(w.tempMax - 9).toFixed(1), rainMm: +w.rainMm.toFixed(1), source: 'synthetic' });
      }
    }
    if (filled.length) await weatherRepo.upsertMany(Math.round(s.lat * 10) / 10, Math.round(s.lng * 10) / 10, filled);
    cache.set(s.id, real);
  }
  return (site, date) => cache.get(site.id).get(date);
}

module.exports = { seedMenus, seedCalendar, seedMealLogs, seedMenuPlan, loadWeather, SLOT_RATE };
