const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');
const repo = require('./quality.repository');
const reference = require('../reference/reference.service');
const settings = require('../settings/settings.service');
const iot = require('../iot/iot.service');
const audit = require('../audit/audit.service');
const vision = require('../../ml/vision');
const logistic = require('../../ml/logistic');
const shelfLife = require('../../ml/shelfLife');
const { badRequest, notFound } = require('../../lib/errors');

async function saveImage(file) {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) throw badRequest('Image must be JPEG, PNG or WebP');
  await fs.mkdir(config.uploadDir, { recursive: true });
  const name = `${crypto.randomUUID()}${path.extname(file.originalname || '.jpg') || '.jpg'}`;
  await fs.writeFile(path.join(config.uploadDir, name), file.buffer);
  return `/uploads/${name}`;
}

// Calibrated model (if trained on inspector labels) takes precedence over the rule-based score.
async function scoreImage(buffer) {
  if (!buffer) return { features: null, visionScore: null, method: null };
  const features = await vision.extractFeatures(buffer);
  const model = await repo.latestModel();
  if (model) {
    const p = logistic.predictProba(model.params, vision.FEATURE_ORDER.map((k) => features[k]));
    return { features, visionScore: +(p * 100).toFixed(1), method: `calibrated model #${model.id} (${model.samples} labels)` };
  }
  const rule = vision.ruleScore(features);
  return { features, visionScore: rule.score, method: 'rule-based colour/texture analysis', penalties: rule.penalties };
}

// Pure estimate used by inspections and by surplus creation (no image).
async function estimate({ categoryCode, hoursSincePrep, foodTempC, storageUnitId, visionScore, sensor }) {
  const [category, thresholds] = await Promise.all([reference.getCategory(categoryCode), settings.get('quality')]);
  const snapshot = sensor || (storageUnitId ? await iot.storageSnapshot(storageUnitId) : null);
  const temp = foodTempC ?? snapshot?.temp_c ?? category.ref_temp_c;
  const result = shelfLife.assess({ hoursSincePrep, foodTempC: temp, storageTempC: snapshot?.temp_c, visionScore, sensor: snapshot }, category, thresholds);
  return { ...result, category, sensorSnapshot: snapshot, foodTempC: temp };
}

async function inspect(body, file, actor, context = {}) {
  const categoryCode = context.categoryCode || body.category_code;
  if (!categoryCode) throw badRequest('category_code is required');
  const hoursSincePrep = context.hoursSincePrep ?? Number(body.hours_since_prep);
  if (!Number.isFinite(hoursSincePrep) || hoursSincePrep < 0) throw badRequest('hours_since_prep must be a non-negative number');
  const foodTempC = body.food_temp_c !== undefined && body.food_temp_c !== '' ? Number(body.food_temp_c) : undefined;
  const sensor = body.nh3_ppm || body.co2_ppm ? { nh3_ppm: Number(body.nh3_ppm) || undefined, co2_ppm: Number(body.co2_ppm) || undefined } : undefined;
  const img = await scoreImage(file?.buffer);
  const est = await estimate({ categoryCode, hoursSincePrep, foodTempC, storageUnitId: Number(body.storage_unit_id) || null, visionScore: img.visionScore, sensor });
  const row = await repo.insertInspection({
    surplusId: context.surplusId, lotId: context.lotId ?? (Number(body.lot_id) || null), categoryCode, inspectedBy: actor.id,
    imagePath: await saveImage(file), imageFeatures: img.features, sensorSnapshot: est.sensorSnapshot, foodTempC: est.foodTempC, hoursSincePrep,
    visionScore: img.visionScore, freshnessScore: est.freshnessScore, scwHours: est.scwHours, verdict: est.verdict,
    explanation: { ...est.explanation, visionMethod: img.method, visionPenalties: img.penalties || [] },
  }, context.client);
  await audit.record(actor, 'quality.inspect', 'quality_inspection', row.id, { verdict: row.verdict, scwHours: row.scw_hours, surplusId: context.surplusId ?? null }, context.client);
  return row;
}

const list = (scope, limit) => repo.list(scope.siteIds, Math.min(Number(limit) || 50, 200));

async function label(id, lbl, actor) {
  if (!['fresh', 'degraded'].includes(lbl)) throw badRequest("label must be 'fresh' or 'degraded'");
  const row = await repo.setLabel(id, lbl);
  if (!row) throw notFound('Inspection');
  await audit.record(actor, 'quality.label', 'quality_inspection', id, { label: lbl });
  return row;
}

// Train logistic regression on inspector-labelled image features; report leave-out accuracy.
async function calibrate(actor) {
  const { minLabelledForModel } = await settings.get('quality');
  const rows = await repo.labelled();
  const classes = new Set(rows.map((r) => r.human_label));
  if (rows.length < minLabelledForModel || classes.size < 2) throw badRequest(`Need at least ${minLabelledForModel} labelled images covering both 'fresh' and 'degraded' (have ${rows.length})`);
  const X = rows.map((r) => vision.FEATURE_ORDER.map((k) => r.image_features[k]));
  const y = rows.map((r) => (r.human_label === 'fresh' ? 1 : 0));
  const correct = X.filter((_, i) => {
    const m = logistic.fit(X.filter((__, j) => j !== i), y.filter((__, j) => j !== i));
    return (logistic.predictProba(m, X[i]) >= 0.5 ? 1 : 0) === y[i];
  }).length;
  const model = await repo.insertModel({ samples: rows.length, accuracy: correct / rows.length, params: logistic.fit(X, y) });
  await audit.record(actor, 'quality.calibrate', 'quality_model', model.id, { samples: model.samples, accuracy: model.accuracy });
  return model;
}

async function modelInfo() {
  const m = await repo.latestModel();
  return m ? { id: m.id, trained_at: m.trained_at, samples: m.samples, accuracy: m.accuracy } : null;
}

module.exports = { estimate, inspect, list, label, calibrate, modelInfo };
