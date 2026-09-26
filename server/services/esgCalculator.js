/**
 * ESG Analytics & Carbon Footprint Avoidance Engine
 * Calculates metrics aligned to FSSAI 'Save Food Share Food' and SEBI BRSR Core frameworks.
 */
exports.calculateEsgImpact = (totalKgDiverted) => {
  const co2eAvoidedKg = (totalKgDiverted * 2.5).toFixed(1); // 2.5 kg CO2e per kg food diverted
  const virtualWaterSavedLiters = Math.round(totalKgDiverted * 840); // 840 L water per kg food
  const landConservedSqM = (totalKgDiverted * 1.8).toFixed(1);
  const mealsEquivalent = Math.round(totalKgDiverted / 0.4); // 400g per meal

  return {
    totalKgDiverted: parseFloat(totalKgDiverted),
    mealsEquivalent,
    co2eAvoidedKg: parseFloat(co2eAvoidedKg),
    co2eAvoidedTonnes: (co2eAvoidedKg / 1000).toFixed(3),
    virtualWaterSavedLiters,
    landConservedSqM: parseFloat(landConservedSqM),
    institutionalCostSavedInr: Math.round(totalKgDiverted * 65.0),
    complianceFrameworks: [
      'FSSAI Save Food Share Food Initiative (Regulation 2019)',
      'SEBI BRSR Core Value Chain Disclosures (July 2023)',
      'UN SDG 12.3: Halve Global Food Waste by 2030',
      'NAAC Green Campus Audit Criteria 7.1'
    ],
    timestamp: new Date().toISOString()
  };
};
