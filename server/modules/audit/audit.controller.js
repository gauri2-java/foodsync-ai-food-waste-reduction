const service = require('./audit.service');

exports.list = async (req, res) => res.json(await service.list(req.query));
exports.verify = async (req, res) => res.json(await service.verify());
