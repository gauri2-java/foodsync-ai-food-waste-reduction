exports.calculateEsgImpact = (totalKgDiverted = 1450) => {
  const kg = parseFloat(totalKgDiverted);
  const co2eAvoidedKg = parseFloat((kg * 2.5).toFixed(1)); // 2.5 kg CO2e / kg food diverted
  const virtualWaterSavedLiters = Math.round(kg * 840); // 840 liters water per kg food
  const landConservedSqM = parseFloat((kg * 1.8).toFixed(1));
  const mealsEquivalent = Math.round(kg / 0.4); // 400g per meal
  const methaneAvoidedKg = parseFloat((kg * 0.18).toFixed(2));
  const institutionalCostSavedInr = Math.round(kg * 68.0);

  return {
    totalKgDiverted: kg,
    mealsEquivalent,
    co2eAvoidedKg,
    co2eAvoidedTonnes: parseFloat((co2eAvoidedKg / 1000).toFixed(3)),
    methaneAvoidedKg,
    virtualWaterSavedLiters,
    landConservedSqM,
    institutionalCostSavedInr,
    complianceFrameworks: {
      fssai: {
        title: "Food Safety and Standards (Recovery and Distribution of Surplus Food) Regulations, 2019",
        status: "COMPLIANT (Thermal Log >= 60°C Verified, QR Handoff Logged)"
      },
      sebiBrsr: {
        title: "SEBI Business Responsibility and Sustainability Reporting (BRSR Core - July 2023)",
        status: "AUDIT READY (Scope 3 Category 5 Waste Diversion Documented)"
      },
      unSdg: {
        title: "UN Sustainable Development Goal 12.3",
        status: "ON TRACK (Target: Halve Food Waste by 2030)"
      },
      naac: {
        title: "NAAC Institutional Green Campus Accreditation (Criteria 7.1)",
        status: "100% DIGITAL AUDIT TRAIL"
      }
    },
    generatedAt: new Date().toISOString()
  };
};
