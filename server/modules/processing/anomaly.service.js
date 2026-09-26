// Unsupervised anomaly detection on machine telemetry using an Isolation Forest per machine.
// Features: power draw, throughput, motor temperature, vibration and energy per kg of throughput.
const repo = require('./processing.repository');
const settings = require('../settings/settings.service');
const alerts = require('../alerts/alerts.service');
const iforest = require('../../ml/isolationForest');
const logger = require('../../lib/logger');

const TRAIN_HOURS = 72;
const RECENT_POINTS = 5;

function toVector(row) {
  const power = row.power_kw ?? 0;
  const tput = row.throughput_kgph ?? 0;
  return [power, tput, row.temp_c ?? 0, row.vibration_mm_s ?? 0, tput > 1 ? power / tput : power];
}

// Plain-language reason: which feature deviates most from its median.
function explain(row, rows) {
  const names = ['power', 'throughput', 'temperature', 'vibration', 'energy per kg'];
  const vecs = rows.map(toVector);
  const v = toVector(row);
  const devs = v.map((x, j) => {
    const col = vecs.map((r) => r[j]).sort((a, b) => a - b);
    const med = col[Math.floor(col.length / 2)];
    const mad = col.map((c) => Math.abs(c - med)).sort((a, b) => a - b)[Math.floor(col.length / 2)] || 1e-6;
    return { name: names[j], z: (x - med) / mad, value: x, median: med };
  });
  const top = devs.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
  return `${top.name} ${top.z > 0 ? 'high' : 'low'} (${top.value.toFixed(2)} vs typical ${top.median.toFixed(2)})`;
}

async function analyseMachine(machine, threshold) {
  const rows = await repo.machineTelemetry(machine.id, TRAIN_HOURS);
  if (rows.length < 50) return { machine, points: [], insufficient: true };
  const model = iforest.fit(rows.map(toVector), { trees: 100, sampleSize: 256, seed: machine.id });
  const points = rows.map((r) => ({ t: r.t, power: r.power_kw, throughput: r.throughput_kgph, temp: r.temp_c, vibration: r.vibration_mm_s, score: +iforest.score(model, toVector(r)).toFixed(3) }));
  const recent = points.slice(-RECENT_POINTS);
  const anomalous = recent.filter((p) => p.score >= threshold).length >= Math.ceil(RECENT_POINTS / 2);
  // Report and explain the worst of the recent readings, not just the last one.
  const worstOffset = recent.reduce((best, p, i) => (p.score > recent[best].score ? i : best), 0);
  const worstRow = rows[rows.length - recent.length + worstOffset];
  return { machine, points, anomalous, latestScore: recent[worstOffset]?.score, reason: anomalous ? explain(worstRow, rows) : null };
}

async function scan(scope = { siteIds: null }, raise = true) {
  const { anomalyThreshold } = await settings.get('processing');
  const machines = await repo.machinesWithMeters(scope.siteIds);
  const results = [];
  for (const m of machines) {
    const r = await analyseMachine(m, anomalyThreshold);
    results.push(r);
    if (raise && r.anomalous) {
      await alerts.raise({ siteId: m.site_id, type: 'machine_anomaly', severity: 'warning', title: `Anomaly on ${m.line_name} / ${m.name}`, detail: `Isolation-Forest score ${r.latestScore}: ${r.reason}. Check for wear, blockage or idle running.`, entityRef: `machine:${m.id}` });
    } else if (raise && r.latestScore !== undefined) await alerts.resolve('machine_anomaly', `machine:${m.id}`);
  }
  logger.debug({ machines: machines.length }, 'anomaly scan complete');
  return { threshold: anomalyThreshold, machines: results.map(({ machine, points, anomalous, latestScore, reason, insufficient }) => ({ ...machine, anomalous: !!anomalous, latestScore, reason, insufficient: !!insufficient, points: points.slice(-360) })) };
}

module.exports = { scan };
