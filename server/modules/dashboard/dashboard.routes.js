const controller = require('./dashboard.controller');

const publicRouter = require('express').Router();
publicRouter.get('/stats', controller.publicStats);
publicRouter.get('/organizations', controller.publicOrganizations);

const router = require('express').Router();
router.get('/overview', controller.overview);
router.get('/ticker', controller.ticker);
router.get('/stream', controller.stream);

module.exports = { router, publicRouter };
