// Multi-criteria recipient matching for a surplus listing.
// Feasibility: accepts category, open, has capacity, and food reaches them inside its SCW.
// Score: weighted blend of proximity, remaining capacity/need, fairness (less food received
// recently) and time slack; secondary buyers only compete for the secondary-sale channel.
const { roadKm } = require('../lib/geo');

function feasibility(listing, r, ctx) {
  const km = roadKm(listing.origin, r, ctx.circuity);
  const etaMin = (km / ctx.speedKmph) * 60 + ctx.handlingMin;
  const hoursLeft = (listing.safeUntilMs - ctx.nowMs) / 3600000;
  const reasons = [];
  if (!r.accepts_categories.includes(listing.categoryCode)) reasons.push('does not accept this food category');
  if (r.remaining_capacity_kg < Math.min(listing.quantityKg, 5)) reasons.push('no remaining capacity today');
  if (etaMin / 60 > hoursLeft - ctx.consumptionBufferH) reasons.push('cannot reach before safe window closes');
  if (km > ctx.maxRadiusKm) reasons.push(`outside ${ctx.maxRadiusKm} km radius`);
  if (r.open_now === false) reasons.push('closed at this hour');
  return { km, etaMin, hoursLeft, reasons };
}

function scoreRecipient(listing, r, ctx) {
  const f = feasibility(listing, r, ctx);
  const w = ctx.weights;
  const proximity = Math.max(0, 1 - f.km / ctx.maxRadiusKm);
  const capacityFit = Math.min(1, r.remaining_capacity_kg / Math.max(1, listing.quantityKg));
  const fairness = 1 - Math.min(1, r.received_kg_7d / Math.max(1, ctx.maxReceived7d));
  const slack = Math.max(0, Math.min(1, (f.hoursLeft - f.etaMin / 60) / Math.max(1, f.hoursLeft)));
  const total = w.proximity * proximity + w.capacity * capacityFit + w.fairness * fairness + w.slack * slack;
  return {
    siteId: r.id,
    name: r.name,
    orgType: r.org_type,
    distanceKm: +f.km.toFixed(2),
    etaMin: +f.etaMin.toFixed(1),
    feasible: f.reasons.length === 0,
    reasons: f.reasons,
    score: +total.toFixed(4),
    breakdown: { proximity: +proximity.toFixed(3), capacityFit: +capacityFit.toFixed(3), fairness: +fairness.toFixed(3), slack: +slack.toFixed(3) },
  };
}

function rankRecipients(listing, recipients, ctx) {
  const maxReceived7d = Math.max(1, ...recipients.map((r) => r.received_kg_7d));
  return recipients.map((r) => scoreRecipient(listing, r, { ...ctx, maxReceived7d })).sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score);
}

module.exports = { rankRecipients };
