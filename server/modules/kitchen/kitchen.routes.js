const router = require('express').Router();
const controller = require('./kitchen.controller');
const { requireRole } = require('../../middleware/auth');

const KITCHEN = ['kitchen_manager'];

router.get('/menu-items', controller.listMenuItems);
router.post('/menu-items', requireRole(...KITCHEN), controller.createMenuItem);
router.get('/menu-plan', controller.listMenuPlan);
router.post('/menu-plan', requireRole(...KITCHEN), controller.saveMenuPlan);
router.delete('/menu-plan/:id', requireRole(...KITCHEN), controller.deleteMenuPlan);
router.get('/meal-logs', controller.listMealLogs);
router.post('/meal-logs', requireRole(...KITCHEN), controller.recordMealLog);
router.get('/waste-trend', controller.wasteTrend);

module.exports = router;
