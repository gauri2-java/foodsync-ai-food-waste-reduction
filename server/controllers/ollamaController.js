const ollamaService = require('../services/ollamaService');

exports.getStatus = async (req, res) => {
  const status = await ollamaService.getOllamaStatus();
  res.json({ success: true, ...status });
};

exports.generateDemandAdvice = async (req, res) => {
  const result = await ollamaService.generateDemandAIAdvice(req.body || {});
  res.json(result);
};

exports.generateQualityDiagnosis = async (req, res) => {
  const result = await ollamaService.generateQualityDiagnosis(req.body || {});
  res.json(result);
};

exports.generateEsgNarrative = async (req, res) => {
  const result = await ollamaService.generateEsgNarrative(req.body || {});
  res.json(result);
};

exports.rawGenerate = async (req, res) => {
  const { prompt, model } = req.body;
  if (!prompt) return res.status(400).json({ success: false, message: 'Prompt is required' });
  try {
    const text = await ollamaService.queryOllama(prompt, model);
    res.json({ success: true, response: text });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
