import { api, session } from './api.js';
import { html, raw, esc, $, $$, fmt, errorToast } from './ui.js';
import { icon } from './icons.js';
import { destroyCharts } from './charts.js';
import { destroyMaps } from './map.js';
import { connectLive, disconnectLive, on, clearPageSubs } from './live.js';
import { store } from './store.js';

const ALL = ['admin', 'kitchen_manager', 'plant_manager', 'quality_officer', 'ngo_coordinator', 'buyer', 'driver', 'auditor'];
const OPS = ['admin', 'kitchen_manager', 'plant_manager', 'quality_officer'];

// Route table: navigation, role access and lazy page modules.
const ROUTES = [
  { path: 'dashboard', title: 'Overview', icon: 'dashboard', group: 'Operate', roles: ALL.filter((r) => r !== 'driver'), page: () => import('./pages/dashboard.js') },
  { path: 'planning', title: 'Demand & planning', icon: 'forecast', group: 'Operate', roles: ['admin', 'kitchen_manager', 'auditor'], page: () => import('./pages/planning.js') },
  { path: 'kitchen', title: 'Meal service log', icon: 'kitchen', group: 'Operate', roles: ['admin', 'kitchen_manager'], page: () => import('./pages/kitchen.js') },
  { path: 'processing', title: 'Processing units', icon: 'factory', group: 'Operate', roles: ['admin', 'plant_manager', 'auditor', 'quality_officer'], page: () => import('./pages/processing.js') },
  { path: 'inventory', title: 'Inventory & expiry', icon: 'inventory', group: 'Operate', roles: OPS, page: () => import('./pages/inventory.js') },
  { path: 'coldchain', title: 'IoT cold chain', icon: 'iot', group: 'Operate', roles: OPS, page: () => import('./pages/coldchain.js') },
  { path: 'quality', title: 'Quality & freshness', icon: 'quality', group: 'Operate', roles: OPS, page: () => import('./pages/quality.js') },
  { path: 'surplus', title: 'Surplus exchange', icon: 'surplus', group: 'Redistribute', roles: OPS, page: () => import('./pages/surplus.js') },
  { path: 'offers', title: 'Food offers', icon: 'inbox', group: 'Redistribute', roles: ['ngo_coordinator', 'buyer'], page: () => import('./pages/offers.js') },
  { path: 'receive', title: 'Receive delivery', icon: 'qr', group: 'Redistribute', roles: ['ngo_coordinator', 'buyer'], page: () => import('./pages/receive.js') },
  { path: 'logistics', title: 'Fleet & routes', icon: 'truck', group: 'Redistribute', roles: ['admin', 'kitchen_manager', 'plant_manager', 'ngo_coordinator', 'buyer'], page: () => import('./pages/logistics.js') },
  { path: 'driver', title: 'My trips', icon: 'truck', group: 'Redistribute', roles: ['driver'], page: () => import('./pages/driver.js') },
  { path: 'impact', title: 'Sustainability & ESG', icon: 'leaf', group: 'Report', roles: ALL.filter((r) => r !== 'driver'), page: () => import('./pages/impact.js') },
  { path: 'alerts', title: 'Alerts', icon: 'bell', group: 'Report', roles: ALL.filter((r) => r !== 'driver'), page: () => import('./pages/alerts.js') },
  { path: 'audit', title: 'Audit trail', icon: 'shield', group: 'Report', roles: ['admin', 'auditor', 'quality_officer', 'kitchen_manager', 'plant_manager'], page: () => import('./pages/audit.js') },
  { path: 'admin', title: 'Administration', icon: 'settings', group: 'Report', roles: ['admin', 'kitchen_manager', 'plant_manager'], page: () => import('./pages/admin.js') },
];
const PUBLIC = { login: () => import('./pages/login.js'), register: () => import('./pages/login.js') };

const ROLE_LABEL = { admin: 'Administrator', kitchen_manager: 'Kitchen manager', plant_manager: 'Plant manager', quality_officer: 'Food safety officer', ngo_coordinator: 'NGO coordinator', buyer: 'Secondary buyer', driver: 'Driver', auditor: 'ESG auditor' };
export const roleLabel = (r) => ROLE_LABEL[r] || r;

const allowed = (user) => ROUTES.filter((r) => r.roles.includes(user.role));
const home = (user) => (user.role === 'driver' ? 'driver' : 'dashboard');

function renderShell(user) {
  const groups = [...new Set(allowed(user).map((r) => r.group))];
  const nav = groups.map((g) => html`<div class="nav-group">${g}</div>${raw(allowed(user).filter((r) => r.group === g).map((r) => html`<a href="#/${r.path}" data-path="${r.path}">${raw(icon(r.icon))}<span>${r.title}</span>${r.path === 'alerts' ? raw('<span class="count" id="alert-count" hidden></span>') : ''}</a>`).join(''))}`).join('');
  $('#app').innerHTML = html`
  <div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><img class="brand-logo" src="/img/logo.svg" alt=""><div>FoodSync<small>Zero-waste food network</small></div></div>
      <nav class="nav">${raw(nav)}</nav>
      <div class="sidebar-foot"><div><b>${user.orgName || 'Platform'}</b></div><div class="muted">${roleLabel(user.role)}</div>${user.orgVerified === false ? raw('<div class="badge amber" style="margin-top:6px">Awaiting verification</div>') : ''}</div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn ghost sm menu-btn" id="menu-btn" aria-label="Menu">${raw(icon('menu'))}</button>
        <div class="ticker" title="Live network activity"><span class="live-dot"></span><marquee id="ticker" scrollamount="4" onmouseover="this.stop()" onmouseout="this.start()"><span>Connecting to live network…</span></marquee></div>
        <button class="btn ghost sm" id="theme-btn" aria-label="Toggle theme">${raw(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'))}</button>
        <div class="user-chip"><div class="avatar">${user.fullName.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div><div class="who"><div><b>${user.fullName}</b></div><div class="muted" style="font-size:12px">${user.email}</div></div></div>
        <button class="btn ghost sm" id="logout-btn" title="Sign out">${raw(icon('logout'))}</button>
      </header>
      <main class="content" id="content"></main>
    </div>
  </div>`;
  bindShell();
}

function bindShell() {
  $('#logout-btn').onclick = () => { session.token = null; session.user = null; disconnectLive(); store.invalidate(); location.hash = '#/login'; };
  $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#theme-btn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('fs-theme', next); } catch { /* ignore */ }
    $('#theme-btn').innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
    route();
  };
}

// Live ticker: recent activity from the audit feed, refreshed as events arrive.
let tickerItems = [];
function paintTicker() {
  const el = $('#ticker');
  if (!el) return;
  el.innerHTML = tickerItems.length ? tickerItems.map((t) => html`<span><b>${fmt.dt(t.at)}</b> · ${t.text}</span>`).join('') : '<span>No activity yet today</span>';
}
async function loadTicker() {
  try { tickerItems = await api.get('/dashboard/ticker?limit=15'); paintTicker(); } catch { /* non-critical */ }
}
async function refreshAlertCount() {
  try {
    const open = await api.get('/alerts?open=true&limit=500');
    const el = $('#alert-count');
    if (el) { el.hidden = !open.length; el.textContent = open.length; }
  } catch { /* ignore */ }
}

let liveStarted = false;
function startLive() {
  connectLive();
  if (liveStarted) { loadTicker(); refreshAlertCount(); return; }
  liveStarted = true;
  on('alert', (a) => { tickerItems.unshift({ at: a.created_at, text: `⚠ ${a.title}` }); tickerItems = tickerItems.slice(0, 20); paintTicker(); refreshAlertCount(); }, { page: false });
  on('alert_resolved', refreshAlertCount, { page: false });
  for (const t of ['surplus', 'trips', 'production', 'meal_log']) on(t, () => setTimeout(loadTicker, 400), { page: false });
  loadTicker();
  refreshAlertCount();
}

async function ensureUser() {
  if (session.user) return session.user;
  if (!session.token) return null;
  try {
    session.user = await api.get('/auth/me');
    return session.user;
  } catch {
    session.token = null;
    return null;
  }
}

function cleanupPage() {
  destroyCharts();
  destroyMaps();
  clearPageSubs();
}

async function renderPublic(name) {
  cleanupPage();
  const mod = await PUBLIC[name]();
  await mod.render($('#app'), { mode: name, onLogin: () => { location.hash = `#/${session.user ? home(session.user) : 'dashboard'}`; } });
}

async function route() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  if (PUBLIC[path]) return renderPublic(path);
  const user = await ensureUser();
  if (!user) { location.hash = '#/login'; return; }
  if (!$('#content')) { renderShell(user); startLive(); }
  const target = allowed(user).find((r) => r.path === path);
  if (!target) { location.hash = `#/${home(user)}`; return; }
  cleanupPage();
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === target.path));
  $('#sidebar').classList.remove('open');
  document.title = `${target.title} · FoodSync`;
  // Fresh container per navigation: a slower, stale render writes into a detached node instead of the new page.
  const content = document.createElement('div');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  $('#content').replaceChildren(content);
  try {
    const mod = await target.page();
    await mod.render(content, { user, params });
  } catch (err) {
    content.innerHTML = html`<div class="card empty"><h3>Could not load this page</h3><p>${err.message}</p></div>`;
    errorToast(err);
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('fs:navigate', route);
route();

export { esc };
