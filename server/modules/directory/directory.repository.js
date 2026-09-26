const db = require('../../lib/db');

const listOrganizations = (type) =>
  db.query(
    `SELECT o.*, (SELECT count(*)::int FROM sites s WHERE s.org_id = o.id) AS site_count
     FROM organizations o WHERE ($1::text IS NULL OR o.org_type = $1) ORDER BY o.org_type, o.name`,
    [type || null]
  );

const findOrganization = (id) => db.one('SELECT * FROM organizations WHERE id = $1', [id]);

const insertOrganization = (o, client) =>
  db.one(
    `INSERT INTO organizations (name, org_type, registration_no, contact_phone, contact_email, verified)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [o.name, o.org_type, o.registration_no || null, o.contact_phone || null, o.contact_email || null, o.verified ?? false],
    client
  );

const setVerified = (id, verified) => db.one('UPDATE organizations SET verified = $2 WHERE id = $1 RETURNING *', [id, verified]);

const SITE_COLUMNS = `s.*, o.name AS org_name, o.org_type, o.verified AS org_verified`;

const listSites = ({ orgId, siteType, siteIds }) =>
  db.query(
    `SELECT ${SITE_COLUMNS} FROM sites s JOIN organizations o ON o.id = s.org_id
     WHERE ($1::int IS NULL OR s.org_id = $1) AND ($2::text IS NULL OR s.site_type = $2)
       AND ($3::int[] IS NULL OR s.id = ANY($3))
     ORDER BY s.site_type, s.name`,
    [orgId || null, siteType || null, siteIds || null]
  );

const findSite = (id) => db.one(`SELECT ${SITE_COLUMNS} FROM sites s JOIN organizations o ON o.id = s.org_id WHERE s.id = $1`, [id]);

const siteIdsForOrg = (orgId) => db.query('SELECT id FROM sites WHERE org_id = $1', [orgId]);

const insertSite = (s, client) =>
  db.one(
    `INSERT INTO sites (org_id, name, site_type, address, lat, lng, enrolled_headcount, daily_capacity_kg, accepts_categories, opens_at, closes_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'06:00'::time),COALESCE($11,'22:00'::time)) RETURNING *`,
    [s.org_id, s.name, s.site_type, s.address || null, s.lat, s.lng, s.enrolled_headcount || null, s.daily_capacity_kg || null, s.accepts_categories || [], s.opens_at || null, s.closes_at || null],
    client
  );

const updateSite = (id, s) =>
  db.one(
    `UPDATE sites SET name = COALESCE($2,name), address = COALESCE($3,address), lat = COALESCE($4,lat), lng = COALESCE($5,lng),
       enrolled_headcount = COALESCE($6,enrolled_headcount), daily_capacity_kg = COALESCE($7,daily_capacity_kg),
       accepts_categories = COALESCE($8,accepts_categories), active = COALESCE($9,active),
       opens_at = COALESCE($10::time,opens_at), closes_at = COALESCE($11::time,closes_at)
     WHERE id = $1 RETURNING *`,
    [id, s.name, s.address, s.lat, s.lng, s.enrolled_headcount, s.daily_capacity_kg, s.accepts_categories, s.active, s.opens_at, s.closes_at]
  );

const listUsers = (orgId) =>
  db.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.phone, u.active, u.org_id, o.name AS org_name, u.created_at
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id
     WHERE ($1::int IS NULL OR u.org_id = $1) ORDER BY u.role, u.full_name`,
    [orgId || null]
  );

const setUserActive = (id, active) => db.one('UPDATE users SET active = $2 WHERE id = $1 RETURNING id, full_name, active', [id, active]);

module.exports = {
  listOrganizations, findOrganization, insertOrganization, setVerified,
  listSites, findSite, siteIdsForOrg, insertSite, updateSite, listUsers, setUserActive,
};
