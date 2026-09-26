const router = require('express').Router();
const controller = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');

router.post('/login', controller.login);
router.post('/register', controller.register);
router.get('/me', authenticate, controller.me);

module.exports = router;
