/**
 * Parsers for the raw outputs the Avenx.js toolchain produces.
 *
 * Every function here is pure (string in, plain data out) so it can be unit
 * tested without running the upstream test suite or benchmarks.
 */

export const METRICS = ['statements', 'branches', 'functions', 'lines'];

/**
 * @typedef {{ covered: number, total: number, pct: number }} Metric
 * @typedef {{ statements: Metric, branches: Metric, functions: Metric, lines: Metric }} CoverageTotals
 */

/**
 * Percentage the way istanbul reports it: two decimals, and 100 when there is
 * nothing to cover.
 * @param {number} covered
 * @param {number} total
 * @returns {number}
 */
export function pct(covered, total) {
  if (!total) return 100;
  return Math.floor((covered / total) * 10000) / 100;
}

/**
 * Reads the summary header and the directory table of an istanbul/c8 HTML
 * `index.html`. Used to import the coverage history from `Avenx-JS/test-cov`,
 * which only ever stored the HTML report.
 * @param {string} html
 * @returns {{ total: CoverageTotals, directories: Array<{ path: string } & CoverageTotals> }}
 */
export function parseIstanbulIndex(html) {
  const total = {};
  const headerRe =
    /<span class="strong">\s*([\d.]+)%\s*<\/span>\s*<span class="quiet">\s*(\w+)\s*<\/span>\s*<span class='fraction'>\s*(\d+)\/(\d+)\s*<\/span>/g;
  for (const m of html.matchAll(headerRe)) {
    const key = m[2].toLowerCase();
    if (METRICS.includes(key)) total[key] = { covered: +m[3], total: +m[4], pct: +m[1] };
  }
  if (METRICS.some((k) => !total[k])) throw new Error('istanbul index: summary header not found');

  const directories = [];
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  for (const row of body.split('<tr>').slice(1)) {
    const file = row.match(/<td class="file[^"]*" data-value="([^"]+)"/);
    if (!file) continue;
    const pcts = [...row.matchAll(/<td data-value="([\d.]+)" class="pct/g)].map((m) => +m[1]);
    const abs = [...row.matchAll(/<td data-value="\d+" class="abs[^"]*">(\d+)\/(\d+)<\/td>/g)];
    if (pcts.length !== 4 || abs.length !== 4) continue;
    const entry = { path: file[1] };
    METRICS.forEach((key, i) => {
      entry[key] = { covered: +abs[i][1], total: +abs[i][2], pct: pcts[i] };
    });
    directories.push(entry);
  }
  return { total, directories };
}

/**
 * Converts c8's `coverage-summary.json` into totals, per-directory and per-file
 * rows with paths relative to the upstream checkout.
 * @param {Record<string, any>} summary - Parsed coverage-summary.json.
 * @param {string} root - Absolute path of the upstream checkout.
 */
export function normalizeCoverageSummary(summary, root) {
  const prefix = root.replace(/\\/g, '/').replace(/\/?$/, '/');
  const pick = (entry) => {
    const out = {};
    for (const key of METRICS) {
      const { covered, total, pct: p } = entry[key];
      out[key] = { covered, total, pct: typeof p === 'number' ? p : pct(covered, total) };
    }
    return out;
  };
  const files = [];
  for (const [abs, entry] of Object.entries(summary)) {
    if (abs === 'total') continue;
    const rel = abs.replace(/\\/g, '/').startsWith(prefix) ? abs.replace(/\\/g, '/').slice(prefix.length) : abs;
    files.push({ path: rel, ...pick(entry) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { total: pick(summary.total), directories: aggregateDirectories(files), files };
}

/**
 * Sums per-file metrics into per-directory metrics, the grouping istanbul's
 * HTML index uses (the file's own directory, not its ancestors).
 * @param {Array<{ path: string } & CoverageTotals>} files
 */
export function aggregateDirectories(files) {
  const dirs = new Map();
  for (const file of files) {
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '.';
    if (!dirs.has(dir)) {
      dirs.set(dir, Object.fromEntries(METRICS.map((k) => [k, { covered: 0, total: 0 }])));
    }
    const acc = dirs.get(dir);
    for (const key of METRICS) {
      acc[key].covered += file[key].covered;
      acc[key].total += file[key].total;
    }
  }
  return [...dirs.entries()]
    .map(([path, acc]) => {
      const entry = { path };
      for (const key of METRICS) entry[key] = { ...acc[key], pct: pct(acc[key].covered, acc[key].total) };
      return entry;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Reads the summary block `test/run-tests.js` prints at the end of a run.
 * @param {string} log - Combined stdout of `npm run test:coverage`.
 * @returns {{ total: number, passed: number, failed: number, failures: Array<{ file: string, detail: string }> } | null}
 */
export function parseTestSummary(log) {
  const clean = log.replace(/\u001b\[[0-9;]*m/g, '');
  const totals = [...clean.matchAll(/Total: (\d+) \| Passed: (\d+) \| Failed: (\d+)/g)].pop();
  if (!totals) return null;
  const failures = [...clean.matchAll(/❌ FAILED: (\S+) \((.*)\)\s*$/gm)].map((m) => ({ file: m[1], detail: m[2] }));
  return { total: +totals[1], passed: +totals[2], failed: +totals[3], failures };
}

/**
 * Reads the failure report `benches/run.js` writes to stderr when a benchmark
 * exits non-zero.
 * @param {string} stderr
 * @returns {Array<{ file: string, exitCode: number, detail: string }>}
 */
export function parseBenchFailures(stderr) {
  const start = stderr.search(/\d+ benchmark\(s\) failed:/);
  if (start === -1) return [];
  const lines = stderr.slice(start).split('\n').slice(1);
  const out = [];
  for (const line of lines) {
    const head = line.match(/^ {2}(\S+\.bench\.js) \(exit (-?\d+)\)$/);
    if (head) out.push({ file: head[1], exitCode: +head[2], detail: '' });
    else if (out.length && line.trim()) out[out.length - 1].detail += (out[out.length - 1].detail ? '\n' : '') + line.trim();
  }
  return out;
}

/**
 * The first prose paragraph of a benchmark file's leading doc comment, or of
 * its `@description` tag. Returns null when the file has none.
 * @param {string} source
 * @returns {string | null}
 */
export function benchDescription(source) {
  const block = source.match(/^\s*(?:import[^\n]*\n|\s)*\/\*\*([\s\S]*?)\*\//);
  // A block documenting a helper function is not a description of the file.
  if (!block || /@(param|returns?)\b/.test(block[1])) return null;
  const text = block[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, ''))
    .join('\n');
  const desc = text.match(/@description\s+([\s\S]*?)(?:\n\s*\n|\n@|$)/);
  const body = desc ? desc[1] : text.split(/\n@/)[0];
  const para = body.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  if (!para || para.startsWith('@')) return null;
  return para;
}

/**
 * JSDoc reports problems on stderr as `ERROR: …` / `WARNING: …` lines.
 * @param {string} stderr
 * @returns {Array<{ level: 'error' | 'warning', message: string, file: string | null, line: number | null }>}
 */
export function parseJsdocDiagnostics(stderr) {
  const out = [];
  for (const raw of stderr.split('\n')) {
    const m = raw.match(/^(ERROR|WARNING): (.*)$/);
    if (!m) continue;
    const message = m[2];
    const fileLine =
      message.match(/source file (\S+) in line (\d+)/) || message.match(/File: (\S+), line: (\d+)/);
    out.push({
      level: m[1] === 'ERROR' ? 'error' : 'warning',
      message,
      file: fileLine ? fileLine[1] : null,
      line: fileLine ? +fileLine[2] : null,
    });
  }
  return out;
}
