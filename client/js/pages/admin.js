import { api } from '../api.js';
import { html, raw, h, $, fmt, table, badge, errorToast, withBusy, toast, modal, formData, options } from '../ui.js';
import { createMap, addSites, fit } from '../map.js';
import { store } from '../store.js';

const SITE_TYPES = ['kitchen', 'plant', 'ngo_center', 'buyer_depot', 'compost_facility', 'depot'];
const reload = () => { store.invalidate(); window.dispatchEvent(new Event('fs:navigate')); };

async function orgsTab(el, user) {
  const orgs = await api.get('/directory/organizations');
  el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>Organisations</h3><p>NGOs and buyers must be verified before they receive offers</p></div>${user.role === 'admin' ? raw('<button class="btn primary" id="new">New organisation</button>') : ''}</div>
    ${raw(table([{ label: 'Name', key: 'name' }, { label: 'Type', render: (o) => fmt.title(o.org_type) }, { label: 'Sites', r: true, key: 'site_count' }, { label: 'Contact', render: (o) => o.contact_email || '—' },
      { label: 'Status', render: (o) => (o.verified ? badge('safe', 'verified') : badge('warning', 'unverified')) },
      { label: '', render: (o) => (user.role === 'admin' ? h`<button class="btn sm" data-verify="${o.id}" data-v="${!o.verified}">${o.verified ? 'Revoke' : 'Verify'}</button>` : '') }], orgs))}</div>`;
  el.querySelectorAll('[data-verify]').forEach((b) => (b.onclick = () => api.post(`/directory/organizations/${b.dataset.verify}/verify`, { verified: b.dataset.v === 'true' }).then(reload).catch(errorToast)));
  $('#new', el)?.addEventListener('click', () => {
    const m = modal({ title: 'New organisation', body: html`<form class="form" id="of"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Type</label><select name="org_type">${raw(['institution', 'processor', 'ngo', 'buyer', 'compost', 'logistics', 'regulator'].map((t) => `<option>${t}</option>`).join(''))}</select></div><div class="form-row"><div class="field"><label>Email</label><input name="contact_email"></div><div class="field"><label>Phone</label><input name="contact_phone"></div></div><div class="field"><label>Registration no. (e.g. NGO Darpan / FSSAI licence)</label><input name="registration_no"></div></form>`, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="s">Create</button>' });
    m.el.querySelector('#s').onclick = (e) => withBusy(e.currentTarget, async () => { await api.post('/directory/organizations', formData(m.el.querySelector('#of'))); m.close(); reload(); }).catch(errorToast);
  });
}

function siteForm(orgs, cats, user) {
  return html`<form class="form" id="sf"><div class="form-row"><div class="field"><label>Organisation</label><select name="org_id">${raw(options(user.role === 'admin' ? orgs : orgs.filter((o) => o.id === user.orgId), user.orgId))}</select></div><div class="field"><label>Type</label><select name="site_type">${raw(SITE_TYPES.map((t) => `<option value="${t}">${fmt.title(t)}</option>`).join(''))}</select></div></div>
    <div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Address</label><input name="address"></div>
    <div class="field"><label>Location — click the map</label><div class="map short" id="pick" style="height:220px"></div><div class="form-row" style="margin-top:6px"><input name="lat" type="number" step="any" placeholder="lat" required><input name="lng" type="number" step="any" placeholder="lng" required></div></div>
    <div class="form-row"><div class="field"><label>Enrolled headcount (kitchens)</label><input name="enrolled_headcount" type="number"></div><div class="field"><label>Daily capacity kg (recipients)</label><input name="daily_capacity_kg" type="number"></div></div>
    <div class="form-row"><div class="field"><label>Opens</label><input name="opens_at" type="time" value="06:00"></div><div class="field"><label>Closes</label><input name="closes_at" type="time" value="22:00"></div></div>
    <div class="field"><label>Accepted food categories (recipients)</label><select name="accepts_categories" multiple size="6">${raw(options(cats, '', { valueKey: 'code' }))}</select></div></form>`;
}

async function sitesTab(el, user) {
  const [sites, orgs, cats] = await Promise.all([api.get('/directory/sites?all=true'), api.get('/directory/organizations'), store.categories()]);
  el.innerHTML = html`<div class="grid g-2-1"><div class="card"><div class="card-head"><h3>Sites</h3><button class="btn primary" id="new">Add site</button></div>
    ${raw(table([{ label: 'Site', render: (s) => h`<b>${s.name}</b><br><small class="muted">${s.org_name}</small>` }, { label: 'Type', render: (s) => fmt.title(s.site_type) }, { label: 'Capacity', render: (s) => (s.enrolled_headcount ? `${s.enrolled_headcount} diners` : s.daily_capacity_kg ? `${s.daily_capacity_kg} kg/day` : '—') }, { label: 'Hours', render: (s) => `${s.opens_at.slice(0, 5)}–${s.closes_at.slice(0, 5)}` }, { label: 'Accepts', render: (s) => (s.accepts_categories.length ? `${s.accepts_categories.length} categories` : '—') }], sites))}</div>
    <div class="card"><div class="map" id="smap"></div></div></div>`;
  const map = createMap($('#smap', el));
  addSites(map, sites);
  fit(map, sites.map((s) => [s.lat, s.lng]));
  $('#new', el).onclick = () => {
    const m = modal({ wide: true, title: 'Add site', body: siteForm(orgs, cats, user), foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="s">Save site</button>' });
    const f = m.el.querySelector('#sf');
    const pick = createMap(m.el.querySelector('#pick'), [sites[0]?.lat ?? 28.61, sites[0]?.lng ?? 77.2], 11);
    let marker = null;
    pick.on('click', (e) => { f.lat.value = e.latlng.lat.toFixed(6); f.lng.value = e.latlng.lng.toFixed(6); marker ? marker.setLatLng(e.latlng) : (marker = window.L.marker(e.latlng).addTo(pick)); });
    setTimeout(() => pick.invalidateSize(), 50);
    m.el.querySelector('#s').onclick = (e) => withBusy(e.currentTarget, async () => {
      const d = formData(f);
      d.org_id = Number(d.org_id);
      d.accepts_categories = [...f.accepts_categories.selectedOptions].map((o) => o.value);
      await api.post('/directory/sites', d);
      m.close();
      toast('Site added', 'ok');
      reload();
    }).catch(errorToast);
  };
}

async function usersTab(el, user) {
  const users = await api.get('/directory/users');
  el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>Users</h3><p>People register themselves; administrators can deactivate accounts</p></div></div>
    ${raw(table([{ label: 'Name', render: (u) => h`<b>${u.full_name}</b><br><small class="muted">${u.email}</small>` }, { label: 'Role', render: (u) => fmt.title(u.role) }, { label: 'Organisation', render: (u) => u.org_name || '—' }, { label: 'Status', render: (u) => (u.active ? badge('safe', 'active') : badge('', 'inactive')) },
      { label: '', render: (u) => (user.role === 'admin' && u.id !== user.id ? h`<button class="btn sm" data-u="${u.id}" data-a="${!u.active}">${u.active ? 'Deactivate' : 'Activate'}</button>` : '') }], users))}</div>`;
  el.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => api.post(`/directory/users/${b.dataset.u}/active`, { active: b.dataset.a === 'true' }).then(reload).catch(errorToast)));
}

async function storageTab(el) {
  const [units, sites] = await Promise.all([store.storageUnits(), store.sites()]);
  el.innerHTML = html`<div class="grid g-1-2"><div class="card"><h3 style="margin-bottom:12px">Add storage unit</h3><form class="form" id="uf"><div class="field"><label>Site</label><select name="site_id">${raw(options(sites))}</select></div><div class="field"><label>Name</label><input name="name" required></div>
      <div class="field"><label>Type</label><select name="unit_type">${raw(['cold_room', 'freezer', 'dry_store', 'hot_holding', 'ambient'].map((t) => `<option value="${t}">${fmt.title(t)}</option>`).join(''))}</select></div>
      <div class="form-row"><div class="field"><label>Min °C</label><input name="min_temp_c" type="number" step="0.1"></div><div class="field"><label>Max °C</label><input name="max_temp_c" type="number" step="0.1"></div><div class="field"><label>Max RH %</label><input name="max_humidity" type="number"></div></div><button class="btn primary">Add</button></form></div>
    <div class="card"><h3 style="margin-bottom:12px">Storage units</h3>${raw(table([{ label: 'Unit', render: (u) => h`<b>${u.name}</b><br><small class="muted">${u.site_name}</small>` }, { label: 'Type', render: (u) => fmt.title(u.unit_type) }, { label: 'Range', render: (u) => `${u.min_temp_c ?? '–'} … ${u.max_temp_c ?? '–'} °C` }], units))}</div></div>`;
  const f = $('#uf', el);
  f.onsubmit = (e) => { e.preventDefault(); const d = formData(f); d.site_id = Number(d.site_id); withBusy(f.querySelector('button'), async () => { await api.post('/inventory/storage-units', d); reload(); }).catch(errorToast); };
}

async function categoriesTab(el, user) {
  const cats = await store.categories();
  const cols = ['shelf_life_ref_h', 'ref_temp_c', 'q10', 'co2e_per_kg', 'water_l_per_kg', 'land_m2_per_kg', 'cost_per_kg'];
  el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>Food categories & footprint factors</h3><p>Drive shelf-life estimates (reference shelf-life at reference temperature, Q10) and ESG accounting (CO₂e, water, land per kg)</p></div></div>
    <div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>Category</th><th>Cooked</th>${raw(['Shelf-life h', 'Ref °C', 'Q10', 'kg CO₂e/kg', 'L water/kg', 'm² land/kg', '₹/kg'].map((c) => `<th class="r">${c}</th>`).join(''))}<th></th></tr></thead><tbody>
    ${raw(cats.map((c) => `<tr data-code="${c.code}"><td><b>${c.name}</b><br><small class="muted mono">${c.code}</small></td><td>${c.is_cooked ? 'yes' : 'no'}</td>${cols.map((k) => `<td class="r"><input type="number" step="any" data-k="${k}" value="${c[k]}" style="width:86px;text-align:right" ${user.role === 'admin' ? '' : 'disabled'}></td>`).join('')}<td>${user.role === 'admin' ? '<button class="btn sm" data-save>Save</button>' : ''}</td></tr>`).join(''))}
    </tbody></table></div></div>`;
  el.querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => {
    const tr = b.closest('tr');
    const c = cats.find((x) => x.code === tr.dataset.code);
    const body = { ...c };
    tr.querySelectorAll('[data-k]').forEach((i) => { body[i.dataset.k] = Number(i.value); });
    withBusy(b, async () => { await api.put('/reference/categories', body); store.invalidate('categories'); toast('Saved', 'ok'); }).catch(errorToast);
  }));
}

async function settingsTab(el, user) {
  const settings = await api.get('/settings');
  el.innerHTML = html`<div class="grid g2">${raw(settings.map((s) => html`<div class="card"><div class="card-head"><div><h3>${fmt.title(s.key)}</h3><p>${s.description}</p></div></div>
    <form class="form" data-key="${s.key}">${raw(Object.entries(s.value).map(([k, v]) => (typeof v === 'object'
      ? html`<div class="field"><label>${k}</label><div class="form-row">${raw(Object.entries(v).map(([k2, v2]) => html`<div class="field"><label class="faint">${k2}</label><input type="number" step="any" data-path="${k}.${k2}" value="${v2}" ${user.role === 'admin' ? '' : 'disabled'}></div>`).join(''))}</div></div>`
      : html`<div class="field"><label>${k}</label><input type="number" step="any" data-path="${k}" value="${v}" ${user.role === 'admin' ? '' : 'disabled'}></div>`)).join(''))}
    ${user.role === 'admin' ? raw('<button class="btn sm primary">Save</button>') : ''}</form></div>`).join(''))}</div>`;
  el.querySelectorAll('form[data-key]').forEach((f) => (f.onsubmit = (e) => {
    e.preventDefault();
    const value = {};
    f.querySelectorAll('[data-path]').forEach((i) => { const [a, b] = i.dataset.path.split('.'); if (b) (value[a] ||= {})[b] = Number(i.value); else value[a] = Number(i.value); });
    withBusy(f.querySelector('button'), async () => { await api.put(`/settings/${f.dataset.key}`, { value }); toast('Settings saved', 'ok'); }).catch(errorToast);
  }));
}

const TABS = { sites: ['Sites', sitesTab], orgs: ['Organisations', orgsTab], users: ['Users', usersTab], storage: ['Storage units', storageTab], categories: ['Food categories', categoriesTab], settings: ['Tunable parameters', settingsTab] };

export async function render(root, { user, params }) {
  const tab = TABS[params.tab] ? params.tab : 'sites';
  root.innerHTML = html`<div class="page-head"><div><h1>Administration</h1><p>Every threshold, factor and entity in FoodSync is data — nothing is hard-coded.</p></div></div>
    <div class="tabs">${raw(Object.entries(TABS).map(([k, [l]]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join(''))}</div><div id="tab"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { location.hash = `#/admin?tab=${b.dataset.tab}`; }));
  await TABS[tab][1]($('#tab', root), user);
}
