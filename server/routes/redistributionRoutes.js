const express = require('express');
const router = express.Router();
const controller = require('../controllers/redistributionController');

router.get('/routes', controller.getOptimizedRoutes);
router.post('/verify-handoff', controller.verifyHandoff);

module.exports = router;
