// Builds the site from the committed history alone (no upstream checkout) and
// checks every internal link. This is the path a fresh clone or a pull request
// without collected data takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const base of ['/', '/dev-dashboard/']) {
  test(`history-only build under base ${base} has no broken links`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avx-dash-'));
    const out = path.join(tmp, 'dist');
    const env = { ...process.env, BASE_PATH: base };
    execFileSync(process.execPath, ['scripts/build.js', '--collected', path.join(tmp, 'none'), '--out', out], { cwd: root, env });
    const result = execFileSync(process.execPath, ['scripts/check-site.js', '--dir', out], { cwd: root, env, encoding: 'utf8' });
    assert.match(result, /No broken references/);
    const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(home, new RegExp(`href="${base}assets/styles.css`));
    const results = JSON.parse(fs.readFileSync(path.join(out, 'benchmarks', 'results.json'), 'utf8'));
    assert.ok(Array.isArray(results) && results.length > 0, 'results.json carries the latest recorded run');
    assert.ok(Object.keys(results[0]).join() === 'file,name,totalTime,avgTime,ops,timestamp', 'legacy results.json shape');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
}

test('history files are valid and chronological', () => {
  for (const kind of ['coverage', 'benchmarks']) {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'data', kind, 'history.json'), 'utf8'));
    assert.equal(data.schemaVersion, 1);
    assert.ok(data.runs.length > 0);
    const dates = data.runs.map((r) => r.recordedAt);
    assert.deepEqual(dates, [...dates].sort(), `${kind} runs are sorted`);
    for (const r of data.runs) assert.ok(!Number.isNaN(Date.parse(r.recordedAt)));
  }
});
