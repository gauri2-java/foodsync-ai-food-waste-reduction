const trips = require('./trip.service');
const routing = require('./routing.service');

exports.listVehicles = async (req, res) => res.json(await trips.listVehicles(req.scope));
exports.createVehicle = async (req, res) => res.status(201).json(await trips.createVehicle(req.body, req.user, req.scope));
exports.pingLocation = async (req, res) => res.json(await trips.pingLocation(Number(req.params.id), req.body, req.user));
exports.optimize = async (req, res) => res.json(await routing.optimize(req.user, req.scope));
exports.listTrips = async (req, res) => res.json(await trips.listTrips(req.query, req.user, req.scope));
exports.tripDetail = async (req, res) => res.json(await trips.tripDetail(Number(req.params.id), req.user));
exports.startTrip = async (req, res) => res.json(await trips.startTrip(Number(req.params.id), req.user));
exports.confirmPickup = async (req, res) => res.json(await trips.confirmPickup(Number(req.params.id), req.body, req.user));
exports.stopQr = async (req, res) => res.json(await trips.stopQr(Number(req.params.id), req.user));
exports.verifyHandoff = async (req, res) => res.json(await trips.verifyHandoff(Number(req.params.id), req.body, req.user));
