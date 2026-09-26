const service = require('./reference.service');

exports.listCategories = async (req, res) => res.json(await service.listCategories());
exports.saveCategory = async (req, res) => res.json(await service.saveCategory(req.body, req.user));
exports.listIngredients = async (req, res) => res.json(await service.listIngredients());
exports.createIngredient = async (req, res) => res.status(201).json(await service.createIngredient(req.body, req.user));
exports.listEvents = async (req, res) => res.json(await service.listEvents(req.query));
exports.createEvent = async (req, res) => res.status(201).json(await service.createEvent(req.body, req.user));
exports.deleteEvent = async (req, res) => res.json(await service.deleteEvent(Number(req.params.id), req.user));
