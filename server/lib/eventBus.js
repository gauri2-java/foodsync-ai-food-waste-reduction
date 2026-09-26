const { EventEmitter } = require('events');

// In-process pub/sub used to push live updates to SSE clients.
const bus = new EventEmitter();
bus.setMaxListeners(200);

function publish(type, data) {
  bus.emit('event', { type, data, at: new Date().toISOString() });
}

module.exports = { bus, publish };
