const service = require('./quality.service');

exports.inspect = async (req, res) => res.status(201).json(await service.inspect(req.body, req.file, req.user));
exports.list = async (req, res) => res.json(await service.list(req.scope, req.query.limit));
exports.label = async (req, res) => res.json(await service.label(Number(req.params.id), req.body.label, req.user));
exports.calibrate = async (req, res) => res.json(await service.calibrate(req.user));
exports.model = async (req, res) => res.json(await service.modelInfo());
