const db = require('../../lib/db');

const listAll = () => db.query('SELECT key, value, description, updated_at FROM settings ORDER BY key');
const findByKey = (key) => db.one('SELECT key, value FROM settings WHERE key = $1', [key]);
const update = (key, value) => db.one('UPDATE settings SET value = $2, updated_at = now() WHERE key = $1 RETURNING key, value, description, updated_at', [key, value]);

module.exports = { listAll, findByKey, update };
