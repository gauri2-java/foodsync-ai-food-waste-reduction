/**
 * Computer Vision + Multi-Gas Sensor Fusion Engine
 * Simulates YOLOv8 edge vision scoring with MQ-135 (NH3 ammonia), MQ-4 (CO2/CH4), and temperature/humidity loggers.
 */
exports.evaluateFreshness = ({ foodItem, cookingTimestamp, ammoniaPpm, co2Ppm, ambientTempC, storageHumidity }) => {
  const hoursSinceCooked = (Date.now() - new Date(cookingTimestamp).getTime()) / (1000 * 60 * 60);

  // Base degradation calculation
  let freshnessScore = 100 - (hoursSinceCooked * 6.5);

  // Gas sensor penalties
  if (ammoniaPpm > 25) freshnessScore -= (ammoniaPpm - 25) * 1.8;
  if (co2Ppm > 800) freshnessScore -= (co2Ppm - 800) * 0.05;
  if (ambientTempC > 32) freshnessScore -= (ambientTempC - 32) * 2.5;

  freshnessScore = Math.max(5, Math.min(99, Math.round(freshnessScore)));

  let status = 'Fresh (Safe to Eat)';
  let recommendation = 'Active Dining Service';
  let safeConsumptionWindowHours = Math.max(0, ((freshnessScore - 40) / 10)).toFixed(1);

  if (freshnessScore >= 75) {
    status = 'Optimal Freshness';
    recommendation = 'Safe for Immediate Dining or Short-Distance Express Donation';
  } else if (freshnessScore >= 50) {
    status = 'Moderate Freshness';
    recommendation = 'Dispatch to Nearby Verified Shelter (Under 45 min transit)';
  } else {
    status = 'Degraded / Critical';
    safeConsumptionWindowHours = '0.0';
    recommendation = 'Divert to Biogas Anaerobic Digester & Institutional Compost';
  }

  return {
    foodItem,
    freshnessScore,
    status,
    safeConsumptionWindowHours: parseFloat(safeConsumptionWindowHours),
    recommendation,
    sensorReadings: {
      ammoniaPpm: ammoniaPpm || 12.4,
      co2Ppm: co2Ppm || 420,
      ambientTempC: ambientTempC || 24.5,
      storageHumidity: storageHumidity || 58
    },
    visionAiDetection: {
      model: 'YOLOv8-Nano-FoodFresh-v2',
      detectedClass: foodItem,
      visualConfidence: 0.965,
      spoilageVisualArtifacts: freshnessScore < 50 ? 'Micro-surface oxidation & moisture weep' : 'None detected'
    }
  };
};
