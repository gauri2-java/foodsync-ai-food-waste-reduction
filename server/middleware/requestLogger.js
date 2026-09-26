const crypto = require('crypto');
const logger = require('../lib/logger');

// Logs the start and end of every API request with a monotonic duration.
module.exports = function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  const start = process.hrtime.bigint();
  const path = req.originalUrl.split('?')[0];
  req.id = req.get('x-request-id') || crypto.randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('x-request-id', req.id);
  req.log.info({ method: req.method, path }, 'request started');
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const payload = { method: req.method, path, status: res.statusCode, durationMs: +durationMs.toFixed(1), userId: req.user?.id };
    if (res.statusCode >= 500) req.log.error(payload, 'request failed');
    else if (res.statusCode >= 400) req.log.warn(payload, 'request completed with client error');
    else req.log.info(payload, 'request completed');
  });
  next();
};
