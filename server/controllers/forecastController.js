const engine = require('../services/prophetXgboostEngine');

exports.getForecast = (req, res) => {
  const { baseHeadcount, dayOfWeek, weather, isExamWeek, isFestivalUpcoming, eventType } = req.query;
  const result = engine.predictDemand({
    baseHeadcount: parseInt(baseHeadcount) || 850,
    dayOfWeek: dayOfWeek || 'Monday',
    weather: weather || 'Sunny',
    isExamWeek: isExamWeek === 'true' || isExamWeek === true,
    isFestivalUpcoming: isFestivalUpcoming === 'true' || isFestivalUpcoming === true,
    eventType: eventType || 'Regular'
  });
  res.json({ success: true, data: result });
};
