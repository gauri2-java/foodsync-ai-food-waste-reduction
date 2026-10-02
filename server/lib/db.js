const { Pool, types } = require('pg');
const config = require('../config');
const logger = require('./logger');

// Return NUMERIC and BIGINT as JS numbers; DATE as 'YYYY-MM-DD' strings.
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
types.setTypeParser(1082, (v) => v);

const isCloud = config.databaseUrl && (
  config.databaseUrl.includes('sslmode=require') ||
  config.databaseUrl.includes('render.com') ||
  config.databaseUrl.includes('supabase') ||
  config.databaseUrl.includes('neon.tech') ||
  process.env.NODE_ENV === 'production'
);

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 15,
  ssl: isCloud ? { rejectUnauthorized: false } : undefined
});
pool.on('error', (err) => logger.error({ err }, 'Postgres pool error'));

async function query(text, params = [], client = pool) {
  logger.debug({ sql: text.replace(/\s+/g, ' ').slice(0, 300) }, 'sql');
  const result = await client.query(text, params);
  return result.rows;
}

async function one(text, params, client) {
  const rows = await query(text, params, client);
  return rows[0] || null;
}

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, one, transaction };
