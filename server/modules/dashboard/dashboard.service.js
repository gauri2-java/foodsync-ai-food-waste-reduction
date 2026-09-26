const repo = require('./dashboard.repository');
const alerts = require('../alerts/alerts.service');
const settings = require('../settings/settings.service');
const sustainability = require('../sustainability/sustainability.service');
const { isoDate, addDays } = require('../../lib/time');

const ACTIVITY_TEXT = {
  'surplus.accept': () => 'Surplus claimed by a recipient',
  'trip.start': () => 'Vehicle departed on a redistribution trip',
  'trip.pickup': (p) => `Pickup confirmed at ${p.foodTempC} °C`,
  'forecast.train': (p) => `Demand model retrained — ${p.seriesKey} MAPE ${p.mape}%`,
  'quality.inspect': (p) => `Quality inspection: ${p.verdict}, safe for ${p.scwHours} h`,
  'logistics.optimize': (p) => `Routes optimised: ${p.optimizedKm} km vs ${p.baselineKm} km ad-hoc`,
  'production_run.record': (p) => `Production run logged — yield ${p.yieldPct}%, OEE ${Math.round((p.oee || 0) * 100)}%`,
};

async function overview(scope) {
  const [pipeline, meals, trips, devices, alertSummary, impact] = await Promise.all([
    repo.surplusPipeline(scope.siteIds), repo.todayMeals(scope.siteIds), repo.tripCounts(scope.siteIds), repo.deviceHealth(scope.siteIds),
    alerts.summary(scope), sustainability.metrics({ from: isoDate(addDays(new Date(), -30)) }, scope),
  ]);
  return { pipeline, meals, trips, devices, alerts: alertSummary, impact30d: impact.headline, prevention30d: impact.prevention };
}

function operationText(o) {
  if (o.kind === 'listing') return `${o.donor} listed ${o.kg} kg of surplus${o.portions ? ` (≈${o.portions} meals)` : ''}`;
  if (o.status === 'failed') return `Delivery to ${o.recipient} rejected at thermal check (${o.temp} °C)`;
  return `${o.recipient} received ${o.kg} kg from ${o.donor}${o.portions ? ` — ${o.portions} meals` : ''} at ${o.temp} °C`;
}

async function ticker(limit = 25) {
  const [audits, ops] = await Promise.all([repo.recentActivity(limit), repo.recentOperations(limit)]);
  const items = [
    ...audits.map((r) => ({ at: r.occurred_at, actor: r.actor, text: (ACTIVITY_TEXT[r.action] || (() => r.action))(r.payload || {}) })),
    ...ops.map((o) => ({ at: o.at, text: operationText(o) })),
  ];
  return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
}

async function publicStats() {
  const [t, esg] = await Promise.all([repo.publicTotals(), settings.get('esg')]);
  return {
    donatedKg: Math.round(t.donated_kg),
    mealsProvided: Math.max(t.portions_received, Math.round(t.donated_kg / esg.portionKg)),
    co2eAvoidedKg: Math.round(t.delivered_kg * esg.landfillCo2ePerKg),
    ngos: t.ngos, donors: t.donors, kitchens: t.kitchens, deliveries: t.deliveries,
  };
}

module.exports = { overview, ticker, publicStats, publicOrganizations: repo.publicOrganizations };
