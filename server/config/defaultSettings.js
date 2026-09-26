// Tunable business parameters. Seeded into the `settings` table and editable from the Admin screen;
// services always read the live DB value, these are only the initial values.
module.exports = {
  routing: {
    value: { circuity: 1.35, avgSpeedKmph: 22, handlingMin: 15, maxRadiusKm: 25, consumptionBufferH: 1 },
    description: 'Road-distance detour factor, average urban speed, loading time, max matching radius and time reserved for consumption after delivery',
  },
  matching: {
    value: { weights: { proximity: 0.35, capacity: 0.2, fairness: 0.2, slack: 0.25 }, offerCount: 3, offerTimeoutMin: 20, secondaryDiscountPct: 60 },
    description: 'Recipient scoring weights, how many recipients get a simultaneous offer, offer expiry, and discount for secondary buyers',
  },
  quality: {
    value: { nh3WarnPpm: 25, nh3CriticalPpm: 60, co2WarnPpm: 2000, dangerZoneMaxHours: 4, cookedMaxHours: 12, unsafeScore: 35, degradedScore: 55, useQuicklyHours: 2, minLabelledForModel: 12 },
    description: 'Gas thresholds (MQ-135), FSSAI danger-zone limit and absolute hold limit for cooked food, verdict cut-offs and labelled samples needed to calibrate the vision model',
  },
  forecast: {
    value: { serviceLevelZ: 1.28, holdoutDays: 14, cookBufferPct: 2, horizonDays: 7 },
    description: 'z-score for the production quantity (1.28 ≈ 90% of days covered), holdout window for accuracy, extra cook buffer',
  },
  inventory: {
    value: { nearExpiryHours: 48 },
    description: 'Raise an alert when a stock lot expires within this many hours',
  },
  iot: {
    value: { breachMinutes: 15, offlineMinutes: 10 },
    description: 'Minutes a storage unit may stay out of range before a critical alert; minutes of silence before a device is flagged offline',
  },
  esg: {
    value: { landfillCo2ePerKg: 2.5, portionKg: 0.4, gridCo2PerKwh: 0.71, vehicleCo2PerKm: 0.27 },
    description: 'CO₂e avoided per kg diverted from landfill (methane), kg per meal, grid emission factor (CEA India), delivery vehicle emissions',
  },
  processing: {
    value: { anomalyThreshold: 0.62, scrapWarnPct: 8, oeeTarget: 0.75, overproductionWarnPct: 10 },
    description: 'Isolation-Forest anomaly score cut-off, scrap-rate warning, OEE target and overproduction warning threshold',
  },
};
