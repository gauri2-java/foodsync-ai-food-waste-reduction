const express = require('express');
const router = express.Router();
const controller = require('../controllers/ngoController');

router.get('/', controller.getNgos);
router.post('/', controller.createNgo);

module.exports = router;
