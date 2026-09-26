import { api, qs } from '../api.js';
import { html, raw, h, $, fmt, options, table, badge, errorToast, withBusy, toast, formData, modal, kpi, progress } from '../ui.js';
import { store, donorSites } from '../store.js';
import { openSurplusForm } from '../components/surplusForm.js';

function expiryCell(l) {
  const hrs = l.hours_to_expiry;
  const tone = hrs <= 0 ? 'red' : hrs < 24 ? 'red' : hrs < 72 ? 'amber' : '';
  const label = hrs <= 0 ? 'expired' : hrs < 48 ? `${fmt.n(hrs)} h left` : `${fmt.n(hrs / 24)} days left`;
  return h`<div style="min-width:120px"><div class="row between"><small>${fmt.dt(l.expires_at)}</small><small class="${tone ? 'delta-bad' : 'muted'}">${label}</small></div>${progress(Math.max(4, 100 - (Math.max(0, hrs) / 240) * 100), tone)}</div>`;
}

function adjust(lot, done) {
  const m = modal({
    title: `${lot.ingredient} · ${lot.lot_code}`,
    body: html`<form class="form" id="adj"><p class="muted">${fmt.n(lot.qty, 2)} ${lot.unit} available in ${lot.storage_name || 'store'}.</p>
      <div class="form-row"><div class="field"><label>Action</label><select name="action"><option value="consume">Issue to kitchen (consume)</option><option value="discard">Discard (spoiled)</option></select></div>
      <div class="field"><label>Quantity (${lot.unit})</label><input name="qty" type="number" step="0.01" min="0.01" max="${lot.qty}" value="${lot.qty}"></div></div></form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn" id="to-surplus">List as surplus instead</button><button class="btn primary" id="save">Save</button>',
  });
  m.el.querySelector('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
    await api.post(`/inventory/lots/${lot.id}/adjust`, formData(m.el.querySelector('#adj')));
    m.close();
    toast('Stock updated', 'ok');
    done();
  }).catch(errorToast);
  m.el.querySelector('#to-surplus').onclick = () => {
    m.close();
    openSurplusForm({ site_id: lot.site_id, lot_id: lot.id, title: `${lot.ingredient} (lot ${lot.lot_code})`, quantity_kg: lot.qty, category_code: lot.category_code, prepared_at: lot.received_at, storage_unit_id: lot.storage_unit_id }, done);
  };
}

async function receive(sites, done) {
  const [ingredients, units] = await Promise.all([store.ingredients(), store.storageUnits()]);
  const m = modal({
    title: 'Receive stock',
    body: html`<form class="form" id="rcv">
      <div class="form-row"><div class="field"><label>Site</label><select name="site_id">${raw(options(sites, sites[0]?.id))}</select></div>
        <div class="field"><label>Store</label><select name="storage_unit_id">${raw(options(units, '', { blank: '—', labelKey: (u) => `${u.site_name} · ${u.name}` }))}</select></div></div>
      <div class="form-row"><div class="field"><label>Ingredient</label><select name="ingredient_id">${raw(options(ingredients, '', { labelKey: (i) => `${i.name} (${i.unit})` }))}</select></div>
        <div class="field"><label>Quantity</label><input name="qty" type="number" step="0.01" required></div></div>
      <div class="form-row"><div class="field"><label>Lot / batch code</label><input name="lot_code" required></div><div class="field"><label>Supplier</label><input name="supplier"></div></div>
      <div class="field"><label>Best before / use by</label><input name="expires_at" type="datetime-local" required></div></form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">Receive</button>',
  });
  m.el.querySelector('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
    const d = formData(m.el.querySelector('#rcv'));
    for (const k of ['site_id', 'storage_unit_id', 'ingredient_id']) if (d[k]) d[k] = Number(d[k]);
    d.expires_at = new Date(d.expires_at).toISOString();
    await api.post('/inventory/lots', d);
    m.close();
    toast('Stock received', 'ok');
    done();
  }).catch(errorToast);
}

export async function render(root, { params }) {
  const sites = await donorSites();
  const siteId = params.site ? Number(params.site) : '';
  const lots = await api.get(`/inventory/lots${qs({ status: 'available', siteId })}`);
  const expiring = lots.filter((l) => l.hours_to_expiry < 48);
  const atRiskValue = expiring.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  const totalValue = lots.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  root.innerHTML = html`<div class="page-head"><div><h1>Inventory & expiry</h1><p>First-expiry-first-out stock with automatic near-expiry alerts and one-click redistribution.</p></div>
    <div class="row"><select id="site" style="width:auto">${raw(options(sites, siteId, { blank: 'All sites' }))}</select><button class="btn primary" id="receive">Receive stock</button></div></div>
    <div class="stack"><div class="grid g4">${kpi('Lots in stock', lots.length)}${kpi('Stock value', fmt.inr(totalValue))}${kpi('Expiring in 48 h', expiring.length, `${fmt.inr(atRiskValue)} at risk`)}${kpi('Already expired', lots.filter((l) => l.hours_to_expiry <= 0).length, 'remove from use')}</div>
    <div class="card"><div class="card-head"><div><h3>Stock lots</h3><p>Sorted by expiry. Click a lot to issue, discard or list as surplus.</p></div></div><div id="lots"></div></div></div>`;
  const cols = [
    { label: 'Ingredient', render: (l) => h`<b>${l.ingredient}</b><br><small class="muted">${l.lot_code} · ${l.supplier || ''}</small>` },
    { label: 'Site / store', render: (l) => h`${l.site_name}<br><small class="muted">${l.storage_name || '—'}</small>` },
    { label: 'Quantity', r: true, render: (l) => `${fmt.n(l.qty, 1)} ${l.unit}` },
    { label: 'Value', r: true, render: (l) => fmt.inr(l.qty * l.unit_cost) },
    { label: 'Expiry', render: expiryCell },
    { label: '', render: (l) => (l.hours_to_expiry < 48 ? badge(l.hours_to_expiry <= 0 ? 'expired' : 'warning', l.hours_to_expiry <= 0 ? 'expired' : 'use / share') : '') },
  ];
  const el = $('#lots', root);
  el.innerHTML = table(cols, lots, { onRow: true });
  const reload = () => window.dispatchEvent(new Event('fs:navigate'));
  el.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = () => adjust(lots[Number(tr.dataset.i)], reload)));
  $('#site', root).onchange = (e) => { location.hash = `#/inventory${e.target.value ? `?site=${e.target.value}` : ''}`; };
  $('#receive', root).onclick = () => receive(sites, () => { store.invalidate('ingredients'); reload(); });
}
