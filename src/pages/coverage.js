/**
 * Test coverage: totals, trend, test results, per-directory and per-file
 * tables. The line-by-line view is the c8 HTML report, published unchanged
 * under coverage/report/.
 */
import { esc, url, badge, panel, statTile, pageHeader, empty, fmtInt, fmtPct, fmtDelta, fmtDate, meter, coverageTone, icon } from '../html.js';
import { lineChart, sparkline } from '../charts.js';
import { METRICS } from '../../scripts/lib/parse.js';

export const METRIC_LABEL = { lines: 'Lines', statements: 'Statements', branches: 'Branches', functions: 'Functions' };
const SLOT = { lines: 1, branches: 2, functions: 3, statements: 4 };

/**
 * The runs the coverage area shows: the recorded history plus the current
 * collection when it has not been recorded (yet).
 */
export function coverageSeries(history, current, meta) {
  const runs = history.runs.map((r) => ({ at: r.recordedAt, total: r.total, tests: r.tests, recorded: true, source: r.source }));
  if (current && meta && !runs.some((r) => r.source?.upstreamCommit === meta.upstream.commit && r.source?.runId === (process.env.GITHUB_RUN_ID ?? null))) {
    runs.push({ at: meta.collectedAt, total: current.total, tests: current.tests, recorded: false, source: { upstreamCommit: meta.upstream.commit } });
  }
  return runs.sort((a, b) => a.at.localeCompare(b.at));
}

// c8 counts statements per line, so the statements series equals lines in
// every recorded run; plotting both would draw one line over the other.
export function coverageTrendChart(runs, metrics = ['lines', 'branches', 'functions'], height = 260) {
  return lineChart({
    label: `Coverage over time: ${metrics.map((m) => METRIC_LABEL[m]).join(', ')}`,
    series: metrics.map((m) => ({ name: METRIC_LABEL[m], slot: SLOT[m], points: runs.map((r) => ({ x: r.at, y: r.total[m].pct })) })),
    format: (v) => fmtPct(v),
    axisFormat: (v) => `${v}%`,
    height,
  });
}

const reportHref = (path) => url(`coverage/report/${path === '.' ? '' : path + '/'}index.html`);
const fileHref = (path) => url(`coverage/report/${path}.html`);
/** Links into the c8 report when this build has one, plain text otherwise. */
const maybeLink = (href, inner, hasReport) => (hasReport ? `<a href="${href}">${inner}</a>` : inner);

function metricCells(entry) {
  return METRICS.map((k) => {
    const m = entry[k];
    return `<td class="num cov-${coverageTone(m.pct)}" data-sort="${m.pct}"><span class="cov-pct">${fmtPct(m.pct)}</span><span class="cov-abs">${fmtInt(m.covered)}/${fmtInt(m.total)}</span></td>`;
  }).join('');
}

export function coveragePage({ current, history, meta, hasReport }) {
  const runs = coverageSeries(history, current, meta);
  const latest = runs[runs.length - 1];
  if (!latest) {
    return `${pageHeader({ eyebrow: 'Test Coverage', title: 'Test coverage' })}${empty('No coverage data has been collected yet.')}`;
  }
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  const dirs = current?.directories || history.runs[history.runs.length - 1]?.directories || [];
  const files = current?.files || [];
  const tests = current?.tests || latest.tests;
  const step = meta?.steps?.coverage;

  const tiles = ['lines', 'statements', 'branches', 'functions']
    .map((k) => {
      const m = latest.total[k];
      const d = prev ? m.pct - prev.total[k].pct : null;
      return statTile({
        label: METRIC_LABEL[k],
        value: fmtPct(m.pct),
        sub: `${fmtInt(m.covered)} / ${fmtInt(m.total)}`,
        delta: d != null ? `${fmtDelta(d, 2, ' pp')}` : '',
        deltaTone: d == null || Math.abs(d) < 0.005 ? 'neutral' : d > 0 ? 'good' : 'critical',
        trend: sparkline(runs.map((r) => r.total[k].pct)),
      });
    })
    .join('');

  const testsTile = tests
    ? statTile({
        label: 'Test files',
        value: `${fmtInt(tests.passed)}<span class="stat-of">/${fmtInt(tests.total)}</span>`,
        sub: tests.failed ? badge('failed', `${tests.failed} failed`) : badge('ok', 'all passed'),
      })
    : '';

  const failing = current?.tests?.failures?.length
    ? `<div class="callout callout-critical">${icon('fail')}<div><strong>${current.tests.failures.length} test file${current.tests.failures.length === 1 ? '' : 's'} failed in this run.</strong> Coverage is still reported for everything that ran.
        <ul class="plain-list">${current.tests.failures.map((f) => `<li><code>${esc(f.file)}</code> <span class="muted">${esc(f.detail)}</span></li>`).join('')}</ul></div></div>`
    : '';

  const byDir = new Map(dirs.map((d) => [d.path, []]));
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }

  const dirRows = dirs
    .map((d, i) => {
      const list = byDir.get(d.path) || [];
      const toggle = list.length
        ? `<button class="row-toggle" type="button" aria-expanded="false" aria-controls="cov-files-${i}" aria-label="Show files in ${esc(d.path)}">${list.length}</button>`
        : '';
      const head = `<tr class="dir-row">
          <td class="dir-cell">${toggle}${maybeLink(reportHref(d.path), `<code>${esc(d.path)}/</code>`, hasReport)}</td>
          <td class="meter-cell" data-sort="${d.lines.pct}">${meter(d.lines.pct, { label: `Lines ${fmtPct(d.lines.pct)}` })}</td>
          ${metricCells(d)}
        </tr>`;
      const rows = list
        .map((f) => `<tr class="file-row"><td class="file-cell">${maybeLink(fileHref(f.path), `<code>${esc(f.path.split('/').pop())}</code>`, hasReport)}</td><td class="meter-cell" data-sort="${f.lines.pct}">${meter(f.lines.pct)}</td>${metricCells(f)}</tr>`)
        .join('');
      return `<tbody class="dir-group">${head}</tbody>${list.length ? `<tbody class="file-group" id="cov-files-${i}" hidden>${rows}</tbody>` : ''}`;
    })
    .join('');

  const lowest = files
    .filter((f) => f.lines.total >= 20 && f.lines.pct < 100)
    .sort((a, b) => a.lines.pct - b.lines.pct || b.lines.total - a.lines.total)
    .slice(0, 12);

  const recordedRuns = history.runs.length;
  const firstDirs = history.runs[0]?.directories?.length ?? null;
  return `${pageHeader({
    eyebrow: 'Test Coverage',
    title: 'Test coverage',
    lede: 'Statement, branch, function and line coverage of the full test suite, measured with c8 by <code>npm run test:coverage</code>, the command the former coverage.avenx-js.com was generated with.',
    meta: [
      meta ? `<span>Measured ${fmtDate(meta.collectedAt, true)} on <a href="https://github.com/${esc(meta.upstream.repository)}/commit/${esc(meta.upstream.commit)}"><code>${esc(meta.upstream.commit.slice(0, 7))}</code></a></span>` : `<span>Latest recorded run ${fmtDate(latest.at, true)}</span>`,
      step ? badge(step.status, step.status === 'ok' ? 'test run passed' : step.reason || 'test run failed') : '',
      hasReport ? `<a class="button" href="${url('coverage/report/index.html')}">Line-by-line report ${icon('ext', 'icon-sm')}</a>` : '',
    ].join(''),
  })}
  ${failing}
  <div class="stats">${tiles}${testsTile}</div>
  ${panel({
    title: 'Coverage over time',
    actions: '',
    sub: `${recordedRuns} recorded runs since ${fmtDate(history.runs[0]?.recordedAt)}${latest.recorded ? '' : ', plus the current build'}.${firstDirs != null && firstDirs < dirs.length ? ` The first recorded run measured ${firstDirs} director${firstDirs === 1 ? 'y' : 'ies'}, this one ${dirs.length}: early totals cover a smaller part of the code base.` : ''} Statements equal lines under c8 and are not drawn separately.`,
    body: coverageTrendChart(runs),
  })}
  <div class="grid-2">
    ${panel({
      title: 'Test results',
      sub: tests ? 'Test files run by <code>test/run-tests.js</code> under coverage.' : '',
      body: tests
        ? `<div class="segbar" role="img" aria-label="${fmtInt(tests.passed)} passed, ${fmtInt(tests.failed)} failed">
            <span class="seg seg-good" style="flex:${tests.passed}"></span>${tests.failed ? `<span class="seg seg-critical" style="flex:${Math.max(tests.failed, tests.total / 200)}"></span>` : ''}
          </div>
          <dl class="kv">
            <div><dt>${badge('ok', 'Passed')}</dt><dd>${fmtInt(tests.passed)}</dd></div>
            <div><dt>${badge('failed', 'Failed')}</dt><dd>${fmtInt(tests.failed)}</dd></div>
            <div><dt>Total test files</dt><dd>${fmtInt(tests.total)}</dd></div>
          </dl>`
        : empty('Test counts are not available for this run. The legacy reports did not record them.'),
    })}
    ${panel({
      title: 'Least covered files',
      sub: 'Files with at least 20 lines, by line coverage.',
      flush: true,
      body: lowest.length
        ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>File</th><th class="num">Lines</th><th class="num">Uncovered</th></tr></thead><tbody>${lowest
            .map((f) => `<tr><td>${maybeLink(fileHref(f.path), `<code>${esc(f.path)}</code>`, hasReport)}</td><td class="num cov-${coverageTone(f.lines.pct)}">${fmtPct(f.lines.pct)}</td><td class="num">${fmtInt(f.lines.total - f.lines.covered)}</td></tr>`)
            .join('')}</tbody></table></div>`
        : empty('Per-file data is only available in builds that ran the test suite.'),
    })}
  </div>
  ${panel({
    title: 'Coverage by directory',
    sub: `${dirs.length} directories${files.length ? `, ${files.length} files. Expand a directory for its files; names link to the annotated source in the line-by-line report` : ''}. Thresholds as in the report: ${badge('good', '≥ 80%')} ${badge('warning', '50–80%')} ${badge('critical', '< 50%')}`,
    flush: true,
    actions: files.length ? `<button class="button button-quiet" type="button" data-expand-all>Expand all</button>` : '',
    body: `<div class="table-wrap"><table class="table coverage">
      <thead><tr><th data-sort-key>Directory</th><th class="meter-head"><span class="sr-only">Line coverage bar</span></th>${METRICS.map((k) => `<th class="num" data-sort-key>${METRIC_LABEL[k]}</th>`).join('')}</tr></thead>
      ${dirRows}
    </table></div>`,
  })}`;
}
