const service = require('./directory.service');

exports.listOrganizations = async (req, res) => res.json(await service.listOrganizations(req.query.type));
exports.createOrganization = async (req, res) => res.status(201).json(await service.createOrganization(req.body, req.user));
exports.verifyOrganization = async (req, res) => res.json(await service.verifyOrganization(Number(req.params.id), req.body.verified !== false, req.user));
exports.listSites = async (req, res) => res.json(await service.listSites(req.query, req.scope));
exports.getSite = async (req, res) => res.json(await service.getSite(Number(req.params.id)));
exports.createSite = async (req, res) => res.status(201).json(await service.createSite(req.body, req.user, req.scope));
exports.updateSite = async (req, res) => res.json(await service.updateSite(Number(req.params.id), req.body, req.user, req.scope));
exports.listUsers = async (req, res) => res.json(await service.listUsers(req.scope));
exports.setUserActive = async (req, res) => res.json(await service.setUserActive(Number(req.params.id), req.body.active !== false, req.user));
