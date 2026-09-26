const db = require('../../lib/db');
const repo = require('./surplus.repository');
const matchingService = require('./matching.service');
const directory = require('../directory/directory.service');
const quality = require('../quality/quality.service');
const kitchen = require('../kitchen/kitchen.service');
const inventory = require('../inventory/inventory.service');
const audit = require('../audit/audit.service');
const { validate } = require('../../lib/validate');
const { badRequest, notFound } = require('../../lib/errors');
const { hoursBetween } = require('../../lib/time');

const SOURCE_SPEC = {
  site_id: 'int', title: 'string', category_code: 'string', quantity_kg: 'number', portions: 'int?', prepared_at: 'date?',
  food_temp_c: 'number?', storage_unit_id: 'int?', meal_log_id: 'int?', lot_id: 'int?', production_run_id: 'int?',
};

// Links the listing to its origin record and fills defaults from it.
async function resolveSource(data, scope) {
  if (data.meal_log_id) {
    const log = await kitchen.findMealLog(data.meal_log_id);
    if (!log || log.site_id !== data.site_id) throw badRequest('Meal log does not belong to this site');
  }
  if (data.lot_id) {
    const lot = await inventory.findLot(data.lot_id);
    if (!lot) throw notFound('Lot');
    directory.assertSiteInScope(scope, lot.site_id);
    if (data.quantity_kg > lot.qty) throw badRequest(`Lot has only ${lot.qty} ${lot.unit}`);
    return { lot, safeUntilOverride: new Date(lot.expires_at) };
  }
  return {};
}

async function createListing(body, actor, scope) {
  const data = validate(body, SOURCE_SPEC);
  directory.assertSiteInScope(scope, data.site_id);
  if (data.quantity_kg <= 0) throw badRequest('Quantity must be positive');
  const preparedAt = data.prepared_at ? new Date(data.prepared_at) : new Date();
  const source = await resolveSource(data, scope);
  const est = await quality.estimate({ categoryCode: data.category_code, hoursSincePrep: Math.max(0, hoursBetween(preparedAt, new Date())), foodTempC: data.food_temp_c, storageUnitId: data.storage_unit_id });
  const kineticUntil = new Date(Date.now() + est.scwHours * 3600000);
  const safeUntil = source.safeUntilOverride && source.safeUntilOverride < kineticUntil ? source.safeUntilOverride : kineticUntil;
  if (safeUntil <= new Date()) throw badRequest('This food is already past its safe consumption window — route it to compost instead');
  const listing = await db.transaction(async (client) => {
    const row = await repo.insertListing({ ...data, prepared_at: preparedAt.toISOString(), safe_until: safeUntil.toISOString(), freshness_score: est.freshnessScore, created_by: actor.id }, client);
    if (source.lot) await inventory.updateLot(source.lot.id, +(source.lot.qty - data.quantity_kg).toFixed(3), source.lot.qty - data.quantity_kg > 0 ? 'available' : 'listed_surplus', client);
    await audit.record(actor, 'surplus.create', 'surplus', row.id, { title: row.title, kg: row.quantity_kg, safeUntil: row.safe_until, scwVerdict: est.verdict }, client);
    return row;
  });
  const matched = await matchingService.matchAndOffer(listing.id, actor);
  return { ...matched, estimate: { scwHours: est.scwHours, verdict: est.verdict, freshnessScore: est.freshnessScore, explanation: est.explanation } };
}

function list(query, scope) {
  const status = query.status ? String(query.status).split(',') : null;
  return repo.listListings({ siteIds: scope.siteIds, status, limit: Math.min(Number(query.limit) || 100, 300) });
}

async function detail(id, scope) {
  const listing = await repo.findListing(id);
  if (!listing) throw notFound('Surplus listing');
  const offers = await repo.offersForListing(id);
  const visible = !scope.siteIds || scope.siteIds.includes(listing.site_id) || scope.siteIds.includes(listing.assigned_site_id) || offers.some((o) => scope.siteIds.includes(o.recipient_site_id));
  if (!visible) throw notFound('Surplus listing');
  return { ...listing, offers };
}

// Re-inspection with photo/sensors tightens (or relaxes) the safe window and may reroute to compost.
async function inspect(id, body, file, actor, scope) {
  const listing = await repo.findListing(id);
  if (!listing) throw notFound('Surplus listing');
  directory.assertSiteInScope(scope, listing.site_id);
  const hoursSincePrep = Math.max(0, hoursBetween(listing.prepared_at, new Date()));
  const inspection = await quality.inspect(body, file, actor, { surplusId: id, categoryCode: listing.category_code, hoursSincePrep });
  const safeUntil = new Date(Date.now() + inspection.scw_hours * 3600000);
  await repo.updateListing(id, { safe_until: safeUntil.toISOString(), freshness_score: inspection.freshness_score });
  if (['open', 'offered'].includes(listing.status) && ['degraded', 'unsafe'].includes(inspection.verdict)) {
    await repo.supersedePending(id);
    await repo.updateListing(id, { status: 'open' });
    await matchingService.matchAndOffer(id, actor);
  }
  return inspection;
}

async function cancel(id, actor, scope) {
  const listing = await repo.findListing(id);
  if (!listing) throw notFound('Surplus listing');
  directory.assertSiteInScope(scope, listing.site_id);
  if (['in_transit', 'delivered'].includes(listing.status)) throw badRequest(`Cannot cancel a listing that is ${listing.status}`);
  const row = await repo.updateListing(id, { status: 'cancelled' });
  await audit.record(actor, 'surplus.cancel', 'surplus', id, {});
  return row;
}

module.exports = { createListing, list, detail, inspect, cancel };
