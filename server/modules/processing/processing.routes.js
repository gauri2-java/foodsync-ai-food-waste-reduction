const router = require('express').Router();
const controller = require('./processing.controller');
const { requireRole } = require('../../middleware/auth');

const PLANT = ['plant_manager'];
const VIEWERS = ['plant_manager', 'auditor', 'quality_officer'];

router.get('/overview', requireRole(...VIEWERS), controller.overview);
router.get('/anomalies', requireRole(...VIEWERS), controller.anomalies);
router.get('/products', controller.listProducts);
router.post('/products', requireRole(...PLANT), controller.createProduct);
router.get('/lines', controller.listLines);
router.post('/lines', requireRole(...PLANT), controller.createLine);
router.post('/machines', requireRole(...PLANT), controller.createMachine);
router.get('/runs', requireRole(...VIEWERS), controller.listRuns);
router.post('/runs', requireRole(...PLANT), controller.recordRun);
router.get('/downtime', requireRole(...VIEWERS), controller.listDowntime);
router.post('/downtime', requireRole(...PLANT), controller.recordDowntime);
router.post('/downtime/:id/close', requireRole(...PLANT), controller.closeDowntime);

module.exports = router;
