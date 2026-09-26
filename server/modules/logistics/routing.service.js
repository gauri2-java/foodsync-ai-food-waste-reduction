// Builds routing requests from matched surplus, runs the perishability-aware VRP and persists trips.
const crypto = require('crypto');
const db = require('../../lib/db');
const config = require('../../config');
const repo = require('./logistics.repository');
const settings = require('../settings/settings.service');
const audit = require('../audit/audit.service');
const alerts = require('../alerts/alerts.service');
const vrp = require('../../ml/vrp');
const logger = require('../../lib/logger');
const { publish } = require('../../lib/eventBus');
const { badRequest } = require('../../lib/errors');

// The QR token is an HMAC of the stop id, so it never needs to be stored in plaintext.
const handoffToken = (stopId) => crypto.createHmac('sha256', config.jwtSecret).update(`handoff:${stopId}`).digest('base64url').slice(0, 22);
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function toRequests(deliveries, routing) {
  return deliveries.map((d) => ({
    id: d.id,
    kg: d.quantity_kg,
    pickup: { lat: d.p_lat, lng: d.p_lng, siteId: d.site_id },
    drop: { lat: d.d_lat, lng: d.d_lng, siteId: d.assigned_site_id },
    // Deliver early enough to leave consumption time inside the safe window.
    deadline: new Date(d.safe_until).getTime() - routing.consumptionBufferH * 3600000,
    serviceMin: routing.handlingMin / 2,
  }));
}

async function persistPlan(plan, vehicle, stats, client) {
  const geometry = [[vehicle.start.lat, vehicle.start.lng], ...plan.stops.map((s) => [s.loc.lat, s.loc.lng])];
  const trip = await repo.insertTrip({ vehicleId: plan.vehicleId, km: plan.km, minutes: plan.minutes, geometry, optimizer: { algorithm: 'regret-2 insertion + relocate', ...stats } }, client);
  for (const [i, s] of plan.stops.entries()) {
    const stop = await repo.insertStop({ tripId: trip.id, seq: i + 1, type: s.type, surplusId: s.requestId, siteId: s.siteId, eta: s.eta, deadline: new Date(s.deadline).toISOString() }, client);
    if (s.type === 'dropoff') await repo.setStopToken(stop.id, hashToken(handoffToken(stop.id)), client);
  }
  await repo.setVehicleStatus(plan.vehicleId, 'on_trip', client);
  return trip;
}

async function optimize(actor, scope) {
  const routing = await settings.get('routing');
  const deliveries = await repo.pendingDeliveries(scope.siteIds);
  if (!deliveries.length) throw badRequest('No matched surplus is waiting for pickup');
  const vehicleRows = await repo.availableVehicles(scope.orgId);
  if (!vehicleRows.length) throw badRequest('No available vehicles');
  const vehicles = vehicleRows.map((v) => ({ id: v.id, start: { lat: v.start_lat, lng: v.start_lng }, capacityKg: v.capacity_kg, speedKmph: routing.avgSpeedKmph }));
  const solution = vrp.solve({ vehicles, requests: toRequests(deliveries, routing), circuity: routing.circuity });
  const trips = await db.transaction(async (client) => {
    const out = [];
    for (const plan of solution.plans) out.push(await persistPlan(plan, vehicles.find((v) => v.id === plan.vehicleId), solution.stats, client));
    await audit.record(actor, 'logistics.optimize', 'trip', out.map((t) => t.id).join(','), { ...solution.stats, unassigned: solution.unassigned }, client);
    return out;
  });
  for (const id of solution.unassigned) {
    const d = deliveries.find((x) => x.id === id);
    await alerts.raise({ siteId: d.site_id, type: 'unroutable', severity: 'critical', title: `"${d.title}" cannot be delivered in time`, detail: 'No vehicle can reach the recipient within the safe window. Consider a closer recipient or compost.', entityRef: `surplus:${id}` });
  }
  logger.info({ trips: trips.length, ...solution.stats }, 'routes optimised');
  publish('trips', { created: trips.map((t) => t.id) });
  return { trips, ...solution };
}

module.exports = { optimize, handoffToken, hashToken };
