const { getDb, saveDb } = require('../db/database');

exports.getBatches = (req, res) => {
  const db = getDb();
  res.json({ success: true, count: db.batches.length, data: db.batches });
};

exports.createBatch = (req, res) => {
  const { dishName, targetMeals, riceKg, dalKg, vegKg } = req.body;
  if (!dishName || !targetMeals) {
    return res.status(400).json({ success: false, message: 'Dish name and target meals required.' });
  }

  const db = getDb();
  const newBatch = {
    id: `BATCH-${Math.floor(100 + Math.random() * 900)}`,
    dishName,
    targetMeals: parseInt(targetMeals),
    cookedMeals: parseInt(targetMeals),
    riceKg: parseFloat(riceKg) || 0,
    dalKg: parseFloat(dalKg) || 0,
    vegKg: parseFloat(vegKg) || 0,
    status: 'Planned',
    timestamp: new Date().toISOString()
  };

  db.batches.unshift(newBatch);
  db.auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-4)}`,
    action: `New Cooking Batch Created: ${dishName}`,
    user: 'Kitchen Staff',
    details: `Planned ${targetMeals} meals with optimized ingredient sizing.`,
    timestamp: new Date().toISOString()
  });
  saveDb();

  res.status(201).json({ success: true, message: 'Cooking batch saved', data: newBatch });
};

exports.deleteBatch = (req, res) => {
  const db = getDb();
  db.batches = db.batches.filter(b => b.id !== req.params.id);
  saveDb();
  res.json({ success: true, message: 'Batch removed' });
};
