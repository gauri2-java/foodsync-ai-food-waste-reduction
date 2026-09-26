const db = require('../../lib/db');
const repo = require('./kitchen.repository');
const directory = require('../directory/directory.service');
const audit = require('../audit/audit.service');
const alerts = require('../alerts/alerts.service');
const settings = require('../settings/settings.service');
const { publish } = require('../../lib/eventBus');
const { validate, oneOf } = require('../../lib/validate');
const { badRequest, notFound } = require('../../lib/errors');
const { isoDate, addDays } = require('../../lib/time');

const MEAL_SLOTS = ['breakfast', 'lunch', 'snacks', 'dinner'];

const listMenuItems = (scope) => repo.listMenuItems(scope.orgId);

async function createMenuItem(body, actor, scope) {
  const data = validate(body, { name: 'string', category_code: 'string', portion_kg: 'number', recipe: 'array', org_id: 'int?' });
  const orgId = scope.orgId || data.org_id;
  if (!orgId) throw badRequest('org_id is required');
  for (const line of data.recipe) validate(line, { ingredient_id: 'int', qty_per_portion: 'number' });
  const item = await db.transaction(async (client) => {
    const row = await repo.insertMenuItem({ ...data, org_id: orgId }, client);
    for (const line of data.recipe) await repo.insertRecipeLine(row.id, line, client);
    await audit.record(actor, 'menu_item.create', 'menu_item', row.id, { name: row.name }, client);
    return row;
  });
  return item;
}

function listMenuPlan(query, scope) {
  directory.assertSiteInScope(scope, query.siteId);
  const from = query.from || isoDate(new Date());
  return repo.listMenuPlan(Number(query.siteId), from, query.to || isoDate(addDays(from, 7)));
}

async function saveMenuPlan(body, actor, scope) {
  const data = validate(body, { site_id: 'int', plan_date: 'date', meal_slot: 'string', menu_item_id: 'int', planned_portions: 'int?' });
  oneOf(data.meal_slot, MEAL_SLOTS, 'meal_slot');
  directory.assertSiteInScope(scope, data.site_id);
  const row = await repo.upsertMenuPlan(data);
  await audit.record(actor, 'menu_plan.save', 'menu_plan', row.id, data);
  return row;
}

async function deleteMenuPlan(id, actor, scope) {
  const row = await repo.deleteMenuPlan(id);
  if (!row) throw notFound('Menu plan entry');
  directory.assertSiteInScope(scope, row.site_id);
  await audit.record(actor, 'menu_plan.delete', 'menu_plan', id, {});
  return row;
}

function listMealLogs(query, scope) {
  directory.assertSiteInScope(scope, query.siteId);
  return repo.listMealLogs(Number(query.siteId), query.from || isoDate(addDays(new Date(), -30)), query.to || isoDate(new Date()));
}

async function flagOverproduction(log) {
  const cfg = await settings.get('processing');
  const overPct = log.prepared_portions > 0 ? (100 * (log.prepared_portions - log.served_portions)) / log.prepared_portions : 0;
  if (overPct > cfg.overproductionWarnPct) {
    await alerts.raise({
      siteId: log.site_id, type: 'overproduction', severity: overPct > 2 * cfg.overproductionWarnPct ? 'critical' : 'warning',
      title: `${overPct.toFixed(0)}% overproduction at ${log.meal_slot} (${log.log_date})`,
      detail: `Prepared ${log.prepared_portions}, served ${log.served_portions}. Use the forecast plan for the next service.`,
      entityRef: `meal_log:${log.id}`,
    });
  }
  return +overPct.toFixed(1);
}

async function recordMealLog(body, actor, scope) {
  const data = validate(body, {
    site_id: 'int', log_date: 'date', meal_slot: 'string', headcount: 'int', prepared_portions: 'int', served_portions: 'int',
    leftover_kg: 'number?', plate_waste_kg: 'number?', forecast_portions: 'int?',
  });
  oneOf(data.meal_slot, MEAL_SLOTS, 'meal_slot');
  directory.assertSiteInScope(scope, data.site_id);
  if (data.served_portions > data.prepared_portions) throw badRequest('Served portions cannot exceed prepared portions');
  const log = await repo.upsertMealLog({ ...data, created_by: actor.id });
  await audit.record(actor, 'meal_log.record', 'meal_log', log.id, data);
  const overproductionPct = await flagOverproduction(log);
  publish('meal_log', { siteId: log.site_id, date: log.log_date, slot: log.meal_slot });
  return { ...log, overproductionPct };
}

async function wasteTrend(query, scope) {
  const days = Math.min(Number(query.days) || 90, 365);
  const siteIds = query.siteId ? [Number(query.siteId)] : scope.siteIds;
  if (query.siteId) directory.assertSiteInScope(scope, query.siteId);
  return repo.wasteTrend(siteIds, isoDate(addDays(new Date(), -days)));
}

module.exports = {
  MEAL_SLOTS, listMenuItems, createMenuItem, listMenuPlan, saveMenuPlan, deleteMenuPlan,
  listMealLogs, recordMealLog, wasteTrend, findMealLog: repo.findMealLog,
};
