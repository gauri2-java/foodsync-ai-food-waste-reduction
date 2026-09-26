import { api } from '../api.js';
import { html, raw, h, fmt, table, badge, errorToast, withBusy, $ } from '../ui.js';

export async function render(root) {
  const entries = await api.get('/audit?limit=300');
  root.innerHTML = html`<div class="page-head"><div><h1>Audit trail</h1><p>Every action is appended to a SHA-256 hash chain — editing or deleting any past record breaks the chain.</p></div><button class="btn primary" id="verify">Verify chain integrity</button></div>
    <div id="result"></div>
    <div class="card">${raw(table([
      { label: '#', render: (e) => h`<span class="mono">${e.id}</span>` },
      { label: 'When', render: (e) => fmt.dt(e.occurred_at) },
      { label: 'Who', render: (e) => e.actor_name || 'system' },
      { label: 'Action', render: (e) => h`<b>${e.action}</b><br><small class="muted">${e.entity}${e.entity_id ? ` #${e.entity_id}` : ''}</small>` },
      { label: 'Details', render: (e) => h`<span class="mono" style="font-size:11px">${JSON.stringify(e.payload).slice(0, 140)}</span>` },
      { label: 'Hash', render: (e) => h`<span class="mono faint" title="${e.hash}">${e.hash.slice(0, 12)}…</span>` },
    ], entries))}</div>`;
  const btn = $('#verify', root);
  btn.onclick = () => withBusy(btn, async () => {
    const v = await api.get('/audit/verify');
    $('#result', root).innerHTML = v.valid
      ? html`<div class="callout green" style="margin-bottom:16px">${badge('safe', 'Chain valid')} ${v.checked} entries verified. Head hash <span class="mono">${v.head}</span></div>`
      : html`<div class="callout red" style="margin-bottom:16px">${badge('unsafe', 'Tampering detected')} The chain breaks at entry #${v.brokenAt}.</div>`;
  }).catch(errorToast);
}
