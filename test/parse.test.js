import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateDirectories,
  benchDescription,
  normalizeCoverageSummary,
  parseBenchFailures,
  parseIstanbulIndex,
  parseJsdocDiagnostics,
  parseTestSummary,
  pct,
} from '../scripts/lib/parse.js';

test('pct follows istanbul: two decimals, truncated, 100 when empty', () => {
  assert.equal(pct(0, 0), 100);
  assert.equal(pct(1, 3), 33.33);
  assert.equal(pct(2, 3), 66.66);
});

const ISTANBUL = `
<div class='fl pad1y space-right2'>
  <span class="strong">93.15% </span>
  <span class="quiet">Statements</span>
  <span class='fraction'>71048/76270</span>
</div>
<div class='fl pad1y space-right2'><span class="strong">84.28% </span><span class="quiet">Branches</span><span class='fraction'>14964/17753</span></div>
<div class='fl pad1y space-right2'><span class="strong">93.01% </span><span class="quiet">Functions</span><span class='fraction'>2023/2175</span></div>
<div class='fl pad1y space-right2'><span class="strong">93.15% </span><span class="quiet">Lines</span><span class='fraction'>71048/76270</span></div>
<table><tbody><tr>
	<td class="file high" data-value="benches"><a href="benches/index.html">benches</a></td>
	<td data-value="100" class="pic high"><div class="chart"></div></td>
	<td data-value="100" class="pct high">100%</td>
	<td data-value="82" class="abs high">82/82</td>
	<td data-value="100" class="pct high">100%</td>
	<td data-value="1" class="abs high">1/1</td>
	<td data-value="100" class="pct high">100%</td>
	<td data-value="0" class="abs high">0/0</td>
	<td data-value="100" class="pct high">100%</td>
	<td data-value="82" class="abs high">82/82</td>
	</tr>
<tr>
	<td class="file medium" data-value="bin"><a href="bin/index.html">bin</a></td>
	<td data-value="88.15" class="pic medium"></td>
	<td data-value="88.15" class="pct medium">88.15%</td>
	<td data-value="1283" class="abs medium">1131/1283</td>
	<td data-value="85.59" class="pct medium">85.59%</td>
	<td data-value="347" class="abs medium">297/347</td>
	<td data-value="94.11" class="pct high">94.11%</td>
	<td data-value="34" class="abs high">32/34</td>
	<td data-value="88.15" class="pct medium">88.15%</td>
	<td data-value="1283" class="abs medium">1131/1283</td>
	</tr>
</tbody></table>`;

test('parseIstanbulIndex reads totals and directory rows', () => {
  const { total, directories } = parseIstanbulIndex(ISTANBUL);
  assert.deepEqual(total.lines, { covered: 71048, total: 76270, pct: 93.15 });
  assert.deepEqual(total.branches, { covered: 14964, total: 17753, pct: 84.28 });
  assert.equal(directories.length, 2);
  assert.equal(directories[1].path, 'bin');
  assert.deepEqual(directories[1].functions, { covered: 32, total: 34, pct: 94.11 });
});

test('parseIstanbulIndex rejects a page without a summary', () => {
  assert.throws(() => parseIstanbulIndex('<html></html>'), /summary header/);
});

test('normalizeCoverageSummary makes paths relative and groups by directory', () => {
  const m = (covered, total) => ({ covered, total, skipped: 0, pct: pct(covered, total) });
  const entry = (c, t) => ({ lines: m(c, t), statements: m(c, t), functions: m(1, 1), branches: m(0, 0) });
  const summary = {
    total: entry(15, 20),
    '/w/up/lib/a.js': entry(5, 10),
    '/w/up/lib/b.js': entry(10, 10),
    '/w/up/bin/cli.js': entry(0, 0),
  };
  const out = normalizeCoverageSummary(summary, '/w/up');
  assert.deepEqual(out.files.map((f) => f.path), ['bin/cli.js', 'lib/a.js', 'lib/b.js']);
  const lib = out.directories.find((d) => d.path === 'lib');
  assert.deepEqual(lib.lines, { covered: 15, total: 20, pct: 75 });
  assert.equal(out.total.lines.pct, 75);
});

test('aggregateDirectories puts root files under "."', () => {
  const z = { covered: 1, total: 2 };
  const dirs = aggregateDirectories([{ path: 'x.js', lines: z, statements: z, functions: z, branches: z }]);
  assert.equal(dirs[0].path, '.');
  assert.equal(dirs[0].lines.pct, 50);
});

test('parseTestSummary reads the run-tests.js summary', () => {
  const log = [
    '📊 Test Run Summary',
    '  ✅ PASSED: test/unit/a.test.js',
    '  ❌ FAILED: test/system/cli.test.js (Exit code: 1)',
    '  ❌ FAILED: test/unit/slow.test.js (Timed out after 60000ms)',
    '--------------------------------------',
    'Total: 3 | Passed: 1 | Failed: 2',
  ].join('\n');
  assert.deepEqual(parseTestSummary(log), {
    total: 3,
    passed: 1,
    failed: 2,
    failures: [
      { file: 'test/system/cli.test.js', detail: 'Exit code: 1' },
      { file: 'test/unit/slow.test.js', detail: 'Timed out after 60000ms' },
    ],
  });
  assert.equal(parseTestSummary('no summary here'), null);
});

test('parseBenchFailures reads the run.js failure report', () => {
  const stderr = [
    'noise',
    '',
    '1 benchmark(s) failed:',
    '  render-scenarios.bench.js (exit 1)',
    '        at ComponentParser.parse (lib/compiler/ComponentParser.js:777:19)',
    '    Node.js v22.23.5',
  ].join('\n');
  assert.deepEqual(parseBenchFailures(stderr), [
    { file: 'render-scenarios.bench.js', exitCode: 1, detail: 'at ComponentParser.parse (lib/compiler/ComponentParser.js:777:19)\nNode.js v22.23.5' },
  ]);
  assert.deepEqual(parseBenchFailures('all good'), []);
});

test('benchDescription takes the file header, not a helper comment', () => {
  assert.equal(
    benchDescription(`/**\n * @file x.bench.js\n * @description What a keyed list costs,\n * on each path.\n *\n * ## Why\n */\nimport a from 'a';`),
    'What a keyed list costs, on each path.',
  );
  assert.equal(benchDescription(`/**\n * Measures what tracing costs.\n *\n * Two numbers.\n */`), 'Measures what tracing costs.');
  assert.equal(benchDescription(`import x from 'y';\n/**\n * Helper.\n * @param {number} n - Count.\n */\nfunction f(n) {}`), null);
  assert.equal(benchDescription(`/**\n *\n */`), null);
  assert.equal(benchDescription(`// Mock data\nconst a = 1;`), null);
});

test('parseJsdocDiagnostics extracts level, file and line', () => {
  const out = parseJsdocDiagnostics(
    [
      `ERROR: Unable to parse a tag's type expression for source file /r/lib/a.js in line 12 with tag title "param" and text "{{a?: b}} x": Invalid type expression "{a?: b}": Expected`,
      'WARNING: The @type tag does not permit a description; the description will be ignored. File: deferManager.js, line: 15',
      'unrelated',
    ].join('\n'),
  );
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].level, out[0].file, out[0].line], ['error', '/r/lib/a.js', 12]);
  assert.deepEqual([out[1].level, out[1].file, out[1].line], ['warning', 'deferManager.js', 15]);
});
