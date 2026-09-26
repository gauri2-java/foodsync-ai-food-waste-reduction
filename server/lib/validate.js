const { badRequest } = require('./errors');

// Declarative validator: spec = { field: 'string'|'number'|'int'|'bool'|'date'|'array'|'object' } — '?' suffix = optional.
const checks = {
  string: (v) => typeof v === 'string' && v.trim().length > 0,
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  int: (v) => Number.isInteger(v),
  bool: (v) => typeof v === 'boolean',
  date: (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)),
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
};

function coerce(type, value) {
  if ((type === 'number' || type === 'int') && typeof value === 'string' && value.trim() !== '') return Number(value);
  if (type === 'bool' && (value === 'true' || value === 'false')) return value === 'true';
  return value;
}

function validate(body, spec) {
  const out = {};
  const errors = [];
  for (const [field, rawType] of Object.entries(spec)) {
    const optional = rawType.endsWith('?');
    const type = optional ? rawType.slice(0, -1) : rawType;
    const value = coerce(type, body?.[field]);
    if (value === undefined || value === null || value === '') {
      if (!optional) errors.push(`${field} is required`);
      continue;
    }
    if (!checks[type](value)) errors.push(`${field} must be a valid ${type}`);
    else out[field] = typeof value === 'string' ? value.trim() : value;
  }
  if (errors.length) throw badRequest('Validation failed', errors);
  return out;
}

function oneOf(value, allowed, field) {
  if (value !== undefined && !allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

module.exports = { validate, oneOf };
