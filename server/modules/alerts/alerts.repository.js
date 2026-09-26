const db = require('../../lib/db');

// ON CONFLICT on the partial unique index keeps one open alert per (type, entity).
const insertIfNew = (a, client) =>
  db.one(
    `INSERT INTO alerts (site_id, alert_type, severity, title, detail, entity_ref)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (alert_type, entity_ref) WHERE acknowledged_at IS NULL DO NOTHING
     RETURNING *`,
    [a.siteId || null, a.type, a.severity, a.title, a.detail || null, a.entityRef || null],
    client
  );

const list = ({ open, siteIds, limit }) =>
  db.query(
    `SELECT a.*, s.name AS site_name FROM alerts a LEFT JOIN sites s ON s.id = a.site_id
     WHERE ($1::bool IS NOT TRUE OR a.acknowledged_at IS NULL)
       AND ($2::int[] IS NULL OR a.site_id = ANY($2) OR a.site_id IS NULL)
     ORDER BY a.created_at DESC LIMIT $3`,
    [open, siteIds, limit]
  );

const acknowledge = (id, userId) =>
  db.one('UPDATE alerts SET acknowledged_at = now(), acknowledged_by = $2 WHERE id = $1 AND acknowledged_at IS NULL RETURNING *', [id, userId]);

const resolveByRef = (type, entityRef) =>
  db.query('UPDATE alerts SET acknowledged_at = now() WHERE alert_type = $1 AND entity_ref = $2 AND acknowledged_at IS NULL RETURNING id', [type, entityRef]);

const countOpenBySeverity = (siteIds) =>
  db.query(
    `SELECT severity, count(*)::int AS n FROM alerts WHERE acknowledged_at IS NULL
       AND ($1::int[] IS NULL OR site_id = ANY($1) OR site_id IS NULL) GROUP BY severity`,
    [siteIds]
  );

module.exports = { insertIfNew, list, acknowledge, resolveByRef, countOpenBySeverity };
