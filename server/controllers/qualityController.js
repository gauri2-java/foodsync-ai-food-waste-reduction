const engine = require('../services/cvFreshnessEngine');

let surplusLog = [
  { id: 'SURP-201', foodItem: 'Steamed Basmati Rice & Dal', quantityKg: 35, cookedAt: '2.5 hrs ago', freshness: 92, scwHours: 5.2, status: 'Dispatched to Asha Shelter' },
  { id: 'SURP-202', foodItem: 'Mixed Vegetable Curry & Rotis', quantityKg: 24, cookedAt: '3.0 hrs ago', freshness: 86, scwHours: 4.4, status: 'Dispatched to Prerna Foundation' },
  { id: 'SURP-203', foodItem: 'Paneer Butter Masala', quantityKg: 18, cookedAt: '1.5 hrs ago', freshness: 95, scwHours: 6.2, status: 'Delivered to Sneha Kitchen' }
];

exports.assessFreshness = (req, res) => {
  const result = engine.evaluateFreshness(req.body || {});
  res.json({ success: true, data: result });
};

exports.getSurplusLog = (req, res) => {
  res.json({ success: true, count: surplusLog.length, data: surplusLog });
};

exports.logSurplus = (req, res) => {
  const { foodItem, quantityKg, freshness, scwHours } = req.body;
  const entry = {
    id: `SURP-${Date.now().toString().slice(-4)}`,
    foodItem: foodItem || 'Prepared Meal Batch',
    quantityKg: parseFloat(quantityKg) || 20,
    cookedAt: 'Just Now',
    freshness: freshness || 90,
    scwHours: scwHours || 4.5,
    status: 'Matched to Nearest Geofenced NGO'
  };
  surplusLog.unshift(entry);
  res.status(201).json({ success: true, message: 'Surplus batch logged into redistribution pipeline', data: entry });
};
