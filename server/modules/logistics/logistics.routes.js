const router = require('express').Router();
const controller = require('./logistics.controller');
const { requireRole } = require('../../middleware/auth');

const DISPATCHERS = ['kitchen_manager', 'plant_manager'];

router.get('/vehicles', controller.listVehicles);
router.post('/vehicles', requireRole(...DISPATCHERS), controller.createVehicle);
router.post('/vehicles/:id/location', requireRole('driver'), controller.pingLocation);
router.post('/optimize', requireRole(...DISPATCHERS), controller.optimize);
router.get('/trips', controller.listTrips);
router.get('/trips/:id', controller.tripDetail);
router.post('/trips/:id/start', requireRole('driver', ...DISPATCHERS), controller.startTrip);
router.post('/stops/:id/pickup', requireRole('driver'), controller.confirmPickup);
router.get('/stops/:id/qr', requireRole('driver'), controller.stopQr);
router.post('/stops/:id/handoff', requireRole('ngo_coordinator', 'buyer', 'driver'), controller.verifyHandoff);

module.exports = router;
