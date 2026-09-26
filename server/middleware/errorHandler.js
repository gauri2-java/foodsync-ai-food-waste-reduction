const logger = require('../lib/logger');
const { AppError } = require('../lib/errors');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const log = req.log || logger;
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.code === '23505') return res.status(409).json({ error: 'A record with these values already exists', details: err.detail });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist', details: err.detail });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid value format', details: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
  log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', requestId: req.id });
};
