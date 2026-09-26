// Periodic background jobs. Each job is isolated so one failure never stops the others.
const config = require('../config');
const logger = require('../lib/logger');
const inventory = require('../modules/inventory/inventory.service');
const iot = require('../modules/iot/iot.service');
const matching = require('../modules/surplus/matching.service');
const anomaly = require('../modules/processing/anomaly.service');
const forecastJob = require('./forecastJob');

const JOBS = [
  { name: 'surplus-housekeeping', everyTicks: 1, run: () => matching.housekeeping() },
  { name: 'iot-offline-scan', everyTicks: 2, run: () => iot.scanOffline() },
  { name: 'expiry-scan', everyTicks: 5, run: () => inventory.scanExpiring() },
  { name: 'machine-anomaly-scan', everyTicks: 5, run: () => anomaly.scan() },
  { name: 'nightly-forecast-retrain', everyTicks: 60, run: () => forecastJob.retrainAll() },
];

async function runJob(job) {
  const start = process.hrtime.bigint();
  try {
    await job.run();
    logger.debug({ job: job.name, durationMs: Number(process.hrtime.bigint() - start) / 1e6 }, 'job finished');
  } catch (err) {
    logger.error({ err, job: job.name }, 'job failed');
  }
}

function start() {
  if (!config.jobsEnabled) return logger.info('background jobs disabled');
  let tick = 0;
  const loop = async () => {
    for (const job of JOBS) if (tick % job.everyTicks === 0) await runJob(job);
    tick++;
  };
  setTimeout(loop, 5000);
  setInterval(loop, config.jobIntervalSec * 1000);
  logger.info({ intervalSec: config.jobIntervalSec, jobs: JOBS.map((j) => j.name) }, 'background jobs scheduled');
}

module.exports = { start };
