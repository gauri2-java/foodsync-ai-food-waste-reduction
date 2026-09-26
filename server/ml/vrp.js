// Perishability-aware pickup-and-delivery vehicle routing (PDPTW variant).
// Each request = pickup at donor site → drop at recipient, with a hard deadline (end of Safe
// Consumption Window) and a load. Solved with regret-2 insertion + relocate local search.
const { roadKm } = require('../lib/geo');

function evaluateRoute(vehicle, stops, ctx) {
  let pos = vehicle.start;
  let t = ctx.nowMs;
  let load = 0;
  let km = 0;
  let lateness = 0;
  const etas = [];
  for (const s of stops) {
    const d = roadKm(pos, s.loc, ctx.circuity);
    km += d;
    t += (d / vehicle.speedKmph) * 3600000;
    if (s.type === 'pickup') t = Math.max(t, s.readyAt);
    etas.push(t);
    t += s.serviceMin * 60000;
    load += s.type === 'pickup' ? s.kg : -s.kg;
    if (load > vehicle.capacityKg + 1e-6) return { feasible: false };
    if (s.type === 'dropoff' && t > s.deadline) lateness += t - s.deadline;
    pos = s.loc;
  }
  if (lateness > 0) return { feasible: false };
  return { feasible: true, km, minutes: (t - ctx.nowMs) / 60000, etas };
}

// Objective: distance plus a small urgency term so tight-deadline food is delivered sooner.
function routeCost(result) {
  return result.km + result.minutes * 0.01;
}

function toStops(req) {
  const common = { requestId: req.id, kg: req.kg, deadline: req.deadline, readyAt: req.readyAt ?? 0 };
  return [
    { ...common, type: 'pickup', loc: req.pickup, siteId: req.pickup.siteId, serviceMin: req.serviceMin ?? 10 },
    { ...common, type: 'dropoff', loc: req.drop, siteId: req.drop.siteId, serviceMin: req.serviceMin ?? 10 },
  ];
}

// Best position to insert (pickup, drop) into a vehicle's route; returns delta cost.
function bestInsertion(vehicle, route, req, ctx) {
  const [p, d] = toStops(req);
  const base = route.length ? routeCost(evaluateRoute(vehicle, route, ctx)) : 0;
  let best = null;
  for (let i = 0; i <= route.length; i++) {
    for (let j = i; j <= route.length; j++) {
      const candidate = [...route.slice(0, i), p, ...route.slice(i, j), d, ...route.slice(j)];
      const res = evaluateRoute(vehicle, candidate, ctx);
      if (!res.feasible) continue;
      const delta = routeCost(res) - base;
      if (!best || delta < best.delta) best = { delta, route: candidate };
    }
  }
  return best;
}

function regretInsertion(vehicles, requests, ctx) {
  const routes = new Map(vehicles.map((v) => [v.id, []]));
  const pending = [...requests];
  const unassigned = [];
  while (pending.length) {
    let pick = null;
    for (const req of pending) {
      const options = vehicles
        .map((v) => ({ v, ins: bestInsertion(v, routes.get(v.id), req, ctx) }))
        .filter((o) => o.ins)
        .sort((a, b) => a.ins.delta - b.ins.delta);
      if (!options.length) continue;
      const regret = options.length > 1 ? options[1].ins.delta - options[0].ins.delta : Infinity;
      if (!pick || regret > pick.regret) pick = { req, option: options[0], regret };
    }
    if (!pick) {
      unassigned.push(...pending);
      break;
    }
    routes.set(pick.option.v.id, pick.option.ins.route);
    pending.splice(pending.indexOf(pick.req), 1);
  }
  return { routes, unassigned };
}

function totalCost(vehicles, routes, ctx) {
  return vehicles.reduce((s, v) => {
    const r = routes.get(v.id);
    return s + (r.length ? routeCost(evaluateRoute(v, r, ctx)) : 0);
  }, 0);
}

// Try moving each request to its best position anywhere; keep strictly improving moves.
function relocateSearch(vehicles, routes, requests, ctx, maxPasses = 5) {
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (const req of requests) {
      const owner = vehicles.find((v) => routes.get(v.id).some((s) => s.requestId === req.id));
      if (!owner) continue;
      const before = totalCost(vehicles, routes, ctx);
      const original = routes.get(owner.id);
      routes.set(owner.id, original.filter((s) => s.requestId !== req.id));
      const options = vehicles.map((v) => ({ v, ins: bestInsertion(v, routes.get(v.id), req, ctx) })).filter((o) => o.ins);
      options.sort((a, b) => a.ins.delta - b.ins.delta);
      const saved = options[0];
      if (saved) routes.set(saved.v.id, saved.ins.route);
      if (!saved || totalCost(vehicles, routes, ctx) >= before - 1e-6) {
        if (saved) routes.set(saved.v.id, routes.get(saved.v.id).filter((s) => s.requestId !== req.id));
        routes.set(owner.id, original);
      } else improved = true;
    }
    if (!improved) break;
  }
}

function naiveCost(vehicles, requests, ctx) {
  // Baseline: one dedicated trip per request from the nearest vehicle (how ad-hoc dispatch works today).
  return requests.reduce((s, r) => {
    const v = vehicles.reduce((a, b) => (roadKm(a.start, r.pickup, ctx.circuity) <= roadKm(b.start, r.pickup, ctx.circuity) ? a : b));
    return s + roadKm(v.start, r.pickup, ctx.circuity) + roadKm(r.pickup, r.drop, ctx.circuity);
  }, 0);
}

function solve({ vehicles, requests, nowMs = Date.now(), circuity = 1.35 }) {
  const ctx = { nowMs, circuity };
  const started = process.hrtime.bigint();
  const ordered = [...requests].sort((a, b) => a.deadline - b.deadline);
  const { routes, unassigned } = regretInsertion(vehicles, ordered, ctx);
  relocateSearch(vehicles, routes, ordered.filter((r) => !unassigned.includes(r)), ctx);
  const plans = vehicles
    .filter((v) => routes.get(v.id).length)
    .map((v) => {
      const stops = routes.get(v.id);
      const res = evaluateRoute(v, stops, ctx);
      return { vehicleId: v.id, km: +res.km.toFixed(2), minutes: +res.minutes.toFixed(1), stops: stops.map((s, i) => ({ ...s, eta: new Date(res.etas[i]).toISOString() })) };
    });
  const optimizedKm = plans.reduce((s, p) => s + p.km, 0);
  const baselineKm = naiveCost(vehicles, requests.filter((r) => !unassigned.includes(r)), ctx);
  return {
    plans,
    unassigned: unassigned.map((r) => r.id),
    stats: { optimizedKm: +optimizedKm.toFixed(2), baselineKm: +baselineKm.toFixed(2), solveMs: Number(process.hrtime.bigint() - started) / 1e6 },
  };
}

module.exports = { solve, evaluateRoute };
