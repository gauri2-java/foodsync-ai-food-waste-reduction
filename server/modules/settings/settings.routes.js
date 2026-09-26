const router = require('express').Router();
const controller = require('./settings.controller');
const { requireRole } = require('../../middleware/auth');

router.get('/', controller.list);
router.put('/:key', requireRole('admin'), controller.update);

module.exports = router;
