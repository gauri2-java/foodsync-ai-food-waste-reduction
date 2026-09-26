const service = require('./processing.service');
const kpi = require('./kpi.service');
const anomaly = require('./anomaly.service');

exports.listProducts = async (req, res) => res.json(await service.listProducts(req.scope));
exports.createProduct = async (req, res) => res.status(201).json(await service.createProduct(req.body, req.user, req.scope));
exports.listLines = async (req, res) => res.json(await service.listLines(req.scope));
exports.createLine = async (req, res) => res.status(201).json(await service.createLine(req.body, req.user, req.scope));
exports.createMachine = async (req, res) => res.status(201).json(await service.createMachine(req.body, req.user, req.scope));
exports.listRuns = async (req, res) => res.json(await service.listRuns(req.query, req.scope));
exports.recordRun = async (req, res) => res.status(201).json(await service.recordRun(req.body, req.user, req.scope));
exports.listDowntime = async (req, res) => res.json(await service.listDowntime(req.query, req.scope));
exports.recordDowntime = async (req, res) => res.status(201).json(await service.recordDowntime(req.body, req.user, req.scope));
exports.closeDowntime = async (req, res) => res.json(await service.closeDowntime(Number(req.params.id), req.user));
exports.overview = async (req, res) => res.json(await kpi.overview(req.query, req.scope));
exports.anomalies = async (req, res) => res.json(await anomaly.scan(req.scope, false));
