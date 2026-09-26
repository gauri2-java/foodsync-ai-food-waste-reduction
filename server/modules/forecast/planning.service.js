// Turns demand forecasts into (1) how many portions to cook per service and (2) what raw material
// to buy, netting planned consumption against current stock in FEFO order.
const repo = require('./planning.repository');
const forecastService = require('./forecast.service');
const inventory = require('../inventory/inventory.service');
const settings = require('../settings/settings.service');
const directory = require('../directory/directory.service');
const { isoDate, addDays } = require('../../lib/time');

function groupMenu(rows) {
  const byService = new Map();
  for (const r of rows) {
    const key = `${r.date}|${r.slot}`;
    if (!byService.has(key)) byService.set(key, new Map());
    const items = byService.get(key);
    if (!items.has(r.menu_item_id)) items.set(r.menu_item_id, { menuItemId: r.menu_item_id, name: r.menu_item, portionKg: r.portion_kg, recipe: [] });
    items.get(r.menu_item_id).recipe.push({ ingredientId: r.ingredient_id, ingredient: r.ingredient, unit: r.unit, unitCost: r.unit_cost, perPortion: r.qty_per_portion });
  }
  return byService;
}

function planService(p, slot, menuItems, ratio, bufferPct) {
  const recommended = Math.ceil(p.upper * (1 + bufferPct / 100));
  const staticPractice = ratio ? Math.round(p.predicted * ratio) : null;
  const items = menuItems.map((m) => ({
    ...m,
    portions: recommended,
    cookKg: +(recommended * m.portionKg).toFixed(1),
    ingredients: m.recipe.map((r) => ({ ...r, qty: +(r.perPortion * recommended).toFixed(3) })),
  }));
  const costPerPortion = menuItems.reduce((s, m) => s + m.recipe.reduce((a, r) => a + r.perPortion * r.unitCost, 0), 0);
  const avoided = staticPractice ? Math.max(0, staticPractice - recommended) : 0;
  return {
    date: p.date, slot, predicted: p.predicted, lower: p.lower, upper: p.upper, recommended, staticPractice,
    avoidedPortions: avoided, avoidedCost: +(avoided * costPerPortion).toFixed(0),
    avoidedKg: +(avoided * menuItems.reduce((s, m) => s + m.portionKg, 0)).toFixed(1),
    drivers: p.drivers, items, hasMenu: menuItems.length > 0,
  };
}

function aggregateNeeds(services) {
  const needs = new Map();
  for (const s of services) {
    for (const item of s.items) {
      for (const ing of item.ingredients) {
        const cur = needs.get(ing.ingredientId) || { ingredientId: ing.ingredientId, ingredient: ing.ingredient, unit: ing.unit, unitCost: ing.unitCost, byDate: new Map() };
        cur.byDate.set(s.date, (cur.byDate.get(s.date) || 0) + ing.qty);
        needs.set(ing.ingredientId, cur);
      }
    }
  }
  return needs;
}

// Simulate FEFO consumption day by day; report shortfalls (buy) and stock expiring unused (surplus risk).
function netAgainstStock(needs, lots) {
  const stock = lots.map((l) => ({ ...l, left: l.qty }));
  const lines = [];
  for (const need of needs.values()) {
    let shortfall = 0;
    let firstShortDate = null;
    const dates = [...need.byDate.keys()].sort();
    for (const date of dates) {
      let qty = need.byDate.get(date);
      for (const lot of stock.filter((l) => l.ingredient_id === need.ingredientId && isoDate(l.expires_at) > date && l.left > 0)) {
        const take = Math.min(lot.left, qty);
        lot.left -= take;
        qty -= take;
        if (qty <= 0) break;
      }
      if (qty > 1e-6) {
        shortfall += qty;
        firstShortDate = firstShortDate || date;
      }
    }
    const required = dates.reduce((s, d) => s + need.byDate.get(d), 0);
    lines.push({ ingredientId: need.ingredientId, ingredient: need.ingredient, unit: need.unit, required: +required.toFixed(2), toBuy: +shortfall.toFixed(2), buyBy: firstShortDate, estCost: +(shortfall * need.unitCost).toFixed(0) });
  }
  const expiringUnused = stock.filter((l) => l.left > 0.01 && new Date(l.expires_at) < addDays(new Date(), 3)).map((l) => ({ lotId: l.id, ingredientId: l.ingredient_id, qtyLeft: +l.left.toFixed(2), expiresAt: l.expires_at }));
  return { lines: lines.sort((a, b) => b.toBuy - a.toBuy), expiringUnused };
}

async function productionPlan(siteId, scope) {
  directory.assertSiteInScope(scope, siteId);
  const cfg = await settings.get('forecast');
  const forecasts = await forecastService.kitchenForecast(siteId, scope);
  const today = isoDate(new Date());
  const to = isoDate(addDays(new Date(), cfg.horizonDays));
  const [menuRows, ratios, lots] = await Promise.all([repo.menuWithRecipes(siteId, today, to), repo.practiceRatios(siteId, 90), inventory.availableLots(siteId, today)]);
  const menu = groupMenu(menuRows);
  const ratioBySlot = new Map(ratios.map((r) => [r.meal_slot, r.ratio]));
  const services = [];
  for (const f of forecasts.filter((x) => !x.error)) {
    for (const p of f.predictions.filter((x) => isoDate(x.date) >= today)) {
      const date = isoDate(p.date);
      const items = [...(menu.get(`${date}|${f.slot}`)?.values() || [])];
      services.push(planService({ ...p, date }, f.slot, items, ratioBySlot.get(f.slot), cfg.cookBufferPct));
    }
  }
  services.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
  const procurement = netAgainstStock(aggregateNeeds(services), lots);
  return { siteId, generatedAt: new Date().toISOString(), models: forecasts.map((f) => ({ slot: f.slot, error: f.error, ...(f.model || {}) })), services, procurement };
}

module.exports = { productionPlan };
