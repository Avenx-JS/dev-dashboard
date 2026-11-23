/**
 * Small HTML helpers shared by every page. Templates are plain template
 * literals; anything interpolated from data goes through `esc` unless it is
 * HTML that JSDoc or markdown-it already produced from upstream sources.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Joins template parts, dropping null/false/undefined. */
export const join = (parts, sep = '') => parts.filter((p) => p !== null && p !== undefined && p !== false).join(sep);

let BASE = '/';
export function setBase(base) {
  BASE = ('/' + String(base || '/').replace(/^\/+|\/+$/g, '') + '/').replace(/\/+/g, '/');
}
export const getBase = () => BASE;
/** Site-absolute URL honouring the deployment base path. */
export const url = (p = '') => BASE + String(p).replace(/^\/+/, '');

// ------------------------------------------------------------ number formats
const nf = (opts) => new Intl.NumberFormat('en-US', opts);
export const fmtInt = (n) => (n == null ? '—' : nf({ maximumFractionDigits: 0 }).format(n));
export const fmtPct = (n, digits = 2) => (n == null ? '—' : `${nf({ maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n)}%`);
export function fmtCompact(n) {
  if (n == null) return '—';
  return nf({ notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
/** Milliseconds with a unit that keeps three significant digits. */
export function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms === 0) return '0 ms';
  if (ms < 0.001) return `${nf({ maximumSignificantDigits: 3 }).format(ms * 1e6)} ns`;
  if (ms < 1) return `${nf({ maximumSignificantDigits: 3 }).format(ms * 1000)} µs`;
  if (ms < 1000) return `${nf({ maximumSignificantDigits: 3 }).format(ms)} ms`;
  return `${nf({ maximumSignificantDigits: 3 }).format(ms / 1000)} s`;
}
export function fmtDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  return withTime ? `${date} ${d.toISOString().slice(11, 16)} UTC` : date;
}
export function fmtDelta(n, digits = 1, unit = '') {
  if (n == null || !Number.isFinite(n)) return '—';
  const v = nf({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(n));
  if (Number(v) === 0) return `±0${unit}`;
  return `${n > 0 ? '+' : '−'}${v}${unit}`;
}

// ------------------------------------------------------------ components
const ICONS = {
  ok: '<path d="M3.5 8.5l3 3 6-7" />',
  warn: '<path d="M8 3v6M8 11.5v.5" />',
  fail: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />',
  info: '<path d="M8 7v5M8 4.5v.5" />',
  ext: '<path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" />',
};
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/** Status badge: colour + icon + label, never colour alone. */
export function badge(status, label) {
  const map = { ok: ['good', 'ok'], good: ['good', 'ok'], warning: ['warning', 'warn'], failed: ['critical', 'fail'], critical: ['critical', 'fail'], neutral: ['neutral', 'info'] };
  const [tone, ic] = map[status] || map.neutral;
  return `<span class="badge badge-${tone}">${icon(ic)}${esc(label)}</span>`;
}

/** Istanbul's default watermarks, the ones the legacy report coloured by. */
export const coverageTone = (p) => (p >= 80 ? 'good' : p >= 50 ? 'warning' : 'critical');

export function meter(p, { label = '' } = {}) {
  const tone = coverageTone(p);
  return `<span class="meter meter-${tone}" role="img" aria-label="${esc(label || fmtPct(p))}"><span style="width:${Math.max(0, Math.min(100, p))}%"></span></span>`;
}

export function statTile({ label, value, sub = '', delta = '', deltaTone = 'neutral', trend = '', href = '' }) {
  const inner = `
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${value}</div>
    ${delta || sub ? `<div class="stat-sub">${delta ? `<span class="delta delta-${deltaTone}">${delta}</span>` : ''}${sub ? `<span>${sub}</span>` : ''}</div>` : ''}
    ${trend ? `<div class="stat-trend">${trend}</div>` : ''}`;
  return href ? `<a class="stat" href="${href}">${inner}</a>` : `<div class="stat">${inner}</div>`;
}

export function panel({ title, actions = '', body, id = '', flush = false, sub = '' }) {
  return `<section class="panel"${id ? ` id="${esc(id)}"` : ''}>
    ${title ? `<header class="panel-head"><div><h2>${title}</h2>${sub ? `<p class="panel-sub">${sub}</p>` : ''}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ''}</header>` : ''}
    <div class="panel-body${flush ? ' flush' : ''}">${body}</div>
  </section>`;
}

export const empty = (text) => `<div class="empty">${icon('info')}<span>${text}</span></div>`;

export function pageHeader({ eyebrow = '', title, lede = '', meta = '' }) {
  return `<header class="page-head">
    ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
    <h1>${title}</h1>
    ${lede ? `<p class="lede">${lede}</p>` : ''}
    ${meta ? `<div class="page-meta">${meta}</div>` : ''}
  </header>`;
}
