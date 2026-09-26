const engine = require('../services/esgCalculator');

exports.getEsgMetrics = (req, res) => {
  const { totalKg = 1450 } = req.query;
  const metrics = engine.calculateEsgImpact(parseFloat(totalKg));
  res.json({ success: true, data: metrics });
};
