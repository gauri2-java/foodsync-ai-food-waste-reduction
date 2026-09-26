const express = require('express');
const router = express.Router();
const controller = require('../controllers/forecastController');

router.get('/', controller.getForecast);
router.post('/simulate', (req, res) => {
  const engine = require('../services/prophetXgboostEngine');
  const result = engine.predictDemand(req.body);
  res.json({ success: true, data: result });
});

module.exports = router;
