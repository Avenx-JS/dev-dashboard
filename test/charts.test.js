import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, lineChart, sparkline } from '../src/charts.js';
import { fmtMs, fmtDelta, fmtPct } from '../src/html.js';
import { avgDelta, benchmarkRuns } from '../src/pages/benchmarks.js';

test('niceTicks covers the range with round steps', () => {
  assert.deepEqual(niceTicks(48.2, 93.6), [40, 60, 80, 100]);
  assert.deepEqual(niceTicks(0, 1), [0, 0.25, 0.5, 0.75, 1]);
  const flat = niceTicks(5, 5);
  assert.ok(flat[0] < 5 && flat[flat.length - 1] > 5);
});

test('lineChart renders lines, a legend for several series and a data table', () => {
  const html = lineChart({
    label: 'Coverage',
    format: (v) => `${v}%`,
    series: [
      { name: 'Lines', slot: 1, points: [{ x: '2026-01-01T00:00:00Z', y: 50 }, { x: '2026-02-01T00:00:00Z', y: 60 }] },
      { name: 'Branches', slot: 2, points: [{ x: '2026-01-01T00:00:00Z', y: 40 }, { x: '2026-02-01T00:00:00Z', y: null }] },
    ],
  });
  assert.match(html, /class="legend"/);
  assert.equal((html.match(/class="line /g) || []).length, 1, 'a series with one valid point draws no line');
  assert.equal((html.match(/class="dot /g) || []).length, 2);
  assert.equal((html.match(/class="hit"/g) || []).length, 2);
  assert.match(html, /<td class="num">—<\/td>/, 'missing values are shown as a dash');
  assert.match(html, /aria-label="Coverage"/);
});

test('lineChart without data says so', () => {
  assert.match(lineChart({ label: 'x', format: String, series: [{ name: 'a', slot: 1, points: [] }] }), /No data/);
});

test('sparkline needs two points', () => {
  assert.match(sparkline([1]), /spark-none/);
  assert.match(sparkline([1, null, 3]), /<path d="M/);
});

test('formatters', () => {
  assert.equal(fmtMs(0.000751), '751 ns');
  assert.equal(fmtMs(0.3161), '316 µs');
  assert.equal(fmtMs(171.93), '172 ms');
  assert.equal(fmtMs(4532.18), '4.53 s');
  assert.equal(fmtDelta(-26.04, 1, '%'), '−26.0%');
  assert.equal(fmtDelta(0.001, 1, '%'), '±0%');
  assert.equal(fmtPct(93.58), '93.58%');
});

test('avgDelta ignores missing figures and crashed runs', () => {
  assert.equal(avgDelta({ avgTime: 2 }, { avgTime: 1 }), 100);
  assert.equal(avgDelta({ avgTime: 0 }, { avgTime: 1 }), null);
  assert.equal(avgDelta({ avgTime: 2, status: 'failed' }, { avgTime: 1 }), null);
  assert.equal(avgDelta({ avgTime: 2 }, null), null);
});

test('benchmarkRuns appends an unrecorded current run once', () => {
  const history = { runs: [{ recordedAt: '2026-01-01T00:00:00.000Z', results: [], source: {} }] };
  assert.equal(benchmarkRuns(history, { recordedAt: '2026-01-08T00:00:00.000Z', results: [] }, null).length, 2);
  assert.equal(benchmarkRuns(history, { recordedAt: '2026-01-01T00:00:00.000Z', results: [] }, null).length, 1);
});
