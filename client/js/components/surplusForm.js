// Shared "List surplus" dialog. Prefill with a meal log, stock lot or production run.
import { api } from '../api.js';
import { html, raw, modal, options, formData, withBusy, errorToast, toast, fmt, badge } from '../ui.js';
import { store, donorSites } from '../store.js';

function localInput(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}

function resultBody(res) {
  const e = res.estimate;
  const offers = res.offers || [];
  const top = (res.candidates || []).slice(0, 5);
  return html`<div class="stack" style="gap:12px">
    <div class="row">${badge(e.verdict)} <span>Safe consumption window <b>${fmt.hours(e.scwHours)}</b> · freshness ${fmt.n(e.freshnessScore)}/100</span></div>
    <div class="callout ${offers.length ? 'green' : res.listing.status === 'matched' ? 'amber' : 'red'}">${offers.length ? `Offer sent to ${offers.length} recipient(s) via the ${fmt.title(res.listing.channel)} channel. The first to accept gets it.` : res.listing.status === 'matched' ? 'Routed to compost/biogas — the food is not fit for people.' : 'No feasible recipient right now; an alert has been raised.'}</div>
    <h4>Ranked recipients</h4>
    <table class="data"><thead><tr><th>Recipient</th><th class="r">Distance</th><th class="r">ETA</th><th class="r">Score</th><th>Status</th></tr></thead><tbody>
    ${raw(top.map((c) => html`<tr><td>${c.name}</td><td class="r">${fmt.n(c.distanceKm, 1)} km</td><td class="r">${fmt.n(c.etaMin)} min</td><td class="r">${fmt.n(c.score, 3)}</td><td>${c.feasible ? badge('safe', 'feasible') : raw(`<small class="muted">${c.reasons.join(', ')}</small>`)}</td></tr>`).join(''))}
    </tbody></table></div>`;
}

export async function openSurplusForm(prefill = {}, onDone) {
  const [sites, cats, units] = await Promise.all([donorSites(), store.categories(), store.storageUnits()]);
  const siteUnits = (siteId) => units.filter((u) => u.site_id === Number(siteId));
  const siteId = prefill.site_id || sites[0]?.id;
  const m = modal({
    title: 'List surplus food',
    body: html`<form class="form" id="sf">
      <div class="form-row"><div class="field"><label>Site</label><select name="site_id">${raw(options(sites, siteId))}</select></div>
        <div class="field"><label>Food category</label><select name="category_code">${raw(options(cats, prefill.category_code, { valueKey: 'code' }))}</select></div></div>
      <div class="field"><label>Description</label><input name="title" required value="${prefill.title || ''}" placeholder="e.g. Veg biryani and raita"></div>
      <div class="form-row"><div class="field"><label>Quantity (kg)</label><input name="quantity_kg" type="number" step="0.1" min="0.5" required value="${prefill.quantity_kg ?? ''}"></div>
        <div class="field"><label>Portions (approx.)</label><input name="portions" type="number" min="0" value="${prefill.portions ?? ''}"></div></div>
      <div class="form-row"><div class="field"><label>Prepared at</label><input name="prepared_at" type="datetime-local" value="${localInput(prefill.prepared_at || Date.now())}"></div>
        <div class="field"><label>Food temperature °C</label><input name="food_temp_c" type="number" step="0.1" value="${prefill.food_temp_c ?? ''}" placeholder="probe reading"></div></div>
      <div class="field"><label>Held in</label><select name="storage_unit_id" id="sf-unit">${raw(options(siteUnits(siteId), prefill.storage_unit_id, { blank: '— not in a monitored unit —' }))}</select><span class="hint">Live sensor readings from this unit feed the shelf-life estimate.</span></div>
      ${prefill.meal_log_id ? raw(`<input type="hidden" name="meal_log_id" value="${prefill.meal_log_id}">`) : ''}
      ${prefill.lot_id ? raw(`<input type="hidden" name="lot_id" value="${prefill.lot_id}">`) : ''}
      ${prefill.production_run_id ? raw(`<input type="hidden" name="production_run_id" value="${prefill.production_run_id}">`) : ''}
    </form>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="sf-go">Estimate shelf-life & find recipients</button>',
  });
  const form = m.el.querySelector('#sf');
  form.elements.site_id.onchange = (e) => { m.el.querySelector('#sf-unit').innerHTML = options(siteUnits(e.target.value), '', { blank: '— not in a monitored unit —' }); };
  m.el.querySelector('#sf-go').onclick = (e) => withBusy(e.currentTarget, async () => {
    const data = formData(form);
    for (const k of ['site_id', 'storage_unit_id', 'meal_log_id', 'lot_id', 'production_run_id', 'portions']) if (data[k] !== undefined) data[k] = Number(data[k]);
    if (data.prepared_at) data.prepared_at = new Date(data.prepared_at).toISOString();
    const res = await api.post('/surplus', data);
    m.close();
    toast('Surplus listed', 'ok');
    modal({ title: `Listed: ${res.listing.title}`, body: resultBody(res), wide: true });
    onDone?.(res);
  }).catch(errorToast);
}
