// Tamper-evident audit trail: every entry stores SHA-256(prev_hash + canonical entry).
// Editing or deleting any past row breaks the chain, which /api/audit/verify detects.
const crypto = require('crypto');
const db = require('../../lib/db');
const repo = require('./audit.repository');
const logger = require('../../lib/logger');

const GENESIS = '0'.repeat(64);

// JSONB reorders keys, so hash a key-sorted serialisation.
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

function digest(prevHash, e) {
  const canonical = stableStringify([e.occurredAt, e.actorId, e.action, e.entity, e.entityId, e.payload]);
  return crypto.createHash('sha256').update(prevHash + canonical).digest('hex');
}

async function appendWith(client, actor, action, entity, entityId, payload) {
  await repo.lockChain(client);
  const prev = await repo.lastHash(client);
  const entry = { occurredAt: new Date().toISOString(), actorId: actor?.id ?? null, action, entity, entityId: entityId == null ? null : String(entityId), payload: payload || {} };
  entry.prevHash = prev?.hash || GENESIS;
  entry.hash = digest(entry.prevHash, entry);
  await repo.insert(entry, client);
  return entry;
}

// Pass `client` to join an existing transaction; otherwise a dedicated one is used.
async function record(actor, action, entity, entityId, payload, client) {
  if (client) return appendWith(client, actor, action, entity, entityId, payload);
  return db.transaction((c) => appendWith(c, actor, action, entity, entityId, payload));
}

const list = (filters) => repo.list({ entity: filters.entity, limit: Math.min(Number(filters.limit) || 100, 500) });

async function verify() {
  const rows = await repo.allOrdered();
  let prev = GENESIS;
  for (const r of rows) {
    const entry = { occurredAt: new Date(r.occurred_at).toISOString(), actorId: r.actor_id, action: r.action, entity: r.entity, entityId: r.entity_id, payload: r.payload };
    if (r.prev_hash !== prev || digest(prev, entry) !== r.hash) {
      logger.warn({ auditId: r.id }, 'Audit chain broken');
      return { valid: false, checked: rows.length, brokenAt: r.id };
    }
    prev = r.hash;
  }
  return { valid: true, checked: rows.length, head: prev };
}

module.exports = { record, list, verify };
