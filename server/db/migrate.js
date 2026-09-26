// Creates the database if missing, applies schema.sql and inserts default settings. Idempotent.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../config');
const logger = require('../lib/logger');
const defaults = require('../config/defaultSettings');

async function ensureDatabase() {
  const url = new URL(config.databaseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!exists.rowCount) {
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
      logger.info({ dbName }, 'database created');
    }
  } finally {
    await admin.end();
  }
}

async function applySchema() {
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    for (const [key, { value, description }] of Object.entries(defaults)) {
      await client.query('INSERT INTO settings (key, value, description) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description', [key, value, description]);
    }
    logger.info('schema applied');
  } finally {
    await client.end();
  }
}

async function migrate() {
  await ensureDatabase();
  await applySchema();
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((err) => {
    logger.error({ err }, 'migration failed');
    process.exit(1);
  });
}

module.exports = { migrate };
