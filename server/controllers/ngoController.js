const { getDb, saveDb } = require('../db/database');

exports.getNgos = (req, res) => {
  const db = getDb();
  res.json({ success: true, count: db.ngos.length, data: db.ngos });
};

exports.createNgo = (req, res) => {
  const { name, address, contact, capacity, distanceKm } = req.body;
  if (!name || !address) {
    return res.status(400).json({ success: false, message: 'Name and address required.' });
  }

  const db = getDb();
  const newNgo = {
    id: `NGO-${db.ngos.length + 1}`,
    name,
    address,
    contact: contact || '+91-98765-43210',
    capacity: parseInt(capacity) || 50,
    distanceKm: parseFloat(distanceKm) || 4.0,
    coords: [28.6200 + (Math.random() * 0.04 - 0.02), 77.2100 + (Math.random() * 0.04 - 0.02)]
  };

  db.ngos.push(newNgo);
  saveDb();
  res.status(201).json({ success: true, message: 'NGO Partner registered', data: newNgo });
};
