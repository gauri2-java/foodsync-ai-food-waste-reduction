const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../lib/errors');

function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  // EventSource and file downloads cannot set headers, so a query token is accepted too.
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.access_token;
  if (!token) return next(unauthorized());
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(unauthorized('Session expired or invalid token'));
  }
}

// Usage: requireRole('kitchen_manager', 'quality_officer'). Admin always passes.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    next(forbidden());
  };
}

module.exports = { authenticate, requireRole };
