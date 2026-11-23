#!/usr/bin/env node
/**
 * Builds the static site into dist/ from
 *   - data/                   recorded history (committed)
 *   - .cache/collected/       output of scripts/collect.js (optional)
 *
 * Every area degrades on its own: without a collection the site still builds
 * from the recorded history, and pages say what is missing.
 *
 * Environment: BASE_PATH (default "/"), the path the site is served under.
 * Usage: node scripts/build.js [--collected DIR] [--out DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, readHistory } from './lib/history.js';
import { setBase, url, esc } from '../src/html.js';
import { layout } from '../src/layout.js';
import { overviewPage } from '../src/pages/overview.js';
import { coveragePage } from '../src/pages/coverage.js';
import { benchmarksPages, legacyResultsJson } from '../src/pages/benchmarks.js';
import { indexDocs, docsPages, docsSidebar, searchIndex, legacyRedirects } from '../src/pages/docs.js';

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const collected = path.resolve(opt('collected', path.join(ROOT, '.cache/collected')));
const out = path.resolve(opt('out', path.join(ROOT, 'dist')));
setBase(process.env.BASE_PATH || '/');

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const meta = readJson(path.join(collected, 'meta.json'));
const docs = readJson(path.join(collected, 'docs.json'));
const coverage = readJson(path.join(collected, 'coverage.json'));
const benchCurrent = readJson(path.join(collected, 'benchmarks.json'));
const coverageHistory = readHistory('coverage');
const benchHistory = readHistory('benchmarks');
const legacyDocs = readJson(path.join(DATA_DIR, 'legacy', 'dev-docs-pages.json'));
const reportDir = path.join(collected, 'coverage-report');
const hasReport = fs.existsSync(path.join(reportDir, 'index.html'));

const builtAt = new Date().toISOString();
const site = {
  upstream: meta?.upstream ?? null,
  builtAt,
  buildId: `${(meta?.upstream?.commit || 'local').slice(0, 7)}-${Date.parse(builtAt).toString(36)}`,
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let pageCount = 0;
function writePage(p, html) {
  const file = path.join(out, p.endsWith('/') || p === '' ? path.join(p, 'index.html') : p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  pageCount++;
}
const writeData = (p, data) => {
  const file = path.join(out, p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};

// ---------------------------------------------------------------- overview
writePage('', layout({ title: '', section: 'overview', site, body: overviewPage({ meta, docs, coverage, coverageHistory, benchHistory, benchCurrent }) }));

// ---------------------------------------------------------------- docs
let redirects = {};
if (docs) {
  const idx = indexDocs(docs, { repository: meta.upstream.repository, commit: meta.upstream.commit });
  for (const p of docsPages(idx, docs, meta.steps)) {
    writePage(p.path, layout({ title: p.title, section: 'docs', site, sidebar: docsSidebar(idx, p.sidebarFor), body: p.body }));
  }
  writeData('assets/search-index.json', searchIndex(idx));
  if (legacyDocs) redirects = legacyRedirects(idx, legacyDocs.files);
} else {
  writePage('docs/', layout({ title: 'API Reference', section: 'docs', site, body: `<header class="page-head"><div class="eyebrow">API Reference</div><h1>Avenx.js API</h1></header><div class="empty">The API reference is generated from an upstream checkout and was not collected in this build. Run <code>npm run collect -- --upstream &lt;avenx-js&gt;</code>.</div>` }));
  writeData('assets/search-index.json', []);
}

// ---------------------------------------------------------------- coverage
writePage('coverage/', layout({ title: 'Test Coverage', section: 'coverage', site, body: coveragePage({ current: coverage, history: coverageHistory, meta, hasReport }) }));
if (hasReport) fs.cpSync(reportDir, path.join(out, 'coverage', 'report'), { recursive: true });

// ---------------------------------------------------------------- benchmarks
for (const p of benchmarksPages({ history: benchHistory, current: benchCurrent, meta })) {
  writePage(p.path, layout({ title: p.title, section: 'benchmarks', site, body: p.body }));
}
// The legacy site served exactly this file; keep the shape for consumers.
writeData('benchmarks/results.json', legacyResultsJson(benchHistory, benchCurrent, meta));

// ---------------------------------------------------------------- data exports
writeData('data/coverage-history.json', coverageHistory);
writeData('data/benchmarks-history.json', benchHistory);
if (meta) writeData('data/latest.json', { meta, coverage: coverage ? { total: coverage.total, tests: coverage.tests } : null, docs: docs ? { stats: docs.stats } : null });

// ---------------------------------------------------------------- 404 + legacy redirects
// GitHub Pages serves 404.html for unknown paths. Old JSDoc URLs
// (dev.avenx-js.com/AvenxApp.html, …) are forwarded to their new page.
const redirectScript = `<script>
(function () {
  var map = ${JSON.stringify(redirects)};
  var base = ${JSON.stringify(url(''))};
  var p = location.pathname.indexOf(base) === 0 ? location.pathname.slice(base.length) : location.pathname.replace(/^\\//, '');
  var target = map[p];
  if (target) location.replace(/^https?:/.test(target) ? target : base + target + location.hash);
})();
</script>`;
writePage(
  '404.html',
  layout({
    title: 'Page not found',
    section: '',
    site,
    body: `${redirectScript}<header class="page-head"><div class="eyebrow">404</div><h1>Page not found</h1><p class="lede">This page does not exist. The dashboard replaced dev.avenx-js.com, benchmarks.avenx-js.com and coverage.avenx-js.com; their content is under <a href="${url('docs/')}">API Reference</a>, <a href="${url('benchmarks/')}">Benchmarks</a> and <a href="${url('coverage/')}">Test Coverage</a>.</p></header>`,
  }),
);

// ---------------------------------------------------------------- assets
fs.cpSync(path.join(ROOT, 'src', 'assets'), path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`Built ${pageCount} pages into ${path.relative(ROOT, out) || out} (base ${url('')})`);
console.log(`  docs: ${docs ? 'yes' : 'no'} · coverage: ${coverage ? 'current' : 'history only'}${hasReport ? ' + report' : ''} · benchmarks: ${benchCurrent ? 'current' : 'history only'} · legacy redirects: ${Object.keys(redirects).length}`);
