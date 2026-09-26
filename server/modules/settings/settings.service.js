const repo = require('./settings.repository');
const defaults = require('../../config/defaultSettings');
const audit = require('../audit/audit.service');
const { notFound, badRequest } = require('../../lib/errors');

const cache = new Map();
const CACHE_MS = 30000;

// Live value merged over defaults so newly added keys work before an admin saves them.
async function get(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const row = await repo.findByKey(key);
  const value = { ...(defaults[key]?.value || {}), ...(row?.value || {}) };
  cache.set(key, { value, at: Date.now() });
  return value;
}

const list = () => repo.listAll();

async function update(key, value, actor) {
  if (!defaults[key]) throw notFound(`Setting '${key}'`);
  if (typeof value !== 'object' || Array.isArray(value)) throw badRequest('value must be an object');
  const saved = await repo.update(key, value);
  if (!saved) throw notFound(`Setting '${key}'`);
  cache.delete(key);
  await audit.record(actor, 'settings.update', 'settings', key, value);
  return saved;
}

module.exports = { get, list, update };
