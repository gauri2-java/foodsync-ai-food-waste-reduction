const repo = require('./directory.repository');
const audit = require('../audit/audit.service');
const { validate, oneOf } = require('../../lib/validate');
const { notFound, forbidden } = require('../../lib/errors');

const ORG_TYPES = ['institution', 'processor', 'ngo', 'buyer', 'compost', 'logistics', 'regulator'];
const SITE_TYPES = ['kitchen', 'plant', 'ngo_center', 'buyer_depot', 'compost_facility', 'depot'];
const GLOBAL_ROLES = ['admin', 'auditor'];

// Which sites a user may see/act on. null = unrestricted.
async function scopeFor(user) {
  if (GLOBAL_ROLES.includes(user.role) || !user.orgId) return { orgId: null, siteIds: null };
  const rows = await repo.siteIdsForOrg(user.orgId);
  return { orgId: user.orgId, siteIds: rows.map((r) => r.id) };
}

function assertSiteInScope(scope, siteId) {
  if (scope.siteIds && !scope.siteIds.includes(Number(siteId))) throw forbidden('This site belongs to another organisation');
}

const listOrganizations = (type) => repo.listOrganizations(type);

async function createOrganization(body, actor, client) {
  const data = validate(body, { name: 'string', org_type: 'string', registration_no: 'string?', contact_phone: 'string?', contact_email: 'string?' });
  oneOf(data.org_type, ORG_TYPES, 'org_type');
  const org = await repo.insertOrganization({ ...data, verified: actor?.role === 'admin' }, client);
  await audit.record(actor, 'organization.create', 'organization', org.id, { name: org.name, type: org.org_type }, client);
  return org;
}

async function verifyOrganization(id, verified, actor) {
  const org = await repo.setVerified(id, verified);
  if (!org) throw notFound('Organisation');
  await audit.record(actor, verified ? 'organization.verify' : 'organization.unverify', 'organization', id, { name: org.name });
  return org;
}

const listSites = (query, scope) => repo.listSites({ orgId: query.orgId, siteType: query.type, siteIds: query.all === 'true' ? null : scope.siteIds });

async function getSite(id) {
  const site = await repo.findSite(id);
  if (!site) throw notFound('Site');
  return site;
}

const SITE_SPEC = {
  org_id: 'int', name: 'string', site_type: 'string', address: 'string?', lat: 'number', lng: 'number',
  enrolled_headcount: 'int?', daily_capacity_kg: 'number?', accepts_categories: 'array?', opens_at: 'string?', closes_at: 'string?',
};

async function createSite(body, actor, scope) {
  const data = validate(body, SITE_SPEC);
  oneOf(data.site_type, SITE_TYPES, 'site_type');
  if (scope.orgId && scope.orgId !== data.org_id) throw forbidden('You can only add sites to your own organisation');
  const site = await repo.insertSite(data);
  await audit.record(actor, 'site.create', 'site', site.id, { name: site.name, type: site.site_type });
  return site;
}

async function updateSite(id, body, actor, scope) {
  assertSiteInScope(scope, id);
  const optional = Object.fromEntries(Object.entries(SITE_SPEC).filter(([k]) => !['org_id', 'site_type'].includes(k)).map(([k, t]) => [k, t.replace('?', '') + '?']));
  const data = validate(body, { ...optional, active: 'bool?' });
  const site = await repo.updateSite(id, data);
  if (!site) throw notFound('Site');
  await audit.record(actor, 'site.update', 'site', id, data);
  return site;
}

const listUsers = (scope) => repo.listUsers(scope.orgId);

async function setUserActive(id, active, actor) {
  const user = await repo.setUserActive(id, active);
  if (!user) throw notFound('User');
  await audit.record(actor, active ? 'user.activate' : 'user.deactivate', 'user', id, {});
  return user;
}

module.exports = {
  ORG_TYPES, SITE_TYPES, scopeFor, assertSiteInScope, listOrganizations, createOrganization, verifyOrganization,
  listSites, getSite, createSite, updateSite, listUsers, setUserActive,
};
