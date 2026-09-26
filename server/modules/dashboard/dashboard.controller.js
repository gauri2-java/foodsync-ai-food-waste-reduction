const service = require('./dashboard.service');
const { bus } = require('../../lib/eventBus');

exports.overview = async (req, res) => res.json(await service.overview(req.scope));
exports.ticker = async (req, res) => res.json(await service.ticker(Number(req.query.limit) || 25));
exports.publicStats = async (req, res) => res.json(await service.publicStats());
exports.publicOrganizations = async (req, res) => res.json(await service.publicOrganizations());

// Server-Sent Events: pushes alerts, telemetry, surplus and vehicle updates to the browser.
exports.stream = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: hello\ndata: ${JSON.stringify({ user: req.user.id })}\n\n`);
  const onEvent = (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  bus.on('event', onEvent);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('event', onEvent);
  });
};
