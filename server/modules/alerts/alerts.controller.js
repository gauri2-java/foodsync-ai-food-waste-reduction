const service = require('./alerts.service');

exports.list = async (req, res) => res.json(await service.list(req.query, req.scope));
exports.acknowledge = async (req, res) => res.json(await service.acknowledge(Number(req.params.id), req.user));
