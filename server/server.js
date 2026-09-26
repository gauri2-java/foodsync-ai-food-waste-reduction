const config = require('./config');
const logger = require('./lib/logger');
const db = require('./lib/db');
const { buildApp } = require('./app');
const scheduler = require('./jobs/scheduler');

async function main() {
  await db.query('SELECT 1');
  const app = buildApp();
  const server = app.listen(config.port, () => logger.info({ port: config.port, url: `http://localhost:${config.port}` }, 'FoodSync server started'));
  scheduler.start();
  const shutdown = () => {
    logger.info('shutting down');
    server.close(() => db.pool.end().then(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start — check DATABASE_URL in .env and run `npm run db:setup`');
  process.exit(1);
});
