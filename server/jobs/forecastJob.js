// Continuous feedback loop: retrain every kitchen demand model whose latest model is older than a day,
// so each day's actuals refine the next day's plan.
const directoryRepo = require('../modules/directory/directory.repository');
const kitchenRepo = require('../modules/kitchen/kitchen.repository');
const forecastService = require('../modules/forecast/forecast.service');
const logger = require('../lib/logger');

async function retrainAll() {
  const kitchens = await directoryRepo.listSites({ siteType: 'kitchen' });
  for (const site of kitchens) {
    for (const { meal_slot: slot } of await kitchenRepo.slotsForSite(site.id)) {
      try {
        await forecastService.ensureForecast(`kitchen:${site.id}:${slot}`);
      } catch (err) {
        logger.warn({ siteId: site.id, slot, err: err.message }, 'forecast retrain skipped');
      }
    }
  }
}

module.exports = { retrainAll };
