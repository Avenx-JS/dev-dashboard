// Progressive enhancement only: every page is complete without this script.
const base = document.body.dataset.base || '/';
const build = document.body.dataset.build || '';

// ------------------------------------------------------------ theme
document.querySelector('.theme-toggle')?.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('avx-theme', root.dataset.theme);
});

// ------------------------------------------------------------ section nav
// Open beside the content on wide screens, collapsed above it on narrow ones.
const sideToggle = document.querySelector('.sidebar-toggle');
if (sideToggle && matchMedia('(max-width: 900px)').matches) sideToggle.open = false;

// ------------------------------------------------------------ search
const input = document.getElementById('search');
const results = document.getElementById('search-results');
let index = null;
let active = -1;

async function loadIndex() {
  if (!index) {
    const res = await fetch(`${base}assets/search-index.json?v=${build}`);
    index = res.ok ? await res.json() : [];
  }
  return index;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const KIND_BONUS = { module: 0.5, class: 0.5, namespace: 0.3, typedef: 0.2 };
function score(entry, q) {
  return baseScore(entry, q) - (KIND_BONUS[entry[1]] || 0);
}
function baseScore(entry, q) {
  const name = entry[0].toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1 + name.length / 100;
  if (name.includes(q)) return 2 + name.length / 100;
  if (entry[2].toLowerCase().includes(q)) return 4;
  return entry[4].toLowerCase().includes(q) ? 5 : Infinity;
}

async function runSearch() {
  const q = input.value.trim().toLowerCase();
  if (!q) return closeResults();
  const data = await loadIndex();
  const hits = data
    .map((e) => [score(e, q), e])
    .filter(([s]) => s < Infinity)
    .sort((a, b) => a[0] - b[0] || a[1][0].localeCompare(b[1][0]))
    .slice(0, 30);
  active = -1;
  results.innerHTML = hits.length
    ? hits
        .map(([, [name, kind, owner, href, sum]]) => `<a href="${base}${href}" role="option"><span class="r-kind">${escapeHtml(kind)}</span><span class="r-name">${escapeHtml(name)}${owner ? ` <span class="r-owner">${escapeHtml(owner)}</span>` : ''}</span><span class="r-sum">${escapeHtml(sum)}</span></a>`)
        .join('')
    : `<div class="r-empty">No symbol matches “${escapeHtml(input.value.trim())}”.</div>`;
  results.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function closeResults() {
  results.hidden = true;
  input.setAttribute('aria-expanded', 'false');
}

if (input) {
  input.addEventListener('input', runSearch);
  input.addEventListener('focus', () => {
    loadIndex();
    if (input.value.trim()) runSearch();
  });
  input.addEventListener('keydown', (e) => {
    const items = [...results.querySelectorAll('a')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((a, i) => a.setAttribute('aria-selected', String(i === active)));
      items[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items.length) {
      e.preventDefault();
      location.href = items[Math.max(0, active)].href;
    } else if (e.key === 'Escape') {
      closeResults();
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) closeResults();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
      e.preventDefault();
      input.focus();
    }
  });
  // Legacy links that could not be mapped land on docs/?q=<name>.
  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    input.value = q;
    input.focus();
    runSearch();
  }
}

// ------------------------------------------------------------ chart hover
for (const area of document.querySelectorAll('.chart-area')) {
  const tip = area.querySelector('.tooltip');
  const cross = area.querySelector('.crosshair');
  const show = (rect) => {
    const pct = Number(rect.dataset.x);
    cross.style.left = `${pct}%`;
    cross.classList.add('on');
    const rows = rect.dataset.rows ? rect.dataset.rows.split(';').map((r) => r.split('|')) : [];
    tip.innerHTML = `<div class="tt-title">${escapeHtml(rect.dataset.title)}</div>${rows
      .map(([slot, name, value]) => `<div class="tt-row"><span class="key s${slot}"></span><span>${escapeHtml(name)}</span><span>${escapeHtml(value)}</span></div>`)
      .join('')}`;
    tip.hidden = false;
    const x = (pct / 100) * area.clientWidth;
    const w = tip.offsetWidth;
    tip.style.left = `${x + 12 + w > area.clientWidth ? Math.max(0, x - 12 - w) : x + 12}px`;
    tip.style.top = '4px';
  };
  const hide = () => {
    tip.hidden = true;
    cross.classList.remove('on');
  };
  for (const rect of area.querySelectorAll('.hit')) {
    rect.addEventListener('pointerenter', () => show(rect));
    rect.addEventListener('pointerdown', () => show(rect));
  }
  area.addEventListener('pointerleave', hide);
}

// ------------------------------------------------------------ coverage rows
const setGroup = (btn, open) => {
  const body = document.getElementById(btn.getAttribute('aria-controls'));
  if (!body) return;
  body.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
};
document.querySelectorAll('.row-toggle').forEach((btn) => {
  btn.addEventListener('click', () => setGroup(btn, btn.getAttribute('aria-expanded') !== 'true'));
});
document.querySelector('[data-expand-all]')?.addEventListener('click', (e) => {
  const btns = [...document.querySelectorAll('.row-toggle')];
  const open = btns.some((b) => b.getAttribute('aria-expanded') !== 'true');
  btns.forEach((b) => setGroup(b, open));
  e.currentTarget.textContent = open ? 'Collapse all' : 'Expand all';
});

// ------------------------------------------------------------ sortable tables
for (const table of document.querySelectorAll('table.sortable')) {
  const heads = [...table.tHead.rows[0].cells];
  heads.forEach((th, col) => {
    if (!th.hasAttribute('data-sort-key')) return;
    th.tabIndex = 0;
    const sort = () => {
      const dir = th.getAttribute('aria-sort') === 'descending' ? 'ascending' : 'descending';
      heads.forEach((h) => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', dir);
      const body = table.tBodies[0];
      const val = (row) => {
        const cell = row.cells[col];
        const v = cell.dataset.sort;
        return v !== undefined ? Number(v) : cell.textContent.trim().toLowerCase();
      };
      const rows = [...body.rows].sort((a, b) => {
        const x = val(a);
        const y = val(b);
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return dir === 'ascending' ? c : -c;
      });
      rows.forEach((r) => body.appendChild(r));
    };
    th.addEventListener('click', sort);
    th.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), sort()));
  });
}
