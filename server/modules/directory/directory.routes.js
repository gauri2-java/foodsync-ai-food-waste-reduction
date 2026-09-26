const router = require('express').Router();
const controller = require('./directory.controller');
const { requireRole } = require('../../middleware/auth');

const MANAGERS = ['kitchen_manager', 'plant_manager', 'ngo_coordinator', 'buyer'];

router.get('/organizations', controller.listOrganizations);
router.post('/organizations', requireRole('admin'), controller.createOrganization);
router.post('/organizations/:id/verify', requireRole('admin'), controller.verifyOrganization);
router.get('/sites', controller.listSites);
router.get('/sites/:id', controller.getSite);
router.post('/sites', requireRole(...MANAGERS), controller.createSite);
router.patch('/sites/:id', requireRole(...MANAGERS), controller.updateSite);
router.get('/users', requireRole(...MANAGERS), controller.listUsers);
router.post('/users/:id/active', requireRole('admin'), controller.setUserActive);

module.exports = router;
