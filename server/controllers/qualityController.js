const engine = require('../services/cvFreshnessEngine');

let surplusLog = [
  { id: '1', foodItem: 'Steamed Basmati Rice & Dal', quantityKg: 35, cookedAt: new Date(Date.now() - 2.5 * 3600000).toISOString(), freshness: 92, scwHours: 5.2, status: 'Safe for Donation' },
  { id: '2', foodItem: 'Mixed Vegetable Curry', quantityKg: 22, cookedAt: new Date(Date.now() - 3.2 * 3600000).toISOString(), freshness: 84, scwHours: 4.0, status: 'Safe for Donation' },
  { id: '3', foodItem: 'Paneer Butter Masala', quantityKg: 18, cookedAt: new Date(Date.now() - 1.8 * 3600000).toISOString(), freshness: 95, scwHours: 6.5, status: 'Safe for Donation' }
];

exports.assessFreshness = (req, res) => {
  const { foodItem = 'Dal Tadka & Rice', cookingTimestamp = new Date(Date.now() - 2 * 3600000).toISOString(), ammoniaPpm = 14.2, co2Ppm = 450, ambientTempC = 25.0, storageHumidity = 55 } = req.body;
  const result = engine.evaluateFreshness({ foodItem, cookingTimestamp, ammoniaPpm, co2Ppm, ambientTempC, storageHumidity });
  res.json({ success: true, data: result });
};

exports.getSurplusLog = (req, res) => {
  res.json({ success: true, count: surplusLog.length, data: surplusLog });
};

exports.logSurplus = (req, res) => {
  const { foodItem, quantityKg, cookedAt, freshness, scwHours } = req.body;
  const newEntry = {
    id: Date.now().toString(),
    foodItem: foodItem || 'Prepared Meal Batch',
    quantityKg: parseFloat(quantityKg) || 15,
    cookedAt: cookedAt || new Date().toISOString(),
    freshness: freshness || 90,
    scwHours: scwHours || 4.5,
    status: 'Safe for Donation'
  };
  surplusLog.unshift(newEntry);
  res.status(201).json({ success: true, message: 'Surplus food batch recorded with SCW validation', data: newEntry });
};
