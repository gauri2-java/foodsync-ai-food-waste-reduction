import { api } from '../api.js';
import { html, raw, h, $, fmt, badge, errorToast, withBusy, toast, table } from '../ui.js';
import { on } from '../live.js';

function offerCard(l, offer) {
  return html`<div class="card"><div class="card-head"><div><h3>${l.title}</h3><p>${l.site_name} · ${l.category_name}</p></div>${badge(offer.status)}</div>
    <div class="grid g4" style="gap:10px">
      <div class="kpi"><span class="label">Quantity</span><span class="value" style="font-size:20px">${fmt.kg(l.quantity_kg)}</span>${l.portions ? h`<span class="sub">≈ ${l.portions} meals</span>` : ''}</div>
      <div class="kpi"><span class="label">Distance</span><span class="value" style="font-size:20px">${fmt.n(offer.distance_km, 1)}<small>km</small></span><span class="sub">~${fmt.n(offer.eta_min)} min</span></div>
      <div class="kpi"><span class="label">Safe until</span><span class="value" style="font-size:20px">${fmt.time(l.safe_until)}</span><span class="sub">${fmt.hours(l.hours_left)} left</span></div>
      <div class="kpi"><span class="label">${offer.offered_price ? 'Price' : 'Freshness'}</span><span class="value" style="font-size:20px">${offer.offered_price ? fmt.inr(offer.offered_price) : `${fmt.n(l.freshness_score)}/100`}</span></div>
    </div>
    ${offer.status === 'pending' ? h`<div class="row" style="margin-top:14px"><button class="btn primary" data-accept="${offer.id}">Accept — we can take it</button><button class="btn" data-decline="${offer.id}">Decline</button><span class="muted" style="font-size:12px">Delivery is arranged automatically after you accept.</span></div>` : ''}</div>`;
}

export async function render(root, { user }) {
  const listings = await api.get('/surplus?status=offered,matched,in_transit,delivered&limit=100');
  const details = await Promise.all(listings.filter((l) => ['offered', 'matched', 'in_transit'].includes(l.status)).map((l) => api.get(`/surplus/${l.id}`)));
  const mine = (d) => d.offers.find((o) => o.status === 'pending' || o.recipient_site_id === d.assigned_site_id);
  const pending = details.filter((d) => d.status === 'offered' && d.offers.some((o) => o.status === 'pending'));
  const incoming = details.filter((d) => ['matched', 'in_transit'].includes(d.status));
  const done = listings.filter((l) => l.status === 'delivered');
  root.innerHTML = html`<div class="page-head"><div><h1>Food offers</h1><p>Surplus food matched to ${user.orgName}. Offers go to several nearby organisations at once — the first to accept receives it.</p></div></div>
    <div class="stack">
      <h2>Waiting for your answer <span class="muted">(${pending.length})</span></h2>
      ${pending.length ? raw(pending.map((d) => offerCard(d, mine(d))).join('')) : raw('<div class="card empty">No open offers right now. New offers appear here instantly.</div>')}
      <h2>Coming to you</h2>
      <div class="card">${raw(table([{ label: 'Food', render: (d) => h`<b>${d.title}</b><br><small class="muted">${d.site_name}</small>` }, { label: 'Qty', r: true, render: (d) => fmt.kg(d.quantity_kg) }, { label: 'Safe until', render: (d) => fmt.dt(d.safe_until) }, { label: 'Status', render: (d) => badge(d.status) }], incoming, { empty: 'Nothing on the way' }))}</div>
      <h2>Received</h2>
      <div class="card">${raw(table([{ label: 'Food', key: 'title' }, { label: 'From', key: 'site_name' }, { label: 'Qty', r: true, render: (d) => fmt.kg(d.quantity_kg) }, { label: 'Date', render: (d) => fmt.dt(d.created_at) }], done.slice(0, 30)))}</div>
    </div>`;
  const reload = () => window.dispatchEvent(new Event('fs:navigate'));
  root.querySelectorAll('[data-accept]').forEach((b) => (b.onclick = () => withBusy(b, async () => { await api.post(`/surplus/offers/${b.dataset.accept}/respond`, { decision: 'accept' }); toast('Accepted — a vehicle will be assigned', 'ok'); reload(); }).catch((e) => { errorToast(e); reload(); })));
  root.querySelectorAll('[data-decline]').forEach((b) => (b.onclick = () => withBusy(b, async () => { await api.post(`/surplus/offers/${b.dataset.decline}/respond`, { decision: 'decline' }); reload(); }).catch(errorToast)));
  on('surplus', () => setTimeout(reload, 300));
}
