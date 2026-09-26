// Line-level efficiency KPIs and rule-based inefficiency findings for food processing units.
const repo = require('./processing.repository');
const settings = require('../settings/settings.service');
const { isoDate, addDays } = require('../../lib/time');

function runKpis(r) {
  const availability = r.planned_minutes > 0 ? Math.min(1, r.run_minutes / r.planned_minutes) : 0;
  const performance = r.run_minutes > 0 ? Math.min(1.2, r.output_kg / ((r.run_minutes / 60) * r.rated_kgph)) : 0;
  const quality = r.output_kg + r.scrap_kg > 0 ? r.output_kg / (r.output_kg + r.scrap_kg) : 0;
  return {
    yieldPct: r.input_kg > 0 ? (100 * r.output_kg) / r.input_kg : 0,
    scrapPct: r.input_kg > 0 ? (100 * r.scrap_kg) / r.input_kg : 0,
    energyPerKg: r.output_kg > 0 ? r.energy_kwh / r.output_kg : 0,
    availability, performance, quality,
    oee: availability * Math.min(1, performance) * quality,
    overproductionKg: Math.max(0, r.output_kg - r.dispatched_kg),
    overproductionPct: r.output_kg > 0 ? (100 * Math.max(0, r.output_kg - r.dispatched_kg)) / r.output_kg : 0,
  };
}

function aggregate(runs) {
  const sum = (f) => runs.reduce((s, r) => s + f(r), 0);
  const input = sum((r) => r.input_kg);
  const output = sum((r) => r.output_kg);
  return {
    runs: runs.length,
    inputKg: +input.toFixed(0),
    outputKg: +output.toFixed(0),
    scrapKg: +sum((r) => r.scrap_kg).toFixed(0),
    scrapCost: Math.round(sum((r) => r.scrap_kg * r.raw_cost_per_kg)),
    yieldPct: input ? +((100 * output) / input).toFixed(2) : 0,
    energyKwh: +sum((r) => r.energy_kwh).toFixed(0),
    energyPerKg: output ? +(sum((r) => r.energy_kwh) / output).toFixed(3) : 0,
    oee: runs.length ? +(sum((r) => r.kpi.oee) / runs.length).toFixed(3) : 0,
    overproductionKg: +sum((r) => r.kpi.overproductionKg).toFixed(0),
    stdYieldPct: runs.length ? +(sum((r) => r.std_yield_pct) / runs.length).toFixed(2) : 0,
    stdEnergyPerKg: runs.length ? +(sum((r) => r.std_energy_kwh_per_kg) / runs.length).toFixed(3) : 0,
  };
}

function lineFindings(line, agg, cfg) {
  const f = [];
  const scrapPct = agg.inputKg ? (100 * agg.scrapKg) / agg.inputKg : 0;
  if (scrapPct > cfg.scrapWarnPct) f.push({ severity: 'warning', kind: 'raw_material_loss', text: `${line}: scrap ${scrapPct.toFixed(1)}% exceeds ${cfg.scrapWarnPct}% — ≈₹${agg.scrapCost.toLocaleString('en-IN')} of raw material lost` });
  if (agg.yieldPct < agg.stdYieldPct - 2) f.push({ severity: 'warning', kind: 'yield_gap', text: `${line}: yield ${agg.yieldPct}% vs standard ${agg.stdYieldPct}%` });
  if (agg.energyPerKg > agg.stdEnergyPerKg * 1.15) f.push({ severity: 'warning', kind: 'excess_energy', text: `${line}: ${agg.energyPerKg} kWh/kg is ${Math.round((100 * agg.energyPerKg) / agg.stdEnergyPerKg - 100)}% above standard` });
  if (agg.oee < cfg.oeeTarget) f.push({ severity: 'info', kind: 'low_oee', text: `${line}: OEE ${(agg.oee * 100).toFixed(0)}% below target ${(cfg.oeeTarget * 100).toFixed(0)}%` });
  const overPct = agg.outputKg ? (100 * agg.overproductionKg) / agg.outputKg : 0;
  if (overPct > cfg.overproductionWarnPct) f.push({ severity: 'warning', kind: 'overproduction', text: `${line}: ${agg.overproductionKg} kg (${overPct.toFixed(0)}%) produced beyond dispatch demand` });
  return f;
}

function downtimePareto(events) {
  const byReason = new Map();
  for (const e of events) byReason.set(e.reason, (byReason.get(e.reason) || 0) + e.minutes);
  return [...byReason.entries()].map(([reason, minutes]) => ({ reason, minutes: Math.round(minutes) })).sort((a, b) => b.minutes - a.minutes);
}

async function overview(query, scope) {
  const days = Math.min(Number(query.days) || 30, 180);
  const from = isoDate(addDays(new Date(), -days));
  const [runs, events, cfg] = await Promise.all([repo.listRuns(scope.siteIds, from, 5000), repo.downtime(scope.siteIds, from), settings.get('processing')]);
  const withKpi = runs.map((r) => ({ ...r, kpi: runKpis(r) }));
  const byLine = new Map();
  for (const r of withKpi) byLine.set(r.line_name, [...(byLine.get(r.line_name) || []), r]);
  const lines = [...byLine.entries()].map(([line, rs]) => ({ line, ...aggregate(rs) }));
  const findings = lines.flatMap((l) => lineFindings(l.line, l, cfg));
  const daily = new Map();
  for (const r of withKpi) {
    const d = daily.get(r.run_date) || { date: r.run_date, outputKg: 0, scrapKg: 0, energyKwh: 0, oeeSum: 0, n: 0 };
    Object.assign(d, { outputKg: d.outputKg + r.output_kg, scrapKg: d.scrapKg + r.scrap_kg, energyKwh: d.energyKwh + r.energy_kwh, oeeSum: d.oeeSum + r.kpi.oee, n: d.n + 1 });
    daily.set(r.run_date, d);
  }
  return {
    totals: aggregate(withKpi), lines, findings, oeeTarget: cfg.oeeTarget,
    trend: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ date: d.date, outputKg: Math.round(d.outputKg), scrapKg: Math.round(d.scrapKg), energyKwh: Math.round(d.energyKwh), oee: +(d.oeeSum / d.n).toFixed(3) })),
    downtimePareto: downtimePareto(events),
    downtimeMinutes: Math.round(events.reduce((s, e) => s + e.minutes, 0)),
  };
}

module.exports = { overview, runKpis };
