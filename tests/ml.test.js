// Unit tests for the analytics engines (no database needed): `npm test`
process.env.DATABASE_URL ??= 'postgres://unused';
process.env.JWT_SECRET ??= 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const forecaster = require('../server/ml/forecaster');
const vrp = require('../server/ml/vrp');
const shelfLife = require('../server/ml/shelfLife');
const iforest = require('../server/ml/isolationForest');
const vision = require('../server/ml/vision');
const { rankRecipients } = require('../server/ml/matching');
const { isoDate, addDays } = require('../server/lib/time');

function syntheticSeries(days) {
  const out = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = days; k > 0; k--) {
    const d = addDays(new Date('2026-06-01T00:00:00'), -k);
    const dow = d.getDay();
    const exam = k % 45 < 6;
    const y = 800 * (dow === 0 ? 0.7 : dow === 6 ? 0.82 : 1) * (exam ? 1.1 : 1) * (1 + (rand() - 0.5) * 0.06);
    out.push({ date: isoDate(d), y, events: { exam }, tempMax: 32, rainMm: 0 });
  }
  return out;
}

test('forecaster beats seasonal-naive baseline and yields intervals', () => {
  const history = syntheticSeries(200);
  const { model, metrics } = forecaster.train(history, { holdoutDays: 14 });
  assert.ok(metrics.mape < metrics.baselineMape, `model ${metrics.mape} should beat baseline ${metrics.baselineMape}`);
  assert.ok(metrics.mape < 6, `MAPE ${metrics.mape} should be small on clean weekly data`);
  const last = history[history.length - 1].date;
  const future = [1, 2, 3].map((k) => ({ date: isoDate(addDays(new Date(`${last}T00:00:00`), k)), events: {}, tempMax: 32, rainMm: 0 }));
  const preds = forecaster.predict(model, history, future, 1.28);
  assert.equal(preds.length, 3);
  for (const p of preds) assert.ok(p.lower <= p.predicted && p.predicted <= p.upper);
});

test('VRP respects capacity and deadlines, and beats one-trip-per-request', () => {
  const now = Date.now();
  const at = (n, e) => ({ lat: 28.6 + n / 111, lng: 77.2 + e / 97 });
  const requests = [1, 2, 3, 4].map((i) => ({ id: i, kg: 40, pickup: { ...at(i, 0), siteId: i }, drop: { ...at(i, 3), siteId: 10 + i }, deadline: now + 3 * 3600000 }));
  const vehicles = [{ id: 'A', start: at(0, 0), capacityKg: 100, speedKmph: 25 }, { id: 'B', start: at(0, 0), capacityKg: 100, speedKmph: 25 }];
  const { plans, unassigned, stats } = vrp.solve({ vehicles, requests, nowMs: now });
  assert.deepEqual(unassigned, []);
  for (const p of plans) {
    let load = 0;
    for (const s of p.stops) {
      load += s.type === 'pickup' ? s.kg : -s.kg;
      assert.ok(load <= 100);
      if (s.type === 'dropoff') assert.ok(p.stops.findIndex((x) => x.requestId === s.requestId && x.type === 'pickup') < p.stops.indexOf(s));
    }
  }
  assert.ok(stats.optimizedKm <= stats.baselineKm);
});

test('VRP leaves undeliverable requests unassigned', () => {
  const now = Date.now();
  const req = { id: 9, kg: 10, pickup: { lat: 28.6, lng: 77.2, siteId: 1 }, drop: { lat: 29.6, lng: 77.2, siteId: 2 }, deadline: now + 10 * 60000 };
  const { unassigned } = vrp.solve({ vehicles: [{ id: 1, start: { lat: 28.6, lng: 77.2 }, capacityKg: 100, speedKmph: 25 }], requests: [req], nowMs: now });
  assert.deepEqual(unassigned, [9]);
});

const COOKED = { is_cooked: true, shelf_life_ref_h: 6, ref_temp_c: 25, q10: 2.5 };
const THRESHOLDS = { nh3WarnPpm: 25, nh3CriticalPpm: 60, co2WarnPpm: 2000, dangerZoneMaxHours: 4, cookedMaxHours: 12, unsafeScore: 35, degradedScore: 55, useQuicklyHours: 2 };

test('shelf-life: hot-held food keeps longer than food in the danger zone', () => {
  const hot = shelfLife.assess({ hoursSincePrep: 1, foodTempC: 65 }, COOKED, THRESHOLDS);
  const warm = shelfLife.assess({ hoursSincePrep: 1, foodTempC: 35 }, COOKED, THRESHOLDS);
  assert.ok(hot.scwHours > warm.scwHours);
  assert.ok(hot.scwHours <= 11);
});

test('shelf-life: danger-zone limit and gas veto make food unsafe', () => {
  assert.equal(shelfLife.assess({ hoursSincePrep: 4.5, foodTempC: 30 }, COOKED, THRESHOLDS).verdict, 'unsafe');
  const gassy = shelfLife.assess({ hoursSincePrep: 0.5, foodTempC: 65, sensor: { nh3_ppm: 80 } }, COOKED, THRESHOLDS);
  assert.notEqual(gassy.verdict, 'safe');
});

test('isolation forest scores an outlier higher than normal points', () => {
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const pts = Array.from({ length: 500 }, () => [10 + gauss() * 0.5, 100 + gauss() * 3]);
  const model = iforest.fit(pts, { trees: 100, sampleSize: 128 });
  assert.ok(iforest.score(model, [25, 60]) > iforest.score(model, [10, 100]) + 0.1);
});

async function patchImage(colours) {
  const w = 160;
  const buf = Buffer.alloc(w * w * 3);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const c = colours[(Math.floor(x / 20) + Math.floor(y / 20) * 3) % colours.length];
    buf.set(c, (y * w + x) * 3);
  }
  return sharp(buf, { raw: { width: w, height: w, channels: 3 } }).png().toBuffer();
}

test('vision: browned/mouldy food scores lower than vivid fresh food', async () => {
  const fresh = vision.ruleScore(await vision.extractFeatures(await patchImage([[235, 200, 60], [70, 170, 60], [220, 90, 40]])));
  const spoiled = vision.ruleScore(await vision.extractFeatures(await patchImage([[110, 70, 30], [30, 26, 22], [175, 178, 170], [120, 85, 40]])));
  assert.ok(fresh.score > 85, `fresh ${fresh.score}`);
  assert.ok(spoiled.score < 55, `spoiled ${spoiled.score}`);
});

test('matching prefers feasible, closer recipients and rejects wrong categories', () => {
  const listing = { origin: { lat: 28.6, lng: 77.2 }, categoryCode: 'cooked_curry', quantityKg: 20, safeUntilMs: Date.now() + 4 * 3600000 };
  const base = { remaining_capacity_kg: 100, received_kg_7d: 0, open_now: true, accepts_categories: ['cooked_curry'] };
  const ranked = rankRecipients(listing, [
    { ...base, id: 1, name: 'far', lat: 28.7, lng: 77.2 },
    { ...base, id: 2, name: 'near', lat: 28.61, lng: 77.2 },
    { ...base, id: 3, name: 'wrong', lat: 28.605, lng: 77.2, accepts_categories: ['bakery'] },
  ], { circuity: 1.35, speedKmph: 22, handlingMin: 15, maxRadiusKm: 25, consumptionBufferH: 1, nowMs: Date.now(), weights: { proximity: 0.35, capacity: 0.2, fairness: 0.2, slack: 0.25 } });
  assert.equal(ranked[0].name, 'near');
  assert.equal(ranked.find((r) => r.name === 'wrong').feasible, false);
});
