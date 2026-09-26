// Leaflet helpers: Carto Voyager basemap, site-type markers, size-safe fitting and teardown.
const L = () => window.L;
const maps = new Set();

const COLORS = { kitchen: '#0f6b4a', plant: '#7c3aed', ngo_center: '#d9921a', buyer_depot: '#2f6fb3', compost_facility: '#8a5a2b', depot: '#475569', vehicle: '#dc2626' };
const GLYPH = { kitchen: 'K', plant: 'P', ngo_center: 'N', buyer_depot: 'B', compost_facility: 'C', depot: 'D', vehicle: '🚚' };

export function createMap(el, center = [28.6139, 77.209], zoom = 12) {
  const m = L().map(el, { maxZoom: 18, zoomControl: true, attributionControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false }).setView(center, zoom);
  L().tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, attribution: 'Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors',
  }).addTo(m);
  // A map created inside a container that has no size yet computes a wrong view — refit once it does.
  const ro = new ResizeObserver(() => {
    if (!el.clientWidth || !el.clientHeight) return;
    m.invalidateSize();
    if (m._fsBounds) m.fitBounds(m._fsBounds, { padding: [30, 30], maxZoom: 14, animate: false });
  });
  ro.observe(el);
  m._fsObserver = ro;
  maps.add(m);
  return m;
}

export function siteIcon(type, label) {
  const color = COLORS[type] || '#475569';
  const glyph = label ?? GLYPH[type] ?? '•';
  return L().divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"><span style="transform:rotate(45deg);font:700 11px 'Plus Jakarta Sans',sans-serif">${glyph}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

export function sitePopup(s) {
  return `<b>${s.name}</b><br><small>${s.org_name ? `${s.org_name} · ` : ''}${(s.site_type || '').replace('_', ' ')}${s.daily_capacity_kg ? ` · ${s.daily_capacity_kg} kg/day` : ''}</small>`;
}

export function addSites(map, sites) {
  const layer = L().layerGroup().addTo(map);
  for (const s of sites) L().marker([s.lat, s.lng], { icon: siteIcon(s.site_type) }).bindPopup(sitePopup(s)).addTo(layer);
  return layer;
}

export function fit(map, points) {
  if (!points.length) return;
  map._fsBounds = L().latLngBounds(points);
  if (map.getContainer().clientWidth) {
    map.invalidateSize();
    map.fitBounds(map._fsBounds, { padding: [30, 30], maxZoom: 14, animate: false });
  }
}

export function destroyMaps() {
  for (const m of maps) {
    try { m._fsObserver?.disconnect(); m.stop(); m.remove(); } catch { /* map already torn down */ }
  }
  maps.clear();
}

export { COLORS };
