const db = require('../../lib/db');

const lastHash = (client) => db.one('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE', [], client);
const lockChain = (client) => db.query('SELECT pg_advisory_xact_lock(424242)', [], client);

const insert = (e, client) =>
  db.one(
    `INSERT INTO audit_log (occurred_at, actor_id, action, entity, entity_id, payload, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [e.occurredAt, e.actorId, e.action, e.entity, e.entityId, e.payload, e.prevHash, e.hash],
    client
  );

const list = ({ entity, limit }) =>
  db.query(
    `SELECT a.*, u.full_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE ($1::text IS NULL OR a.entity = $1) ORDER BY a.id DESC LIMIT $2`,
    [entity || null, limit]
  );

const allOrdered = () => db.query('SELECT id, occurred_at, actor_id, action, entity, entity_id, payload, prev_hash, hash FROM audit_log ORDER BY id');

module.exports = { lastHash, lockChain, insert, list, allOrdered };
