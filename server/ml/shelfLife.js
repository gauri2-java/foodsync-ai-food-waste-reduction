// Safe Consumption Window (SCW) estimation.
// Kinetic model: spoilage rate scales by Q10 per +10 °C relative to the category reference temperature.
// Cooked food additionally obeys the FSSAI-style danger-zone rule (5–60 °C): time in the zone is capped.

function rateAt(tempC, category) {
  if (category.is_cooked && tempC >= 60) return 0.3; // hot-held: pathogens suppressed, quality still declines slowly
  return category.q10 ** ((tempC - category.ref_temp_c) / 10);
}

function gasScore(sensor, thresholds) {
  if (!sensor) return { score: null, notes: [] };
  const notes = [];
  let score = 100;
  if (sensor.nh3_ppm !== undefined) {
    const over = Math.max(0, sensor.nh3_ppm - thresholds.nh3WarnPpm) / (thresholds.nh3CriticalPpm - thresholds.nh3WarnPpm);
    if (over > 0) notes.push(`NH₃ ${sensor.nh3_ppm.toFixed(1)} ppm above ${thresholds.nh3WarnPpm} ppm`);
    score -= Math.min(70, over * 60);
  }
  if (sensor.co2_ppm !== undefined) {
    const over = Math.max(0, sensor.co2_ppm - thresholds.co2WarnPpm) / thresholds.co2WarnPpm;
    if (over > 0) notes.push(`CO₂ ${Math.round(sensor.co2_ppm)} ppm indicates microbial respiration`);
    score -= Math.min(40, over * 40);
  }
  return { score: Math.max(0, score), notes };
}

// Cooked food: limited time in the 5–60 °C danger zone, and an absolute limit since preparation.
function cookedCap(input, category, thresholds) {
  if (!category.is_cooked) return { capHours: Infinity, hoursInZone: 0 };
  const inZone = input.foodTempC > 5 && input.foodTempC < 60;
  const hoursInZone = inZone ? input.hoursSincePrep : 0;
  const zoneCap = inZone ? thresholds.dangerZoneMaxHours - hoursInZone : Infinity;
  return { capHours: Math.min(zoneCap, thresholds.cookedMaxHours - input.hoursSincePrep), hoursInZone };
}

function fuseScores(kineticScore, visionScore, gas) {
  const parts = [{ w: 0.45, v: kineticScore }];
  if (visionScore !== null && visionScore !== undefined) parts.push({ w: 0.35, v: visionScore });
  if (gas.score !== null) parts.push({ w: 0.2, v: gas.score });
  const wSum = parts.reduce((s, p) => s + p.w, 0);
  return parts.reduce((s, p) => s + (p.w / wSum) * p.v, 0);
}

// Any single strong signal (image or gas) can veto an otherwise good kinetic estimate.
function verdictFor(fused, scwHours, thresholds, signals) {
  const worst = Math.min(fused, ...signals.filter((v) => v !== null && v !== undefined));
  if (scwHours <= 0 || worst < thresholds.unsafeScore) return 'unsafe';
  if (worst < thresholds.degradedScore) return 'degraded';
  if (scwHours < thresholds.useQuicklyHours) return 'use_quickly';
  return 'safe';
}

// input: { hoursSincePrep, foodTempC, storageTempC?, visionScore?, sensor?: {nh3_ppm, co2_ppm} }
function assess(input, category, thresholds) {
  const histTemp = input.storageTempC ?? input.foodTempC;
  const consumed = (input.hoursSincePrep * rateAt(histTemp, category)) / category.shelf_life_ref_h;
  const remainingFraction = Math.max(0, 1 - consumed);
  const gas = gasScore(input.sensor, thresholds);
  const fused = fuseScores(100 * remainingFraction, input.visionScore, gas);
  const qualityFactor = Math.min(1, fused / 70);
  const kineticHours = (remainingFraction * category.shelf_life_ref_h) / rateAt(input.foodTempC, category);
  const zone = cookedCap(input, category, thresholds);
  const scw = Math.max(0, Math.min(kineticHours * qualityFactor, zone.capHours));
  const verdict = verdictFor(fused, scw, thresholds, [input.visionScore, gas.score]);
  return {
    freshnessScore: +fused.toFixed(1),
    scwHours: +scw.toFixed(2),
    verdict,
    explanation: {
      shelfLifeUsedPct: +(Math.min(1, consumed) * 100).toFixed(1),
      spoilageRateMultiplier: +rateAt(input.foodTempC, category).toFixed(2),
      dangerZoneHours: +zone.hoursInZone.toFixed(2),
      gasNotes: gas.notes,
      gasScore: gas.score,
      visionScore: input.visionScore ?? null,
    },
  };
}

module.exports = { assess, rateAt };
