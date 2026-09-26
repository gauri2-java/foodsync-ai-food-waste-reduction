import { api } from '../api.js';
import { html, raw, h, $, fmt, options, badge, errorToast, withBusy, toast } from '../ui.js';
import { store } from '../store.js';
import { icon } from '../icons.js';

const VERDICT_COPY = {
  safe: 'Safe to serve or donate within the window below.',
  use_quickly: 'Safe, but serve or hand over quickly.',
  degraded: 'Quality has degraded — do not donate for human consumption. Route to animal feed or compost.',
  unsafe: 'Unsafe — discard to compost/biogas.',
};

function resultCard(r) {
  const tone = { safe: 'var(--brand)', use_quickly: 'var(--warn)', degraded: 'var(--danger)', unsafe: 'var(--danger)' }[r.verdict];
  const x = r.explanation || {};
  const reasons = [
    `${fmt.n(x.shelfLifeUsedPct, 0)}% of reference shelf-life used (spoilage rate ×${fmt.n(x.spoilageRateMultiplier, 2)} at ${fmt.n(r.food_temp_c, 1)} °C)`,
    x.dangerZoneHours ? `${fmt.n(x.dangerZoneHours, 1)} h in the 5–60 °C danger zone` : null,
    ...(x.gasNotes || []),
    x.visionScore != null ? `Image score ${fmt.n(x.visionScore)}/100 via ${x.visionMethod}` : 'No photo supplied — kinetic + sensor estimate only',
    ...(x.visionPenalties || []).map((p) => `− ${p.points} pts: ${p.reason}`),
  ].filter(Boolean);
  return html`<div class="card"><div class="row" style="gap:18px;align-items:center">
      <div class="score-ring" style="--v:${r.freshness_score};--c:${tone}"><div>${fmt.n(r.freshness_score)}</div></div>
      <div class="stack" style="gap:6px"><div class="row">${badge(r.verdict)}<b>Safe for ${fmt.hours(r.scw_hours)}</b></div><div class="muted">${VERDICT_COPY[r.verdict]}</div></div>
      ${r.image_path ? h`<img class="thumb" style="width:92px;height:92px;margin-left:auto" src="${r.image_path}" alt="Inspected food">` : ''}
    </div><hr><h4 style="margin-bottom:6px">Why</h4><ul style="margin:0;padding-left:18px">${raw(reasons.map((t) => html`<li>${t}</li>`).join(''))}</ul>
    ${r.image_features ? h`<details style="margin-top:10px"><summary class="muted">Image features</summary><div class="mono" style="margin-top:6px">${Object.entries(r.image_features).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div></details>` : ''}</div>`;
}

function inspectForm(cats, units) {
  return html`<div class="card"><div class="card-head"><div><h3>New inspection</h3><p>Photo + probe temperature + storage sensors → Safe Consumption Window</p></div></div>
    <form class="form" id="qf">
      <div class="field"><label>Photo of the food</label><input type="file" name="image" accept="image/*" capture="environment"><img id="preview" class="thumb" style="width:100%;height:180px;display:none;margin-top:6px"></div>
      <div class="form-row"><div class="field"><label>Food category</label><select name="category_code">${raw(options(cats, '', { valueKey: 'code' }))}</select></div>
        <div class="field"><label>Hours since cooked / received</label><input type="number" name="hours_since_prep" step="0.1" min="0" value="1" required></div></div>
      <div class="form-row"><div class="field"><label>Probe temperature °C</label><input type="number" name="food_temp_c" step="0.1" placeholder="e.g. 64"></div>
        <div class="field"><label>Stored in</label><select name="storage_unit_id">${raw(options(units, '', { blank: '— none —', labelKey: (u) => `${u.site_name} · ${u.name}` }))}</select></div></div>
      <details><summary class="muted">Manual gas reading (if no sensor)</summary><div class="form-row" style="margin-top:8px"><div class="field"><label>NH₃ ppm</label><input type="number" name="nh3_ppm" step="0.1"></div><div class="field"><label>CO₂ ppm</label><input type="number" name="co2_ppm"></div></div></details>
      <button class="btn primary">${raw(icon('quality'))} Assess freshness</button>
    </form></div>`;
}

function historyList(items, canLabel) {
  if (!items.length) return '<div class="empty">No inspections yet</div>';
  return html`<div class="list">${raw(items.map((q) => html`<div class="list-item">
    ${q.image_path ? h`<img class="thumb" src="${q.image_path}" alt="">` : h`<div class="thumb" style="display:grid;place-items:center" aria-hidden="true">—</div>`}
    <div style="flex:1;min-width:0"><div class="row">${badge(q.verdict)}<b>${fmt.n(q.freshness_score)}/100</b><span class="muted">· ${fmt.hours(q.scw_hours)} window</span></div>
      <small class="muted">${q.category_name}${q.surplus_title ? ` · ${q.surplus_title}` : ''} · ${q.inspector || ''} · ${fmt.ago(q.inspected_at)}</small></div>
    ${q.image_features ? (q.human_label ? badge(q.human_label === 'fresh' ? 'safe' : 'degraded', `labelled ${q.human_label}`) : canLabel ? h`<div class="row" style="gap:4px"><button class="btn sm" data-label="fresh" data-id="${q.id}">Fresh</button><button class="btn sm danger" data-label="degraded" data-id="${q.id}">Degraded</button></div>` : '') : ''}
  </div>`).join(''))}</div>`;
}

function modelCard(model, labelled, canTrain) {
  return html`<div class="card"><div class="card-head"><div><h3>Vision model</h3><p>Rule-based colour/texture scoring until inspectors label enough photos, then a calibrated logistic model</p></div></div>
    ${model ? h`<div class="row"><b>Calibrated model #${model.id}</b>${badge('safe', `${fmt.n(model.accuracy * 100, 0)}% leave-one-out accuracy`)}<span class="muted">${model.samples} labels · ${fmt.ago(model.trained_at)}</span></div>` : h`<div class="muted">Using transparent rule-based scoring.</div>`}
    <div class="row" style="margin-top:10px"><span class="muted">${labelled} labelled photos available</span>${canTrain ? h`<button class="btn sm" id="calibrate">Train calibrated model</button>` : ''}</div></div>`;
}

export async function render(root, { user }) {
  const [cats, units, items, model] = await Promise.all([store.categories(), store.storageUnits(), api.get('/quality/inspections?limit=60'), api.get('/quality/model')]);
  const canLabel = ['quality_officer', 'admin'].includes(user.role);
  root.innerHTML = html`<div class="page-head"><div><h1>Quality & freshness</h1><p>Multi-signal freshness grading: kinetic shelf-life model (Q10), FSSAI danger-zone rules, spoilage-gas sensors and image analysis.</p></div></div>
    <div class="grid g-1-2"><div class="stack">${raw(inspectForm(cats, units))}<div id="result"></div></div>
    <div class="stack">${raw(modelCard(model, items.filter((i) => i.human_label).length, canLabel))}<div class="card"><div class="card-head"><div><h3>Recent inspections</h3><p>${canLabel ? 'Label photos to teach the model what fresh and degraded look like in your kitchen' : ''}</p></div></div>${raw(historyList(items, canLabel))}</div></div></div>`;
  const form = $('#qf', root);
  form.image.onchange = () => { const f = form.image.files[0]; const img = $('#preview', root); if (f) { img.src = URL.createObjectURL(f); img.style.display = 'block'; } };
  form.onsubmit = (e) => {
    e.preventDefault();
    withBusy(form.querySelector('button'), async () => {
      const fd = new FormData(form);
      for (const [k, v] of [...fd.entries()]) if (v === '' || (v instanceof File && !v.size)) fd.delete(k);
      const r = await api.upload('/quality/inspections', fd);
      $('#result', root).innerHTML = resultCard(r);
    }).catch(errorToast);
  };
  root.querySelectorAll('[data-label]').forEach((b) => (b.onclick = () => api.post(`/quality/inspections/${b.dataset.id}/label`, { label: b.dataset.label }).then(() => { toast('Label saved', 'ok'); window.dispatchEvent(new Event('fs:navigate')); }).catch(errorToast)));
  const cal = $('#calibrate', root);
  if (cal) cal.onclick = () => withBusy(cal, async () => { const m = await api.post('/quality/model/calibrate'); toast(`Model trained: ${fmt.n(m.accuracy * 100, 0)}% accuracy`, 'ok'); window.dispatchEvent(new Event('fs:navigate')); }).catch(errorToast);
}
