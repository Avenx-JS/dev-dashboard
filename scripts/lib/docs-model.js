/**
 * Turns the raw doclet dump of `jsdoc -X` into the compact model the dashboard
 * renders.
 *
 * The selection rules mirror JSDoc's default template, which is what
 * dev.avenx-js.com used to publish: undocumented, `@ignore`d and private
 * doclets are dropped (the upstream jsdoc.json does not enable `private`).
 */

const SYMBOL_KINDS = new Set(['class', 'function', 'member', 'constant', 'typedef', 'event', 'namespace', 'mixin', 'interface']);
// Inner declarations (`~name`) are module internals and not counted for doc coverage.
const COVERAGE_KINDS = new Set(['class', 'function']);
const PUBLIC_SCOPES = new Set(['static', 'instance', 'global']);

const typeNames = (t) => (t && Array.isArray(t.names) ? t.names : []);

function normParam(p) {
  return {
    name: p.name ?? null,
    type: typeNames(p.type),
    description: p.description ?? '',
    optional: !!p.optional,
    nullable: p.nullable ?? null,
    variable: !!p.variable,
    defaultvalue: p.defaultvalue !== undefined ? String(p.defaultvalue) : null,
  };
}

function normReturn(r) {
  return { type: typeNames(r.type), description: r.description ?? '' };
}

function relPath(meta, root) {
  if (!meta || !meta.path) return null;
  const dir = meta.path.replace(/\\/g, '/');
  const base = root.replace(/\\/g, '/').replace(/\/?$/, '/');
  const rel = (dir + '/').startsWith(base) ? dir.slice(base.length) : dir;
  return (rel ? rel + '/' : '') + meta.filename;
}

/** Strips tags so a description can be shown as a one-line summary. */
export function summarize(html, max = 180) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{@link\s+([^}|\s]+)(?:[|\s]([^}]*))?\}/g, (_, t, label) => label || t)
    .replace(/&[a-z]+;|&#\d+;/g, (e) => ({ '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" })[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = text.match(/^(.+?[.!?])(\s|$)/);
  const s = sentence && sentence[1].length <= max ? sentence[1] : text;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/**
 * @param {any[]} doclets - Output of `jsdoc -X`.
 * @param {{ root: string }} options - `root` is the upstream checkout the paths are relative to.
 */
export function buildDocsModel(doclets, { root }) {
  const visible = (d) => !d.undocumented && !d.ignore && d.access !== 'private' && d.kind !== 'package';

  // Documentation coverage: classes and functions a caller can reach (static,
  // instance or global scope). JSDoc emits several doclets for one ES export
  // (the declaration and the `exports.x` binding), so a longname counts as
  // documented when any of its doclets is. Constructor artefacts (`Foo#Foo`)
  // belong to the class doclet and are skipped.
  const coverageByName = new Map();
  for (const d of doclets) {
    if (!COVERAGE_KINDS.has(d.kind) || !PUBLIC_SCOPES.has(d.scope)) continue;
    if (!d.name || d.access === 'private' || d.ignore || d.inherited) continue;
    if (d.memberof && d.longname === `${d.memberof}#${d.name}` && d.name === d.memberof.split(/[.~#/:]/).pop()) continue;
    coverageByName.set(d.longname, coverageByName.get(d.longname) || !d.undocumented);
  }
  const candidates = coverageByName.size;
  const documented = [...coverageByName.values()].filter(Boolean).length;

  const fileDocs = new Map();
  const modules = [];
  const symbols = [];
  for (const d of doclets) {
    if (!visible(d)) continue;
    if (d.kind === 'file') {
      const p = relPath(d.meta, root);
      if (p && d.description) fileDocs.set(p, d.description);
      continue;
    }
    // ES private methods (`#name`) reach JSDoc without a name. They are private
    // by language semantics and cannot be addressed, so they are left out like
    // `@private` members.
    const name = d.name;
    if (!name) continue;
    const base = {
      longname: d.longname,
      name,
      kind: d.kind,
      // JSDoc sometimes makes an ES class a member of itself; such a class is
      // top-level for navigation purposes.
      memberof: d.memberof && d.memberof !== d.longname ? d.memberof : null,
      scope: d.scope ?? null,
      access: d.access ?? null,
      description: d.description ?? '',
      file: relPath(d.meta, root),
      line: d.meta?.lineno ?? null,
    };
    if (d.kind === 'module') {
      modules.push(base);
      continue;
    }
    if (!SYMBOL_KINDS.has(d.kind)) continue;
    const sym = { ...base };
    if (d.classdesc) sym.classdesc = d.classdesc;
    if (d.params?.length) sym.params = d.params.map(normParam);
    if (d.returns?.length) sym.returns = d.returns.map(normReturn);
    if (d.yields?.length) sym.yields = d.yields.map(normReturn);
    if (d.exceptions?.length) sym.exceptions = d.exceptions.map(normReturn);
    if (d.properties?.length) sym.properties = d.properties.map(normParam);
    if (d.type) sym.type = typeNames(d.type);
    if (d.examples?.length) sym.examples = d.examples.map(String);
    if (d.augments?.length) sym.augments = d.augments;
    if (d.see?.length) sym.see = d.see;
    if (d.deprecated) sym.deprecated = d.deprecated === true ? '' : String(d.deprecated);
    if (d.since) sym.since = String(d.since);
    if (d.async) sym.async = true;
    if (d.generator) sym.generator = true;
    if (d.readonly) sym.readonly = true;
    if (d.isEnum) sym.isEnum = true;
    if (d.defaultvalue !== undefined) sym.defaultvalue = String(d.defaultvalue);
    if (d.inherited) sym.inherited = d.inherits ?? true;
    if (d.overrides) sym.overrides = d.overrides;
    symbols.push(sym);
  }

  // A doclet can appear twice (e.g. a re-export documented in two places);
  // keep the most complete one.
  const richness = (s) => (s.description ? 2 : 0) + (s.classdesc ? 2 : 0) + (s.params?.length ? 1 : 0) + (s.returns?.length ? 1 : 0);
  const unique = (list) => {
    const keyed = new Map();
    for (const s of list) {
      const key = `${s.longname}|${s.scope}|${s.kind}`;
      if (!keyed.has(key) || richness(s) > richness(keyed.get(key))) keyed.set(key, s);
    }
    return [...keyed.values()];
  };

  const mods = unique(modules).map((m) => ({
    ...m,
    description: m.description || (m.file && fileDocs.get(m.file)) || '',
  }));
  mods.sort((a, b) => a.name.localeCompare(b.name));
  const syms = unique(symbols);

  return {
    modules: mods,
    symbols: syms,
    stats: {
      modules: mods.length,
      classes: syms.filter((s) => s.kind === 'class').length,
      functions: syms.filter((s) => s.kind === 'function').length,
      members: syms.filter((s) => s.kind === 'member' || s.kind === 'constant').length,
      typedefs: syms.filter((s) => s.kind === 'typedef').length,
      symbols: syms.length,
      coverage: { documented, total: candidates },
    },
  };
}
