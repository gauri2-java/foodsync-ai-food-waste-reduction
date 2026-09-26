const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const ollamaRoutes = require('./routes/ollamaRoutes');
const forecastRoutes = require('./routes/forecastRoutes');
const qualityRoutes = require('./routes/qualityRoutes');
const redistributionRoutes = require('./routes/redistributionRoutes');
const esgRoutes = require('./routes/esgRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const batchRoutes = require('./routes/batchRoutes');
const ngoRoutes = require('./routes/ngoRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../client')));

// Mount API Routers
app.use('/api/auth', authRoutes);
app.use('/api/ollama', ollamaRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/redistribution', redistributionRoutes);
app.use('/api/esg', esgRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/ngos', ngoRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ACTIVE',
    project: 'FoodSync - SIH 2026 (Problem Statement ID: SIH26234)',
    organization: 'Ministry of Food Processing Industries (MoFPI)',
    team: 'FoodSync (ID: 144697)',
    version: '3.0.0-ENTERPRISE',
    aiIntegration: 'Ollama Local LLM (llama3.2 / qwen2.5-coder)',
    timestamp: new Date().toISOString()
  });
});

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[*] FoodSync Enterprise Platform Active on Port ${PORT}`);
  console.log(`[*] URL: http://localhost:${PORT}`);
  console.log(`[*] Local AI: Connected with Ollama API on port 11434`);
  console.log(`[*] SIH 2026 | Ministry of Food Processing Industries`);
  console.log(`=======================================================`);
});
