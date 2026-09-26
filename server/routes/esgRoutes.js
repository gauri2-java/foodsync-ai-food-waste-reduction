const express = require('express');
const router = express.Router();
const controller = require('../controllers/esgController');

router.get('/metrics', controller.getEsgMetrics);

module.exports = router;
