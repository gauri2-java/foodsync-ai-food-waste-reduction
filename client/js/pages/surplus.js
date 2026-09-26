import { api, qs } from '../api.js';
import { html, raw, h, $, fmt, table, badge, errorToast, withBusy, toast, modal, kpi, progress } from '../ui.js';
import { on } from '../live.js';
import { openSurplusForm } from '../components/surplusForm.js';

const ACTIVE = 'open,offered,matched,in_transit';
const HISTORY = 'delivered,expired,composted,cancelled';
const STAGES = ['open', 'offered', 'matched', 'in_transit', 'delivered'];

function windowCell(l) {
  if (!['open', 'offered', 'matched', 'in_transit'].includes(l.status)) return h`<small class="muted">${fmt.dt(l.safe_until)}</small>`;
  const hrs = l.hours_left;
  const tone = hrs < 1 ? 'red' : hrs < 2 ? 'amber' : '';
  return h`<div style="min-width:110px"><small class="${tone ? 'delta-bad' : ''}">${hrs <= 0 ? 'window closed' : `${fmt.hours(hrs)} left`}</small>${progress((hrs / 6) * 100, tone)}</div>`;
}

const COLS = [
  { label: 'Surplus', render: (l) => h`<b>${l.title}</b><br><small class="muted">${l.site_name} · ${l.category_name}</small>` },
  { label: 'Qty', r: true, render: (l) => h`${fmt.kg(l.quantity_kg)}${l.portions ? h`<br><small class="muted">${l.portions} meals</small>` : ''}` },
  { label: 'Freshness', r: true, render: (l) => (l.freshness_score != null ? fmt.n(l.freshness_score) : '—') },
  { label: 'Safe window', render: windowCell },
  { label: 'Status', render: (l) => h`${badge(l.status)}${l.channel ? h`<br>${badge(l.channel)}` : ''}` },
  { label: 'Recipient', render: (l) => l.assigned_site_name || '—' },
  { label: 'Listed', render: (l) => fmt.dt(l.created_at) },
];

function stageBar(status) {
  const idx = STAGES.indexOf(status);
  return html`<div class="steps">${raw(STAGES.map((s, i) => `<div class="step ${idx >= i ? 'done' : ''}">${fmt.title(s)}</div>`).join(''))}</div>`;
}

async function detail(id, reload) {
  const l = await api.get(`/surplus/${id}`);
  const offers = table([
    { label: '#', key: 'rank' }, { label: 'Recipient', render: (o) => h`${o.recipient_name}<br><small class="muted">${fmt.title(o.org_type)}</small>` },
    { label: 'Distance', r: true, render: (o) => `${fmt.n(o.distance_km, 1)} km` }, { label: 'ETA', r: true, render: (o) => `${fmt.n(o.eta_min)} min` },
    { label: 'Score', render: (o) => h`<b>${fmt.n(o.score, 3)}</b><br><small class="muted">${Object.entries(o.score_breakdown).map(([k, v]) => `${k} ${fmt.n(v, 2)}`).join(' · ')}</small>` },
    { label: 'Price', r: true, render: (o) => (o.offered_price ? fmt.inr(o.offered_price) : 'donation') }, { label: 'Status', render: (o) => badge(o.status) },
  ], l.offers, { empty: 'No offers yet' });
  const active = ['open', 'offered'].includes(l.status);
  const m = modal({
    wide: true,
    title: l.title,
    body: html`<div class="stack">${raw(stageBar(l.status))}
      <div class="grid g4">${kpi('Quantity', fmt.kg(l.quantity_kg))}${kpi('Freshness', l.freshness_score != null ? fmt.n(l.freshness_score) : '—', '', '/100')}${kpi('Safe until', fmt.time(l.safe_until), fmt.date(l.safe_until))}${kpi('Channel', fmt.title(l.channel || 'pending'))}</div>
      <div><h4 style="margin-bottom:6px">Recipient matching</h4>${raw(offers)}</div>
      ${active ? h`<form class="form card" id="reinspect" style="padding:14px"><h4>Re-inspect (photo + probe temperature)</h4><div class="form-row"><input type="file" name="image" accept="image/*" capture="environment"><input type="number" step="0.1" name="food_temp_c" placeholder="Probe °C"></div><button class="btn sm">Update safe window</button></form>` : ''}</div>`,
    foot: active ? '<button class="btn danger" id="cancel">Withdraw listing</button><button class="btn" id="rematch">Re-run matching</button>' : '',
  });
  const reinspect = m.el.querySelector('#reinspect');
  if (reinspect) reinspect.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(reinspect);
    for (const [k, v] of [...fd.entries()]) if (v === '' || (v instanceof File && !v.size)) fd.delete(k);
    withBusy(reinspect.querySelector('button'), async () => { const r = await api.upload(`/surplus/${id}/inspect`, fd); toast(`Verdict: ${fmt.title(r.verdict)} · ${fmt.hours(r.scw_hours)} window`, r.verdict === 'safe' ? 'ok' : 'error'); m.close(); reload(); }).catch(errorToast);
  };
  m.el.querySelector('#cancel')?.addEventListener('click', () => api.post(`/surplus/${id}/cancel`).then(() => { m.close(); reload(); }).catch(errorToast));
  m.el.querySelector('#rematch')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => { await api.post(`/surplus/${id}/rematch`); m.close(); reload(); }).catch(errorToast));
}

export async function render(root, { params, user }) {
  const view = params.view === 'history' ? 'history' : 'active';
  const listings = await api.get(`/surplus${qs({ status: view === 'history' ? HISTORY : ACTIVE, limit: 200 })}`);
  const count = (s) => listings.filter((l) => l.status === s).length;
  root.innerHTML = html`<div class="page-head"><div><h1>Surplus exchange</h1><p>Surplus is matched automatically: donation to NGOs first, then secondary buyers, and compost/biogas only for food that is no longer fit to eat.</p></div>
    <div class="row"><a class="btn" href="#/logistics">Plan pickups</a>${user.role !== 'quality_officer' ? raw('<button class="btn primary" id="new">List surplus</button>') : ''}</div></div>
    ${view === 'active' ? raw(html`<div class="grid g4" style="margin-bottom:16px">${kpi('Awaiting a recipient', count('open') + count('offered'))}${kpi('Claimed, awaiting pickup', count('matched'))}${kpi('On the road', count('in_transit'))}${kpi('Food in pipeline', fmt.kg(listings.reduce((s, l) => s + l.quantity_kg, 0)))}</div>`) : ''}
    <div class="tabs"><button data-view="active" class="${view === 'active' ? 'active' : ''}">Active</button><button data-view="history" class="${view === 'history' ? 'active' : ''}">History</button></div>
    <div class="card"><div id="list"></div></div>`;
  const reload = () => window.dispatchEvent(new Event('fs:navigate'));
  const el = $('#list', root);
  el.innerHTML = table(COLS, listings, { onRow: true, empty: view === 'active' ? 'No active surplus. Leftovers logged in the Meal service log can be listed in one click.' : 'No history yet' });
  el.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = () => detail(listings[Number(tr.dataset.i)].id, reload).catch(errorToast)));
  root.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { location.hash = `#/surplus?view=${b.dataset.view}`; }));
  const btn = $('#new', root);
  if (btn) btn.onclick = () => openSurplusForm({}, reload);
  if (params.new && btn) { history.replaceState(null, '', '#/surplus'); btn.click(); }
  on('surplus', () => { if (view === 'active') setTimeout(reload, 300); });
}
