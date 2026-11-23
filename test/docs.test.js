import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocsModel, summarize } from '../scripts/lib/docs-model.js';
import { indexDocs, resolveLinks, renderType, legacyRedirects, addHeadingIds } from '../src/pages/docs.js';
import { setBase } from '../src/html.js';

const meta = (file, line, dir = '/r/lib/x') => ({ filename: file, lineno: line, path: dir });
const DOCLETS = [
  { kind: 'module', name: 'lib/x/emit', longname: 'module:lib/x/emit', description: '<p>Emits.</p>', meta: meta('emit.js', 1) },
  { kind: 'class', name: 'EmitError', longname: 'module:lib/x/emit.EmitError', memberof: 'module:lib/x/emit', scope: 'static', classdesc: '<p>Raised.</p>', params: [{ name: 'message', type: { names: ['string'] } }], meta: meta('emit.js', 10) },
  { kind: 'function', name: 'emit', longname: 'module:lib/x/emit.emit', memberof: 'module:lib/x/emit', scope: 'static', description: '<p>See {@link module:lib/x/emit.EmitError|the error}.</p>', returns: [{ type: { names: ['module:lib/x/emit.EmitError'] } }], meta: meta('emit.js', 20) },
  // The `exports.emit` binding JSDoc adds next to the declaration.
  { kind: 'function', name: 'emit', longname: 'module:lib/x/emit.emit', memberof: 'module:lib/x/emit', scope: 'static', undocumented: true, meta: meta('emit.js', 20) },
  { kind: 'function', name: 'hidden', longname: 'module:lib/x/emit~hidden', memberof: 'module:lib/x/emit', scope: 'inner', access: 'private', description: 'x', meta: meta('emit.js', 30) },
  { kind: 'function', name: 'undoc', longname: 'module:lib/x/emit.undoc', memberof: 'module:lib/x/emit', scope: 'static', undocumented: true, meta: meta('emit.js', 40) },
  // A class JSDoc made a member of itself, plus its constructor artefact.
  { kind: 'class', name: 'Router', longname: 'Router', memberof: 'Router', scope: 'global', classdesc: '<p>Routes.</p>', meta: meta('Router.js', 5, '/r/lib/core') },
  { kind: 'class', name: 'Router', longname: 'Router#Router', memberof: 'Router', scope: 'instance', undocumented: true, meta: meta('Router.js', 5, '/r/lib/core') },
  { kind: 'function', name: 'go', longname: 'Router#go', memberof: 'Router', scope: 'instance', description: '<p>Navigates.</p>', meta: meta('Router.js', 50, '/r/lib/core') },
  { kind: 'function', name: '', longname: '', memberof: 'Router', scope: 'instance', description: 'private #method', meta: meta('Router.js', 60, '/r/lib/core') },
  { kind: 'class', name: 'Frame', longname: 'module:lib/x/emit~Frame', memberof: 'module:lib/x/emit', scope: 'inner', classdesc: '<p>A frame.</p>', meta: meta('emit.js', 70) },
  { kind: 'package', name: 'avenx-core', longname: 'package:avenx-core' },
];

test('buildDocsModel keeps documented, non-private symbols and dedupes', () => {
  const model = buildDocsModel(DOCLETS, { root: '/r' });
  const names = model.symbols.map((s) => s.longname).sort();
  assert.deepEqual(names, ['Router', 'Router#go', 'module:lib/x/emit.EmitError', 'module:lib/x/emit.emit', 'module:lib/x/emit~Frame']);
  assert.equal(model.modules[0].file, 'lib/x/emit.js');
  assert.equal(model.symbols.find((s) => s.longname === 'Router').memberof, null);
});

test('documentation coverage counts a longname once and skips constructor artefacts', () => {
  const { stats } = buildDocsModel(DOCLETS, { root: '/r' });
  // EmitError, emit, undoc, Router, Router#go -> 4 documented of 5
  assert.deepEqual(stats.coverage, { documented: 4, total: 5 });
});

test('indexDocs assigns pages and anchors', () => {
  setBase('/');
  const idx = indexDocs(buildDocsModel(DOCLETS, { root: '/r' }), { repository: 'o/r', commit: 'abc' });
  assert.equal(idx.byLongname.get('module:lib/x/emit').url, 'docs/lib/x/emit/');
  assert.equal(idx.byLongname.get('module:lib/x/emit.EmitError').url, 'docs/lib/x/emit/EmitError/');
  assert.equal(idx.byLongname.get('module:lib/x/emit.emit').url, 'docs/lib/x/emit/#static-emit');
  assert.equal(idx.byLongname.get('Router').url, 'docs/global/Router/');
  assert.equal(idx.byLongname.get('Router#go').url, 'docs/global/Router/#go');
});

test('resolveLinks and renderType link known symbols', () => {
  setBase('/dash/');
  const idx = indexDocs(buildDocsModel(DOCLETS, { root: '/r' }), { repository: 'o/r', commit: 'abc' });
  assert.equal(
    resolveLinks(idx, 'See {@link module:lib/x/emit.EmitError|the error}.'),
    'See <a href="/dash/docs/lib/x/emit/EmitError/"><code>the error</code></a>.',
  );
  assert.equal(resolveLinks(idx, '{@link Nope}'), '<code>Nope</code>');
  assert.equal(resolveLinks(idx, '{@link https://x.dev Docs}'), '<a href="https://x.dev">Docs</a>');
  assert.match(renderType(idx, ['Array.<Router>']), /Array\.&lt;<a href="\/dash\/docs\/global\/Router\/">Router<\/a>&gt;/);
  setBase('/');
});

test('legacyRedirects maps old JSDoc file names', () => {
  const idx = indexDocs(buildDocsModel(DOCLETS, { root: '/r' }), { repository: 'o/r', commit: 'abc' });
  const map = legacyRedirects(idx, ['index.html', 'global.html', 'module-lib_x_emit.html', 'module-lib_x_emit.EmitError.html', 'lib_x_emit.js.html', 'Router.html', 'Gone.html', 'bin_cli.js.html', 'module-lib_x_emit-Frame.html']);
  assert.deepEqual(map, {
    'global.html': 'docs/global/',
    'module-lib_x_emit.html': 'docs/lib/x/emit/',
    'module-lib_x_emit.EmitError.html': 'docs/lib/x/emit/EmitError/',
    'lib_x_emit.js.html': 'docs/lib/x/emit/',
    'Router.html': 'docs/global/Router/',
    'Gone.html': 'docs/?q=Gone',
    'bin_cli.js.html': 'https://github.com/o/r/blob/abc/bin/cli.js',
    'module-lib_x_emit-Frame.html': 'docs/lib/x/emit/Frame/',
  });
});

test('addHeadingIds matches GitHub slugs, including emoji and duplicates', () => {
  assert.equal(addHeadingIds('<h2>📦 What’s in the box</h2>'), '<h2 id="-whats-in-the-box">📦 What’s in the box</h2>');
  assert.equal(addHeadingIds('<h1>Avenx.js</h1><h2>Avenx.js</h2>'), '<h1 id="avenxjs">Avenx.js</h1><h2 id="avenxjs-1">Avenx.js</h2>');
});

test('summarize returns the first sentence as plain text', () => {
  assert.equal(summarize('<p>Renders a graph. Then more.</p>'), 'Renders a graph.');
  assert.equal(summarize('<p>Uses {@link Foo|the foo} &amp; bar</p>'), 'Uses the foo & bar');
});
