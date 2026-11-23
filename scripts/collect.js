#!/usr/bin/env node
/**
 * Collects the raw data for the dashboard from a checkout of Avenx-JS/avenx-js.
 *
 * It runs exactly the commands the legacy pipelines ran, in the upstream
 * checkout, with the upstream's own dependencies:
 *
 *   docs        jsdoc -c jsdoc.json -X     (legacy: `npm run docs` → Avenx-JS/dev-docs)
 *   coverage    npm run test:coverage      (legacy: quality-results.yml → Avenx-JS/test-cov)
 *   benchmarks  node benches/run.js --json (legacy: `npm run bench:report` → Avenx-JS/bench-results)
 *
 * A failing step does not abort the collection. Its status, exit code and log
 * are recorded in meta.json, the dashboard shows the failure, and
 * `scripts/status.js` fails the workflow at the end. The legacy pipelines
 * aborted instead, which left the published sites silently stale (the API
 * docs since 2026-09-16).
 *
 * Usage:
 *   node scripts/collect.js --upstream ../avenx-js [--out .cache/collected]
 *                           [--only docs,coverage,benchmarks]
 */
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/history.js';
import { buildDocsModel } from './lib/docs-model.js';
import {
  benchDescription,
  normalizeCoverageSummary,
  parseBenchFailures,
  parseJsdocDiagnostics,
  parseTestSummary,
} from './lib/parse.js';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = process.argv[i].match(/^--([\w-]+)$/);
  if (m) args[m[1]] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
if (!args.upstream) {
  console.error('Usage: collect.js --upstream <avenx-js checkout> [--out DIR] [--only docs,coverage,benchmarks]');
  process.exit(2);
}

// Resolve symlinks: c8 and JSDoc report real paths, and the paths shown on the
// dashboard are made relative to this directory.
const upstream = fs.realpathSync(path.resolve(args.upstream));
const out = path.resolve(args.out || path.join(ROOT, '.cache/collected'));
const only = new Set(String(args.only || 'docs,coverage,benchmarks').split(','));
const logs = path.join(out, 'logs');
fs.mkdirSync(logs, { recursive: true });

const writeJson = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data) + '\n');

/** Runs a command in the upstream checkout and keeps its output in logs/. */
function run(step, cmd, argv, opts = {}) {
  console.log(`\n▶ [${step}] ${cmd} ${argv.join(' ')}`);
  const started = Date.now();
  const res = spawnSync(cmd, argv, {
    cwd: upstream,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    ...opts,
  });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  if (res.error) throw res.error;
  fs.writeFileSync(path.join(logs, `${step}.stderr.log`), res.stderr || '');
  if (!opts.keepStdout) fs.writeFileSync(path.join(logs, `${step}.stdout.log`), res.stdout || '');
  console.log(`  exit ${res.status} after ${seconds}s`);
  return { ...res, seconds };
}

const gitOut = (...a) => execFileSync('git', ['-C', upstream, ...a], { encoding: 'utf8' }).trim();
const pkg = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json'), 'utf8'));

const meta = {
  collectedAt: new Date().toISOString(),
  upstream: {
    repository: process.env.UPSTREAM_REPOSITORY || 'Avenx-JS/avenx-js',
    commit: gitOut('rev-parse', 'HEAD'),
    commitDate: gitOut('log', '-1', '--format=%cI'),
    subject: gitOut('log', '-1', '--format=%s'),
    package: pkg.name,
    version: pkg.version,
  },
  node: process.version,
  steps: {},
};

// ---------------------------------------------------------------- docs
if (only.has('docs')) {
  const res = run('docs', process.execPath, [path.join('node_modules', 'jsdoc', 'jsdoc.js'), '-c', 'jsdoc.json', '-X'], {
    keepStdout: true,
  });
  const diagnostics = parseJsdocDiagnostics(res.stderr || '');
  let doclets = null;
  try {
    doclets = JSON.parse(res.stdout);
  } catch {
    /* reported below */
  }
  if (doclets) {
    const model = buildDocsModel(doclets, { root: upstream });
    // The README is the landing page of the legacy JSDoc site; render it with
    // the markdown-it that upstream's JSDoc uses, so nothing new is installed.
    const req = createRequire(path.join(upstream, 'package.json'));
    let readme = '';
    try {
      const MarkdownIt = req(req.resolve('markdown-it', { paths: [path.join(upstream, 'node_modules/jsdoc')] }));
      readme = new MarkdownIt({ html: true, linkify: false }).render(
        fs.readFileSync(path.join(upstream, 'README.md'), 'utf8'),
      );
    } catch (err) {
      console.warn(`  README not rendered: ${err.message}`);
    }
    writeJson('docs.json', { ...model, readme, diagnostics });
    // JSDoc exits 1 whenever it logged an ERROR, even though the output is
    // complete. Unparseable type expressions are reported, not fatal.
    meta.steps.docs = {
      status: 'ok',
      exitCode: res.status,
      seconds: res.seconds,
      errors: diagnostics.filter((d) => d.level === 'error').length,
      warnings: diagnostics.filter((d) => d.level === 'warning').length,
    };
  } else {
    meta.steps.docs = { status: 'failed', exitCode: res.status, seconds: res.seconds, reason: 'jsdoc produced no JSON' };
  }
}

// ---------------------------------------------------------------- coverage
if (only.has('coverage')) {
  const res = run('coverage', 'npm', ['run', 'test:coverage']);
  const tests = parseTestSummary(res.stdout || '');
  const c8 = path.join('node_modules', '.bin', process.platform === 'win32' ? 'c8.cmd' : 'c8');
  // test:coverage only writes the text and HTML reporters; derive the
  // machine-readable summary from the same raw V8 data instead of running the
  // suite a second time.
  const rep = run('coverage-summary', c8, [
    'report',
    '--reporter=json-summary',
    '--report-dir',
    'coverage',
    '--temp-directory',
    path.join('coverage', 'tmp'),
  ]);
  const summaryFile = path.join(upstream, 'coverage', 'coverage-summary.json');
  if (rep.status === 0 && fs.existsSync(summaryFile)) {
    const summary = normalizeCoverageSummary(JSON.parse(fs.readFileSync(summaryFile, 'utf8')), upstream);
    const reportDir = path.join(out, 'coverage-report');
    fs.rmSync(reportDir, { recursive: true, force: true });
    // The HTML report holds the line-by-line view; the raw V8 dumps in tmp/
    // are inputs to it, not part of it (the legacy pipeline published them by
    // accident, 860+ files).
    fs.cpSync(path.join(upstream, 'coverage'), reportDir, {
      recursive: true,
      filter: (src) => !src.includes(`${path.sep}coverage${path.sep}tmp`) && !src.endsWith('coverage-summary.json'),
    });
    writeJson('coverage.json', { ...summary, tests });
    meta.steps.coverage = {
      status: res.status === 0 ? 'ok' : 'failed',
      exitCode: res.status,
      seconds: res.seconds,
      reason: res.status === 0 ? null : tests ? `${tests.failed} test file(s) failed` : 'test run failed',
    };
  } else {
    meta.steps.coverage = { status: 'failed', exitCode: res.status, seconds: res.seconds, reason: 'no coverage summary' };
  }
}

// ---------------------------------------------------------------- benchmarks
if (only.has('benchmarks')) {
  const res = run('benchmarks', process.execPath, [path.join('benches', 'run.js'), '--json']);
  const failures = parseBenchFailures(res.stderr || '');
  let rows = null;
  try {
    rows = JSON.parse(res.stdout);
  } catch {
    /* reported below */
  }
  const benchDir = path.join(upstream, 'benches');
  const descriptions = {};
  for (const f of fs.readdirSync(benchDir).filter((f) => f.endsWith('.bench.js'))) {
    const d = benchDescription(fs.readFileSync(path.join(benchDir, f), 'utf8'));
    if (d) descriptions[f] = d;
  }
  let gating = {};
  try {
    gating = (await import(pathToFileURL(path.join(benchDir, 'regression-gate.js')).href)).gating ?? {};
  } catch (err) {
    console.warn(`  regression-gate.js not read: ${err.message}`);
  }
  if (Array.isArray(rows)) {
    const failed = new Map(failures.map((f) => [f.file, f]));
    const results = rows.map((r) => ({
      ...r,
      status: failed.has(r.file) ? 'failed' : 'ok',
      ...(failed.has(r.file) ? { error: failed.get(r.file).detail.split(`file://${upstream}${path.sep}`).join('').split(upstream + path.sep).join('') } : {}),
    }));
    const relFailures = failures.map((f) => ({ ...f, detail: f.detail.split(`file://${upstream}${path.sep}`).join('').split(upstream + path.sep).join('') }));
    writeJson('benchmarks.json', { recordedAt: results[0]?.timestamp ?? meta.collectedAt, results, failures: relFailures, descriptions, gating });
    meta.steps.benchmarks = {
      status: failures.length ? 'failed' : 'ok',
      exitCode: res.status,
      seconds: res.seconds,
      reason: failures.length ? `${failures.length} benchmark(s) crashed` : null,
    };
  } else {
    meta.steps.benchmarks = { status: 'failed', exitCode: res.status, seconds: res.seconds, reason: 'no JSON output' };
  }
}

// Steps that were not requested keep the result of an earlier collection in
// the same directory, if any (local development).
const previous = fs.existsSync(path.join(out, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'meta.json'), 'utf8')) : null;
if (previous && previous.upstream?.commit === meta.upstream.commit) {
  for (const [k, v] of Object.entries(previous.steps || {})) if (!meta.steps[k]) meta.steps[k] = v;
}
writeJson('meta.json', meta);
console.log('\nCollected:', JSON.stringify(meta.steps, null, 2));
