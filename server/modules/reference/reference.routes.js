const router = require('express').Router();
const controller = require('./reference.controller');
const { requireRole } = require('../../middleware/auth');

router.get('/categories', controller.listCategories);
router.put('/categories', requireRole('admin'), controller.saveCategory);
router.get('/ingredients', controller.listIngredients);
router.post('/ingredients', requireRole('kitchen_manager', 'plant_manager'), controller.createIngredient);
router.get('/calendar', controller.listEvents);
router.post('/calendar', requireRole('kitchen_manager', 'plant_manager'), controller.createEvent);
router.delete('/calendar/:id', requireRole('kitchen_manager', 'plant_manager'), controller.deleteEvent);

module.exports = router;
