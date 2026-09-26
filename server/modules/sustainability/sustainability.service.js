// Impact accounting. Every number is derived from operational records × configurable factors;
// the factors used are returned alongside the results so reports are auditable.
const repo = require('./sustainability.repository');
const settings = require('../settings/settings.service');
const { isoDate, addDays } = require('../../lib/time');

function period(query) {
  const to = query.to || isoDate(new Date());
  const from = query.from || isoDate(addDays(new Date(), -90));
  return { from, to };
}

function summariseOutcomes(rows, esg) {
  const pick = (pred) => rows.filter(pred);
  const sum = (rs, f) => rs.reduce((s, r) => s + f(r), 0);
  const delivered = pick((r) => r.status === 'delivered' && r.channel !== 'compost');
  const composted = pick((r) => r.status === 'composted' || (r.status === 'delivered' && r.channel === 'compost'));
  const expired = pick((r) => r.status === 'expired');
  const donatedKg = sum(delivered.filter((r) => r.channel === 'donation'), (r) => r.kg);
  const soldKg = sum(delivered.filter((r) => r.channel === 'secondary_sale'), (r) => r.kg);
  return {
    donatedKg, soldKg, compostedKg: sum(composted, (r) => r.kg), expiredKg: sum(expired, (r) => r.kg),
    secondaryRevenue: sum(delivered, (r) => r.revenue),
    mealsFromDonations: Math.round(donatedKg / esg.portionKg),
    landfillCo2eAvoided: sum(delivered, (r) => r.kg) * esg.landfillCo2ePerKg,
    embodiedCo2eRecovered: sum(delivered, (r) => r.kg * r.co2e_per_kg),
    waterLitres: sum(delivered, (r) => r.kg * r.water_l_per_kg),
    landM2: sum(delivered, (r) => r.kg * r.land_m2_per_kg),
    valueRecovered: sum(delivered, (r) => r.kg * r.cost_per_kg),
    byCategory: delivered.map((r) => ({ category: r.category_name, channel: r.channel, kg: +r.kg.toFixed(1) })),
  };
}

// Overproduction prevented = what the old prepared/served ratio would have cooked minus what was cooked.
function summarisePrevention(practice, meal, esg) {
  let preventedPortions = 0;
  let baselineRatioSum = 0;
  let currentRatioSum = 0;
  let sites = 0;
  for (const p of practice) {
    if (!p.base_served || !p.fs_served) continue;
    const baseRatio = p.base_prepared / p.base_served;
    preventedPortions += Math.max(0, p.fs_served * baseRatio - p.fs_prepared);
    baselineRatioSum += baseRatio;
    currentRatioSum += p.fs_prepared / p.fs_served;
    sites++;
  }
  const portionKg = meal?.portion_kg || esg.portionKg;
  const kg = preventedPortions * portionKg;
  return {
    preventedPortions: Math.round(preventedPortions),
    preventedKg: kg,
    baselineOverproductionPct: sites ? +(100 * (baselineRatioSum / sites - 1)).toFixed(1) : null,
    currentOverproductionPct: sites ? +(100 * (currentRatioSum / sites - 1)).toFixed(1) : null,
    costSaved: kg * (meal?.cost_per_kg || 0),
    co2eAvoided: kg * ((meal?.co2e_per_kg || 0) + esg.landfillCo2ePerKg),
    waterLitres: kg * (meal?.water_l_per_kg || 0),
    landM2: kg * (meal?.land_m2_per_kg || 0),
    leftoverKg: practice.reduce((s, p) => s + (p.leftover_kg || 0), 0),
    plateWasteKg: practice.reduce((s, p) => s + (p.plate_waste_kg || 0), 0),
  };
}

const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(1) : v]));

async function metrics(query, scope) {
  const { from, to } = period(query);
  const siteIds = scope.siteIds;
  const [esg, outcomes, practice, meal, trips, proc, monthly, recipients] = await Promise.all([
    settings.get('esg'), repo.outcomesByCategory(siteIds, from, to), repo.kitchenPractice(siteIds, from, to), repo.avgCookedMeal(siteIds),
    repo.tripKm(siteIds, from, to), repo.processing(siteIds, from, to), repo.monthlyDiverted(siteIds, from, to), repo.recipientBreakdown(siteIds, from, to),
  ]);
  const redistribution = summariseOutcomes(outcomes, esg);
  const prevention = summarisePrevention(practice, meal, esg);
  const transportCo2e = trips.km * esg.vehicleCo2PerKm;
  const grossCo2e = redistribution.landfillCo2eAvoided + prevention.co2eAvoided;
  return {
    period: { from, to },
    factors: esg,
    headline: round({
      foodSavedKg: redistribution.donatedKg + redistribution.soldKg + prevention.preventedKg,
      mealsServed: redistribution.mealsFromDonations,
      netCo2eAvoidedKg: grossCo2e - transportCo2e,
      waterSavedLitres: redistribution.waterLitres + prevention.waterLitres,
      landSavedM2: redistribution.landM2 + prevention.landM2,
      moneySaved: prevention.costSaved + redistribution.secondaryRevenue,
    }),
    prevention: round(prevention),
    redistribution: { ...round({ ...redistribution, byCategory: undefined }), byCategory: redistribution.byCategory },
    logistics: round({ trips: trips.trips, km: trips.km, transportCo2e }),
    processing: round({ ...proc, yieldPct: proc.input_kg ? (100 * proc.output_kg) / proc.input_kg : 0, energyPerKg: proc.output_kg ? proc.energy_kwh / proc.output_kg : 0, scope2Co2e: proc.energy_kwh * esg.gridCo2PerKwh }),
    monthly,
    recipients,
  };
}

const handoffs = (query, scope) => {
  const { from, to } = period(query);
  return repo.handoffs(scope.siteIds, from, to);
};

module.exports = { metrics, handoffs };
