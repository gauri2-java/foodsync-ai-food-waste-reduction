// Small cache for reference data used across pages.
import { api } from './api.js';

const cache = new Map();

function cached(key, loader, ttlMs = 60000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
  const promise = loader().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { promise, at: Date.now() });
  return promise;
}

export const store = {
  sites: () => cached('sites', () => api.get('/directory/sites')),
  allSites: () => cached('allSites', () => api.get('/directory/sites?all=true')),
  categories: () => cached('categories', () => api.get('/reference/categories'), 600000),
  ingredients: () => cached('ingredients', () => api.get('/reference/ingredients')),
  storageUnits: () => cached('storageUnits', () => api.get('/inventory/storage-units')),
  settings: () => cached('settings', () => api.get('/settings')),
  invalidate: (key) => (key ? cache.delete(key) : cache.clear()),
};

export async function kitchenSites() {
  return (await store.sites()).filter((s) => s.site_type === 'kitchen');
}

export async function donorSites() {
  return (await store.sites()).filter((s) => ['kitchen', 'plant'].includes(s.site_type));
}
