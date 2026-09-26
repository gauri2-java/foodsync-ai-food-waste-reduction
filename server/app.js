const path = require('path');
const express = require('express');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const attachScope = require('./middleware/scope');
const { authenticate } = require('./middleware/auth');
const db = require('./lib/db');

const iotRoutes = require('./modules/iot/iot.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // Public endpoints
  app.get('/api/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  });
  app.use('/api/auth', require('./modules/auth/auth.routes'));
  app.use('/api/public', dashboardRoutes.publicRouter);
  app.use('/api/iot', iotRoutes.ingestRouter);

  // Authenticated API
  const api = express.Router();
  api.use(authenticate, attachScope);
  api.use('/directory', require('./modules/directory/directory.routes'));
  api.use('/reference', require('./modules/reference/reference.routes'));
  api.use('/settings', require('./modules/settings/settings.routes'));
  api.use('/kitchen', require('./modules/kitchen/kitchen.routes'));
  api.use('/forecast', require('./modules/forecast/forecast.routes'));
  api.use('/inventory', require('./modules/inventory/inventory.routes'));
  api.use('/iot', iotRoutes.router);
  api.use('/quality', require('./modules/quality/quality.routes'));
  api.use('/surplus', require('./modules/surplus/surplus.routes'));
  api.use('/logistics', require('./modules/logistics/logistics.routes'));
  api.use('/processing', require('./modules/processing/processing.routes'));
  api.use('/sustainability', require('./modules/sustainability/sustainability.routes'));
  api.use('/alerts', require('./modules/alerts/alerts.routes'));
  api.use('/audit', require('./modules/audit/audit.routes'));
  api.use('/dashboard', dashboardRoutes.router);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: `No API route ${req.method} ${req.path}` }));

  // Static front-end, vendor libraries and uploaded inspection images
  const root = path.join(__dirname, '..');
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));
  app.use('/vendor/chart.js', express.static(path.join(root, 'node_modules/chart.js/dist')));
  app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules/leaflet/dist')));
  app.use('/vendor/markercluster', express.static(path.join(root, 'node_modules/leaflet.markercluster/dist')));
  app.use(express.static(path.join(root, 'client')));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(root, 'client/index.html')));

  app.use(errorHandler);
  return app;
}

module.exports = { buildApp };
