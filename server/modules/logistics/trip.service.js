// Trip execution: driver starts a trip, confirms pickups (with a food temperature reading), and the
// recipient confirms delivery by scanning the stop's QR code — a thermal gate rejects unsafe food.
const QRCode = require('qrcode');
const db = require('../../lib/db');
const repo = require('./logistics.repository');
const { handoffToken, hashToken } = require('./routing.service');
const settings = require('../settings/settings.service');
const audit = require('../audit/audit.service');
const alerts = require('../alerts/alerts.service');
const { publish } = require('../../lib/eventBus');
const { validate } = require('../../lib/validate');
const { notFound, forbidden, badRequest, conflict } = require('../../lib/errors');
const { hoursBetween } = require('../../lib/time');

const listVehicles = (scope) => repo.listVehicles(scope.orgId);

async function createVehicle(body, actor, scope) {
  const data = validate(body, { registration: 'string', capacity_kg: 'number', refrigerated: 'bool?', depot_site_id: 'int?', driver_user_id: 'int?', org_id: 'int?' });
  const vehicle = await repo.insertVehicle({ ...data, org_id: scope.orgId || data.org_id || actor.orgId });
  await audit.record(actor, 'vehicle.create', 'vehicle', vehicle.id, data);
  return vehicle;
}

async function pingLocation(vehicleId, body, actor) {
  const { lat, lng } = validate(body, { lat: 'number', lng: 'number' });
  const vehicle = await repo.findVehicle(vehicleId);
  if (!vehicle) throw notFound('Vehicle');
  if (actor.role === 'driver' && vehicle.driver_user_id !== actor.id) throw forbidden('Not your vehicle');
  const row = await repo.setVehicleLocation(vehicleId, lat, lng);
  publish('vehicle', { id: row.id, lat, lng, at: row.last_ping_at });
  return row;
}

function listTrips(query, user, scope) {
  const status = query.status ? String(query.status).split(',') : null;
  const driverId = user.role === 'driver' ? user.id : null;
  return repo.listTrips({ siteIds: driverId ? null : scope.siteIds, driverId, status, limit: Math.min(Number(query.limit) || 50, 200) });
}

async function tripDetail(id, user) {
  const trip = await repo.findTrip(id);
  if (!trip) throw notFound('Trip');
  if (user.role === 'driver' && trip.driver_user_id !== user.id) throw forbidden('Not your trip');
  const stops = await repo.stopsForTrip(id);
  return { ...trip, stops: stops.map(({ handoff_token_hash: _h, ...s }) => s) };
}

async function startTrip(id, user) {
  const trip = await repo.findTrip(id);
  if (!trip) throw notFound('Trip');
  if (user.role === 'driver' && trip.driver_user_id !== user.id) throw forbidden('Not your trip');
  if (trip.status !== 'planned') throw conflict(`Trip is ${trip.status}`);
  const row = await repo.setTripStatus(id, 'in_progress');
  await audit.record(user, 'trip.start', 'trip', id, {});
  publish('trips', { id, status: 'in_progress' });
  return row;
}

async function finishTripIfDone(stop, client) {
  const { n } = await repo.openStopCount(stop.trip_id, client);
  if (n > 0) return;
  await repo.setTripStatus(stop.trip_id, 'completed', client);
  await repo.setVehicleStatus(stop.vehicle_id, 'available', client);
}

async function confirmPickup(stopId, body, user) {
  const data = validate(body, { food_temp_c: 'number', notes: 'string?' });
  const result = await db.transaction(async (client) => {
    const stop = await repo.findStop(stopId, client);
    if (!stop || stop.stop_type !== 'pickup') throw notFound('Pickup stop');
    if (stop.status !== 'pending') throw conflict('Pickup already recorded');
    if (stop.trip_status !== 'in_progress') throw badRequest('Start the trip first');
    const row = await repo.completeStop(stopId, { status: 'done', foodTempC: data.food_temp_c, notes: data.notes }, client);
    await repo.setListingStatus(stop.surplus_id, 'in_transit', client);
    await audit.record(user, 'trip.pickup', 'trip_stop', stopId, { surplusId: stop.surplus_id, foodTempC: data.food_temp_c }, client);
    return row;
  });
  publish('surplus', { id: result.surplus_id, status: 'in_transit' });
  return result;
}

// FSSAI-style gate: cooked food must be hot-held (≥60 °C), chilled (≤5 °C) or within the danger-zone time limit.
async function thermalGate(stop, foodTempC) {
  if (!stop.is_cooked) return { pass: true };
  const { dangerZoneMaxHours } = await settings.get('quality');
  const hours = hoursBetween(stop.prepared_at, new Date());
  if (foodTempC >= 60 || foodTempC <= 5 || hours <= dangerZoneMaxHours) return { pass: true };
  return { pass: false, reason: `Food at ${foodTempC} °C after ${hours.toFixed(1)} h exceeds the ${dangerZoneMaxHours} h danger-zone limit` };
}

async function stopQr(stopId, user) {
  const stop = await repo.findStop(stopId);
  if (!stop || stop.stop_type !== 'dropoff') throw notFound('Drop-off stop');
  const trip = await repo.findTrip(stop.trip_id);
  if (user.role === 'driver' && trip.driver_user_id !== user.id) throw forbidden('Not your trip');
  const token = handoffToken(stopId);
  return { stopId, token, qrDataUrl: await QRCode.toDataURL(JSON.stringify({ stop: stopId, token }), { margin: 1, width: 280 }) };
}

async function recordHandoff(stop, data, gate, user, client) {
  const status = gate.pass ? 'done' : 'failed';
  const row = await repo.completeStop(stop.id, { status, foodTempC: data.food_temp_c, receivedPortions: data.received_portions, notes: gate.reason || data.notes }, client);
  await repo.setListingStatus(stop.surplus_id, gate.pass ? 'delivered' : 'composted', client);
  await audit.record(user, gate.pass ? 'handoff.verified' : 'handoff.rejected', 'trip_stop', stop.id, { surplusId: stop.surplus_id, foodTempC: data.food_temp_c, receivedPortions: data.received_portions ?? null, reason: gate.reason ?? null }, client);
  await finishTripIfDone(stop, client);
  return row;
}

async function verifyHandoff(stopId, body, user) {
  const data = validate(body, { token: 'string', food_temp_c: 'number', received_portions: 'int?', notes: 'string?' });
  const result = await db.transaction(async (client) => {
    const stop = await repo.findStop(stopId, client);
    if (!stop || stop.stop_type !== 'dropoff') throw notFound('Drop-off stop');
    const driverAtCompost = user.role === 'driver' && stop.site_org_type === 'compost';
    if (user.role !== 'admin' && !driverAtCompost && stop.site_org_id !== user.orgId) throw forbidden('This delivery is addressed to another organisation');
    if (stop.handoff_token_hash !== hashToken(data.token)) throw forbidden('QR code does not match this delivery');
    if (stop.status !== 'pending') throw conflict('Delivery already confirmed');
    const gate = await thermalGate(stop, data.food_temp_c);
    return { stop: await recordHandoff(stop, data, gate, user, client), gate, siteId: stop.site_id };
  });
  if (!result.gate.pass) await alerts.raise({ siteId: result.siteId, type: 'handoff_rejected', severity: 'critical', title: 'Delivery rejected at thermal check', detail: result.gate.reason, entityRef: `stop:${stopId}` });
  publish('surplus', { id: result.stop.surplus_id, status: result.gate.pass ? 'delivered' : 'composted' });
  return { ...result.stop, accepted: result.gate.pass, reason: result.gate.reason || null };
}

module.exports = { listVehicles, createVehicle, pingLocation, listTrips, tripDetail, startTrip, confirmPickup, stopQr, verifyHandoff };
