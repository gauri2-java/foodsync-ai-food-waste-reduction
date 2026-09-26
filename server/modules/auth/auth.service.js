const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const db = require('../../lib/db');
const repo = require('./auth.repository');
const directory = require('../directory/directory.service');
const audit = require('../audit/audit.service');
const { validate, oneOf } = require('../../lib/validate');
const { unauthorized, badRequest, conflict, notFound } = require('../../lib/errors');

// Roles a person may self-register for, and the organisation type each requires.
const SELF_SERVICE_ROLES = {
  kitchen_manager: 'institution',
  plant_manager: 'processor',
  quality_officer: null,
  ngo_coordinator: 'ngo',
  buyer: 'buyer',
  driver: null,
  auditor: 'regulator',
};

function issueToken(user) {
  const claims = { id: user.id, role: user.role, orgId: user.org_id, name: user.full_name };
  return jwt.sign(claims, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email, role: u.role, orgId: u.org_id, orgName: u.org_name, orgType: u.org_type, orgVerified: u.org_verified });

async function login(body) {
  const { email, password } = validate(body, { email: 'string', password: 'string' });
  const user = await repo.findByEmail(email);
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) throw unauthorized('Invalid email or password');
  await audit.record(user, 'auth.login', 'user', user.id, {});
  return { token: issueToken(user), user: publicUser(user) };
}

async function resolveOrganization(data, client) {
  if (data.org_id) return data.org_id;
  if (!data.org_name) throw badRequest('Choose an existing organisation or enter a new organisation name');
  const orgType = SELF_SERVICE_ROLES[data.role];
  if (!orgType) throw badRequest('This role must join an existing organisation');
  const org = await directory.createOrganization({ name: data.org_name, org_type: orgType, contact_email: data.email, contact_phone: data.phone }, null, client);
  return org.id;
}

async function register(body) {
  const data = validate(body, { full_name: 'string', email: 'string', password: 'string', role: 'string', phone: 'string?', org_id: 'int?', org_name: 'string?' });
  oneOf(data.role, Object.keys(SELF_SERVICE_ROLES), 'role');
  if (data.password.length < 8) throw badRequest('Password must be at least 8 characters');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw badRequest('Enter a valid email address');
  if (await repo.findByEmail(data.email)) throw conflict('An account with this email already exists');
  const passwordHash = await bcrypt.hash(data.password, 10);
  const created = await db.transaction(async (client) => {
    const orgId = await resolveOrganization(data, client);
    const user = await repo.insertUser({ orgId, fullName: data.full_name, email: data.email, passwordHash, role: data.role, phone: data.phone }, client);
    await audit.record(user, 'auth.register', 'user', user.id, { role: user.role, orgId }, client);
    return user;
  });
  const full = await repo.findById(created.id);
  return { token: issueToken(full), user: publicUser(full) };
}

async function me(userId) {
  const user = await repo.findById(userId);
  if (!user) throw notFound('User');
  return publicUser(user);
}

module.exports = { login, register, me, hashPassword: (p) => bcrypt.hash(p, 10) };
