const router = require('express').Router();
const controller = require('./surplus.controller');
const upload = require('../../middleware/upload');
const { requireRole } = require('../../middleware/auth');

const DONORS = ['kitchen_manager', 'plant_manager', 'quality_officer'];

router.get('/', controller.list);
router.post('/', requireRole(...DONORS), controller.create);
router.get('/:id', controller.detail);
router.post('/:id/inspect', requireRole(...DONORS), upload.single('image'), controller.inspect);
router.post('/:id/cancel', requireRole(...DONORS), controller.cancel);
router.post('/:id/rematch', requireRole(...DONORS), controller.rematch);
router.post('/offers/:offerId/respond', requireRole('ngo_coordinator', 'buyer'), controller.respond);

module.exports = router;
