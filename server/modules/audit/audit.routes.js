const router = require('express').Router();
const controller = require('./audit.controller');
const { requireRole } = require('../../middleware/auth');

router.get('/', requireRole('auditor', 'quality_officer', 'kitchen_manager', 'plant_manager'), controller.list);
router.get('/verify', requireRole('auditor', 'quality_officer'), controller.verify);

module.exports = router;
