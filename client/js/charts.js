// Chart.js layer. Colours come from a validated colour-blind-safe categorical palette (fixed slot
// order, never cycled), stepped separately for light and dark surfaces. One y-axis per chart.
const active = new Set();

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => document.documentElement.dataset.theme === 'dark';

const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export const palette = () => ({
  series: SERIES[isDark() ? 'dark' : 'light'],
  status: STATUS,
  neutral: isDark() ? '#6e6d68' : '#a8a7a1',
  surface: css('--surface') || '#ffffff',
  text: css('--text'), muted: css('--muted'), faint: css('--faint'), border: css('--border'),
  // legacy names used by some pages
  brand: SERIES[isDark() ? 'dark' : 'light'][0], info: SERIES[isDark() ? 'dark' : 'light'][0],
  warn: STATUS.warning, danger: STATUS.critical,
});

export const alpha = (hex, a) => {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

// Common dataset styles
export const lineStyle = (color, extra = {}) => ({ borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: palette().surface, tension: 0.3, ...extra });
export const barStyle = (color, extra = {}) => ({ backgroundColor: color, hoverBackgroundColor: color, borderRadius: 4, borderSkipped: 'start', borderWidth: 0, maxBarThickness: 28, categoryPercentage: 0.8, barPercentage: 0.9, ...extra });
// Stacked segments: a 2px surface gap between fills instead of borders.
export const stackStyle = (color, extra = {}) => barStyle(color, { borderColor: palette().surface, borderWidth: { top: 2 }, borderSkipped: 'start', ...extra });

// Draws a labelled vertical marker (e.g. "Go-live") at a category label.
const markerPlugin = {
  id: 'fsMarker',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.at) return;
    const i = chart.data.labels.indexOf(opts.at);
    if (i < 0) return;
    const x = chart.scales.x.getPixelForValue(i);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = palette().muted;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top + 14); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.fillStyle = palette().text;
    ctx.font = `600 11px ${css('--font') || 'sans-serif'}`;
    ctx.textAlign = x > chart.width - 80 ? 'right' : 'left';
    ctx.fillText(opts.label, x + (ctx.textAlign === 'left' ? 4 : -4), top + 10);
    ctx.restore();
  },
};

// Direct value labels at the end of horizontal bars (few bars only — never on every point of a line).
const valueLabelPlugin = {
  id: 'fsValueLabels',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.format) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = palette().text;
    ctx.font = `600 11.5px ${css('--font') || 'sans-serif'}`;
    ctx.textBaseline = 'middle';
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      ctx.fillText(opts.format(chart.data.datasets[0].data[i], i), bar.x + 6, bar.y);
    });
    ctx.restore();
  },
};

function baseOptions() {
  const p = palette();
  const font = css('--font') || 'sans-serif';
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 6, right: 4 } },
    font: { family: font },
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: p.muted, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 14, font: { family: font, size: 12 } } },
      tooltip: {
        backgroundColor: isDark() ? '#2a2a28' : '#ffffff', titleColor: p.text, bodyColor: p.text, borderColor: p.border, borderWidth: 1,
        padding: 10, cornerRadius: 8, boxPadding: 5, usePointStyle: true, titleFont: { family: font, weight: '600' }, bodyFont: { family: font },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: p.border }, ticks: { color: p.faint, maxRotation: 0, autoSkipPadding: 18, font: { family: font, size: 11 } } },
      y: { grid: { color: alpha(isDark() ? '#ffffff' : '#000000', 0.06), drawTicks: false }, border: { display: false }, ticks: { color: p.faint, padding: 8, font: { family: font, size: 11 } }, beginAtZero: true },
    },
  };
}

function merge(base, extra) {
  const out = { ...base, ...extra };
  if (extra.plugins) out.plugins = { ...base.plugins, ...extra.plugins, legend: { ...base.plugins.legend, ...(extra.plugins.legend || {}), labels: { ...base.plugins.legend.labels, ...(extra.plugins.legend?.labels || {}) } }, tooltip: { ...base.plugins.tooltip, ...(extra.plugins.tooltip || {}) } };
  if (extra.scales) out.scales = Object.fromEntries([...new Set([...Object.keys(base.scales), ...Object.keys(extra.scales)])].map((k) => [k, { ...(base.scales[k] || {}), ...(extra.scales[k] || {}) }]));
  return out;
}

export function chart(canvas, type, data, options = {}) {
  if (!canvas || !window.Chart) return null;
  window.Chart.defaults.font.family = css('--font') || 'sans-serif';
  const opts = merge(baseOptions(), options);
  // A single series needs no legend box — the card title names it.
  if (options.plugins?.legend?.display === undefined && data.datasets.filter((d) => !d.hideInLegend).length < 2 && type !== 'doughnut') opts.plugins.legend = { ...opts.plugins.legend, display: false };
  const c = new window.Chart(canvas, { type, data, options: opts, plugins: [markerPlugin, valueLabelPlugin] });
  active.add(c);
  return c;
}

export function destroyCharts() {
  for (const c of active) c.destroy();
  active.clear();
}
