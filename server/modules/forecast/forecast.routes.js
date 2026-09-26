const router = require('express').Router();
const controller = require('./forecast.controller');
const { requireRole } = require('../../middleware/auth');

const PLANNERS = ['kitchen_manager', 'plant_manager', 'auditor'];

router.get('/models', requireRole(...PLANNERS), controller.models);
router.get('/kitchen/:siteId', requireRole(...PLANNERS), controller.kitchen);
router.post('/kitchen/:siteId/retrain', requireRole('kitchen_manager'), controller.retrain);
router.get('/kitchen/:siteId/accuracy', requireRole(...PLANNERS), controller.accuracy);
router.get('/kitchen/:siteId/plan', requireRole(...PLANNERS), controller.plan);
router.get('/product/:productId', requireRole('plant_manager', 'auditor'), controller.product);

module.exports = router;
