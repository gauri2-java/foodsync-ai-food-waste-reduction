const db = require('../../lib/db');

const LISTING_SELECT = `SELECT sl.*, s.name AS site_name, s.lat, s.lng, c.name AS category_name, c.is_cooked,
    rs.name AS assigned_site_name, ro.org_type AS assigned_org_type,
    EXTRACT(EPOCH FROM (sl.safe_until - now())) / 3600 AS hours_left
  FROM surplus_listings sl JOIN sites s ON s.id = sl.site_id JOIN food_categories c ON c.code = sl.category_code
  LEFT JOIN sites rs ON rs.id = sl.assigned_site_id LEFT JOIN organizations ro ON ro.id = rs.org_id`;

const insertListing = (l, client) =>
  db.one(
    `INSERT INTO surplus_listings (site_id, meal_log_id, lot_id, production_run_id, title, category_code, quantity_kg, portions,
       prepared_at, safe_until, freshness_score, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [l.site_id, l.meal_log_id ?? null, l.lot_id ?? null, l.production_run_id ?? null, l.title, l.category_code, l.quantity_kg, l.portions ?? null,
      l.prepared_at, l.safe_until, l.freshness_score ?? null, l.created_by],
    client
  );

const findListing = (id, client) => db.one(`${LISTING_SELECT} WHERE sl.id = $1`, [id], client);
const lockListing = (id, client) => db.one('SELECT * FROM surplus_listings WHERE id = $1 FOR UPDATE', [id], client);

// Donor view: listings from own sites. Recipient view: listings offered/assigned to own sites.
const listListings = ({ siteIds, status, limit }) =>
  db.query(
    `${LISTING_SELECT} WHERE ($1::int[] IS NULL OR sl.site_id = ANY($1) OR sl.assigned_site_id = ANY($1)
       OR EXISTS (SELECT 1 FROM surplus_offers o WHERE o.surplus_id = sl.id AND o.recipient_site_id = ANY($1)))
     AND ($2::text[] IS NULL OR sl.status = ANY($2)) ORDER BY sl.created_at DESC LIMIT $3`,
    [siteIds, status, limit]
  );

const updateListing = (id, fields, client) => {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  return db.one(`UPDATE surplus_listings SET ${sets} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => fields[k])], client);
};

const recipientCandidates = (orgTypes) =>
  db.query(
    `SELECT s.id, s.name, s.lat, s.lng, s.accepts_categories, s.daily_capacity_kg, o.org_type, o.name AS org_name,
       (localtime BETWEEN s.opens_at AND s.closes_at) AS open_now,
       GREATEST(0, COALESCE(s.daily_capacity_kg, 0) - COALESCE((SELECT sum(x.quantity_kg) FROM surplus_listings x
         WHERE x.assigned_site_id = s.id AND x.created_at::date = current_date AND x.status NOT IN ('cancelled','expired')), 0))::float AS remaining_capacity_kg,
       COALESCE((SELECT sum(x.quantity_kg) FROM surplus_listings x WHERE x.assigned_site_id = s.id AND x.status = 'delivered'
         AND x.created_at > now() - interval '7 days'), 0)::float AS received_kg_7d
     FROM sites s JOIN organizations o ON o.id = s.org_id
     WHERE s.active AND o.verified AND o.org_type = ANY($1)`,
    [orgTypes]
  );

const excludedRecipients = (surplusId, client) =>
  db.query(`SELECT recipient_site_id FROM surplus_offers WHERE surplus_id = $1 AND status IN ('declined','expired')`, [surplusId], client);

const insertOffer = (o, client) =>
  db.one(
    `INSERT INTO surplus_offers (surplus_id, recipient_site_id, rank, score, distance_km, eta_min, score_breakdown, offered_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (surplus_id, recipient_site_id) DO UPDATE SET status = 'pending', rank = EXCLUDED.rank, score = EXCLUDED.score, created_at = now()
     RETURNING *`,
    [o.surplusId, o.siteId, o.rank, o.score, o.distanceKm, o.etaMin, o.breakdown, o.offeredPrice ?? null],
    client
  );

const offersForListing = (surplusId) =>
  db.query(
    `SELECT o.*, s.name AS recipient_name, org.org_type FROM surplus_offers o JOIN sites s ON s.id = o.recipient_site_id
     JOIN organizations org ON org.id = s.org_id WHERE o.surplus_id = $1 ORDER BY o.rank`,
    [surplusId]
  );

const findOffer = (id, client) =>
  db.one(`SELECT o.*, s.org_id AS recipient_org_id FROM surplus_offers o JOIN sites s ON s.id = o.recipient_site_id WHERE o.id = $1 FOR UPDATE OF o`, [id], client);

const setOfferStatus = (id, status, userId, client) =>
  db.one('UPDATE surplus_offers SET status = $2, responded_at = now(), responded_by = $3 WHERE id = $1 RETURNING *', [id, status, userId], client);

const supersedeOthers = (surplusId, keepId, client) =>
  db.query(`UPDATE surplus_offers SET status = 'superseded' WHERE surplus_id = $1 AND id <> $2 AND status = 'pending'`, [surplusId, keepId], client);

const supersedePending = (surplusId) => db.query(`UPDATE surplus_offers SET status = 'superseded' WHERE surplus_id = $1 AND status = 'pending'`, [surplusId]);

const pendingCount = (surplusId, client) => db.one(`SELECT count(*)::int AS n FROM surplus_offers WHERE surplus_id = $1 AND status = 'pending'`, [surplusId], client);

const expireStaleOffers = (minutes) =>
  db.query(
    `UPDATE surplus_offers SET status = 'expired' WHERE status = 'pending' AND created_at < now() - make_interval(mins => $1)
     RETURNING surplus_id`,
    [minutes]
  );

const expireListings = () =>
  db.query(
    `UPDATE surplus_listings SET status = 'expired' WHERE status IN ('open','offered') AND safe_until < now()
     RETURNING id, site_id, title, quantity_kg`
  );

const openWithoutOffers = () =>
  db.query(`SELECT id FROM surplus_listings WHERE status = 'open' AND safe_until > now() ORDER BY safe_until LIMIT 50`);

module.exports = {
  insertListing, findListing, lockListing, listListings, updateListing, recipientCandidates, excludedRecipients, insertOffer,
  offersForListing, findOffer, setOfferStatus, supersedeOthers, supersedePending, pendingCount, expireStaleOffers, expireListings, openWithoutOffers,
};
