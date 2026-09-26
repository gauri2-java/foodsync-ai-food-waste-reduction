const db = require('../../lib/db');

const findByEmail = (email) =>
  db.one(
    `SELECT u.*, o.name AS org_name, o.org_type, o.verified AS org_verified
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE lower(u.email) = lower($1)`,
    [email]
  );

const findById = (id) =>
  db.one(
    `SELECT u.id, u.full_name, u.email, u.role, u.phone, u.org_id, o.name AS org_name, o.org_type, o.verified AS org_verified
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE u.id = $1`,
    [id]
  );

const insertUser = (u, client) =>
  db.one(
    `INSERT INTO users (org_id, full_name, email, password_hash, role, phone)
     VALUES ($1,$2,lower($3),$4,$5,$6) RETURNING id, full_name, email, role, org_id`,
    [u.orgId, u.fullName, u.email, u.passwordHash, u.role, u.phone || null],
    client
  );

module.exports = { findByEmail, findById, insertUser };
