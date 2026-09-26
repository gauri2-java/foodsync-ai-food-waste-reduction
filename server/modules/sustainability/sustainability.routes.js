const router = require('express').Router();
const controller = require('./sustainability.controller');

router.get('/metrics', controller.metrics);
router.get('/handoffs', controller.handoffs);
router.get('/report.pdf', controller.report);

module.exports = router;
