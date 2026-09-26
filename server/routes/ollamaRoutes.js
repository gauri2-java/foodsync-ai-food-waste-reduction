const express = require('express');
const router = express.Router();
const controller = require('../controllers/ollamaController');

router.get('/status', controller.getStatus);
router.post('/demand-advice', controller.generateDemandAdvice);
router.post('/quality-diagnosis', controller.generateQualityDiagnosis);
router.post('/esg-narrative', controller.generateEsgNarrative);
router.post('/generate', controller.rawGenerate);

module.exports = router;
