const repo = require('./processing.repository');
const { runKpis } = require('./kpi.service');
const directory = require('../directory/directory.service');
const settings = require('../settings/settings.service');
const alerts = require('../alerts/alerts.service');
const audit = require('../audit/audit.service');
const { publish } = require('../../lib/eventBus');
const { validate, oneOf } = require('../../lib/validate');
const { badRequest, notFound } = require('../../lib/errors');
const { isoDate, addDays } = require('../../lib/time');

const DOWNTIME_REASONS = ['breakdown', 'changeover', 'no_material', 'cleaning', 'power_failure', 'quality_hold', 'other'];

const listProducts = (scope) => repo.listProducts(scope.orgId);

async function createProduct(body, actor, scope) {
  const data = validate(body, { name: 'string', category_code: 'string', raw_material_id: 'int?', std_yield_pct: 'number', std_energy_kwh_per_kg: 'number', unit_price: 'number', org_id: 'int?' });
  const row = await repo.insertProduct({ ...data, org_id: scope.orgId || data.org_id });
  await audit.record(actor, 'product.create', 'product', row.id, data);
  return row;
}

const listLines = (scope) => repo.listLines(scope.siteIds);

async function createLine(body, actor, scope) {
  const data = validate(body, { site_id: 'int', name: 'string', rated_kgph: 'number' });
  directory.assertSiteInScope(scope, data.site_id);
  const row = await repo.insertLine(data);
  await audit.record(actor, 'line.create', 'production_line', row.id, data);
  return row;
}

async function createMachine(body, actor, scope) {
  const data = validate(body, { line_id: 'int', name: 'string', machine_type: 'string', rated_kw: 'number' });
  const line = await repo.findLine(data.line_id);
  if (!line) throw notFound('Line');
  directory.assertSiteInScope(scope, line.site_id);
  const row = await repo.insertMachine(data);
  await audit.record(actor, 'machine.create', 'machine', row.id, data);
  return row;
}

function listRuns(query, scope) {
  const from = isoDate(addDays(new Date(), -(Math.min(Number(query.days) || 30, 365))));
  return repo.listRuns(scope.siteIds, from, Math.min(Number(query.limit) || 200, 2000));
}

async function checkRun(run, line, actor) {
  const cfg = await settings.get('processing');
  const k = runKpis({ ...run, rated_kgph: line.rated_kgph });
  if (k.scrapPct > cfg.scrapWarnPct) {
    await alerts.raise({ siteId: line.site_id, type: 'high_scrap', severity: 'warning', title: `${line.name}: ${k.scrapPct.toFixed(1)}% scrap on ${run.run_date}`, detail: 'Check raw-material grade, blade/sieve wear and operator settings.', entityRef: `run:${run.id}` });
  }
  if (k.overproductionPct > cfg.overproductionWarnPct) {
    await alerts.raise({ siteId: line.site_id, type: 'overproduction', severity: 'warning', title: `${line.name}: ${Math.round(k.overproductionKg)} kg produced beyond demand`, detail: 'List the excess as surplus for secondary buyers or NGOs, and use the product demand forecast for tomorrow’s plan.', entityRef: `run:${run.id}` });
  }
  await audit.record(actor, 'production_run.record', 'production_run', run.id, { yieldPct: +k.yieldPct.toFixed(2), oee: +k.oee.toFixed(3) });
  return k;
}

async function recordRun(body, actor, scope) {
  const data = validate(body, {
    line_id: 'int', product_id: 'int', run_date: 'date', planned_output_kg: 'number', input_kg: 'number', output_kg: 'number', scrap_kg: 'number',
    dispatched_kg: 'number?', planned_minutes: 'int', run_minutes: 'int', energy_kwh: 'number',
  });
  const line = await repo.findLine(data.line_id);
  if (!line) throw notFound('Line');
  directory.assertSiteInScope(scope, line.site_id);
  if (data.output_kg + data.scrap_kg > data.input_kg * 1.001) throw badRequest('Output + scrap cannot exceed input (mass balance)');
  if (data.run_minutes > data.planned_minutes) throw badRequest('Run minutes cannot exceed planned minutes');
  const run = await repo.insertRun(data);
  const kpi = await checkRun(run, line, actor);
  publish('production', { lineId: line.id, runId: run.id });
  return { ...run, kpi };
}

const listDowntime = (query, scope) => repo.downtime(scope.siteIds, isoDate(addDays(new Date(), -(Number(query.days) || 30))));

async function recordDowntime(body, actor, scope) {
  const data = validate(body, { machine_id: 'int', started_at: 'date', ended_at: 'date?', reason: 'string', notes: 'string?' });
  oneOf(data.reason, DOWNTIME_REASONS, 'reason');
  const machine = await repo.findMachine(data.machine_id);
  if (!machine) throw notFound('Machine');
  directory.assertSiteInScope(scope, machine.site_id);
  const row = await repo.insertDowntime(data);
  if (!data.ended_at) await alerts.raise({ siteId: machine.site_id, type: 'machine_down', severity: data.reason === 'breakdown' ? 'critical' : 'info', title: `${machine.name} stopped: ${data.reason.replace('_', ' ')}`, detail: data.notes, entityRef: `downtime:${row.id}` });
  await audit.record(actor, 'downtime.record', 'downtime', row.id, data);
  return row;
}

async function closeDowntime(id, actor) {
  const row = await repo.closeDowntime(id);
  if (!row) throw notFound('Open downtime event');
  await alerts.resolve('machine_down', `downtime:${id}`);
  await audit.record(actor, 'downtime.close', 'downtime', id, {});
  return row;
}

module.exports = { listProducts, createProduct, listLines, createLine, createMachine, listRuns, recordRun, listDowntime, recordDowntime, closeDowntime, findRun: repo.findRun };
