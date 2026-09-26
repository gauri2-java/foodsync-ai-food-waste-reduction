const engine = require('../services/prophetXgboostEngine');

exports.getForecast = (req, res) => {
  const { baseHeadcount = 850, dayOfWeek = 'Monday', weather = 'Sunny', isExamWeek = false, isFestivalUpcoming = false } = req.query;
  const result = engine.predictDemand({
    baseHeadcount: parseInt(baseHeadcount),
    dayOfWeek,
    weather,
    isExamWeek: isExamWeek === 'true' || isExamWeek === true,
    isFestivalUpcoming: isFestivalUpcoming === 'true' || isFestivalUpcoming === true
  });
  res.json({ success: true, data: result });
};
