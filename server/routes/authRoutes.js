const express = require('express');
const router = express.Router();
const controller = require('../controllers/authController');

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/demo-login', controller.demoLogin);
router.get('/me', controller.getCurrentUser);

module.exports = router;
