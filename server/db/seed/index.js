// `npm run db:seed` — resets and populates a demo deployment. Safe to re-run (it truncates first).
const fs = require('fs');
const path = require('path');
const db = require('../../lib/db');
const logger = require('../../lib/logger');
const { migrate } = require('../migrate');
const { createRng } = require('./rng');
const catalog = require('./catalog');
const { seedOrganizations } = require('./organizations');
const kitchens = require('./kitchens');
const facilities = require('./facilities');
const { seedPlant } = require('./plant');
const { seedRedistribution, seedPlantSurplus } = require('./redistribution');
const audit = require('../../modules/audit/audit.service');
const forecastJob = require('../../jobs/forecastJob');
const { isoDate, addDays } = require('../../lib/time');

const HISTORY_DAYS = Number(process.env.SEED_HISTORY_DAYS || 210);
const GO_LIVE_DAYS = Number(process.env.SEED_GO_LIVE_DAYS || 60);
const CENTER = { lat: Number(process.env.SEED_CITY_LAT || 28.6139), lng: Number(process.env.SEED_CITY_LNG || 77.209) };
const PASSWORD = process.env.SEED_PASSWORD || 'FoodSync@123';
const DEVICE_FILE = path.join(__dirname, '../../../simulator/devices.local.json');

const TABLES = ['audit_log', 'alerts', 'trip_stops', 'trips', 'vehicles', 'surplus_offers', 'quality_inspections', 'quality_models', 'surplus_listings',
  'downtime_events', 'production_runs', 'machines', 'production_lines', 'products', 'sensor_readings', 'devices', 'inventory_lots', 'storage_units',
  'forecasts', 'forecast_models', 'meal_logs', 'menu_plan', 'recipe_lines', 'menu_items', 'ingredients', 'calendar_events', 'users', 'sites', 'organizations', 'food_categories'];

async function seedReference(client) {
  for (const c of catalog.categories) await client.query('INSERT INTO food_categories VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', c);
  for (const [name, unit, cat, cost] of catalog.ingredients) await client.query('INSERT INTO ingredients (name, unit, category_code, unit_cost) VALUES ($1,$2,$3,$4)', [name, unit, cat, cost]);
}

async function kitchenSites(client, ids) {
  const rows = (await client.query("SELECT id, org_id, enrolled_headcount, lat, lng, name FROM sites WHERE site_type = 'kitchen'")).rows;
  return rows.map((s) => ({
    id: s.id, orgId: s.org_id, headcount: s.enrolled_headcount, lat: s.lat, lng: s.lng, name: s.name,
    weekdaysOnly: s.org_id === ids.orgs.corp,
    slots: s.org_id === ids.orgs.corp ? ['breakfast', 'lunch', 'snacks'] : ['breakfast', 'lunch', 'snacks', 'dinner'],
  }));
}

function dailyIngredientUse(site) {
  const use = new Map();
  for (const slot of site.slots) {
    for (const day of catalog.menuRotation[slot]) {
      for (const itemName of day) {
        const item = catalog.menuItems.find((m) => m.name === itemName);
        for (const [ing, qty] of Object.entries(item.recipe)) use.set(ing, (use.get(ing) || 0) + (qty * site.headcount * kitchens.SLOT_RATE[slot]) / 7);
      }
    }
  }
  return use;
}

function mealKgFn() {
  const kg = (names) => names.reduce((s, n) => s + catalog.menuItems.find((m) => m.name === n).portionKg, 0);
  return (site, slot, date) => kg(catalog.menuRotation[slot][new Date(`${date}T00:00:00`).getDay()]);
}

async function seedKitchens(client, ids, rng) {
  const sites = await kitchenSites(client, ids);
  const from = addDays(new Date(), -HISTORY_DAYS);
  const to = addDays(new Date(), 30);
  const menus = await kitchens.seedMenus(client, [ids.orgs.uni, ids.orgs.corp]);
  const calendar = await kitchens.seedCalendar(client, from, to, [ids.sites.k1, ids.sites.k2]);
  const weather = await kitchens.loadWeather(sites, from, addDays(new Date(), 7), rng);
  const logs = await kitchens.seedMealLogs(client, sites, { rng, calendar, weather, mealKg: mealKgFn() }, HISTORY_DAYS, GO_LIVE_DAYS);
  await kitchens.seedMenuPlan(client, sites, menus, 1, 14);
  return { sites, logs };
}

async function seedFacilities(client, ids, sites, rng) {
  const devices = [];
  for (const key of ['k1', 'k2', 'k3']) {
    const s = sites.find((x) => x.id === ids.sites[key]);
    const unitIds = await facilities.seedStorage(client, s.id, key, facilities.KITCHEN_UNITS, rng, devices);
    await facilities.seedLots(client, s.id, key, unitIds, dailyIngredientUse(s), rng);
  }
  await facilities.seedStorage(client, ids.sites.plant, 'plant', facilities.PLANT_UNITS, rng, devices);
  return devices;
}

async function redistributionContext(client, rng) {
  const recipients = (await client.query(`SELECT s.*, o.org_type FROM sites s JOIN organizations o ON o.id = s.org_id WHERE o.verified AND o.org_type IN ('ngo','buyer')`)).rows;
  const allSites = (await client.query('SELECT * FROM sites')).rows;
  return {
    rng,
    ngos: recipients.filter((r) => r.org_type === 'ngo'),
    buyers: recipients.filter((r) => r.org_type === 'buyer'),
    vehicles: (await client.query('SELECT id FROM vehicles')).rows,
    siteById: new Map(allSites.map((s) => [s.id, s])),
  };
}

async function run() {
  await migrate();
  const rng = createRng(Number(process.env.SEED_RANDOM || 20260926));
  const client = await db.pool.connect();
  try {
    await client.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await seedReference(client);
    const ids = await seedOrganizations(client, CENTER, PASSWORD);
    const { sites, logs } = await seedKitchens(client, ids, rng);
    logger.info({ mealLogs: logs.length }, 'kitchen history seeded');
    const devices = await seedFacilities(client, ids, sites, rng);
    const runsByProduct = await seedPlant(client, ids, rng, devices, 180);
    const ctx = await redistributionContext(client, rng);
    const listings = await seedRedistribution(client, ctx, logs, isoDate(addDays(new Date(), -GO_LIVE_DAYS)));
    const plantListings = await seedPlantSurplus(client, ctx, runsByProduct, ctx.siteById.get(ids.sites.plant));
    logger.info({ listings, plantListings, devices: devices.length }, 'operations history seeded');
    fs.mkdirSync(path.dirname(DEVICE_FILE), { recursive: true });
    fs.writeFileSync(DEVICE_FILE, JSON.stringify(devices, null, 2));
  } finally {
    client.release();
  }
  await audit.record(null, 'system.seed', 'system', null, { historyDays: HISTORY_DAYS, goLiveDays: GO_LIVE_DAYS });
  logger.info('training demand forecast models…');
  await forecastJob.retrainAll();
  logger.info({ password: '(from SEED_PASSWORD)', admin: 'admin@foodsync.local' }, 'seed complete');
}

run().then(() => db.pool.end()).catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
