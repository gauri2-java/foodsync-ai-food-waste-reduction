const express = require('express');
const cors = require('cors');
const path = require('path');

const forecastRoutes = require('./routes/forecastRoutes');
const qualityRoutes = require('./routes/qualityRoutes');
const redistributionRoutes = require('./routes/redistributionRoutes');
const esgRoutes = require('./routes/esgRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// API Sub-Routers
app.use('/api/forecast', forecastRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/redistribution', redistributionRoutes);
app.use('/api/esg', esgRoutes);

// System Status Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ACTIVE',
    project: 'FoodSync - SIH 2026 (Problem Statement: SIH26234)',
    organization: 'Ministry of Food Processing Industries (MoFPI)',
    modules: {
      demandForecasting: 'ONLINE (Prophet + XGBoost Engine)',
      freshnessQualityAssessment: 'ONLINE (YOLOv8 Edge Vision + IoT Gas Fusion)',
      dynamicRedistribution: 'ONLINE (CVRPTW Routing & QR Verification)',
      esgAnalytics: 'ONLINE (FSSAI / SEBI BRSR Audit Ready)'
    },
    timestamp: new Date().toISOString()
  });
});

// Serve Frontend SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[*] FoodSync AIoT Platform Server Active on Port ${PORT}`);
  console.log(`[*] Dashboard: http://localhost:${PORT}`);
  console.log(`[*] SIH 2026 | Ministry of Food Processing Industries`);
  console.log(`=======================================================`);
});
