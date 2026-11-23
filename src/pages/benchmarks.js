/**
 * Performance benchmarks: the latest run of `benches/run.js --json`, its
 * change against the previous run and the full recorded history.
 */
import { esc, url, badge, panel, statTile, pageHeader, empty, fmtInt, fmtMs, fmtDate, fmtDelta, fmtCompact, icon } from '../html.js';
import { lineChart, sparkline } from '../charts.js';

export const benchSlug = (file) => file.replace(/\.bench\.js$/, '').replace(/[^A-Za-z0-9_-]/g, '-');

/** run.js stores 0 when a benchmark's output did not contain the figure. */
const reported = (v) => (typeof v === 'number' && v > 0 ? v : null);

/**
 * Runs in chronological order. The current collection is appended when it is
 * not yet part of the recorded history.
 */
export function benchmarkRuns(history, current, meta) {
  const runs = history.runs.map((r) => ({ at: r.recordedAt, results: r.results, recorded: true, source: r.source }));
  if (current) {
    const at = new Date(current.recordedAt).toISOString();
    if (!runs.some((r) => r.at === at)) runs.push({ at, results: current.results, recorded: false, source: { upstreamCommit: meta?.upstream?.commit ?? null } });
  }
  return runs.sort((a, b) => a.at.localeCompare(b.at));
}

function rowFor(run, file) {
  return run?.results.find((r) => r.file === file) || null;
}

/** Relative change of the average time; null when either side is missing. */
export function avgDelta(cur, prev) {
  const a = reported(cur?.avgTime);
  const b = reported(prev?.avgTime);
  if (a == null || b == null || cur.status === 'failed') return null;
  return ((a - b) / b) * 100;
}

// Single runs on shared CI machines move by double-digit percentages on their
// own (see benches/regression-gate.js); changes below this are not coloured.
const NOISE_PCT = 10;
const deltaTone = (d) => (d == null || Math.abs(d) < NOISE_PCT ? 'neutral' : d > 0 ? 'critical' : 'good');

export function benchmarksPages({ history, current, meta }) {
  const runs = benchmarkRuns(history, current, meta);
  const latest = runs[runs.length - 1];
  if (!latest) {
    return [{ path: 'benchmarks/', title: 'Benchmarks', body: `${pageHeader({ eyebrow: 'Benchmarks', title: 'Performance benchmarks' })}${empty('No benchmark run has been recorded yet.')}` }];
  }
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  const descriptions = current?.descriptions || {};
  const gating = current?.gating || {};
  const failures = new Map((current && !latest.recorded ? current.failures : current?.failures || []).map((f) => [f.file, f]));
  const failedLatest = latest.results.filter((r) => r.status === 'failed');
  const allFiles = [...new Set(runs.flatMap((r) => r.results.map((x) => x.file)))];
  const latestFiles = latest.results.map((r) => r.file);
  const retired = allFiles.filter((f) => !latestFiles.includes(f));

  const rows = latest.results
    .map((r) => {
      const p = rowFor(prev, r.file);
      const d = avgDelta(r, p);
      const failed = r.status === 'failed';
      const gate = gating[r.file];
      return `<tr${failed ? ' class="row-failed"' : ''}>
        <td><a class="bench-name" href="${url(`benchmarks/${benchSlug(r.file)}/`)}">${esc(r.name)}</a><div class="mono faint small">${esc(r.file)}</div></td>
        <td>${failed ? badge('failed', 'crashed') : gate ? `<span class="tag" title="Fails a pull request in benchmark-compare.yml when its median slows by more than ${gate}%">PR gate +${gate}%</span>` : ''}</td>
        <td class="num" data-sort="${reported(r.avgTime) ?? -1}">${failed ? '—' : fmtMs(reported(r.avgTime))}</td>
        <td class="num" data-sort="${reported(r.ops) ?? -1}">${failed ? '—' : reported(r.ops) != null ? fmtInt(r.ops) : '—'}</td>
        <td class="num" data-sort="${reported(r.totalTime) ?? -1}">${failed ? '—' : fmtMs(reported(r.totalTime))}</td>
        <td class="num" data-sort="${d ?? 0}"><span class="delta delta-${deltaTone(d)}">${fmtDelta(d, 1, '%')}</span></td>
        <td class="spark-cell">${sparkline(runs.map((run) => {
          const x = rowFor(run, r.file);
          return x && x.status !== 'failed' ? reported(x.avgTime) : null;
        }))}</td>
      </tr>`;
    })
    .join('');

  const failureCallout = failedLatest.length
    ? `<div class="callout callout-critical">${icon('fail')}<div><strong>${failedLatest.length} benchmark${failedLatest.length === 1 ? '' : 's'} crashed in the latest run.</strong> <code>benches/run.js</code> exited non-zero; the row is shown as crashed instead of a zero.
        ${failedLatest.map((r) => `<details class="inline-details"><summary><code>${esc(r.file)}</code></summary><pre class="code small">${esc(failures.get(r.file)?.detail || r.error || 'No stack trace recorded.')}</pre></details>`).join('')}</div></div>`
    : '';

  const index = {
    path: 'benchmarks/',
    title: 'Benchmarks',
    body: `${pageHeader({
      eyebrow: 'Benchmarks',
      title: 'Performance benchmarks',
      lede: 'Every suite in <code>benches/</code>, run by <code>node benches/run.js --json</code>, the output the former benchmarks.avenx-js.com published as <code>results.json</code>.',
      meta: [
        `<span>Latest run ${fmtDate(latest.at, true)}${latest.source?.upstreamCommit ? ` on <a href="https://github.com/${esc(meta?.upstream?.repository || 'Avenx-JS/avenx-js')}/commit/${esc(latest.source.upstreamCommit)}"><code>${esc(latest.source.upstreamCommit.slice(0, 7))}</code></a>` : ''}</span>`,
        `<a class="button button-quiet" href="${url('benchmarks/results.json')}">results.json</a>`,
      ].join(''),
    })}
    ${failureCallout}
    <div class="stats">
      ${statTile({ label: 'Benchmarks', value: fmtInt(latest.results.length), sub: 'in the latest run' })}
      ${statTile({ label: 'Crashed', value: fmtInt(failedLatest.length), sub: failedLatest.length ? badge('failed', 'see above') : badge('ok', 'none') })}
      ${statTile({ label: 'Recorded runs', value: fmtInt(history.runs.length), sub: history.runs.length ? `since ${fmtDate(history.runs[0].recordedAt)}` : '' })}
      ${statTile({ label: 'Gated on pull requests', value: fmtInt(Object.keys(gating).length), sub: Object.keys(gating).length ? 'regression-gate.js' : 'gate list not collected in this build' })}
    </div>
    ${panel({
      title: 'Latest results',
      sub: `Average time per operation is the summary figure each benchmark reports and the one pull-request comparisons use. Change is against the previous run${prev ? ` (${fmtDate(prev.at)})` : ''}; lower is faster. Changes under ${NOISE_PCT}% are not coloured: a single run on a shared CI machine moves that much on its own.`,
      flush: true,
      body: `<div class="table-wrap"><table class="table bench sortable">
        <thead><tr><th data-sort-key>Benchmark</th><th></th><th class="num" data-sort-key>Avg / op</th><th class="num" data-sort-key>Ops/s</th><th class="num" data-sort-key>Total</th><th class="num" data-sort-key>Change</th><th>History</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`,
    })}
    <div class="grid-2">
      ${panel({
        title: 'How to read these numbers',
        body: `<ul class="plain-list prose small">
          <li>Each benchmark runs a fixed number of iterations after a warm-up and prints its total time, average time per operation and operations per second.</li>
          <li>Runs happen weekly on a GitHub-hosted runner. Absolute numbers on shared machines are noisy; read the trend, not one value.</li>
          <li>A dash means the benchmark printed no such figure (run.js records a missing figure as 0) or the benchmark crashed.</li>
          <li>Whether a pull request made something slower is decided in the avenx-js repository by <code>benchmark-compare.yml</code>, which runs base and PR side by side.</li>
        </ul>`,
      })}
      ${panel({
        title: 'Run history',
        flush: true,
        body: `<div class="table-wrap"><table class="table compact"><thead><tr><th>Recorded</th><th class="num">Benchmarks</th><th>Status</th><th>Source</th></tr></thead><tbody>${[...runs]
          .reverse()
          .map((run) => {
            const crashed = run.results.filter((x) => x.status === 'failed').length;
            const src = run.source?.kind === 'legacy' ? `<span class="faint">bench-results@${esc(run.source.legacyCommit.slice(0, 7))}</span>` : run.recorded ? 'workflow' : '<span class="faint">this build, not recorded</span>';
            return `<tr><td>${fmtDate(run.at, true)}</td><td class="num">${run.results.length}</td><td>${crashed ? badge('failed', `${crashed} crashed`) : run.results.some((x) => x.status === 'unknown') ? '<span class="faint">not recorded</span>' : badge('ok', 'ok')}</td><td>${src}</td></tr>`;
          })
          .join('')}</tbody></table></div>`,
      })}
    </div>
    ${retired.length ? panel({ title: 'Benchmarks no longer in the suite', sub: 'Recorded in earlier runs; their history stays available.', body: `<ul class="chip-list">${retired.map((f) => `<li><a href="${url(`benchmarks/${benchSlug(f)}/`)}"><code>${esc(f)}</code></a></li>`).join('')}</ul>` }) : ''}`,
  };

  const detail = allFiles.map((file) => {
    const points = runs.map((run) => ({ at: run.at, row: rowFor(run, file) })).filter((p) => p.row);
    const last = points[points.length - 1]?.row;
    const pts = (key) => points.map((p) => ({ x: p.at, y: p.row.status === 'failed' ? null : reported(p.row[key]) }));
    const hasOps = points.some((p) => reported(p.row.ops) != null);
    const hasAvg = points.some((p) => reported(p.row.avgTime) != null);
    const gate = gating[file];
    return {
      path: `benchmarks/${benchSlug(file)}/`,
      title: `${last?.name || file} · Benchmarks`,
      body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="${url('benchmarks/')}">Benchmarks</a><span class="sep">/</span><span>${esc(last?.name || file)}</span></nav>
      ${pageHeader({
        title: esc(last?.name || file),
        lede: descriptions[file] ? esc(descriptions[file]) : '',
        meta: [
          `<a class="source" href="https://github.com/${esc(meta?.upstream?.repository || 'Avenx-JS/avenx-js')}/blob/${esc(meta?.upstream?.commit || 'main')}/benches/${esc(file)}"><code>benches/${esc(file)}</code> ${icon('ext', 'icon-sm')}</a>`,
          gate ? `<span class="tag">PR gate +${gate}%</span>` : '',
          last?.status === 'failed' ? badge('failed', 'crashed in the latest run') : '',
          !latestFiles.includes(file) ? badge('neutral', 'no longer in the suite') : '',
        ].join(''),
      })}
      <div class="stats">
        ${statTile({ label: 'Avg / op (latest)', value: last?.status === 'failed' ? '—' : fmtMs(reported(last?.avgTime)) })}
        ${statTile({ label: 'Ops/s (latest)', value: last?.status === 'failed' ? '—' : reported(last?.ops) != null ? fmtCompact(last.ops) : '—' })}
        ${statTile({ label: 'Total (latest)', value: last?.status === 'failed' ? '—' : fmtMs(reported(last?.totalTime)) })}
        ${statTile({ label: 'Runs with this benchmark', value: fmtInt(points.length), sub: points.length ? `since ${fmtDate(points[0].at)}` : '' })}
      </div>
      ${panel({ title: 'Average time per operation', sub: 'Lower is faster.', body: hasAvg ? lineChart({ label: `Average time per operation of ${last?.name || file}`, series: [{ name: 'Avg / op', slot: 1, points: pts('avgTime') }], format: fmtMs, height: 220 }) : empty('This benchmark has not reported an average time.') })}
      ${panel({ title: 'Operations per second', sub: 'Higher is faster.', body: hasOps ? lineChart({ label: `Operations per second of ${last?.name || file}`, series: [{ name: 'Ops/s', slot: 1, points: pts('ops') }], format: (v) => fmtInt(v), axisFormat: (v) => fmtCompact(v), height: 220 }) : empty('This benchmark has not reported operations per second.') })}`,
    };
  });

  return [index, ...detail];
}

/** The latest results in the legacy results.json shape, for existing consumers. */
export function legacyResultsJson(history, current, meta) {
  const runs = benchmarkRuns(history, current, meta);
  const latest = runs[runs.length - 1];
  if (!latest) return [];
  return latest.results.map(({ file, name, totalTime, avgTime, ops, timestamp }) => ({ file, name, totalTime, avgTime, ops, timestamp }));
}
