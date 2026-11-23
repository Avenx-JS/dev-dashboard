/**
 * The page shell: top bar, primary navigation, optional section sidebar.
 */
import { esc, url, icon } from './html.js';

const NAV = [
  { id: 'overview', label: 'Overview', href: '' },
  { id: 'docs', label: 'API Reference', href: 'docs/' },
  { id: 'coverage', label: 'Test Coverage', href: 'coverage/' },
  { id: 'benchmarks', label: 'Benchmarks', href: 'benchmarks/' },
];

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true" class="logo"><path d="M12 2.5 21.5 20h-4.2L12 10.2 6.7 20H2.5z" fill="currentColor"/><path d="M9.2 16.2h5.6l1.4 2.6H7.8z" fill="currentColor" opacity=".55"/></svg>`;

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.section - One of the NAV ids, highlighted in the navigation.
 * @param {string} o.body - Main content.
 * @param {string} [o.sidebar] - Section navigation, rendered left of the content.
 * @param {object} o.site - { upstream, collectedAt, version }.
 * @param {string} [o.description]
 */
export function layout({ title, section, body, sidebar = '', site, description = '' }) {
  const fullTitle = title ? `${title} · Avenx.js Developer Dashboard` : 'Avenx.js Developer Dashboard';
  const commit = site.upstream?.commit;
  const commitLink = commit
    ? `<a class="commit" href="https://github.com/${esc(site.upstream.repository)}/commit/${esc(commit)}" title="Upstream commit the data was built from">${esc(site.upstream.repository.split('/')[1])}@<code>${esc(commit.slice(0, 7))}</code></a>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || 'API reference, test coverage and performance benchmarks of the Avenx.js framework.')}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${url('assets/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${url('assets/styles.css')}?v=${esc(site.buildId)}">
<script>document.documentElement.dataset.theme = localStorage.getItem('avx-theme') || '';</script>
<script type="module" src="${url('assets/app.js')}?v=${esc(site.buildId)}"></script>
</head>
<body data-base="${esc(url(''))}" data-build="${esc(site.buildId)}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="${url('')}">${LOGO}<span><strong>Avenx.js</strong> <span class="brand-sub">Developer Dashboard</span></span></a>
    <nav class="primary" aria-label="Primary">
      ${NAV.map((n) => `<a href="${url(n.href)}"${n.id === section ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}
    </nav>
    <div class="topbar-tools">
      <div class="search" role="search">
        <input type="search" id="search" placeholder="Search API" autocomplete="off" spellcheck="false" aria-label="Search the API reference" aria-controls="search-results" aria-expanded="false">
        <kbd>/</kbd>
        <div class="search-results" id="search-results" role="listbox" hidden></div>
      </div>
      ${commitLink}
      <button class="theme-toggle" type="button" aria-label="Toggle colour theme" title="Toggle colour theme"><svg viewBox="0 0 16 16" class="icon" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13z" fill="currentColor"/><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
    </div>
  </div>
</header>
<div class="shell${sidebar ? ' has-sidebar' : ''}">
  ${sidebar ? `<aside class="sidebar" aria-label="Section"><details class="sidebar-toggle" open><summary>Browse</summary>${sidebar}</details></aside>` : ''}
  <main id="main" class="content">
    ${body}
  </main>
</div>
<footer class="footer">
  <div class="footer-inner">
    <span>Built ${esc(site.builtAt.slice(0, 16).replace('T', ' '))} UTC from <a href="https://github.com/${esc(site.upstream?.repository || 'Avenx-JS/avenx-js')}">${esc(site.upstream?.repository || 'Avenx-JS/avenx-js')}</a>${site.upstream?.version ? ` ${esc(site.upstream.version)}` : ''}.</span>
    <span><a href="https://github.com/Avenx-JS/dev-dashboard">Avenx-JS/dev-dashboard</a> ${icon('ext', 'icon-sm')}</span>
  </div>
</footer>
</body>
</html>
`;
}
