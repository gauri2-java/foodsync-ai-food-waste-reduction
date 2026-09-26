const express = require('express');
const router = express.Router();
const controller = require('../controllers/qualityController');

router.post('/assess', controller.assessFreshness);
router.get('/surplus-log', controller.getSurplusLog);
router.post('/log-surplus', controller.logSurplus);

module.exports = router;
