const express = require('express');
const router = express.Router();

router.get('/live', (req, res) => {
  // Generates simulated live sensor telemetry stream
  const baseTemp = 24.0 + (Math.sin(Date.now() / 10000) * 3.5);
  const baseAmmonia = 12.0 + (Math.cos(Date.now() / 8000) * 4.0);
  const baseCo2 = 430 + Math.round(Math.sin(Date.now() / 15000) * 80);
  const baseHumidity = 56 + Math.round(Math.cos(Date.now() / 12000) * 6);

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    sensors: {
      nodeId: 'ESP32-KITCHEN-NODE-01',
      ammoniaPpm: parseFloat(baseAmmonia.toFixed(2)),
      co2Ppm: baseCo2,
      ambientTempC: parseFloat(baseTemp.toFixed(1)),
      humidityPercent: baseHumidity,
      gasAlertLevel: baseAmmonia > 25 ? 'WARNING' : 'NORMAL',
      thermalGateStatus: baseTemp > 35 ? 'HIGH_TEMP_RISK' : 'OPTIMAL_STORAGE'
    }
  });
});

module.exports = router;
