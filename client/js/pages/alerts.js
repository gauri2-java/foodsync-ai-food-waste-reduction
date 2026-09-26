import { api } from '../api.js';
import { html, raw, h, fmt, badge, errorToast, table } from '../ui.js';
import { on } from '../live.js';

const TYPE_LINK = { near_expiry: '#/inventory', lot_expired: '#/inventory', cold_chain_breach: '#/coldchain', device_offline: '#/coldchain', machine_anomaly: '#/processing', high_scrap: '#/processing', machine_down: '#/processing', overproduction: '#/planning', unmatched_surplus: '#/surplus', surplus_expired: '#/surplus', unroutable: '#/logistics', handoff_rejected: '#/impact' };

export async function render(root, { params }) {
  const showAll = params.all === '1';
  const alerts = await api.get(`/alerts?limit=300${showAll ? '' : '&open=true'}`);
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const a of alerts.filter((x) => !x.acknowledged_at)) counts[a.severity]++;
  root.innerHTML = html`<div class="page-head"><div><h1>Alerts</h1><p>Raised automatically by expiry scans, cold-chain sensors, anomaly detection, overproduction checks and the redistribution engine.</p></div>
    <div class="row">${badge('critical', `${counts.critical} critical`)}${badge('warning', `${counts.warning} warning`)}${badge('info', `${counts.info} info`)}<a class="btn sm" href="#/alerts${showAll ? '' : '?all=1'}">${showAll ? 'Open only' : 'Include resolved'}</a></div></div>
    ${counts.critical ? raw(html`<div class="alert-strip"><marquee scrollamount="4">${raw(alerts.filter((a) => a.severity === 'critical' && !a.acknowledged_at).map((a) => html`<span>● ${a.title}</span>`).join(''))}</marquee></div>`) : ''}
    <div class="card">${raw(table([
      { label: '', render: (a) => h`<span class="dot ${a.severity}" style="display:inline-block"></span>` },
      { label: 'Alert', render: (a) => h`<b>${a.title}</b>${a.detail ? h`<br><small class="muted">${a.detail}</small>` : ''}` },
      { label: 'Type', render: (a) => (TYPE_LINK[a.alert_type] ? h`<a href="${TYPE_LINK[a.alert_type]}">${fmt.title(a.alert_type)}</a>` : fmt.title(a.alert_type)) },
      { label: 'Site', render: (a) => a.site_name || 'Network' },
      { label: 'Raised', render: (a) => fmt.ago(a.created_at) },
      { label: '', render: (a) => (a.acknowledged_at ? badge('', 'resolved') : h`<button class="btn sm" data-ack="${a.id}">Acknowledge</button>`) },
    ], alerts, { empty: 'No open alerts — everything is within limits.' }))}</div>`;
  const reload = () => window.dispatchEvent(new Event('fs:navigate'));
  root.querySelectorAll('[data-ack]').forEach((b) => (b.onclick = () => api.post(`/alerts/${b.dataset.ack}/ack`).then(reload).catch(errorToast)));
  on('alert', () => setTimeout(reload, 200));
}
