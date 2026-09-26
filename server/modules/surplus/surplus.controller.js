const service = require('./surplus.service');
const matching = require('./matching.service');

exports.create = async (req, res) => res.status(201).json(await service.createListing(req.body, req.user, req.scope));
exports.list = async (req, res) => res.json(await service.list(req.query, req.scope));
exports.detail = async (req, res) => res.json(await service.detail(Number(req.params.id), req.scope));
exports.inspect = async (req, res) => res.status(201).json(await service.inspect(Number(req.params.id), req.body, req.file, req.user, req.scope));
exports.cancel = async (req, res) => res.json(await service.cancel(Number(req.params.id), req.user, req.scope));
exports.rematch = async (req, res) => res.json(await matching.matchAndOffer(Number(req.params.id), req.user));
exports.respond = async (req, res) => res.json(await matching.respond(Number(req.params.offerId), req.body.decision, req.user));
