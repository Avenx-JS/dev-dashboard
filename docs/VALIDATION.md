# Validation report

Carried out on 2026-11-23 against `Avenx-JS/avenx-js` at commit `0cf023c` (`1.0.0-rc.1`), on macOS with Node 24.2.0. The workflow uses Node 22, like the legacy pipelines.

## Summary

| Check | Result |
| --- | --- |
| Unit and build tests (`npm test`) | 26 of 26 pass |
| Full pipeline against a fresh clone of the framework | collect, record, build, check and status all behave as designed |
| Internal links, anchors and assets in the built site | 25,482 references in 206 pages, none broken |
| Legacy URLs of `dev.avenx-js.com` | 317 of 317 redirect to an existing page (238) or the source file on GitHub (79) |
| Base paths `/` and `/dev-dashboard/` | both build without broken references |
| Workflow file | parses; job graph and conditions reviewed. **Not run on GitHub** (nothing is pushed) |
| Browser rendering | all page types checked at 1440 px and 375 px, light and dark; search, tooltips, row expansion and redirects work; no script errors |
| Other repositories | `avenx-js` working tree unchanged; no other repository modified; nothing committed |

## 1. Unit and build tests

`npm test` runs 26 tests in `test/`:

- **Parsers** (`parse.test.js`, 9): istanbul HTML summary and directory rows, c8 `json-summary` normalisation and directory grouping, the test-runner summary, the benchmark crash report, benchmark descriptions (including that a helper's doc comment is not taken as a file description), JSDoc diagnostics.
- **API model** (`docs.test.js`, 7): selection rules (undocumented, private, nameless and package doclets dropped; duplicate doclets merged), documentation coverage, URLs and anchors, `{@link}` and type linking under a base path, legacy file-name mapping including inner classes, GitHub heading slugs, summaries.
- **Charts and formatting** (`charts.test.js`, 7): tick generation, line chart structure (legend, gaps for missing values, hover targets, data table), sparkline, number and time formats, benchmark change calculation, merging of an unrecorded run.
- **Build** (`build.test.js`, 3): a site built from the committed history alone, under `/` and `/dev-dashboard/`, has no broken references and serves `benchmarks/results.json` in the legacy shape; both history files are valid and chronological.

## 2. Pipeline run against the framework

The workflow's steps were run in order in a throwaway copy of the repository (so the recorded history in `data/` was not touched by laptop measurements), with a fresh `git clone` and `npm ci` of `Avenx-JS/avenx-js`, `BASE_PATH=/dev-dashboard/` and a simulated run id.

| Step | Outcome |
| --- | --- |
| `collect.js` — docs | `jsdoc -X` exit 1 with complete output: 92 modules, 86 classes, 1,553 functions, 2,455 symbols; 56 errors and 40 warnings recorded; status `ok` (ARCHITECTURE.md, D4). 2 s. |
| `collect.js` — coverage | `npm run test:coverage`: 387 test files, 383 passed, **4 failed** (`test/system/cli.test.js`, `test/system/fallbackRendererBundle.test.js`, `test/system/productionBuild.test.js`, `test/unit/compileValidation.test.js`). Lines 93.58 %, branches 84.63 %, functions 93.28 %; 40 directories, 228 files. Status `failed`. 85–94 s. |
| `collect.js` — benchmarks | 19 benchmarks, **`render-scenarios.bench.js` crashed** (same stack as the failed legacy run of 2026-11-21). Status `failed`. 21 s. |
| `record.js` | Appended one run each: coverage 12 → 13, benchmarks 14 → 15. A second build with the same run id did not add the run again. |
| `build.js` | 206 pages, c8 report copied without `tmp/`, 317 legacy redirects. |
| `check-site.js` | No broken references (after the fix in section 4, item 1). |
| `status.js` | Job summary table written; two `::error` annotations; exit 1, which turns the final `Upstream checks` job red. |

The failing tests and the crashing benchmark are problems in the framework, present on `main`, and were not changed (the task rules exclude changes to other repositories). They are what the dashboard currently shows.

## 3. Migrated content

| Area | Legacy | Dashboard |
| --- | --- | --- |
| API reference | JSDoc HTML from 2026-09-16 (pipeline failing since): 46 class pages, 114 module pages, 158 source views, README, global page | Reference from the current source: 92 modules, 86 classes and all their members, README, global page, documentation health; source links to GitHub at the built commit. All 317 legacy page names redirect. |
| Test coverage | c8 HTML report of 2026-11-21 (93.15 % lines) and 12 earlier reports in git history | Current totals, per directory and per file; the same c8 HTML report for the line view; 12 legacy runs imported as history (2026-06-15 to 2026-11-21); test results, which the legacy site did not show. |
| Benchmarks | `results.json` of 2026-11-14 and 13 earlier versions in git history; no page | All 14 runs imported (2026-06-15 to 2026-11-14), 19 benchmarks with descriptions, gate thresholds, change and history; `benchmarks/results.json` in the legacy shape. |

The import was cross-checked: the newest imported coverage run (2026-11-21: 93.15 % lines, 84.28 % branches, 93.01 % functions, 40 directories) and benchmark run (2026-11-14, 19 rows) equal the files currently in the legacy repositories.

## 4. Defects found during validation (all fixed)

1. **Coverage paths stayed absolute when the checkout was reached through a symlink** (`/tmp` → `/private/tmp` on macOS), so every link into the line-by-line report broke. Found by the link checker in the pipeline run. The collector now resolves the real path first.
2. **Placeholder `#` links** on the coverage page when no c8 report is present. Found by the history-only build test. Names are now plain text in that case.
3. **ES private methods** (`#name`) arrived from JSDoc without a name and produced empty entries and an empty link. They are now excluded like other private members.
4. **A class listed as its own member** (JSDoc records some ES classes with `memberof` set to themselves), which nested the class page inside itself. Such classes are now top-level.
5. **README table of contents anchors** did not exist (markdown-it adds no heading ids). GitHub-compatible ids are now added.
6. **Documentation-coverage metric**: a first definition counted every member assignment (22 %) and a second wrongly skipped all instance methods. The final definition is in ARCHITECTURE.md, D10; covered by a unit test.
7. **Inner classes** (`module-x-Name.html`) were redirected to a search instead of their page. JSDoc's `~` → `-` rule is now applied.
8. **Charts** scaled with the page width (oversized on wide screens, unreadable on phones). Replaced by fixed-height charts with HTML labels.

## 5. Browser checks

Served with `scripts/serve.js` (which mimics GitHub Pages, including `404.html`) and checked in a browser:

- Overview, API index, module page, class page, global page, README, documentation health, coverage, benchmark index and benchmark detail pages at 1440 × 900 (dark and light) and 375 × 812.
- Search: typing `router` lists the class `AvenxRouter`, `initRouter` and related members; arrow keys and Enter navigate.
- Chart hover shows date and values; coverage directories expand to files; "Expand all" toggles.
- `/AvenxApp.html` lands on `/docs/global/AvenxApp/`, `/module-lib_bundler_emit.EmitError.html` on `/docs/lib/bundler/emit/EmitError/`.
- The console shows no script errors (only the expected 404 status of the redirecting legacy URLs).

## 6. Not verified

These need the repository pushed and settings changed, which was out of scope:

- An actual run of `dashboard.yml` on GitHub, the Pages deployment and the commit of `data/` by `github-actions[bot]`.
- The custom domain and HTTPS certificate (docs/MIGRATION.md, step 2).
- Runtimes on GitHub's runners; the local run took about two minutes for all three steps.

Run the workflow once by hand after pushing (MIGRATION.md, step 1) to close these.
