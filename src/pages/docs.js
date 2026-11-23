/**
 * API reference pages, rendered from the docs model produced by
 * scripts/lib/docs-model.js (the same doclets JSDoc's default template used
 * for the legacy dev.avenx-js.com).
 */
import { esc, url, badge, panel, statTile, pageHeader, empty, fmtInt, fmtPct, icon, meter } from '../html.js';
import { summarize } from '../../scripts/lib/docs-model.js';

const CONTAINER_KINDS = new Set(['class', 'namespace', 'interface', 'mixin']);
const slug = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');

const GROUPS = [
  ['class', 'Classes'],
  ['namespace', 'Namespaces'],
  ['interface', 'Interfaces'],
  ['mixin', 'Mixins'],
  ['typedef', 'Type definitions'],
  ['constant', 'Constants'],
  ['member', 'Members'],
  ['function', 'Functions'],
  ['event', 'Events'],
];

/**
 * Indexes the model and assigns every module, container and member a URL.
 * @param {ReturnType<import('../../scripts/lib/docs-model.js').buildDocsModel>} model
 */
export function indexDocs(model, { repository, commit }) {
  const pages = new Map(); // longname -> page path (containers and modules)
  const byLongname = new Map(); // longname -> { url, entry }
  const children = new Map(); // container longname -> symbols
  const byName = new Map(); // short name -> [entries]

  for (const m of model.modules) {
    pages.set(m.longname, `docs/${m.name.split('/').map(slug).join('/')}/`);
  }
  const symbols = model.symbols;
  // Containers can nest (a class inside a namespace); resolve parents first.
  const containers = symbols.filter((s) => CONTAINER_KINDS.has(s.kind));
  const pending = new Set(containers);
  let guard = 0;
  while (pending.size && guard++ < 20) {
    for (const c of [...pending]) {
      if (c.memberof && !pages.has(c.memberof) && containers.some((o) => o.longname === c.memberof)) continue;
      const parent = c.memberof && pages.get(c.memberof);
      pages.set(c.longname, `${parent || 'docs/global/'}${slug(c.name)}/`);
      pending.delete(c);
    }
  }
  for (const c of pending) pages.set(c.longname, `docs/global/${slug(c.name)}/`);

  const anchor = (s) => `${s.scope === 'static' ? 'static-' : s.scope === 'inner' ? 'inner-' : ''}${slug(s.name)}`;
  for (const s of symbols) {
    const owner = s.memberof && pages.has(s.memberof) ? s.memberof : '__global__';
    if (!children.has(owner)) children.set(owner, []);
    children.get(owner).push(s);
    const ownerPage = owner === '__global__' ? 'docs/global/' : pages.get(owner);
    s.anchor = anchor(s);
    s.url = CONTAINER_KINDS.has(s.kind) ? pages.get(s.longname) : `${ownerPage}#${s.anchor}`;
    s.page = CONTAINER_KINDS.has(s.kind) ? pages.get(s.longname) : ownerPage;
    byLongname.set(s.longname, s);
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  for (const m of model.modules) {
    m.url = pages.get(m.longname);
    byLongname.set(m.longname, m);
    const short = m.name.split('/').pop();
    if (!byName.has(short)) byName.set(short, []);
    byName.get(short).push(m);
  }
  const moduleByFile = new Map(model.modules.filter((m) => m.file).map((m) => [m.file, m]));
  return { model, pages, byLongname, byName, children, moduleByFile, repository, commit };
}

// ------------------------------------------------------------ links & types

function lookup(idx, target) {
  const t = target.trim();
  if (idx.byLongname.has(t)) return idx.byLongname.get(t);
  if (idx.byLongname.has(`module:${t}`)) return idx.byLongname.get(`module:${t}`);
  const short = t.replace(/^.*[.#~]/, '').replace(/\(\)$/, '');
  const cands = idx.byName.get(short) || [];
  if (cands.length === 1) return cands[0];
  return cands.find((c) => CONTAINER_KINDS.has(c.kind) || c.kind === 'module') || null;
}

/** Resolves JSDoc inline `{@link}` tags in already-rendered description HTML. */
export function resolveLinks(idx, html) {
  if (!html) return '';
  const render = (target, text) => {
    const label = (text || target).trim();
    if (/^(https?:|mailto:)/.test(target)) return `<a href="${esc(target)}">${esc(label)}</a>`;
    const hit = lookup(idx, target);
    return hit ? `<a href="${url(hit.url)}"><code>${esc(label)}</code></a>` : `<code>${esc(label)}</code>`;
  };
  return html
    .replace(/\[([^\]]+)\]\{@link(?:code|plain)?\s+([^}]+)\}/g, (_, text, target) => render(target, text))
    .replace(/\{@link(?:code|plain)?\s+([^}|\s]+)(?:\s*\|\s*|\s+)?([^}]*)\}/g, (_, target, text) => render(target, text));
}

/** Renders a type expression, linking names the reference knows. */
export function renderType(idx, names) {
  if (!names || !names.length) return '';
  return names
    .map((n) =>
      esc(n).replace(/module:[\w/.\-$]+|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g, (tok) => {
        const raw = tok.replace(/&[a-z]+;/g, '');
        const hit = idx.byLongname.get(raw) || (CONTAINER_KINDS.has(idx.byName.get(raw)?.[0]?.kind) ? idx.byName.get(raw)[0] : null);
        return hit && hit.url ? `<a href="${url(hit.url)}">${tok}</a>` : tok;
      }),
    )
    .join(' | ');
}

const sourceUrl = (idx, file, line) =>
  file ? `https://github.com/${idx.repository}/blob/${idx.commit}/${file}${line ? `#L${line}` : ''}` : null;

function sourceLink(idx, s) {
  const href = sourceUrl(idx, s.file, s.line);
  return href ? `<a class="source" href="${esc(href)}" title="View source on GitHub">${esc(s.file)}${s.line ? `:${s.line}` : ''} ${icon('ext', 'icon-sm')}</a>` : '';
}

// ------------------------------------------------------------ fragments

function signature(idx, s) {
  const isFn = s.kind === 'function' || s.kind === 'class';
  const params = (s.params || [])
    .filter((p) => p.name && !p.name.includes('.'))
    .map((p) => {
      const n = `${p.variable ? '…' : ''}${esc(p.name)}`;
      return p.optional ? `<span class="opt">[${n}]</span>` : n;
    })
    .join(', ');
  const ret = s.returns?.length ? ` <span class="sig-arrow">→</span> <span class="sig-type">${renderType(idx, s.returns.flatMap((r) => r.type))}</span>` : '';
  const type = !isFn && s.type ? `<span class="sig-colon">:</span> <span class="sig-type">${renderType(idx, s.type)}</span>` : '';
  const prefix = [s.kind === 'class' ? 'new' : '', s.async ? 'async' : '', s.generator ? 'function*' : ''].filter(Boolean).join(' ');
  return `<code class="sig">${prefix ? `<span class="sig-kw">${prefix}</span> ` : ''}<span class="sig-name">${esc(s.name)}</span>${isFn ? `(${params})` : ''}${type}${ret}</code>`;
}

function paramTable(idx, title, params) {
  if (!params?.length) return '';
  const hasDefault = params.some((p) => p.defaultvalue != null);
  return `<div class="block"><h4>${title}</h4><div class="table-wrap"><table class="table params">
    <thead><tr><th>Name</th><th>Type</th>${hasDefault ? '<th>Default</th>' : ''}<th>Description</th></tr></thead>
    <tbody>${params
      .map((p) => {
        const depth = p.name ? (p.name.match(/\./g) || []).length : 0;
        return `<tr><td class="pname" style="--depth:${depth}"><code>${esc(p.name || '')}</code>${p.optional ? ' <span class="pill">optional</span>' : ''}${p.variable ? ' <span class="pill">repeatable</span>' : ''}${p.nullable ? ' <span class="pill">nullable</span>' : ''}</td><td class="ptype"><code>${renderType(idx, p.type)}</code></td>${hasDefault ? `<td>${p.defaultvalue != null ? `<code>${esc(p.defaultvalue)}</code>` : ''}</td>` : ''}<td class="prose small">${resolveLinks(idx, p.description)}</td></tr>`;
      })
      .join('')}</tbody></table></div></div>`;
}

function returnsBlock(idx, title, list) {
  if (!list?.length) return '';
  return `<div class="block"><h4>${title}</h4><dl class="returns">${list
    .map((r) => `<div><dt><code>${renderType(idx, r.type) || 'unspecified'}</code></dt><dd class="prose small">${resolveLinks(idx, r.description)}</dd></div>`)
    .join('')}</dl></div>`;
}

function flags(s) {
  const out = [];
  if (s.scope && s.scope !== 'instance') out.push(`<span class="tag">${esc(s.scope)}</span>`);
  if (s.access && s.access !== 'public') out.push(`<span class="tag">${esc(s.access)}</span>`);
  if (s.readonly) out.push('<span class="tag">readonly</span>');
  if (s.isEnum) out.push('<span class="tag">enum</span>');
  if (s.deprecated != null) out.push('<span class="tag tag-warn">deprecated</span>');
  if (s.inherited) out.push('<span class="tag">inherited</span>');
  return out.join('');
}

function memberDetail(idx, s) {
  const extra = [];
  if (s.deprecated) extra.push(`<p class="note note-warn"><strong>Deprecated.</strong> ${resolveLinks(idx, s.deprecated)}</p>`);
  if (s.defaultvalue != null && !s.params) extra.push(`<p class="meta-line">Default: <code>${esc(s.defaultvalue)}</code></p>`);
  if (s.since) extra.push(`<p class="meta-line">Since ${esc(s.since)}</p>`);
  if (s.overrides) {
    const o = lookup(idx, s.overrides);
    extra.push(`<p class="meta-line">Overrides ${o ? `<a href="${url(o.url)}"><code>${esc(s.overrides)}</code></a>` : `<code>${esc(s.overrides)}</code>`}</p>`);
  }
  if (typeof s.inherited === 'string') {
    const o = lookup(idx, s.inherited);
    extra.push(`<p class="meta-line">Inherited from ${o ? `<a href="${url(o.url)}"><code>${esc(s.inherited)}</code></a>` : `<code>${esc(s.inherited)}</code>`}</p>`);
  }
  const see = s.see?.length ? `<div class="block"><h4>See</h4><ul class="see">${s.see.map((x) => `<li class="prose small">${resolveLinks(idx, /\{@link/.test(x) || /^</.test(x) ? x : `{@link ${x}}`)}</li>`).join('')}</ul></div>` : '';
  const examples = s.examples?.length
    ? `<div class="block"><h4>Example${s.examples.length > 1 ? 's' : ''}</h4>${s.examples.map((e) => `<pre class="code"><code>${esc(e)}</code></pre>`).join('')}</div>`
    : '';
  return `<article class="member" id="${esc(s.anchor)}">
    <header class="member-head">
      <a class="anchor" href="#${esc(s.anchor)}" aria-label="Link to ${esc(s.name)}">#</a>
      ${signature(idx, s)}
      <span class="member-flags">${flags(s)}</span>
    </header>
    <div class="member-body">
      ${s.description ? `<div class="prose">${resolveLinks(idx, s.description)}</div>` : ''}
      ${extra.join('')}
      ${paramTable(idx, 'Parameters', s.params)}
      ${paramTable(idx, 'Properties', s.properties)}
      ${returnsBlock(idx, 'Returns', s.returns)}
      ${returnsBlock(idx, 'Yields', s.yields)}
      ${returnsBlock(idx, 'Throws', s.exceptions)}
      ${see}
      ${examples}
      <div class="member-foot">${sourceLink(idx, s)}</div>
    </div>
  </article>`;
}

function memberSections(idx, list) {
  const out = [];
  const index = [];
  for (const [kind, title] of GROUPS) {
    const items = list.filter((s) => s.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) continue;
    const isContainer = CONTAINER_KINDS.has(kind);
    index.push(`<div class="index-group"><h3>${title} <span class="count">${items.length}</span></h3><ul class="index-list">${items
      .map((s) => `<li><a href="${isContainer ? url(s.url) : `#${esc(s.anchor)}`}"><code>${esc(s.name)}</code></a><span class="index-sum">${esc(summarize(s.classdesc || s.description, 110))}</span></li>`)
      .join('')}</ul></div>`);
    if (!isContainer) {
      out.push(`<section class="members"><h2 class="section-title">${title}</h2>${items.map((s) => memberDetail(idx, s)).join('')}</section>`);
    }
  }
  return { index: index.join(''), details: out.join('') };
}

function breadcrumbs(parts) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts
    .map((p, i) => (p.href && i < parts.length - 1 ? `<a href="${url(p.href)}">${esc(p.label)}</a>` : `<span>${esc(p.label)}</span>`))
    .join('<span class="sep">/</span>')}</nav>`;
}

// ------------------------------------------------------------ sidebar

export function docsSidebar(idx, current) {
  const groups = new Map();
  for (const m of idx.model.modules) {
    const parts = m.name.split('/');
    const group = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(m);
  }
  const hasGlobal = (idx.children.get('__global__') || []).length > 0;
  const link = (href, label, cur) => `<a href="${url(href)}"${cur ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="side-nav">
    <div class="side-group">
      ${link('docs/', 'Overview', current === 'docs/')}
      ${link('docs/readme/', 'Project README', current === 'docs/readme/')}
      ${link('docs/health/', 'Documentation health', current === 'docs/health/')}
      ${hasGlobal ? link('docs/global/', 'Global', current === 'docs/global/') : ''}
    </div>
    ${[...groups.entries()]
      .map(([g, mods]) => {
        const open = mods.some((m) => current === m.url);
        return `<details class="side-group"${open ? ' open' : ''}><summary>${esc(g)} <span class="count">${mods.length}</span></summary><ul>${mods
          .map((m) => `<li>${link(m.url, esc(m.name.startsWith(g + '/') ? m.name.slice(g.length + 1) : m.name), current === m.url)}</li>`)
          .join('')}</ul></details>`;
      })
      .join('')}
  </nav>`;
}

// ------------------------------------------------------------ pages

/** @returns {Array<{ path: string, title: string, body: string, sidebarFor: string }>} */
export function docsPages(idx, docs, steps) {
  const pages = [];
  const { model } = idx;
  const stats = model.stats;
  const docCov = stats.coverage.total ? (stats.coverage.documented / stats.coverage.total) * 100 : null;
  const errors = docs.diagnostics.filter((d) => d.level === 'error');
  const warnings = docs.diagnostics.filter((d) => d.level === 'warning');

  // Overview
  const groups = new Map();
  for (const m of model.modules) {
    const parts = m.name.split('/');
    const g = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(m);
  }
  const countKind = (m, kinds) => (idx.children.get(m.longname) || []).filter((s) => kinds.includes(s.kind)).length;
  const moduleTables = [...groups.entries()]
    .map(([g, mods]) =>
      panel({
        title: `<code>${esc(g)}</code>`,
        sub: `${mods.length} module${mods.length === 1 ? '' : 's'}`,
        flush: true,
        body: `<div class="table-wrap"><table class="table modules">
          <thead><tr><th>Module</th><th>Summary</th><th class="num">Classes</th><th class="num">Functions</th></tr></thead>
          <tbody>${mods
            .map((m) => `<tr><td><a href="${url(m.url)}"><code>${esc(m.name)}</code></a></td><td class="muted">${esc(summarize(m.description, 140)) || '<span class="faint">No module description</span>'}</td><td class="num">${countKind(m, ['class']) || ''}</td><td class="num">${countKind(m, ['function']) || ''}</td></tr>`)
            .join('')}</tbody></table></div>`,
      }),
    )
    .join('');

  pages.push({
    path: 'docs/',
    title: 'API Reference',
    sidebarFor: 'docs/',
    body: `${pageHeader({
      eyebrow: 'API Reference',
      title: 'Avenx.js API',
      lede: 'Generated from the JSDoc comments in <code>lib/</code> and <code>bin/</code> with the upstream <code>jsdoc.json</code>, the same source and configuration the former dev.avenx-js.com was built from.',
    })}
    <div class="stats">
      ${statTile({ label: 'Modules', value: fmtInt(stats.modules) })}
      ${statTile({ label: 'Classes', value: fmtInt(stats.classes) })}
      ${statTile({ label: 'Functions', value: fmtInt(stats.functions) })}
      ${statTile({ label: 'Documented declarations', value: fmtPct(docCov, 1), sub: `${fmtInt(stats.coverage.documented)} of ${fmtInt(stats.coverage.total)}`, href: url('docs/health/') })}
      ${statTile({ label: 'JSDoc diagnostics', value: fmtInt(docs.diagnostics.length), sub: `${errors.length} errors · ${warnings.length} warnings`, href: url('docs/health/') })}
    </div>
    ${moduleTables}`,
  });

  // README
  pages.push({
    path: 'docs/readme/',
    title: 'Project README',
    sidebarFor: 'docs/readme/',
    body: `${breadcrumbs([{ label: 'API Reference', href: 'docs/' }, { label: 'README' }])}
      <div class="panel"><div class="panel-body"><div class="prose readme">${rewriteRelative(idx, docs.readme) || empty('README was not rendered in this build.')}</div></div></div>`,
  });

  // Health
  const byFile = new Map();
  for (const d of docs.diagnostics) {
    const key = d.file ? d.file.replace(/^.*?\/(lib|bin)\//, '$1/') : '(no file)';
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(d);
  }
  const shortMsg = (m) =>
    m
      .replace(/^Unable to parse a tag's type expression for source file \S+ in line \d+ with tag title "(\w+)" and text "(.*?)": Invalid type expression "(.*?)": .*$/, 'Unparseable type in @$1: $3')
      .replace(/ File: \S+, line: \d+$/, '');
  pages.push({
    path: 'docs/health/',
    title: 'Documentation health',
    sidebarFor: 'docs/health/',
    body: `${breadcrumbs([{ label: 'API Reference', href: 'docs/' }, { label: 'Documentation health' }])}
    ${pageHeader({ title: 'Documentation health', lede: 'What JSDoc reported while generating this reference, and how much of the reachable API carries a doc comment.' })}
    <div class="stats">
      ${statTile({ label: 'Documented declarations', value: fmtPct(docCov, 1), sub: `${fmtInt(stats.coverage.documented)} of ${fmtInt(stats.coverage.total)} static, instance and global declarations`, trend: docCov != null ? meter(docCov) : '' })}
      ${statTile({ label: 'Errors', value: fmtInt(errors.length), sub: 'type expressions JSDoc cannot parse' })}
      ${statTile({ label: 'Warnings', value: fmtInt(warnings.length) })}
      ${statTile({ label: 'JSDoc exit code', value: steps.docs?.exitCode ?? '—', sub: steps.docs?.exitCode ? 'non-zero because errors were logged; output is complete' : '' })}
    </div>
    ${panel({
      title: 'Diagnostics by file',
      sub: 'Errors drop the affected type from the reference; the symbol itself is still documented. TypeScript-style object types (<code>{a?: T}</code>, <code>import(…)</code>) are the usual cause. The former pipeline failed on these and stopped publishing.',
      flush: true,
      body: docs.diagnostics.length
        ? `<div class="table-wrap"><table class="table diag"><thead><tr><th>File</th><th class="num">Line</th><th>Level</th><th>Message</th></tr></thead><tbody>${[...byFile.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .flatMap(([file, list]) =>
              list.map((d, i) => `<tr>${i === 0 ? `<td rowspan="${list.length}"><code>${esc(file)}</code></td>` : ''}<td class="num">${d.line ?? ''}</td><td>${d.level === 'error' ? badge('failed', 'error') : badge('warning', 'warning')}</td><td class="mono small wrap">${esc(shortMsg(d.message))}</td></tr>`),
            )
            .join('')}</tbody></table></div>`
        : empty('JSDoc reported no problems.'),
    })}`,
  });

  // Module pages
  for (const m of model.modules) {
    const list = idx.children.get(m.longname) || [];
    const { index, details } = memberSections(idx, list);
    const crumbs = [{ label: 'API Reference', href: 'docs/' }, ...m.name.split('/').map((p) => ({ label: p }))];
    pages.push({
      path: m.url,
      title: m.name,
      sidebarFor: m.url,
      body: `${breadcrumbs(crumbs)}
      <header class="symbol-head">
        <div class="symbol-kind">module</div>
        <h1><code>${esc(m.name)}</code></h1>
        <div class="symbol-meta">${sourceLink(idx, m)}<span class="import"><code>import … from '${esc(m.file || m.name)}'</code></span></div>
      </header>
      ${m.description ? `<div class="prose lead-prose">${resolveLinks(idx, m.description)}</div>` : ''}
      ${index ? panel({ title: 'Contents', body: `<div class="index-grid">${index}</div>` }) : empty('This module documents no members.')}
      ${details}`,
    });
  }

  // Container pages (classes, namespaces, …) and the global page
  for (const s of model.symbols.filter((x) => CONTAINER_KINDS.has(x.kind))) {
    const list = idx.children.get(s.longname) || [];
    const { index, details } = memberSections(idx, list);
    const owner = s.memberof && idx.byLongname.get(s.memberof);
    const crumbs = [{ label: 'API Reference', href: 'docs/' }];
    if (owner) crumbs.push({ label: owner.kind === 'module' ? owner.name : owner.name, href: owner.url });
    else crumbs.push({ label: 'Global', href: 'docs/global/' });
    crumbs.push({ label: s.name });
    const augments = s.augments?.length
      ? `<p class="meta-line">Extends ${s.augments.map((a) => {
          const hit = lookup(idx, a);
          return hit ? `<a href="${url(hit.url)}"><code>${esc(a.replace(/^module:/, ''))}</code></a>` : `<code>${esc(a.replace(/^module:/, ''))}</code>`;
        }).join(', ')}</p>`
      : '';
    const ctor =
      s.kind === 'class'
        ? `<section class="members"><h2 class="section-title">Constructor</h2>${memberDetail(idx, { ...s, anchor: 'constructor', description: s.classdesc ? s.description : '', scope: null })}</section>`
        : '';
    pages.push({
      path: s.url,
      title: s.name,
      sidebarFor: owner?.url || 'docs/global/',
      body: `${breadcrumbs(crumbs)}
      <header class="symbol-head">
        <div class="symbol-kind">${esc(s.kind)}${s.deprecated != null ? ' <span class="tag tag-warn">deprecated</span>' : ''}</div>
        <h1><code>${esc(s.name)}</code></h1>
        <div class="symbol-meta">${sourceLink(idx, s)}${owner ? `<span>in <a href="${url(owner.url)}"><code>${esc(owner.name)}</code></a></span>` : ''}</div>
      </header>
      ${augments}
      <div class="prose lead-prose">${resolveLinks(idx, s.classdesc || s.description)}</div>
      ${ctor}
      ${index ? panel({ title: 'Members', body: `<div class="index-grid">${index}</div>` }) : ''}
      ${details}`,
    });
  }

  const globals = idx.children.get('__global__') || [];
  if (globals.length) {
    const { index, details } = memberSections(idx, globals);
    pages.push({
      path: 'docs/global/',
      title: 'Global',
      sidebarFor: 'docs/global/',
      body: `${breadcrumbs([{ label: 'API Reference', href: 'docs/' }, { label: 'Global' }])}
      ${pageHeader({ title: 'Global', lede: 'Symbols documented without an enclosing module.' })}
      ${panel({ title: 'Contents', body: `<div class="index-grid">${index}</div>` })}
      ${details}`,
    });
  }
  return pages;
}

/** GitHub's heading anchors, so the README's own table of contents works. */
export function addHeadingIds(html) {
  const used = new Map();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (all, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&[a-z]+;|&#\d+;/g, '');
    let id = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    if (used.has(id)) {
      const n = used.get(id) + 1;
      used.set(id, n);
      id = `${id}-${n}`;
    } else used.set(id, 0);
    return `<h${level} id="${esc(id)}">${inner}</h${level}>`;
  });
}

/** README links point at files in the upstream repository. */
function rewriteRelative(idx, html) {
  if (!html) return '';
  return addHeadingIds(html).replace(/(href|src)="(?!https?:|#|mailto:|data:)([^"]+)"/g, (_, attr, target) => {
    const clean = target.replace(/^\.\//, '');
    const base = attr === 'src' ? `https://raw.githubusercontent.com/${idx.repository}/${idx.commit}/` : `https://github.com/${idx.repository}/blob/${idx.commit}/`;
    return `${attr}="${base}${clean}"`;
  });
}

/** Entries for the client-side search. */
export function searchIndex(idx) {
  const out = idx.model.modules.map((m) => [m.name, 'module', '', m.url, summarize(m.description, 90)]);
  for (const s of idx.model.symbols) {
    const owner = s.memberof ? s.memberof.replace(/^module:/, '') : '';
    out.push([s.name, s.kind, owner, s.url, summarize(s.classdesc || s.description, 90)]);
  }
  return out;
}

/**
 * Where a page of the legacy JSDoc site lives now. Old file names follow
 * JSDoc's default template: `module-lib_core_x.Name.html` for symbols,
 * `lib_core_x.js.html` for source views.
 */
export function legacyRedirects(idx, legacyFiles) {
  // JSDoc's rule: `module:` -> `module-`, inner `~` -> `-`, other unsafe characters -> `_`.
  const legacyName = (longname) => longname.replace(/^module:/, 'module-').replace(/~/g, '-').replace(/[^$a-z0-9._-]/gi, '_') + '.html';
  const current = new Map();
  for (const m of idx.model.modules) current.set(legacyName(m.longname), m.url);
  for (const s of idx.model.symbols) if (CONTAINER_KINDS.has(s.kind)) current.set(legacyName(s.longname), s.url);
  const sourceToModule = new Map([...idx.moduleByFile.entries()].map(([file, m]) => [file.replace(/\//g, '_') + '.html', m.url]));

  const map = {};
  for (const file of legacyFiles) {
    if (file === 'index.html') continue;
    if (file === 'global.html') map[file] = 'docs/global/';
    else if (current.has(file)) map[file] = current.get(file);
    else if (sourceToModule.has(file)) map[file] = sourceToModule.get(file);
    else if (/\.js\.html$/.test(file)) {
      // Source view of a file without a module doclet: the file on GitHub.
      const path = file.replace(/\.html$/, '').replace(/_/g, '/');
      map[file] = `https://github.com/${idx.repository}/blob/${idx.commit}/${path}`;
    } else {
      // A symbol that moved or was renamed: find it by its short name.
      const name = file.replace(/\.html$/, '').replace(/^.*\./, '');
      const hit = lookup(idx, name);
      map[file] = hit ? hit.url : `docs/?q=${encodeURIComponent(name)}`;
    }
  }
  return map;
}
