const service = require('./forecast.service');
const planning = require('./planning.service');

exports.kitchen = async (req, res) => res.json(await service.kitchenForecast(Number(req.params.siteId), req.scope));
exports.retrain = async (req, res) => res.json(await service.retrainSite(Number(req.params.siteId), req.user, req.scope));
exports.accuracy = async (req, res) => res.json(await service.accuracy(Number(req.params.siteId), Number(req.query.days), req.scope));
exports.plan = async (req, res) => res.json(await planning.productionPlan(Number(req.params.siteId), req.scope));
exports.product = async (req, res) => res.json(await service.productForecast(Number(req.params.productId)));
exports.models = async (req, res) => res.json(await service.modelHistory(req.query.prefix));
