// Organisations, sites, users and fleet for a demo city. Locations are generated around SEED_CITY_LAT/LNG.
const bcrypt = require('bcryptjs');

const ALL_COOKED = ['cooked_rice_dal', 'cooked_curry', 'cooked_bread', 'cooked_dairy', 'cooked_breakfast'];

const ORGS = [
  { key: 'uni', name: 'Greenfield University', type: 'institution', sites: [
    { key: 'k1', name: 'Central Dining Hall', type: 'kitchen', headcount: 1400, at: [0.6, -1.2] },
    { key: 'k2', name: 'North Hostel Mess', type: 'kitchen', headcount: 820, at: [2.1, -0.4] }] },
  { key: 'corp', name: 'Metro Tech Park Cafeteria', type: 'institution', sites: [{ key: 'k3', name: 'Tech Park Food Court', type: 'kitchen', headcount: 950, at: [-3.2, 4.1] }] },
  { key: 'agro', name: 'Sunrise Agro Foods Pvt Ltd', type: 'processor', sites: [{ key: 'plant', name: 'Sunrise Processing Plant', type: 'plant', at: [-6.5, -5.2] }] },
  { key: 'ngo1', name: 'Annapurna Community Kitchen', type: 'ngo', sites: [{ key: 'n1', name: 'Annapurna Kitchen — Old City', type: 'ngo_center', cap: 180, accepts: [...ALL_COOKED, 'bakery', 'fresh_produce', 'fruits', 'grains_pulses', 'dairy_raw'], at: [1.5, 2.2] }] },
  { key: 'ngo2', name: 'Hope Night Shelter Trust', type: 'ngo', sites: [{ key: 'n2', name: 'Hope Shelter — Ward 12', type: 'ngo_center', cap: 90, accepts: [...ALL_COOKED, 'bakery', 'fruits'], hours: ['16:00', '23:30'], at: [-1.8, 1.1] }] },
  { key: 'ngo3', name: 'Little Stars Children’s Home', type: 'ngo', sites: [{ key: 'n3', name: 'Little Stars Home', type: 'ngo_center', cap: 70, accepts: ['cooked_rice_dal', 'cooked_curry', 'cooked_bread', 'cooked_breakfast', 'fruits', 'dairy_raw', 'bakery'], at: [3.8, 1.6] }] },
  { key: 'ngo4', name: 'Seva Elderly Care Society', type: 'ngo', sites: [{ key: 'n4', name: 'Seva Old-Age Home', type: 'ngo_center', cap: 60, accepts: ['cooked_rice_dal', 'cooked_curry', 'cooked_bread', 'cooked_breakfast', 'fruits'], at: [-4.4, -1.9] }] },
  { key: 'ngo5', name: 'Roti Bank Collective', type: 'ngo', sites: [{ key: 'n5', name: 'Roti Bank — Station Road', type: 'ngo_center', cap: 150, accepts: [...ALL_COOKED, 'bakery'], at: [0.2, 5.3] }] },
  { key: 'ngo6', name: 'Udaan Street Children Foundation', type: 'ngo', verified: false, sites: [{ key: 'n6', name: 'Udaan Drop-in Centre', type: 'ngo_center', cap: 50, accepts: [...ALL_COOKED], at: [5.5, -3.0] }] },
  { key: 'buy1', name: 'GreenFeed Livestock Co-operative', type: 'buyer', sites: [{ key: 'b1', name: 'GreenFeed Collection Depot', type: 'buyer_depot', cap: 800, accepts: ['fresh_produce', 'fruits', 'bakery', 'cooked_rice_dal', 'cooked_bread', 'fruit_pulp'], at: [-8.1, 3.4] }] },
  { key: 'buy2', name: 'ValueMart Discount Grocers', type: 'buyer', sites: [{ key: 'b2', name: 'ValueMart Warehouse', type: 'buyer_depot', cap: 1500, accepts: ['bakery', 'processed_snack', 'fresh_produce', 'fruits', 'grains_pulses', 'fruit_pulp', 'dairy_raw'], at: [-2.6, -6.8] }] },
  { key: 'bio', name: 'BioUrja Biogas & Compost', type: 'compost', sites: [{ key: 'c1', name: 'BioUrja Biogas Plant', type: 'compost_facility', cap: 20000, accepts: ['cooked_rice_dal', 'cooked_curry', 'cooked_bread', 'cooked_dairy', 'cooked_breakfast', 'bakery', 'fresh_produce', 'fruits', 'grains_pulses', 'dairy_raw', 'processed_snack', 'fruit_pulp'], hours: ['00:00', '23:59'], at: [-9.5, -7.5] }] },
  { key: 'fleet', name: 'FoodSync Community Fleet', type: 'logistics', sites: [{ key: 'depot', name: 'Fleet Depot', type: 'depot', at: [-0.8, -2.5] }] },
  { key: 'fso', name: 'District Food Safety Office', type: 'regulator', sites: [] },
];

const USERS = [
  ['System Administrator', 'admin@foodsync.local', 'admin', null],
  ['Kitchen Manager — Greenfield', 'kitchen@foodsync.local', 'kitchen_manager', 'uni'],
  ['Cafeteria Manager — Tech Park', 'cafeteria@foodsync.local', 'kitchen_manager', 'corp'],
  ['Plant Manager — Sunrise', 'plant@foodsync.local', 'plant_manager', 'agro'],
  ['Food Safety Officer — Greenfield', 'quality@foodsync.local', 'quality_officer', 'uni'],
  ['Coordinator — Annapurna', 'ngo@foodsync.local', 'ngo_coordinator', 'ngo1'],
  ['Coordinator — Hope Shelter', 'hope@foodsync.local', 'ngo_coordinator', 'ngo2'],
  ['Coordinator — Little Stars', 'stars@foodsync.local', 'ngo_coordinator', 'ngo3'],
  ['Procurement — GreenFeed', 'buyer@foodsync.local', 'buyer', 'buy1'],
  ['Driver — Van 1', 'driver1@foodsync.local', 'driver', 'fleet'],
  ['Driver — Van 2', 'driver2@foodsync.local', 'driver', 'fleet'],
  ['Driver — Bike 3', 'driver3@foodsync.local', 'driver', 'fleet'],
  ['ESG Auditor', 'auditor@foodsync.local', 'auditor', 'fso'],
];

const VEHICLES = [
  ['FS-VAN-01', 400, true, 'driver1@foodsync.local'],
  ['FS-VAN-02', 300, false, 'driver2@foodsync.local'],
  ['FS-EBIKE-03', 60, false, 'driver3@foodsync.local'],
];

// Offset in km → lat/lng
function place(center, [northKm, eastKm]) {
  return { lat: center.lat + northKm / 111, lng: center.lng + eastKm / (111 * Math.cos((center.lat * Math.PI) / 180)) };
}

async function insertOrgAndSites(client, o, center, ids) {
  const org = await client.query('INSERT INTO organizations (name, org_type, verified, contact_email) VALUES ($1,$2,$3,$4) RETURNING id', [o.name, o.type, o.verified !== false, `contact@${o.key}.example.org`]);
  ids.orgs[o.key] = org.rows[0].id;
  for (const s of o.sites) {
    const p = place(center, s.at);
    const [opens, closes] = s.hours || ['06:00', '22:00'];
    const row = await client.query(
      `INSERT INTO sites (org_id, name, site_type, address, lat, lng, enrolled_headcount, daily_capacity_kg, accepts_categories, opens_at, closes_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [ids.orgs[o.key], s.name, s.type, `${s.name}, ${process.env.SEED_CITY_NAME || 'Demo City'}`, p.lat, p.lng, s.headcount || null, s.cap || null, s.accepts || [], opens, closes]
    );
    ids.sites[s.key] = row.rows[0].id;
  }
}

async function seedOrganizations(client, center, password) {
  const ids = { orgs: {}, sites: {}, users: {} };
  for (const o of ORGS) await insertOrgAndSites(client, o, center, ids);
  const hash = await bcrypt.hash(password, 10);
  for (const [name, email, role, orgKey] of USERS) {
    const r = await client.query('INSERT INTO users (org_id, full_name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id', [orgKey ? ids.orgs[orgKey] : null, name, email, hash, role]);
    ids.users[email] = r.rows[0].id;
  }
  for (const [reg, cap, fridge, driver] of VEHICLES) {
    await client.query('INSERT INTO vehicles (org_id, depot_site_id, registration, capacity_kg, refrigerated, driver_user_id) VALUES ($1,$2,$3,$4,$5,$6)', [ids.orgs.fleet, ids.sites.depot, reg, cap, fridge, ids.users[driver]]);
  }
  return ids;
}

module.exports = { seedOrganizations, USERS };
