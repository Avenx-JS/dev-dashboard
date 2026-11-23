#!/usr/bin/env node
/**
 * Appends the collected coverage and benchmark results to the history files in
 * `data/`. The workflow runs this only on the weekly schedule (or when started
 * manually with `record: true`) and commits the result, so the history keeps
 * the weekly cadence of the legacy pipeline.
 *
 * Usage: node scripts/record.js [--from .cache/collected]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readHistory, writeHistory } from './lib/history.js';

const fromIdx = process.argv.indexOf('--from');
const from = path.resolve(fromIdx > -1 ? process.argv[fromIdx + 1] : path.join(ROOT, '.cache/collected'));
const read = (name) => (fs.existsSync(path.join(from, name)) ? JSON.parse(fs.readFileSync(path.join(from, name), 'utf8')) : null);

const meta = read('meta.json');
if (!meta) {
  console.error(`No meta.json in ${from}; run scripts/collect.js first.`);
  process.exit(2);
}
const source = {
  kind: 'workflow',
  repository: meta.upstream.repository,
  upstreamCommit: meta.upstream.commit,
  version: meta.upstream.version,
  node: meta.node,
  runId: process.env.GITHUB_RUN_ID ?? null,
};

const coverage = read('coverage.json');
if (coverage) {
  const history = readHistory('coverage');
  history.runs = history.runs.filter((r) => !(r.source.runId && r.source.runId === source.runId));
  history.runs.push({
    recordedAt: meta.collectedAt,
    source,
    total: coverage.total,
    directories: coverage.directories,
    tests: coverage.tests ? { total: coverage.tests.total, passed: coverage.tests.passed, failed: coverage.tests.failed } : null,
  });
  writeHistory('coverage', history);
  console.log(`coverage: recorded, ${history.runs.length} runs`);
}

const bench = read('benchmarks.json');
if (bench) {
  const history = readHistory('benchmarks');
  history.runs = history.runs.filter((r) => !(r.source.runId && r.source.runId === source.runId));
  history.runs.push({
    recordedAt: new Date(bench.recordedAt).toISOString(),
    source,
    results: bench.results.map(({ file, name, totalTime, avgTime, ops, timestamp, status }) => ({
      file,
      name,
      totalTime,
      avgTime,
      ops,
      timestamp,
      status,
    })),
  });
  writeHistory('benchmarks', history);
  console.log(`benchmarks: recorded, ${history.runs.length} runs`);
}
