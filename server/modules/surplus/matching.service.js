// Redistribution engine: chooses the channel (donation → secondary sale → compost/biogas) and sends
// ranked offers to the best feasible recipients. The first recipient to accept wins.
const db = require('../../lib/db');
const repo = require('./surplus.repository');
const settings = require('../settings/settings.service');
const reference = require('../reference/reference.service');
const audit = require('../audit/audit.service');
const alerts = require('../alerts/alerts.service');
const matching = require('../../ml/matching');
const logger = require('../../lib/logger');
const { publish } = require('../../lib/eventBus');
const { notFound, badRequest, forbidden, conflict } = require('../../lib/errors');

const CHANNELS = [
  { channel: 'donation', orgTypes: ['ngo'] },
  { channel: 'secondary_sale', orgTypes: ['buyer'] },
  { channel: 'compost', orgTypes: ['compost'] },
];

function listingContext(listing, routing, weights) {
  return {
    listing: { origin: { lat: listing.lat, lng: listing.lng }, categoryCode: listing.category_code, quantityKg: listing.quantity_kg, safeUntilMs: new Date(listing.safe_until).getTime() },
    ctx: { ...routing, speedKmph: routing.avgSpeedKmph, nowMs: Date.now(), weights },
  };
}

async function rankForChannel(listing, orgTypes, excluded, compostMode) {
  const [routing, match] = await Promise.all([settings.get('routing'), settings.get('matching')]);
  const candidates = (await repo.recipientCandidates(orgTypes)).filter((c) => !excluded.has(c.id));
  const { listing: l, ctx } = listingContext(listing, routing, match.weights);
  // Compost/biogas accepts anything regardless of the safe window.
  if (compostMode) Object.assign(l, { safeUntilMs: Date.now() + 48 * 3600000 });
  return matching.rankRecipients(l, candidates, ctx);
}

async function isSpoiled(listing) {
  const [q, routing] = await Promise.all([settings.get('quality'), settings.get('routing')]);
  return (listing.freshness_score !== null && listing.freshness_score < q.degradedScore) || listing.hours_left <= routing.consumptionBufferH;
}

async function chooseChannel(listing, excluded) {
  const spoiled = await isSpoiled(listing);
  for (const { channel, orgTypes } of CHANNELS) {
    if (spoiled && channel !== 'compost') continue;
    const ranked = await rankForChannel(listing, orgTypes, excluded, channel === 'compost');
    const feasible = ranked.filter((r) => r.feasible);
    if (feasible.length) return { channel, feasible, ranked };
  }
  return { channel: null, feasible: [], ranked: [] };
}

async function createOffers(listing, channel, feasible, client) {
  const cfg = await settings.get('matching');
  const price = channel === 'secondary_sale' ? +(listing.quantity_kg * listing.cost_per_kg * (1 - cfg.secondaryDiscountPct / 100)).toFixed(0) : null;
  const top = feasible.slice(0, cfg.offerCount);
  const offers = [];
  for (const [i, r] of top.entries()) offers.push(await repo.insertOffer({ surplusId: listing.id, ...r, rank: i + 1, offeredPrice: price }, client));
  return offers;
}

// Compost needs no acceptance: assign straight to the nearest facility.
async function assignCompost(listing, best, actor, client) {
  const updated = await repo.updateListing(listing.id, { status: 'matched', channel: 'compost', assigned_site_id: best.siteId }, client);
  await audit.record(actor, 'surplus.route_compost', 'surplus', listing.id, { siteId: best.siteId }, client);
  return updated;
}

async function matchAndOffer(listingId, actor) {
  const listing = await repo.findListing(listingId);
  if (!listing) throw notFound('Surplus listing');
  if (!['open', 'offered'].includes(listing.status)) return { listing, offers: [] };
  const excluded = new Set((await repo.excludedRecipients(listingId)).map((r) => r.recipient_site_id));
  const category = await reference.getCategory(listing.category_code);
  const { channel, feasible, ranked } = await chooseChannel({ ...listing, cost_per_kg: category.cost_per_kg }, excluded);
  if (!channel) {
    await alerts.raise({ siteId: listing.site_id, type: 'unmatched_surplus', severity: 'critical', title: `No recipient can take "${listing.title}"`, detail: 'Add recipients, widen radius in Settings, or arrange pickup manually.', entityRef: `surplus:${listing.id}` });
    return { listing, offers: [], candidates: ranked };
  }
  const result = await db.transaction(async (client) => {
    if (channel === 'compost') return { listing: await assignCompost(listing, feasible[0], actor, client), offers: [] };
    const offers = await createOffers({ ...listing, cost_per_kg: category.cost_per_kg }, channel, feasible, client);
    const updated = await repo.updateListing(listing.id, { status: 'offered', channel }, client);
    await audit.record(actor, 'surplus.offer', 'surplus', listing.id, { channel, recipients: offers.map((o) => o.recipient_site_id) }, client);
    return { listing: updated, offers };
  });
  logger.info({ surplusId: listingId, channel, offers: result.offers.length }, 'surplus matched');
  publish('surplus', { id: listingId, status: result.listing.status, channel, recipientSiteIds: result.offers.map((o) => o.recipient_site_id) });
  return { ...result, candidates: ranked };
}

async function acceptOffer(offer, actor, client) {
  const listing = await repo.lockListing(offer.surplus_id, client);
  if (listing.status !== 'offered') throw conflict('This surplus has already been claimed or closed');
  const accepted = await repo.setOfferStatus(offer.id, 'accepted', actor.id, client);
  await repo.supersedeOthers(offer.surplus_id, offer.id, client);
  await repo.updateListing(offer.surplus_id, { status: 'matched', assigned_site_id: offer.recipient_site_id, sale_price: offer.offered_price }, client);
  await audit.record(actor, 'surplus.accept', 'surplus', offer.surplus_id, { offerId: offer.id, siteId: offer.recipient_site_id }, client);
  return accepted;
}

async function respond(offerId, decision, actor) {
  if (!['accept', 'decline'].includes(decision)) throw badRequest("decision must be 'accept' or 'decline'");
  const outcome = await db.transaction(async (client) => {
    const offer = await repo.findOffer(offerId, client);
    if (!offer) throw notFound('Offer');
    if (actor.role !== 'admin' && offer.recipient_org_id !== actor.orgId) throw forbidden('This offer was sent to another organisation');
    if (offer.status !== 'pending') throw conflict(`Offer is already ${offer.status}`);
    if (decision === 'accept') return { offer: await acceptOffer(offer, actor, client), rematch: false };
    const declined = await repo.setOfferStatus(offer.id, 'declined', actor.id, client);
    await audit.record(actor, 'surplus.decline', 'surplus', offer.surplus_id, { offerId: offer.id }, client);
    const { n } = await repo.pendingCount(offer.surplus_id, client);
    if (n === 0) await repo.updateListing(offer.surplus_id, { status: 'open' }, client);
    return { offer: declined, rematch: n === 0 };
  });
  if (outcome.rematch) await matchAndOffer(outcome.offer.surplus_id, actor);
  publish('surplus', { id: outcome.offer.surplus_id, offerId, decision });
  return outcome.offer;
}

// Job: expire unanswered offers, re-match, and expire listings whose safe window has passed.
async function housekeeping() {
  const cfg = await settings.get('matching');
  const stale = await repo.expireStaleOffers(cfg.offerTimeoutMin);
  const toRematch = new Set(stale.map((s) => s.surplus_id));
  for (const id of toRematch) {
    const { n } = await repo.pendingCount(id);
    if (n === 0) {
      await repo.updateListing(id, { status: 'open' });
      await matchAndOffer(id, null);
    }
  }
  for (const l of await repo.openWithoutOffers()) await matchAndOffer(l.id, null);
  for (const l of await repo.expireListings()) {
    await alerts.raise({ siteId: l.site_id, type: 'surplus_expired', severity: 'warning', title: `"${l.title}" (${l.quantity_kg} kg) expired unclaimed`, detail: 'Route to compost/biogas and review why no recipient accepted.', entityRef: `surplus:${l.id}` });
  }
}

module.exports = { matchAndOffer, respond, housekeeping };
