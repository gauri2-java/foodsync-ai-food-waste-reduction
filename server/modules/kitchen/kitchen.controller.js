const service = require('./kitchen.service');

exports.listMenuItems = async (req, res) => res.json(await service.listMenuItems(req.scope));
exports.createMenuItem = async (req, res) => res.status(201).json(await service.createMenuItem(req.body, req.user, req.scope));
exports.listMenuPlan = async (req, res) => res.json(await service.listMenuPlan(req.query, req.scope));
exports.saveMenuPlan = async (req, res) => res.json(await service.saveMenuPlan(req.body, req.user, req.scope));
exports.deleteMenuPlan = async (req, res) => res.json(await service.deleteMenuPlan(Number(req.params.id), req.user, req.scope));
exports.listMealLogs = async (req, res) => res.json(await service.listMealLogs(req.query, req.scope));
exports.recordMealLog = async (req, res) => res.json(await service.recordMealLog(req.body, req.user, req.scope));
exports.wasteTrend = async (req, res) => res.json(await service.wasteTrend(req.query, req.scope));
