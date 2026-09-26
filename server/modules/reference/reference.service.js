const repo = require('./reference.repository');
const audit = require('../audit/audit.service');
const { validate, oneOf } = require('../../lib/validate');
const { notFound } = require('../../lib/errors');
const { isoDate, addDays } = require('../../lib/time');

const EVENT_TYPES = ['holiday', 'exam', 'festival', 'vacation', 'special_event'];

const listCategories = () => repo.listCategories();

async function getCategory(code) {
  const c = await repo.findCategory(code);
  if (!c) throw notFound(`Food category '${code}'`);
  return c;
}

async function saveCategory(body, actor) {
  const data = validate(body, {
    code: 'string', name: 'string', is_cooked: 'bool', shelf_life_ref_h: 'number', ref_temp_c: 'number', q10: 'number',
    co2e_per_kg: 'number', water_l_per_kg: 'number', land_m2_per_kg: 'number', cost_per_kg: 'number',
  });
  const saved = await repo.upsertCategory(data);
  await audit.record(actor, 'category.save', 'food_category', data.code, data);
  return saved;
}

const listIngredients = () => repo.listIngredients();

async function createIngredient(body, actor) {
  const data = validate(body, { name: 'string', unit: 'string?', category_code: 'string', unit_cost: 'number?' });
  const row = await repo.insertIngredient(data);
  await audit.record(actor, 'ingredient.create', 'ingredient', row.id, data);
  return row;
}

function listEvents(query) {
  const from = query.from || isoDate(addDays(new Date(), -30));
  const to = query.to || isoDate(addDays(new Date(), 60));
  return repo.listEvents({ from, to, siteId: query.siteId ? Number(query.siteId) : null });
}

async function createEvent(body, actor) {
  const data = validate(body, { site_id: 'int?', event_date: 'date', event_type: 'string', title: 'string', attendance_factor: 'number?' });
  oneOf(data.event_type, EVENT_TYPES, 'event_type');
  const row = await repo.insertEvent(data);
  await audit.record(actor, 'calendar.create', 'calendar_event', row.id, data);
  return row;
}

async function deleteEvent(id, actor) {
  const row = await repo.deleteEvent(id);
  if (!row) throw notFound('Calendar event');
  await audit.record(actor, 'calendar.delete', 'calendar_event', id, {});
  return row;
}

module.exports = { listCategories, getCategory, saveCategory, listIngredients, createIngredient, listEvents, createEvent, deleteEvent };
