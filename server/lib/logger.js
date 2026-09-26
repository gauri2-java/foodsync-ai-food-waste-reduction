const pino = require('pino');
const config = require('../config');

// Structured JSON logs; level driven by LOG_LEVEL. Secrets are redacted defensively.
module.exports = pino({
  level: config.logLevel,
  base: { service: 'foodsync' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', 'password', 'password_hash', 'apiKey', 'token'],
});
