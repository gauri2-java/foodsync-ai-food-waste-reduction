const service = require('./iot.service');

exports.listDevices = async (req, res) => res.json(await service.listDevices(req.scope));
exports.registerDevice = async (req, res) => res.status(201).json(await service.registerDevice(req.body, req.user, req.scope));
exports.ingest = async (req, res) => res.status(202).json(await service.ingest(req.get('x-device-id') || req.body.device_uid, req.get('x-device-key'), req.body));
exports.series = async (req, res) => res.json(await service.series(Number(req.params.id), req.query.metric || 'temp_c', Number(req.query.hours), req.scope));
exports.latest = async (req, res) => res.json(await service.latest(req.scope));
