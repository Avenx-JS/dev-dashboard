#!/usr/bin/env node
/**
 * One-time import of the history stored in the three legacy repositories.
 *
 * The legacy repositories never kept history as data: every weekly run
 * overwrote `results.json` (Avenx-JS/bench-results) or the HTML report
 * (Avenx-JS/test-cov) and the history only exists as git commits. This script
 * walks those commits and writes the same information into this repository's
 * `data/` directory, so the dashboard keeps the full history after the legacy
 * repositories are deleted.
 *
 * It is NOT part of the regular build or workflow. Run it once, with local
 * clones of the legacy repositories:
 *
 *   node scripts/migrate/import-legacy.js \
 *     --bench-results ../bench-results --test-cov ../test-cov --dev-docs ../dev-docs
 *
 * Re-running it is safe: runs that originate from a legacy commit already in
 * the history are replaced, runs recorded by the workflow are kept.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseIstanbulIndex } from '../lib/parse.js';
import { readHistory, writeHistory, DATA_DIR } from '../lib/history.js';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = process.argv[i].match(/^--([\w-]+)$/);
  if (m) args[m[1]] = process.argv[++i];
}

const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** Commits that touched `file`, oldest first. */
function commitsTouching(repo, file) {
  return git(repo, 'log', '--reverse', '--format=%H %cI %s', '--', file)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...subject] = line.split(' ');
      return { sha, date, subject: subject.join(' ') };
    });
}

function mergeRuns(existing, imported) {
  const legacyKeys = new Set(imported.map((r) => r.source.legacyCommit));
  const kept = existing.filter((r) => !r.source.legacyCommit || !legacyKeys.has(r.source.legacyCommit));
  return [...imported, ...kept].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

function importBenchmarks(repo) {
  const runs = [];
  for (const c of commitsTouching(repo, 'results.json')) {
    let results;
    try {
      results = JSON.parse(git(repo, 'show', `${c.sha}:results.json`));
    } catch (err) {
      console.warn(`bench-results ${c.sha.slice(0, 7)}: unreadable results.json, skipped (${err.message})`);
      continue;
    }
    if (!Array.isArray(results) || results.length === 0) continue;
    // The run time is when the benchmarks ran; every row carries its own
    // timestamp, the commit date is only a fallback.
    const stamps = results.map((r) => r.timestamp).filter(Boolean).sort();
    runs.push({
      recordedAt: new Date(stamps[0] || c.date).toISOString(),
      source: {
        kind: 'legacy',
        repository: 'Avenx-JS/bench-results',
        legacyCommit: c.sha,
        upstreamCommit: null,
      },
      results: results.map((r) => ({
        file: r.file,
        name: r.name,
        totalTime: r.totalTime,
        avgTime: r.avgTime,
        ops: r.ops,
        timestamp: r.timestamp ?? null,
        status: 'unknown',
      })),
    });
  }
  const history = readHistory('benchmarks');
  history.runs = mergeRuns(history.runs, runs);
  writeHistory('benchmarks', history);
  console.log(`benchmarks: imported ${runs.length} runs, history now ${history.runs.length}`);
}

function importCoverage(repo) {
  const runs = [];
  for (const c of commitsTouching(repo, 'index.html')) {
    let parsed;
    try {
      parsed = parseIstanbulIndex(git(repo, 'show', `${c.sha}:index.html`));
    } catch (err) {
      console.warn(`test-cov ${c.sha.slice(0, 7)}: ${err.message}, skipped`);
      continue;
    }
    runs.push({
      recordedAt: new Date(c.date).toISOString(),
      source: { kind: 'legacy', repository: 'Avenx-JS/test-cov', legacyCommit: c.sha, upstreamCommit: null },
      total: parsed.total,
      directories: parsed.directories,
      tests: null,
    });
  }
  const history = readHistory('coverage');
  history.runs = mergeRuns(history.runs, runs);
  writeHistory('coverage', history);
  console.log(`coverage: imported ${runs.length} runs, history now ${history.runs.length}`);
}

/**
 * The file names the legacy JSDoc site served, so the dashboard can redirect
 * old links (dev.avenx-js.com/AvenxApp.html, …) to the matching page.
 */
function importDocsFileList(repo) {
  const files = git(repo, 'ls-files', '*.html')
    .trim()
    .split('\n')
    .filter((f) => f && !f.includes('/'))
    .sort();
  const head = git(repo, 'log', '-1', '--format=%H %cI').trim().split(' ');
  const out = { repository: 'Avenx-JS/dev-docs', commit: head[0], date: head[1], files };
  fs.writeFileSync(path.join(DATA_DIR, 'legacy', 'dev-docs-pages.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`dev-docs: recorded ${files.length} legacy page names`);
}

if (args['bench-results']) importBenchmarks(path.resolve(args['bench-results']));
if (args['test-cov']) importCoverage(path.resolve(args['test-cov']));
if (args['dev-docs']) importDocsFileList(path.resolve(args['dev-docs']));
if (!args['bench-results'] && !args['test-cov'] && !args['dev-docs']) {
  console.error('Usage: import-legacy.js [--bench-results DIR] [--test-cov DIR] [--dev-docs DIR]');
  process.exit(1);
}
