// Leaflet helpers with site-type markers.
const L = () => window.L;
const maps = new Set();

const COLORS = { kitchen: '#1f7a4d', plant: '#7c3aed', ngo_center: '#d97706', buyer_depot: '#2f6fb3', compost_facility: '#8a5a2b', depot: '#475569', vehicle: '#dc2626' };
const GLYPH = { kitchen: 'K', plant: 'P', ngo_center: 'N', buyer_depot: 'B', compost_facility: 'C', depot: 'D', vehicle: '🚚' };

export function createMap(el, center = [28.6139, 77.209], zoom = 12) {
  const m = L().map(el, { zoomControl: true, attributionControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false }).setView(center, zoom);
  L().tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  maps.add(m);
  return m;
}

export function siteIcon(type, label) {
  const color = COLORS[type] || '#475569';
  const glyph = label ?? GLYPH[type] ?? '•';
  return L().divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"><span style="transform:rotate(45deg);font:700 11px Inter,sans-serif">${glyph}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

export function addSites(map, sites) {
  const layer = L().layerGroup().addTo(map);
  for (const s of sites) L().marker([s.lat, s.lng], { icon: siteIcon(s.site_type) }).bindPopup(`<b>${s.name}</b><br><small>${(s.site_type || '').replace('_', ' ')}${s.daily_capacity_kg ? ` · ${s.daily_capacity_kg} kg/day` : ''}</small>`).addTo(layer);
  return layer;
}

export function fit(map, points) {
  if (points.length) map.fitBounds(L().latLngBounds(points), { padding: [30, 30], maxZoom: 14, animate: false });
}

export function destroyMaps() {
  for (const m of maps) {
    try { m.stop(); m.remove(); } catch { /* map already torn down */ }
  }
  maps.clear();
}

export { COLORS };
