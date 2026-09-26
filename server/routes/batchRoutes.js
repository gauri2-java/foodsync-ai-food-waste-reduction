const express = require('express');
const router = express.Router();
const controller = require('../controllers/batchController');

router.get('/', controller.getBatches);
router.post('/', controller.createBatch);
router.delete('/:id', controller.deleteBatch);

module.exports = router;
