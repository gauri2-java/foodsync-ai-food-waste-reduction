const express = require('express');
const cors = require('cors');
const path = require('path');

const forecastRoutes = require('./routes/forecastRoutes');
const qualityRoutes = require('./routes/qualityRoutes');
const redistributionRoutes = require('./routes/redistributionRoutes');
const esgRoutes = require('./routes/esgRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../client')));

// API Sub-Routers
app.use('/api/forecast', forecastRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/redistribution', redistributionRoutes);
app.use('/api/esg', esgRoutes);
app.use('/api/telemetry', telemetryRoutes);

// System Status Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ACTIVE',
    project: 'FoodSync - SIH 2026 (Problem Statement: SIH26234)',
    organization: 'Ministry of Food Processing Industries (MoFPI)',
    team: 'FoodSync (ID: 144697)',
    modules: {
      demandForecasting: 'ONLINE (Prophet + XGBoost Engine)',
      freshnessQualityAssessment: 'ONLINE (YOLOv8 Edge Vision + IoT Gas Fusion)',
      dynamicRedistribution: 'ONLINE (Leaflet GPS + OR-Tools CVRPTW & QR Verification)',
      esgAnalytics: 'ONLINE (FSSAI / SEBI BRSR Audit Ready)',
      iotSensorHub: 'ONLINE (ESP32 Live Stream Streamer)'
    },
    version: '2.0.0-PROTOTYPE',
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
  console.log(`[*] Dashboard URL: http://localhost:${PORT}`);
  console.log(`[*] SIH 2026 | Ministry of Food Processing Industries`);
  console.log(`=======================================================`);
});
