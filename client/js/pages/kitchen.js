import { api, qs } from '../api.js';
import { html, raw, h, $, fmt, options, table, badge, errorToast, withBusy, toast, formData, modal } from '../ui.js';
import { store, kitchenSites } from '../store.js';
import { openSurplusForm } from '../components/surplusForm.js';

const SLOTS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const today = () => new Date().toLocaleDateString('en-CA');

// ── Service log ────────────────────────────────────────
async function logTab(el, siteId) {
  const [logs, plan] = await Promise.all([api.get(`/kitchen/meal-logs${qs({ siteId })}`), api.get(`/forecast/kitchen/${siteId}/plan`).catch(() => null)]);
  const recommended = (date, slot) => plan?.services.find((s) => s.date === date && s.slot === slot)?.recommended;
  el.innerHTML = html`<div class="grid g-1-2">
    <div class="card"><div class="card-head"><div><h3>Record a service</h3><p>From POS / check-in counts at the end of each meal</p></div></div>
      <form class="form" id="log-form">
        <div class="form-row"><div class="field"><label>Date</label><input type="date" name="log_date" value="${today()}" max="${today()}" required></div>
          <div class="field"><label>Meal</label><select name="meal_slot">${raw(SLOTS.map((s) => `<option value="${s}">${fmt.title(s)}</option>`).join(''))}</select></div></div>
        <div class="callout" id="rec">—</div>
        <div class="form-row"><div class="field"><label>Diners (headcount)</label><input type="number" name="headcount" min="0" required></div>
          <div class="field"><label>Portions prepared</label><input type="number" name="prepared_portions" min="0" required></div>
          <div class="field"><label>Portions served</label><input type="number" name="served_portions" min="0" required></div></div>
        <div class="form-row"><div class="field"><label>Untouched leftover (kg)</label><input type="number" step="0.1" name="leftover_kg" min="0" value="0"><span class="hint">Edible — can be redistributed</span></div>
          <div class="field"><label>Plate waste (kg)</label><input type="number" step="0.1" name="plate_waste_kg" min="0" value="0"></div></div>
        <button class="btn primary">Save service</button>
      </form></div>
    <div class="card"><div class="card-head"><div><h3>Recent services</h3><p>Last 30 days</p></div></div><div id="logs"></div></div></div>`;
  const form = $('#log-form', el);
  const showRec = () => {
    const r = recommended(form.log_date.value, form.meal_slot.value);
    $('#rec', el).innerHTML = r ? html`FoodSync plan for this service: <b>${fmt.n(r)}</b> portions` : 'No forecast for this service (past date or outside horizon).';
    form.dataset.rec = r || '';
  };
  form.log_date.onchange = showRec;
  form.meal_slot.onchange = showRec;
  showRec();
  form.onsubmit = (e) => {
    e.preventDefault();
    withBusy(form.querySelector('button'), async () => {
      const data = { ...formData(form), site_id: siteId };
      if (form.dataset.rec) data.forecast_portions = Number(form.dataset.rec);
      const saved = await api.post('/kitchen/meal-logs', data);
      toast(`Saved · overproduction ${fmt.pct(saved.overproductionPct)}`, saved.overproductionPct > 10 ? 'error' : 'ok');
      if (saved.leftover_kg >= 3) offerListing(saved);
      await logTab(el, siteId);
    }).catch(errorToast);
  };
  renderLogs($('#logs', el), logs);
}

function offerListing(log) {
  const m = modal({
    title: 'Redistribute the leftover?',
    body: html`<p>${fmt.kg(log.leftover_kg)} of untouched food from ${fmt.title(log.meal_slot)} can reach a shelter within its safe window.</p>`,
    foot: '<button class="btn" data-close>Not now</button><button class="btn primary" id="go">List as surplus</button>',
  });
  m.el.querySelector('#go').onclick = () => {
    m.close();
    const cat = ['breakfast', 'snacks'].includes(log.meal_slot) ? 'cooked_breakfast' : 'cooked_rice_dal';
    openSurplusForm({ site_id: log.site_id, meal_log_id: log.id, title: `${fmt.title(log.meal_slot)} surplus`, quantity_kg: log.leftover_kg, portions: log.prepared_portions - log.served_portions, category_code: cat });
  };
}

function renderLogs(el, logs) {
  el.innerHTML = table([
    { label: 'Service', render: (l) => h`<b>${fmt.day(l.log_date)}</b> <span class="muted">${fmt.title(l.meal_slot)}</span>` },
    { label: 'Diners', r: true, render: (l) => fmt.n(l.headcount) },
    { label: 'Prepared', r: true, render: (l) => fmt.n(l.prepared_portions) },
    { label: 'Served', r: true, render: (l) => fmt.n(l.served_portions) },
    { label: 'Over', r: true, render: (l) => { const p = l.prepared_portions ? (100 * (l.prepared_portions - l.served_portions)) / l.prepared_portions : 0; return h`<span class="${p > 10 ? 'delta-bad' : 'muted'}">${fmt.pct(p)}</span>`; } },
    { label: 'Leftover', r: true, render: (l) => fmt.kg(l.leftover_kg) },
    { label: 'Planning', render: (l) => (l.forecast_portions ? badge('safe', 'FoodSync') : badge('', 'static')) },
  ], logs);
}

// ── Menu plan ──────────────────────────────────────────
async function menuPlanTab(el, siteId) {
  const [items, plan] = await Promise.all([api.get('/kitchen/menu-items'), api.get(`/kitchen/menu-plan${qs({ siteId, from: today() })}`)]);
  const dates = [...Array(7)].map((_, k) => new Date(Date.now() + k * 86400000).toLocaleDateString('en-CA'));
  const cell = (d, s) => plan.filter((p) => p.plan_date === d && p.meal_slot === s).map((p) => html`<span class="badge" style="margin:2px">${p.menu_item} <a href="#" data-del="${p.id}" title="Remove">✕</a></span>`).join('');
  el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>Menu plan · next 7 days</h3><p>The production plan converts forecast portions into ingredients using these menus</p></div></div>
    <div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>Date</th>${raw(SLOTS.map((s) => `<th>${fmt.title(s)}</th>`).join(''))}</tr></thead><tbody>
    ${raw(dates.map((d) => `<tr><td><b>${fmt.day(d)}</b></td>${SLOTS.map((s) => `<td>${cell(d, s)}<select class="add" data-date="${d}" data-slot="${s}" style="width:auto;padding:2px 6px;font-size:12px;margin-top:4px">${options(items, '', { blank: '+ add' })}</select></td>`).join('')}</tr>`).join(''))}
    </tbody></table></div></div>`;
  el.querySelectorAll('select.add').forEach((s) => (s.onchange = async () => {
    if (!s.value) return;
    await api.post('/kitchen/menu-plan', { site_id: siteId, plan_date: s.dataset.date, meal_slot: s.dataset.slot, menu_item_id: Number(s.value) }).catch(errorToast);
    menuPlanTab(el, siteId);
  }));
  el.querySelectorAll('[data-del]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); await api.del(`/kitchen/menu-plan/${a.dataset.del}`).catch(errorToast); menuPlanTab(el, siteId); }));
}

// ── Menus & recipes ────────────────────────────────────
async function recipesTab(el) {
  const [items, ingredients, cats] = await Promise.all([api.get('/kitchen/menu-items'), store.ingredients(), store.categories()]);
  el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>Dishes & recipes</h3><p>Per-portion bill of materials used for procurement planning</p></div><button class="btn primary" id="new-item">New dish</button></div>
    ${raw(table([{ label: 'Dish', key: 'name' }, { label: 'Category', key: 'category_name' }, { label: 'Portion', r: true, render: (m) => `${fmt.n(m.portion_kg * 1000)} g` },
      { label: 'Recipe per portion', render: (m) => m.recipe.map((r) => `${r.name} ${fmt.n(r.qty_per_portion * (r.unit === 'kg' || r.unit === 'L' ? 1000 : 1))}${r.unit === 'kg' ? ' g' : r.unit === 'L' ? ' ml' : ` ${r.unit}`}`).join(' · ') },
      { label: 'Cost / portion', r: true, render: (m) => fmt.inr(m.recipe.reduce((s, r) => s + r.qty_per_portion * r.unit_cost, 0)) }], items))}</div>`;
  $('#new-item', el).onclick = () => newDish(ingredients, cats, () => recipesTab(el));
}

function newDish(ingredients, cats, done) {
  const line = () => `<div class="form-row line"><select name="ing">${options(ingredients, '', { labelKey: (i) => `${i.name} (${i.unit})` })}</select><input name="qty" type="number" step="0.001" min="0" placeholder="qty per portion"></div>`;
  const m = modal({
    title: 'New dish',
    body: html`<form class="form" id="nd"><div class="field"><label>Name</label><input name="name" required></div>
      <div class="form-row"><div class="field"><label>Category</label><select name="category_code">${raw(options(cats.filter((c) => c.is_cooked), '', { valueKey: 'code' }))}</select></div><div class="field"><label>Portion (kg)</label><input name="portion_kg" type="number" step="0.01" value="0.15"></div></div>
      <div class="field"><label>Recipe (per portion, in the ingredient's unit)</label><div id="lines">${raw(line() + line())}</div><button type="button" class="btn sm" id="add-line">+ ingredient</button></div></form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">Save dish</button>',
  });
  m.el.querySelector('#add-line').onclick = () => m.el.querySelector('#lines').insertAdjacentHTML('beforeend', line());
  m.el.querySelector('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = m.el.querySelector('#nd');
    const recipe = [...m.el.querySelectorAll('.line')].map((l) => ({ ingredient_id: Number(l.querySelector('[name=ing]').value), qty_per_portion: Number(l.querySelector('[name=qty]').value) })).filter((r) => r.qty_per_portion > 0);
    await api.post('/kitchen/menu-items', { name: f.name.value, category_code: f.category_code.value, portion_kg: Number(f.portion_kg.value), recipe });
    m.close();
    toast('Dish saved', 'ok');
    done();
  }).catch(errorToast);
}

// ── Calendar ───────────────────────────────────────────
async function calendarTab(el, siteId) {
  const events = await api.get(`/reference/calendar${qs({ siteId })}`);
  el.innerHTML = html`<div class="grid g-1-2"><div class="card"><div class="card-head"><div><h3>Add calendar event</h3><p>Exams, holidays, festivals and vacations shift demand — the forecaster learns their effect</p></div></div>
    <form class="form" id="ev"><div class="field"><label>Date</label><input type="date" name="event_date" required></div>
      <div class="field"><label>Type</label><select name="event_type">${raw(['exam', 'holiday', 'festival', 'vacation', 'special_event'].map((t) => `<option value="${t}">${fmt.title(t)}</option>`).join(''))}</select></div>
      <div class="field"><label>Title</label><input name="title" required></div>
      <div class="field"><label>Expected attendance factor</label><input name="attendance_factor" type="number" step="0.05" min="0" max="2" placeholder="optional, e.g. 0.3"></div>
      <label class="row"><input type="checkbox" name="all_sites" style="width:auto"> Applies to all sites</label>
      <button class="btn primary">Add event</button></form></div>
    <div class="card"><div class="card-head"><h3>Upcoming & recent events</h3></div>${raw(table([{ label: 'Date', render: (e) => fmt.day(e.event_date) }, { label: 'Type', render: (e) => badge('', fmt.title(e.event_type)) }, { label: 'Title', key: 'title' }, { label: 'Scope', render: (e) => e.site_name || 'All sites' }, { label: '', render: (e) => h`<button class="btn sm ghost" data-del="${e.id}">Remove</button>` }], events))}</div></div>`;
  const form = $('#ev', el);
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = formData(form);
    withBusy(form.querySelector('button'), async () => {
      await api.post('/reference/calendar', { event_date: d.event_date, event_type: d.event_type, title: d.title, attendance_factor: d.attendance_factor, site_id: d.all_sites ? undefined : siteId });
      toast('Event added — retrain forecasts to use it', 'ok');
      calendarTab(el, siteId);
    }).catch(errorToast);
  };
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { await api.del(`/reference/calendar/${b.dataset.del}`).catch(errorToast); calendarTab(el, siteId); }));
}

const TABS = { log: ['Service log', logTab], menu: ['Menu plan', menuPlanTab], recipes: ['Dishes & recipes', recipesTab], calendar: ['Calendar', calendarTab] };

export async function render(root, { params }) {
  const sites = await kitchenSites();
  if (!sites.length) { root.innerHTML = '<div class="card empty">No kitchens yet.</div>'; return; }
  const siteId = Number(params.site) || sites[0].id;
  const tab = TABS[params.tab] ? params.tab : 'log';
  root.innerHTML = html`<div class="page-head"><div><h1>Meal service log</h1><p>Record what was cooked and eaten, plan menus, and maintain the calendar that drives the forecast.</p></div><select id="site" style="width:auto">${raw(options(sites, siteId))}</select></div>
    <div class="tabs">${raw(Object.entries(TABS).map(([k, [label]]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${label}</button>`).join(''))}</div><div id="tab"></div>`;
  $('#site', root).onchange = (e) => { location.hash = `#/kitchen?site=${e.target.value}&tab=${tab}`; };
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { location.hash = `#/kitchen?site=${siteId}&tab=${b.dataset.tab}`; }));
  await TABS[tab][1]($('#tab', root), siteId);
}
