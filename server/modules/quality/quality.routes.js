const router = require('express').Router();
const controller = require('./quality.controller');
const upload = require('../../middleware/upload');
const { requireRole } = require('../../middleware/auth');

const INSPECTORS = ['quality_officer', 'kitchen_manager', 'plant_manager'];

router.get('/inspections', controller.list);
router.post('/inspections', requireRole(...INSPECTORS), upload.single('image'), controller.inspect);
router.post('/inspections/:id/label', requireRole('quality_officer'), controller.label);
router.get('/model', controller.model);
router.post('/model/calibrate', requireRole('quality_officer'), controller.calibrate);

module.exports = router;
