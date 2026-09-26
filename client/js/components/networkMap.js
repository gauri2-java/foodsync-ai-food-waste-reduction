// Explorer-style network map: clustered markers + side panel with locate-me, category tiles,
// search and a distance-sorted list (click to fly to a site).
import { html, raw, esc, fmt } from '../ui.js';
import { createMap, siteIcon, sitePopup, fit, COLORS } from '../map.js';
import { on } from '../live.js';

const CATEGORIES = [
  { key: 'kitchen', label: 'Kitchens', sub: 'Institutions' },
  { key: 'plant', label: 'Plants', sub: 'Processors' },
  { key: 'ngo_center', label: 'NGOs', sub: 'Shelters' },
  { key: 'buyer_depot', label: 'Buyers', sub: 'Secondary' },
  { key: 'compost_facility', label: 'Compost', sub: 'Biogas' },
  { key: 'vehicle', label: 'Vehicles', sub: 'Live fleet' },
];

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2));

function clusterIcon(cluster) {
  const n = cluster.getChildCount();
  const size = n < 5 ? 38 : n < 15 ? 46 : 54;
  const tone = n < 5 ? '#9be0b8' : n < 15 ? '#f2d16b' : '#f2b441';
  return window.L.divIcon({
    className: '',
    html: `<div class="cluster" style="width:${size}px;height:${size}px;--tone:${tone}"><span>${n}</span></div>`,
    iconSize: [size, size],
  });
}

function panelHtml(counts) {
  return html`<aside class="net-panel">
    <div class="net-origin"><div><b id="net-origin-name">Network centre</b><button class="link-btn" id="net-locate" type="button">Locate me</button></div><span class="net-origin-icon">◎</span></div>
    <div class="net-cats">${raw(CATEGORIES.map((c) => html`<button class="net-cat active" data-cat="${c.key}" type="button"><span class="net-cat-dot" style="background:${COLORS[c.key]}"></span><b>${counts[c.key] || 0}</b><span>${c.label}</span><small>${c.sub}</small></button>`).join(''))}</div>
    <input class="net-search" id="net-search" type="search" placeholder="Search sites…">
    <div class="net-list" id="net-list"></div>
  </aside>`;
}

function listHtml(items, origin) {
  if (!items.length) return '<div class="empty">No sites match</div>';
  return items.map((s) => html`<button class="net-item" data-id="${s.key}" type="button">
    <span class="net-cat-dot" style="background:${COLORS[s.site_type]}"></span>
    <span class="net-item-body"><b>${s.name}</b><small>${s.subtitle}</small></span>
    <span class="net-item-dist">${origin ? `${fmt.n(km(origin, s), 1)} km` : ''}</span></button>`).join('');
}

export function renderNetworkMap(container, { sites, vehicles = [] }) {
  const items = [
    ...sites.map((s) => ({ ...s, key: `s${s.id}`, subtitle: s.org_name || fmt.title(s.site_type) })),
    ...vehicles.filter((v) => v.last_lat || v.depot_lat).map((v) => ({ key: `v${v.id}`, id: v.id, name: v.registration, site_type: 'vehicle', lat: v.last_lat ?? v.depot_lat, lng: v.last_lng ?? v.depot_lng, subtitle: `${fmt.title(v.status)} · ${v.driver_name || 'no driver'}` })),
  ];
  const counts = items.reduce((c, s) => ({ ...c, [s.site_type]: (c[s.site_type] || 0) + 1 }), {});
  container.innerHTML = html`<div class="net-wrap"><div class="net-map" id="net-map"></div>${raw(panelHtml(counts))}</div>`;
  const map = createMap(container.querySelector('#net-map'));
  const cluster = window.L.markerClusterGroup ? window.L.markerClusterGroup({ iconCreateFunction: clusterIcon, showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 17 }) : window.L.layerGroup();
  map.addLayer(cluster);
  const markers = new Map(items.map((s) => [s.key, window.L.marker([s.lat, s.lng], { icon: siteIcon(s.site_type) }).bindPopup(s.site_type === 'vehicle' ? `<b>${esc(s.name)}</b><br><small>${esc(s.subtitle)}</small>` : sitePopup(s))]));
  const active = new Set(CATEGORIES.map((c) => c.key));
  let origin = null;
  const listEl = container.querySelector('#net-list');
  const search = container.querySelector('#net-search');

  const refresh = () => {
    const q = search.value.trim().toLowerCase();
    const visible = items.filter((s) => active.has(s.site_type) && (!q || `${s.name} ${s.subtitle}`.toLowerCase().includes(q)));
    cluster.clearLayers();
    visible.forEach((s) => cluster.addLayer(markers.get(s.key)));
    const sorted = origin ? [...visible].sort((a, b) => km(origin, a) - km(origin, b)) : visible;
    listEl.innerHTML = listHtml(sorted, origin);
    listEl.querySelectorAll('.net-item').forEach((b) => (b.onclick = () => {
      const m = markers.get(b.dataset.id);
      cluster.zoomToShowLayer ? cluster.zoomToShowLayer(m, () => m.openPopup()) : (map.setView(m.getLatLng(), 15), m.openPopup());
    }));
  };

  container.querySelectorAll('.net-cat').forEach((b) => (b.onclick = () => {
    b.classList.toggle('active');
    active[b.classList.contains('active') ? 'add' : 'delete'](b.dataset.cat);
    refresh();
  }));
  search.oninput = refresh;

  // Default origin = centre of the network; "Locate me" switches to the browser's position.
  const lat = items.reduce((s, x) => s + x.lat, 0) / (items.length || 1);
  const lng = items.reduce((s, x) => s + x.lng, 0) / (items.length || 1);
  origin = { lat, lng };
  let meMarker = null;
  container.querySelector('#net-locate').onclick = () => navigator.geolocation?.getCurrentPosition((p) => {
    origin = { lat: p.coords.latitude, lng: p.coords.longitude };
    container.querySelector('#net-origin-name').textContent = 'Your location';
    meMarker?.remove();
    meMarker = window.L.circleMarker([origin.lat, origin.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2f6fb3', fillOpacity: 1 }).addTo(map).bindPopup('You are here');
    map.setView([origin.lat, origin.lng], 12);
    refresh();
  }, () => { container.querySelector('#net-origin-name').textContent = 'Location unavailable'; });

  refresh();
  fit(map, items.map((s) => [s.lat, s.lng]));
  on('vehicle', (v) => markers.get(`v${v.id}`)?.setLatLng([v.lat, v.lng]));
  return map;
}
