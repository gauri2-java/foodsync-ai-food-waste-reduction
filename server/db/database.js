/**
 * In-Memory & Persistent State Database for FoodSync
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'foodsync_data.json');

const initialData = {
  users: [
    { id: '1', name: 'Dr. Rajesh Sharma', email: 'rajesh@iitd.ac.in', password: 'password123', role: 'Kitchen Manager', organization: 'IIT Delhi Central Dining' },
    { id: '2', name: 'Priya Mukherjee', email: 'priya@fssai.gov.in', password: 'password123', role: 'Food Safety Officer', organization: 'FSSAI Delhi Regional Office' },
    { id: '3', name: 'Vikram Singh', email: 'vikram@robinhood.org', password: 'password123', role: 'NGO Coordinator', organization: 'Robin Hood Army & Feeding India' },
    { id: '4', name: 'Ananya Verma', email: 'ananya@mofpi.gov.in', password: 'password123', role: 'ESG Auditor', organization: 'Ministry of Food Processing Industries' }
  ],
  batches: [
    { id: 'BATCH-401', dishName: 'Steamed Basmati Rice & Tadka Dal', targetMeals: 850, cookedMeals: 860, riceKg: 102, dalKg: 51, vegKg: 136, status: 'Cooked', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: 'BATCH-402', dishName: 'Mixed Seasonal Sabzi & Whole Wheat Rotis', targetMeals: 820, cookedMeals: 820, riceKg: 0, dalKg: 0, vegKg: 164, status: 'Active Service', timestamp: new Date().toISOString() }
  ],
  surplus: [
    { id: 'SURP-101', foodItem: 'Steamed Basmati Rice & Dal', quantityKg: 35, cookedAt: new Date(Date.now() - 2.5 * 3600000).toISOString(), freshness: 92, scwHours: 5.2, status: 'Dispatched', recipient: 'Asha Community Shelter & Care', priority: 'HIGH' },
    { id: 'SURP-102', foodItem: 'Mixed Vegetable Curry & Rotis', quantityKg: 24, cookedAt: new Date(Date.now() - 3.0 * 3600000).toISOString(), freshness: 86, scwHours: 4.4, status: 'In Transit', recipient: 'Prerna Children Foster Foundation', priority: 'MEDIUM' },
    { id: 'SURP-103', foodItem: 'Paneer Butter Masala', quantityKg: 18, cookedAt: new Date(Date.now() - 1.5 * 3600000).toISOString(), freshness: 95, scwHours: 6.2, status: 'Delivered', recipient: 'Sneha Elderly & Relief Kitchen', priority: 'HIGH' }
  ],
  ngos: [
    { id: 'NGO-1', name: 'Asha Community Shelter & Care', address: 'Gate 2, Civil Lines, North Delhi', contact: '+91-98101-22345', capacity: 85, distanceKm: 3.4, coords: [28.6320, 77.2250] },
    { id: 'NGO-2', name: 'Prerna Children Foster Foundation', address: 'Sector 12, Shanti Nagar, Central Delhi', contact: '+91-98711-99882', capacity: 60, distanceKm: 5.6, coords: [28.6010, 77.2310] },
    { id: 'NGO-3', name: 'Sneha Elderly & Relief Kitchen', address: 'Model Town, Ring Road, Delhi', contact: '+91-99233-11200', capacity: 110, distanceKm: 4.8, coords: [28.6450, 77.1980] },
    { id: 'NGO-4', name: 'Feeding India Community Hub', address: 'Connaught Place Outer Circle, Delhi', contact: '+91-98110-44332', capacity: 150, distanceKm: 2.9, coords: [28.6280, 77.2150] }
  ],
  auditLogs: [
    { id: 'LOG-8801', action: 'Prophet + XGBoost Batch Sizing Computed', user: 'Dr. Rajesh Sharma', details: 'Planned 850 meals (-18% overproduction prevention)', timestamp: new Date(Date.now() - 4 * 3600000).toISOString() },
    { id: 'LOG-8802', action: 'YOLOv8 Freshness SCW Certified (5.2h)', user: 'Priya Mukherjee', details: 'Batch SURP-101 passed ammonia (14ppm) & temp (24.5C) gates', timestamp: new Date(Date.now() - 2.5 * 3600000).toISOString() },
    { id: 'LOG-8803', action: 'Tamper-Evident QR Handoff Verified', user: 'Vikram Singh', details: 'Thermal reading 64.2C (>60C FSSAI compliant). 85 beneficiaries served.', timestamp: new Date(Date.now() - 1 * 3600000).toISOString() }
  ]
};

let db = { ...initialData };

exports.getDb = () => db;
exports.saveDb = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    // fallback in memory
  }
};
