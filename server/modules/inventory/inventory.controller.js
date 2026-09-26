const service = require('./inventory.service');

exports.listStorageUnits = async (req, res) => res.json(await service.listStorageUnits(req.scope));
exports.createStorageUnit = async (req, res) => res.status(201).json(await service.createStorageUnit(req.body, req.user, req.scope));
exports.listLots = async (req, res) => res.json(await service.listLots(req.query, req.scope));
exports.receiveLot = async (req, res) => res.status(201).json(await service.receiveLot(req.body, req.user, req.scope));
exports.adjustLot = async (req, res) => res.json(await service.adjustLot(Number(req.params.id), req.body, req.user, req.scope));
