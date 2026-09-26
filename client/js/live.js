// Server-Sent Events: one connection per session, fanned out to subscribers.
import { session } from './api.js';

let source = null;
const listeners = new Map();
const TYPES = ['alert', 'alert_resolved', 'telemetry', 'surplus', 'vehicle', 'trips', 'meal_log', 'production'];

export function connectLive() {
  if (source || !session.token) return;
  source = new EventSource(`/api/dashboard/stream?access_token=${encodeURIComponent(session.token)}`);
  for (const t of TYPES) source.addEventListener(t, (e) => emit(t, JSON.parse(e.data)));
  source.onerror = () => {
    source?.close();
    source = null;
    setTimeout(connectLive, 5000);
  };
}

export function disconnectLive() {
  source?.close();
  source = null;
}

function emit(type, data) {
  for (const fn of listeners.get(type) || []) fn(data);
  for (const fn of listeners.get('*') || []) fn(type, data);
}

// Returns an unsubscribe function. Page-scoped subscriptions are cleared on navigation.
const pageSubs = [];
export function on(type, fn, { page = true } = {}) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  const off = () => listeners.get(type)?.delete(fn);
  if (page) pageSubs.push(off);
  return off;
}

export function clearPageSubs() {
  while (pageSubs.length) pageSubs.pop()();
}
