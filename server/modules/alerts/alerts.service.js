const repo = require('./alerts.repository');
const { publish } = require('../../lib/eventBus');
const logger = require('../../lib/logger');
const { notFound } = require('../../lib/errors');

// Raise an alert once per (type, entityRef) while it stays open; pushes it to live clients.
async function raise(alert, client) {
  const row = await repo.insertIfNew(alert, client);
  if (row) {
    logger.info({ alertId: row.id, type: row.alert_type, severity: row.severity }, 'alert raised');
    publish('alert', row);
  }
  return row;
}

async function resolve(type, entityRef) {
  const rows = await repo.resolveByRef(type, entityRef);
  if (rows.length) publish('alert_resolved', { type, entityRef });
}

const list = (query, scope) => repo.list({ open: query.open === 'true', siteIds: scope.siteIds, limit: Math.min(Number(query.limit) || 100, 500) });

async function acknowledge(id, user) {
  const row = await repo.acknowledge(id, user.id);
  if (!row) throw notFound('Open alert');
  publish('alert_resolved', { id: row.id });
  return row;
}

const summary = (scope) => repo.countOpenBySeverity(scope.siteIds);

module.exports = { raise, resolve, list, acknowledge, summary };
