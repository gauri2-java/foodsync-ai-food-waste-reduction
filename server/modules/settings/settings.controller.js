const service = require('./settings.service');

exports.list = async (req, res) => res.json(await service.list());
exports.update = async (req, res) => res.json(await service.update(req.params.key, req.body.value, req.user));
