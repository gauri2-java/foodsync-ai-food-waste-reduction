const router = require('express').Router();
const controller = require('./inventory.controller');
const { requireRole } = require('../../middleware/auth');

const STOCK_ROLES = ['kitchen_manager', 'plant_manager'];

router.get('/storage-units', controller.listStorageUnits);
router.post('/storage-units', requireRole(...STOCK_ROLES), controller.createStorageUnit);
router.get('/lots', controller.listLots);
router.post('/lots', requireRole(...STOCK_ROLES), controller.receiveLot);
router.post('/lots/:id/adjust', requireRole(...STOCK_ROLES), controller.adjustLot);

module.exports = router;
