const service = require('./sustainability.service');
const report = require('./report.service');

exports.metrics = async (req, res) => res.json(await service.metrics(req.query, req.scope));
exports.handoffs = async (req, res) => res.json(await service.handoffs(req.query, req.scope));

exports.report = async (req, res) => {
  const doc = await report.render(req.query, req.scope);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="foodsync-esg-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);
  doc.end();
};
