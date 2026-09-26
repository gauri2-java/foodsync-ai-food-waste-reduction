const router = require('express').Router();
const controller = require('./alerts.controller');

router.get('/', controller.list);
router.post('/:id/ack', controller.acknowledge);

module.exports = router;
