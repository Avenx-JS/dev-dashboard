/**
 * Landing page: the state of all three areas at a glance.
 */
import { esc, url, badge, panel, statTile, pageHeader, fmtInt, fmtPct, fmtDate, fmtMs, icon, empty } from '../html.js';
import { sparkline } from '../charts.js';
import { coverageSeries, coverageTrendChart } from './coverage.js';
import { benchmarkRuns } from './benchmarks.js';

const STEP_INFO = {
  docs: { label: 'API reference', cmd: 'jsdoc -c jsdoc.json -X', href: 'docs/' },
  coverage: { label: 'Test coverage', cmd: 'npm run test:coverage', href: 'coverage/' },
  benchmarks: { label: 'Benchmarks', cmd: 'node benches/run.js --json', href: 'benchmarks/' },
};

export function overviewPage({ meta, docs, coverage, coverageHistory, benchHistory, benchCurrent }) {
  const covRuns = coverageSeries(coverageHistory, coverage, meta);
  const cov = covRuns[covRuns.length - 1];
  const benchRuns = benchmarkRuns(benchHistory, benchCurrent, meta);
  const bench = benchRuns[benchRuns.length - 1];
  const crashed = bench ? bench.results.filter((r) => r.status === 'failed').length : 0;
  const stats = docs?.stats;
  const docCov = stats?.coverage.total ? (stats.coverage.documented / stats.coverage.total) * 100 : null;
  const tests = coverage?.tests || cov?.tests;

  const area = ({ href, title, lines, status }) => `<a class="area" href="${url(href)}">
      <div class="area-head"><h2>${title}</h2>${status}</div>
      <div class="area-body">${lines}</div>
      <div class="area-foot">Open ${icon('ext', 'icon-sm')}</div>
    </a>`;

  const docsArea = area({
    href: 'docs/',
    title: 'API Reference',
    status: docs ? (docs.diagnostics.some((d) => d.level === 'error') ? badge('warning', `${docs.diagnostics.filter((d) => d.level === 'error').length} JSDoc errors`) : badge('ok', 'clean')) : badge('neutral', 'not built'),
    lines: stats
      ? `<div class="area-figure">${fmtInt(stats.symbols)}<span>documented symbols</span></div>
         <dl class="kv kv-tight"><div><dt>Modules</dt><dd>${fmtInt(stats.modules)}</dd></div><div><dt>Classes</dt><dd>${fmtInt(stats.classes)}</dd></div><div><dt>Classes &amp; functions with docs</dt><dd>${fmtPct(docCov, 1)}</dd></div></dl>`
      : '<p class="muted">The API reference was not generated in this build.</p>',
  });

  const covArea = area({
    href: 'coverage/',
    title: 'Test Coverage',
    status: tests ? (tests.failed ? badge('failed', `${tests.failed} test files failing`) : badge('ok', 'all tests pass')) : badge('neutral', 'no test counts'),
    lines: cov
      ? `<div class="area-figure">${fmtPct(cov.total.lines.pct)}<span>line coverage</span></div>
         <div class="area-spark">${sparkline(covRuns.map((r) => r.total.lines.pct), { width: 220, height: 32 })}</div>
         <dl class="kv kv-tight"><div><dt>Branches</dt><dd>${fmtPct(cov.total.branches.pct)}</dd></div><div><dt>Functions</dt><dd>${fmtPct(cov.total.functions.pct)}</dd></div>${tests ? `<div><dt>Test files passing</dt><dd>${fmtInt(tests.passed)} / ${fmtInt(tests.total)}</dd></div>` : ''}</dl>`
      : '<p class="muted">No coverage data yet.</p>',
  });

  const benchArea = area({
    href: 'benchmarks/',
    title: 'Benchmarks',
    status: bench ? (crashed ? badge('failed', `${crashed} crashed`) : badge('ok', 'all ran')) : badge('neutral', 'no runs'),
    lines: bench
      ? `<div class="area-figure">${fmtInt(bench.results.length)}<span>benchmark suites</span></div>
         <dl class="kv kv-tight"><div><dt>Gated on pull requests</dt><dd>${fmtInt(Object.keys(benchCurrent?.gating || {}).length) || '—'}</dd></div><div><dt>Latest run</dt><dd>${fmtDate(bench.at)}</dd></div><div><dt>Runs recorded</dt><dd>${fmtInt(benchHistory.runs.length)}</dd></div></dl>`
      : '<p class="muted">No benchmark runs yet.</p>',
  });

  const steps = meta?.steps || {};
  const pipeline = Object.keys(STEP_INFO)
    .map((k) => {
      const s = steps[k];
      const info = STEP_INFO[k];
      return `<tr><td><a href="${url(info.href)}">${info.label}</a></td><td><code>${esc(info.cmd)}</code></td><td>${s ? badge(s.status, s.status === 'ok' ? 'ok' : 'failed') : '<span class="faint">not run in this build</span>'}</td><td class="num">${s?.seconds != null ? fmtMs(s.seconds * 1000) : '—'}</td><td class="muted small">${esc([s?.reason, s?.errors != null ? `${s.errors} errors, ${s.warnings} warnings logged` : null].filter(Boolean).join('; '))}</td></tr>`;
    })
    .join('');

  return `${pageHeader({
    eyebrow: 'Avenx.js',
    title: 'Developer Dashboard',
    lede: 'API reference, test coverage and performance benchmarks of the Avenx.js framework, generated from the source in one pipeline.',
    meta: meta
      ? `<span>Built from <a href="https://github.com/${esc(meta.upstream.repository)}/commit/${esc(meta.upstream.commit)}"><code>${esc(meta.upstream.commit.slice(0, 7))}</code></a> · ${esc(meta.upstream.subject)}</span><span>${esc(meta.upstream.package)} ${esc(meta.upstream.version)}</span><span>Collected ${fmtDate(meta.collectedAt, true)}</span>`
      : '<span>Built from the recorded history only; no upstream checkout was collected.</span>',
  })}
  <div class="areas">${docsArea}${covArea}${benchArea}</div>
  ${cov ? panel({ title: 'Coverage trend', sub: 'Line and branch coverage per recorded run.', body: coverageTrendChart(covRuns, ['lines', 'branches'], 220), actions: `<a class="button button-quiet" href="${url('coverage/')}">All metrics</a>` }) : ''}
  ${panel({
    title: 'Pipeline',
    sub: 'Each build runs these commands in a fresh checkout of the framework. A failing step is reported here and on its page, and fails the workflow run, but does not stop the other areas from updating.',
    flush: true,
    body: meta
      ? `<div class="table-wrap"><table class="table"><thead><tr><th>Area</th><th>Command</th><th>Status</th><th class="num">Duration</th><th>Note</th></tr></thead><tbody>${pipeline}</tbody></table></div>`
      : empty('No collection metadata in this build.'),
  })}`;
}
