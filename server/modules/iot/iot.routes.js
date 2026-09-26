const controller = require('./iot.controller');
const { requireRole } = require('../../middleware/auth');

// Device ingest uses its own API-key auth, so it is mounted before user authentication.
const ingestRouter = require('express').Router();
ingestRouter.post('/ingest', controller.ingest);

const router = require('express').Router();
router.get('/devices', controller.listDevices);
router.post('/devices', requireRole('kitchen_manager', 'plant_manager'), controller.registerDevice);
router.get('/devices/:id/series', controller.series);
router.get('/latest', controller.latest);

module.exports = { router, ingestRouter };
