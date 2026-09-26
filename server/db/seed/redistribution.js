// Historical redistribution records (listings → accepted offers → completed trips → QR hand-offs) and
// today's open surplus, which the live matching engine picks up on first start.
const crypto = require('crypto');
const { roadKm } = require('../../lib/geo');
const { parseDate } = require('../../lib/time');

const SLOT_HOUR = { breakfast: 9, lunch: 14, snacks: 17, dinner: 21 };
const MIN_LISTING_KG = 6;

function categoryFor(slot) {
  return slot === 'breakfast' || slot === 'snacks' ? 'cooked_breakfast' : 'cooked_rice_dal';
}

function nearestAccepting(origin, recipients, category, usedToday) {
  return recipients
    .filter((r) => r.accepts_categories.includes(category) && (usedToday.get(r.id) || 0) < r.daily_capacity_kg)
    .map((r) => ({ r, km: roadKm(origin, r, 1.35) }))
    .sort((a, b) => a.km - b.km)[0];
}

async function insertListing(client, l) {
  const r = await client.query(
    `INSERT INTO surplus_listings (site_id, meal_log_id, production_run_id, title, category_code, quantity_kg, portions, prepared_at, safe_until, freshness_score, status, channel, assigned_site_id, sale_price, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [l.siteId, l.mealLogId ?? null, l.runId ?? null, l.title, l.category, l.kg, l.portions ?? null, l.preparedAt, l.safeUntil, l.freshness, l.status, l.channel ?? null, l.assignedSiteId ?? null, l.salePrice ?? null, l.createdAt]
  );
  return r.rows[0].id;
}

async function completedTrip(client, ctx, listingId, l, match, rejected) {
  const vehicle = ctx.rng.pick(ctx.vehicles);
  const pickupAt = new Date(l.createdAt.getTime() + ctx.rng.between(15, 40) * 60000);
  const dropAt = new Date(pickupAt.getTime() + ((match.km / 22) * 60 + 10) * 60000);
  const t = await client.query(
    `INSERT INTO trips (vehicle_id, status, planned_km, planned_minutes, actual_km, geometry, optimizer, started_at, completed_at, created_at)
     VALUES ($1,'completed',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [vehicle.id, match.km.toFixed(2), ((dropAt - l.createdAt) / 60000).toFixed(1), (match.km * ctx.rng.normal(1.05, 0.04)).toFixed(2),
      JSON.stringify([[l.origin.lat, l.origin.lng], [match.r.lat, match.r.lng]]), { algorithm: 'historical' }, l.createdAt, dropAt, l.createdAt]
  );
  const cooked = l.category.startsWith('cooked');
  const pickTemp = cooked ? ctx.rng.normal(67, 2) : ctx.rng.normal(6, 1);
  const dropTemp = rejected ? ctx.rng.normal(44, 3) : cooked ? ctx.rng.normal(62, 1.5) : ctx.rng.normal(7, 1);
  const hash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');
  await client.query(
    `INSERT INTO trip_stops (trip_id, seq, stop_type, surplus_id, site_id, eta, deadline, status, completed_at, food_temp_c, handoff_token_hash, received_portions, notes) VALUES
     ($1,1,'pickup',$2,$3,$4,$5,'done',$4,$6,NULL,NULL,NULL), ($1,2,'dropoff',$2,$7,$8,$5,$9,$8,$10,$11,$12,$13)`,
    [t.rows[0].id, listingId, l.siteId, pickupAt, l.safeUntil, pickTemp.toFixed(1), match.r.id, dropAt, rejected ? 'failed' : 'done', dropTemp.toFixed(1), hash,
      rejected ? null : l.portions, rejected ? 'Rejected at thermal check' : null]
  );
}

function outcome(rng, afterGoLive) {
  const x = rng.next();
  if (!afterGoLive) return x < 0.7 ? 'delivered' : 'expired';
  return x < 0.86 ? 'delivered' : x < 0.93 ? 'secondary' : x < 0.97 ? 'rejected' : 'expired';
}

async function recordListing(client, ctx, l, result, usedToday) {
  const channelRecipients = result === 'secondary' ? ctx.buyers : ctx.ngos;
  const match = nearestAccepting(l.origin, channelRecipients, l.category, usedToday);
  if (!match || result === 'expired') return insertListing(client, { ...l, status: 'expired' });
  usedToday.set(match.r.id, (usedToday.get(match.r.id) || 0) + l.kg);
  const channel = result === 'secondary' ? 'secondary_sale' : 'donation';
  const salePrice = channel === 'secondary_sale' ? Math.round(l.kg * 60 * 0.4) : null;
  const id = await insertListing(client, { ...l, status: result === 'rejected' ? 'composted' : 'delivered', channel, assignedSiteId: match.r.id, salePrice });
  await client.query(
    `INSERT INTO surplus_offers (surplus_id, recipient_site_id, rank, score, distance_km, eta_min, score_breakdown, status, responded_at, offered_price, created_at)
     VALUES ($1,$2,1,$3,$4,$5,$6,'accepted',$7,$8,$7)`,
    [id, match.r.id, ctx.rng.between(0.6, 0.9).toFixed(4), match.km.toFixed(2), ((match.km / 22) * 60 + 15).toFixed(1), { proximity: 0.8 }, l.createdAt, salePrice]
  );
  await completedTrip(client, ctx, id, l, match, result === 'rejected');
  return id;
}

function listingFromMealLog(log, siteById, goLive, rng) {
  const site = siteById.get(log.site_id);
  const preparedAt = parseDate(log.log_date);
  preparedAt.setHours(SLOT_HOUR[log.meal_slot] - 2, 30);
  const createdAt = new Date(preparedAt.getTime() + 100 * 60000);
  const kg = +(log.leftover_kg * rng.between(0.8, 0.95)).toFixed(1);
  return {
    siteId: log.site_id, mealLogId: log.id, title: `${log.meal_slot[0].toUpperCase()}${log.meal_slot.slice(1)} surplus — ${site.name}`,
    category: categoryFor(log.meal_slot), kg, portions: Math.round(kg / 0.45), preparedAt, safeUntil: new Date(preparedAt.getTime() + 5.5 * 3600000),
    freshness: +rng.between(78, 95).toFixed(1), createdAt, origin: site, afterGoLive: log.log_date >= goLive,
  };
}

async function seedRedistribution(client, ctx, mealLogs, goLive) {
  const usedByDay = new Map();
  let count = 0;
  const today = new Date().toDateString();
  for (const log of mealLogs.filter((m) => m.leftover_kg >= MIN_LISTING_KG)) {
    const l = listingFromMealLog(log, ctx.siteById, goLive, ctx.rng);
    if (!l.afterGoLive && !ctx.rng.chance(0.18)) continue; // before FoodSync most surplus was simply binned
    if (l.createdAt.toDateString() === today) {
      await insertListing(client, { ...l, status: 'open', safeUntil: new Date(Date.now() + 3.5 * 3600000), createdAt: new Date() });
      continue;
    }
    const key = log.log_date;
    if (!usedByDay.has(key)) usedByDay.set(key, new Map());
    await recordListing(client, ctx, l, outcome(ctx.rng, l.afterGoLive), usedByDay.get(key));
    count++;
  }
  return count;
}

// Finished-goods overproduction from the plant → secondary buyers.
async function seedPlantSurplus(client, ctx, runsByProduct, plantSite) {
  let count = 0;
  for (const p of Object.values(runsByProduct)) {
    for (const run of p.runs.filter((r) => r.output_kg - r.dispatched_kg > 80)) {
      if (!ctx.rng.chance(0.5)) continue;
      const createdAt = parseDate(run.run_date);
      createdAt.setHours(19, 0);
      const l = { siteId: plantSite.id, runId: run.id, title: `Excess ${p.name} — batch ${run.run_date}`, category: p.category, kg: +((run.output_kg - run.dispatched_kg) * 0.8).toFixed(0), preparedAt: createdAt, safeUntil: new Date(createdAt.getTime() + 20 * 86400000), freshness: 96, createdAt, origin: plantSite };
      await recordListing(client, ctx, l, ctx.rng.chance(0.85) ? 'secondary' : 'expired', new Map());
      count++;
    }
  }
  return count;
}

module.exports = { seedRedistribution, seedPlantSurplus };
