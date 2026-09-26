// Rendering helpers shared by all pages.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Tagged template that escapes interpolations unless wrapped with raw().
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: true, s: String(s) });
export function html(strings, ...vals) {
  return strings.reduce((out, str, i) => {
    if (i === 0) return str;
    const v = vals[i - 1];
    const piece = Array.isArray(v) ? v.map((x) => (x?.[RAW] ? x.s : esc(x))).join('') : v?.[RAW] ? v.s : v === false || v == null ? '' : esc(v);
    return out + piece + str;
  }, '');
}
export const h = (strings, ...vals) => raw(html(strings, ...vals));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf = (d) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const fmt = {
  n: (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : nf(d).format(v)),
  kg: (v) => (v == null ? '—' : v >= 10000 ? `${nf(1).format(v / 1000)} t` : `${nf(v < 100 ? 1 : 0).format(v)} kg`),
  inr: (v) => (v == null ? '—' : v >= 1e7 ? `₹${nf(2).format(v / 1e7)} Cr` : v >= 1e5 ? `₹${nf(2).format(v / 1e5)} L` : `₹${nf(0).format(v)}`),
  pct: (v, d = 1) => (v == null ? '—' : `${nf(d).format(v)}%`),
  date: (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'),
  day: (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'),
  time: (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'),
  dt: (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'),
  ago: (v) => {
    const s = (Date.now() - new Date(v)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  },
  hours: (v) => (v == null ? '—' : v < 1 ? `${Math.round(v * 60)} min` : `${nf(1).format(v)} h`),
  title: (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
};

const STATUS_TONE = {
  open: 'blue', offered: 'amber', matched: 'blue', in_transit: 'amber', delivered: 'green', expired: 'red', composted: 'red', cancelled: '',
  pending: 'amber', accepted: 'green', declined: 'red', superseded: '', planned: 'blue', in_progress: 'amber', completed: 'green', done: 'green', failed: 'red',
  safe: 'green', use_quickly: 'amber', degraded: 'red', unsafe: 'red', critical: 'red', warning: 'amber', info: 'blue',
  available: 'green', on_trip: 'amber', maintenance: 'red', consumed: '', listed_surplus: 'blue', discarded: 'red',
  donation: 'green', secondary_sale: 'blue', compost: 'amber',
};
export const badge = (status, label) => h`<span class="badge ${STATUS_TONE[status] ?? ''}">${label ?? fmt.title(status)}</span>`;

export function toast(message, tone = '') {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), tone === 'error' ? 6000 : 3500);
}

export const errorToast = (err) => toast(err.details ? `${err.message}: ${[].concat(err.details).join(', ')}` : err.message, 'error');

export function modal({ title, body, foot = '', wide = false, onMount }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${title}</h2><button class="btn ghost sm" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">${raw(body)}</div>${foot ? h`<div class="modal-foot">${raw(foot)}</div>` : ''}</div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  onMount?.(back, close);
  return { el: back, close };
}

export const kpi = (label, value, sub = '', unit = '') => h`<div class="card kpi"><span class="label">${label}</span><span class="value">${raw(value)}${unit ? h`<small>${unit}</small>` : ''}</span>${sub ? h`<span class="sub">${raw(sub)}</span>` : ''}</div>`;

export function table(columns, rows, { empty = 'Nothing here yet', onRow } = {}) {
  if (!rows.length) return html`<div class="empty">${empty}</div>`;
  const head = columns.map((c) => html`<th class="${c.r ? 'r' : ''}">${c.label}</th>`).join('');
  const body = rows.map((row, i) => `<tr class="${onRow ? 'click' : ''}" data-i="${i}">${columns.map((c) => `<td class="${c.r ? 'r' : ''}">${renderCell(c, row)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function renderCell(c, row) {
  const v = c.render ? c.render(row) : row[c.key];
  return v?.[RAW] ? v.s : esc(v ?? '—');
}
export function bindRows(container, rows, onRow) {
  container.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => onRow(rows[Number(tr.dataset.i)])));
}

export const loading = () => '<div class="loading"><div class="spinner"></div></div>';

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file') continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.value !== '') out[el.name] = el.type === 'number' ? Number(el.value) : el.value;
  }
  return out;
}

export async function withBusy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

export const options = (items, value, { valueKey = 'id', labelKey = 'name', blank } = {}) =>
  (blank ? `<option value="">${esc(blank)}</option>` : '') + items.map((i) => `<option value="${esc(i[valueKey])}" ${String(i[valueKey]) === String(value) ? 'selected' : ''}>${esc(typeof labelKey === 'function' ? labelKey(i) : i[labelKey])}</option>`).join('');

export const progress = (pct, tone = '') => h`<div class="progress ${tone}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
