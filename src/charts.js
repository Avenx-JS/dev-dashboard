/**
 * Build-time SVG charts. No chart library: every chart is a static SVG that
 * scales with its container, carries its own hover targets (read by
 * assets/app.js for the tooltip and crosshair) and ships with a data table.
 *
 * Mark specs follow one system: 2px lines, r=4 end markers with a 2px surface
 * ring, hairline solid gridlines, one y-axis per chart, categorical colours
 * assigned by slot in fixed order (CSS variables --series-N).
 */
import { esc, fmtDate } from './html.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Round tick values covering [min, max]. */
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toPrecision(12)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(12)));
  return ticks;
}

const shortDate = (d, withYear) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${withYear ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ''}`;

/**
 * @param {object} o
 * @param {Array<{ name: string, slot: number, points: Array<{ x: string, y: number | null }> }>} o.series
 * @param {(v: number) => string} o.format - Value formatter (tooltip, table, axis unless `axisFormat`).
 * @param {(v: number) => string} [o.axisFormat]
 * @param {[number, number]} [o.domain] - Fixed y-domain; otherwise derived from the data.
 * @param {number} [o.height]
 * @param {string} o.label - Accessible name of the chart.
 */
export function lineChart({ series, format, axisFormat = format, domain, height = 240, label }) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  const values = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v != null && Number.isFinite(v));
  if (!xs.length || !values.length) return `<div class="chart-empty">No data recorded yet.</div>`;

  const ticks = domain ? niceTicks(domain[0], domain[1]) : niceTicks(Math.min(...values), Math.max(...values));
  const y0 = domain ? domain[0] : ticks[0];
  const y1 = domain ? domain[1] : ticks[ticks.length - 1];
  const yTicks = ticks.filter((t) => t >= y0 - 1e-9 && t <= y1 + 1e-9);
  const t0 = Date.parse(xs[0]);
  const t1 = Date.parse(xs[xs.length - 1]);
  // Geometry lives in a 0..100 percent space on both axes. The SVG stretches
  // to the container (fixed CSS height, any width) with non-scaling strokes;
  // text and markers are HTML positioned in percent, so they never distort.
  const px = (x) => (t1 === t0 ? 50 : ((Date.parse(x) - t0) / (t1 - t0)) * 100);
  const py = (v) => 100 - ((v - y0) / (y1 - y0 || 1)) * 100;
  const f = (n) => Number(n.toFixed(3));

  const grid = yTicks.map((t) => `<line class="grid" x1="0" x2="100" y1="${f(py(t))}" y2="${f(py(t))}"/>`).join('');
  const yLabels = yTicks.map((t) => `<span class="y-tick" style="top:${f(py(t))}%">${esc(axisFormat(t))}</span>`).join('');

  const multiYear = new Date(t0).getUTCFullYear() !== new Date(t1).getUTCFullYear();
  const maxLabels = Math.min(6, xs.length);
  const labelIdx = [...new Set(Array.from({ length: maxLabels }, (_, i) => Math.round((i * (xs.length - 1)) / Math.max(1, maxLabels - 1))))];
  const xLabels = labelIdx
    .map((i) => {
      const edge = xs.length > 1 ? (i === 0 ? ' x-start' : i === xs.length - 1 ? ' x-end' : '') : '';
      return `<span class="x-tick${edge}" style="left:${f(px(xs[i]))}%">${shortDate(new Date(xs[i]), multiYear)}</span>`;
    })
    .join('');

  const lines = [];
  const dots = [];
  for (const s of series) {
    const pts = [...s.points].filter((p) => xs.includes(p.x)).sort((a, b) => a.x.localeCompare(b.x));
    let d = '';
    let pen = false;
    for (const p of pts) {
      if (p.y == null || !Number.isFinite(p.y)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${f(px(p.x))} ${f(py(p.y))}`;
      pen = true;
    }
    const valid = pts.filter((p) => p.y != null && Number.isFinite(p.y));
    if (d && valid.length > 1) lines.push(`<path class="line s${s.slot}" d="${d}"/>`);
    const last = valid[valid.length - 1];
    if (last) dots.push(`<span class="dot s${s.slot}" style="left:${f(px(last.x))}%;top:${f(py(last.y))}%"></span>`);
  }

  // One hover column per x position, wider than any mark.
  const hits = xs
    .map((x, i) => {
      const left = i === 0 ? 0 : (px(xs[i - 1]) + px(x)) / 2;
      const right = i === xs.length - 1 ? 100 : (px(x) + px(xs[i + 1])) / 2;
      const rows = series
        .map((s) => {
          const p = s.points.find((q) => q.x === x);
          return p && p.y != null ? `${s.slot}|${s.name}|${format(p.y)}` : null;
        })
        .filter(Boolean)
        .join(';');
      return `<rect class="hit" x="${f(left)}" y="0" width="${f(Math.max(0.2, right - left))}" height="100" data-x="${f(px(x))}" data-title="${esc(fmtDate(x, true))}" data-rows="${esc(rows)}"/>`;
    })
    .join('');

  const legend =
    series.length > 1
      ? `<ul class="legend">${series.map((s) => `<li><span class="key s${s.slot}"></span>${esc(s.name)}</li>`).join('')}</ul>`
      : '';

  const table = `<details class="data-table"><summary>Data table</summary><div class="table-wrap"><table class="table compact">
    <thead><tr><th>Recorded</th>${series.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead>
    <tbody>${[...xs]
      .reverse()
      .map((x) => `<tr><td>${fmtDate(x, true)}</td>${series.map((s) => {
        const p = s.points.find((q) => q.x === x);
        return `<td class="num">${p && p.y != null ? esc(format(p.y)) : '—'}</td>`;
      }).join('')}</tr>`)
      .join('')}</tbody></table></div></details>`;

  return `<figure class="chart">
    ${legend}
    <div class="chart-plot" role="img" aria-label="${esc(label)}">
      <div class="chart-area" style="height:${height}px">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${grid}
          <line class="axis" x1="0" x2="100" y1="100" y2="100"/>
          ${lines.join('')}
          <g class="hits">${hits}</g>
        </svg>
        <div class="y-ticks" aria-hidden="true">${yLabels}</div>
        <div class="x-ticks" aria-hidden="true">${xLabels}</div>
        ${dots.join('')}
        <div class="crosshair"></div>
        <div class="tooltip" hidden></div>
      </div>
    </div>
    ${table}
  </figure>`;
}

/** Inline trend line for table rows and stat tiles. Values are shown elsewhere. */
export function sparkline(values, { width = 96, height = 24 } = {}) {
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v != null && Number.isFinite(p.v));
  if (pts.length < 2) return `<span class="spark-none" aria-hidden="true">—</span>`;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const sx = (i) => 2 + (i / (values.length - 1)) * (width - 6);
  const sy = (v) => (max === min ? height / 2 : 3 + (1 - (v - min) / (max - min)) * (height - 6));
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${sx(p.i).toFixed(1)} ${sy(p.v).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><path d="${d}"/><circle cx="${sx(last.i).toFixed(1)}" cy="${sy(last.v).toFixed(1)}" r="2.5"/></svg>`;
}
