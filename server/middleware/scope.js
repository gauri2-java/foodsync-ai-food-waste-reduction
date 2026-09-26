const directory = require('../modules/directory/directory.service');

// Attaches req.scope = { orgId, siteIds } so services can restrict data to the user's organisation.
module.exports = async function attachScope(req, res, next) {
  try {
    req.scope = await directory.scopeFor(req.user);
    next();
  } catch (err) {
    next(err);
  }
};
