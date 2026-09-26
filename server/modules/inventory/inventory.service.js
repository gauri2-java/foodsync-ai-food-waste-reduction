const db = require('../../lib/db');
const repo = require('./inventory.repository');
const directory = require('../directory/directory.service');
const audit = require('../audit/audit.service');
const alerts = require('../alerts/alerts.service');
const settings = require('../settings/settings.service');
const { validate, oneOf } = require('../../lib/validate');
const { badRequest, notFound } = require('../../lib/errors');

const UNIT_TYPES = ['cold_room', 'freezer', 'dry_store', 'hot_holding', 'ambient'];

const listStorageUnits = (scope) => repo.listStorageUnits(scope.siteIds);

async function createStorageUnit(body, actor, scope) {
  const data = validate(body, { site_id: 'int', name: 'string', unit_type: 'string', min_temp_c: 'number?', max_temp_c: 'number?', max_humidity: 'number?' });
  oneOf(data.unit_type, UNIT_TYPES, 'unit_type');
  directory.assertSiteInScope(scope, data.site_id);
  const row = await repo.insertStorageUnit(data);
  await audit.record(actor, 'storage_unit.create', 'storage_unit', row.id, data);
  return row;
}

const listLots = (query, scope) => repo.listLots({ siteIds: query.siteId ? [Number(query.siteId)] : scope.siteIds, status: query.status });

async function receiveLot(body, actor, scope) {
  const data = validate(body, { site_id: 'int', ingredient_id: 'int', storage_unit_id: 'int?', lot_code: 'string', qty: 'number', received_at: 'date?', expires_at: 'date', supplier: 'string?' });
  directory.assertSiteInScope(scope, data.site_id);
  if (data.qty <= 0) throw badRequest('Quantity must be positive');
  if (new Date(data.expires_at) <= new Date(data.received_at || Date.now())) throw badRequest('Expiry must be after receipt');
  const lot = await repo.insertLot(data);
  await audit.record(actor, 'inventory.receive', 'inventory_lot', lot.id, data);
  return lot;
}

// Consume or discard stock from a lot (partial or full).
async function adjustLot(id, body, actor, scope) {
  const data = validate(body, { action: 'string', qty: 'number' });
  oneOf(data.action, ['consume', 'discard'], 'action');
  return db.transaction(async (client) => {
    const lot = await repo.findLot(id, client);
    if (!lot) throw notFound('Lot');
    directory.assertSiteInScope(scope, lot.site_id);
    if (lot.status !== 'available') throw badRequest(`Lot is already ${lot.status}`);
    if (data.qty <= 0 || data.qty > lot.qty) throw badRequest(`Quantity must be between 0 and ${lot.qty}`);
    const remaining = +(lot.qty - data.qty).toFixed(3);
    const status = remaining > 0 ? 'available' : data.action === 'consume' ? 'consumed' : 'discarded';
    const updated = await repo.updateLot(id, remaining, status, client);
    await audit.record(actor, `inventory.${data.action}`, 'inventory_lot', id, { qty: data.qty, remaining }, client);
    return updated;
  });
}

// Background job: alert on lots close to expiry so they are used first or redistributed.
async function scanExpiring() {
  const { nearExpiryHours } = await settings.get('inventory');
  const lots = await repo.expiringLots(nearExpiryHours);
  for (const lot of lots) {
    const expired = lot.hours_to_expiry <= 0;
    await alerts.raise({
      siteId: lot.site_id, type: expired ? 'lot_expired' : 'near_expiry', severity: expired || lot.hours_to_expiry < 12 ? 'critical' : 'warning',
      title: expired ? `${lot.ingredient} lot ${lot.lot_code} has expired` : `${lot.ingredient} (${lot.qty} ${lot.unit}) expires in ${Math.round(lot.hours_to_expiry)} h`,
      detail: expired ? 'Remove from use; route to compost/biogas.' : 'Use first in upcoming menus (FEFO) or list as surplus for redistribution.',
      entityRef: `lot:${lot.id}`,
    });
  }
  return lots.length;
}

module.exports = { listStorageUnits, createStorageUnit, listLots, receiveLot, adjustLot, scanExpiring, availableLots: repo.availableLots, findLot: repo.findLot, updateLot: repo.updateLot };
