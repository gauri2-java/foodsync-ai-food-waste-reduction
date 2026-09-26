// Chart.js wrappers styled from the CSS theme tokens. Charts are tracked so page changes destroy them.
const active = new Set();

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const palette = () => ({
  brand: css('--brand'), brand2: css('--brand-2'), warn: css('--warn'), danger: css('--danger'), info: css('--info'),
  muted: css('--muted'), border: css('--border'), text: css('--text'), faint: css('--faint'),
  series: [css('--brand'), css('--info'), css('--warn'), '#8b5cf6', css('--danger'), '#0d9488'],
});

export const alpha = (hex, a) => {
  const n = hex.replace('#', '');
  const [r, g, b] = n.length === 3 ? n.split('').map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

function baseOptions(extra = {}) {
  const p = palette();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: p.muted, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11.5 } } },
      tooltip: { backgroundColor: p.text, titleColor: css('--bg'), bodyColor: css('--bg'), padding: 10, cornerRadius: 6, boxPadding: 4 },
    },
    scales: {
      x: { grid: { display: false }, border: { color: p.border }, ticks: { color: p.faint, maxRotation: 0, autoSkipPadding: 14, font: { size: 11 } } },
      y: { grid: { color: p.border }, border: { display: false }, ticks: { color: p.faint, font: { size: 11 } }, beginAtZero: true },
    },
    ...extra,
  };
}

export function chart(canvas, type, data, options = {}) {
  if (!canvas || !window.Chart) return null;
  const merged = baseOptions(options);
  if (options.scales) merged.scales = { ...baseOptions().scales, ...Object.fromEntries(Object.entries(options.scales).map(([k, v]) => [k, { ...(baseOptions().scales[k] || {}), ...v }])) };
  if (options.plugins) merged.plugins = { ...baseOptions().plugins, ...options.plugins };
  const c = new window.Chart(canvas, { type, data, options: merged });
  active.add(c);
  return c;
}

export function destroyCharts() {
  for (const c of active) c.destroy();
  active.clear();
}
