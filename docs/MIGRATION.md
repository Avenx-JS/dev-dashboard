# Migration and decommissioning

How to switch from the three legacy sites to the dashboard, and what can be removed afterwards. The steps change settings in other repositories, DNS and GitHub Pages; they are written for a maintainer to carry out by hand, in this order. Nothing here has been done automatically.

## Step 1 — Publish the dashboard

1. Commit and push this repository to `Avenx-JS/dev-dashboard` `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** in `Avenx-JS/dev-dashboard`. (Pages is not enabled for the repository yet.)
3. **Actions → Developer Dashboard → Run workflow** on `main`, `record` unticked. Expected:
   - `Dashboard unit tests` green.
   - `Collect & build` green; its summary lists the three steps. At the time of writing `coverage` reports failing test files and benchmarks are not run (no `record`).
   - `Deploy to GitHub Pages` green; the site is at `https://avenx-js.github.io/dev-dashboard/`.
   - `Upstream checks` **red while the framework has failing tests**. That is intended (ARCHITECTURE.md, D4) and not a problem with the dashboard.
4. Check the site: overview, API reference (search for a class), coverage (open a file in the line-by-line report), benchmarks (14 recorded runs).
5. Optionally run the workflow once more with `record` ticked. It runs the benchmarks, appends one coverage and one benchmark run to `data/`, and commits them as `github-actions[bot]`. Otherwise the first recording happens on the next Saturday.

## Step 2 — Move the domain

The dashboard needs one domain. `dev.avenx-js.com` is the natural one: it already points to GitHub Pages, and the legacy API URLs on it are redirected by the dashboard (ARCHITECTURE.md, D9). A custom domain can be attached to only one repository at a time.

1. `Avenx-JS/dev-docs` → **Settings → Pages → Custom domain**: remove `dev.avenx-js.com`.
2. `Avenx-JS/dev-dashboard` → **Settings → Pages → Custom domain**: enter `dev.avenx-js.com`, wait for the DNS check and the certificate, then tick **Enforce HTTPS** (the legacy sites run without it).
3. The existing DNS `CNAME dev → avenx-js.github.io` stays as it is.
4. Open `https://dev.avenx-js.com/AvenxApp.html`; it should land on `/docs/global/AvenxApp/`.

No workflow change is needed: the build reads the base path from `actions/configure-pages`, so the same workflow serves `/dev-dashboard/` and the custom domain root.

## Step 3 — Remove the legacy publishing in `Avenx-JS/avenx-js`

These workflows exist only to publish into the three legacy repositories. They are replaced by `dashboard.yml` here.

| File in `Avenx-JS/avenx-js` | What it does | Replaced by | Action |
| --- | --- | --- | --- |
| `.github/workflows/dev-docs.yml` | `npm run docs`, pushes to `Avenx-JS/dev-docs` on every push to `main`. Failing since 2026-09-16. | `collect.js` docs step, daily + on push here | **Delete** |
| `.github/workflows/quality-results.yml` | `npm run test:coverage` → `Avenx-JS/test-cov`; `npm run bench:report` → `Avenx-JS/bench-results`; Saturdays. | `collect.js` coverage and benchmark steps, `record.js`, same Saturday slot | **Delete** |

Text that describes them, to update in the same pull request:

| Location | Change |
| --- | --- |
| `.github/workflows/Pipelines.md` | Remove rows and sections 1 (*Development Docs Publishing*) and 2 (*Quality & Benchmarks*); remove the *Target Repository Cross-Publishing (`PAT_TOKEN`)* section; mention that docs, coverage and benchmarks are published by `Avenx-JS/dev-dashboard`. |
| `.github/workflows/Pipelines.md`, section 9 | "`quality-results.yml` publishes absolute numbers weekly" → the dashboard does. |
| `.github/workflows/benchmark-compare.yml`, line 9 (comment) | Same. |
| `benches/run.js`, lines 20–22 (comment) | Same. The behaviour it describes (exit 1 on a crash) is still what the dashboard relies on. |

**Keep unchanged.** These are not publishing workflows and are not touched by the migration: `ci.yml`, `npm-publish.yml`, `size-check.yml`, `compiler-coverage.yml`, `benchmark-compare.yml` (apart from the comment), `fuzz-nightly.yml`, `e2e-nightly.yml`, `snapshot.yml`, and `static.yml` (the Astro docs at `docs.avenx-js.com`). Also keep the npm scripts `docs`, `test:coverage`, `bench:report` and the ignore entries for `dev-docs/`, `bench-results/` and `coverage/` in `.gitignore`, `.prettierignore` and `eslint.config.mjs`: the dashboard calls the first two, and they remain useful locally.

**Secret.** `PAT_TOKEN` (repository secret in `avenx-js`, set 2026-09-14) is referenced only by the two workflows above. Delete it after they are gone, and revoke the personal access token behind it. The workflows also fall back to `GH_PAT` and `DEPLOY_TOKEN`; check at organisation level whether those exist and are used elsewhere before removing them.

## Step 4 — Retire the legacy sites and repositories

| Repository | Workflow in it | Domain |
| --- | --- | --- |
| `Avenx-JS/dev-docs` | `.github/workflows/static.yml` (Pages deploy) | `dev.avenx-js.com` → moved in step 2 |
| `Avenx-JS/test-cov` | `.github/workflows/static.yml` (Pages deploy) | `coverage.avenx-js.com` |
| `Avenx-JS/bench-results` | `.github/workflows/static.yml` (Pages deploy) | `benchmarks.avenx-js.com` |

1. **DNS first.** Remove the DNS records for `coverage.avenx-js.com` and `benchmarks.avenx-js.com` (or point them at something you control). A subdomain that still points to GitHub Pages after its repository is gone can be claimed by anyone who adds it as a custom domain to their own repository. GitHub Pages cannot redirect a whole custom domain to another domain, so these two hostnames cannot simply forward to the dashboard; a redirect needs a DNS/hosting provider rule.
2. **Pages off.** In each of the three repositories: **Settings → Pages → Unpublish site**.
3. **Archive** the three repositories (**Settings → Archive this repository**). This keeps them read-only and recoverable while you confirm nothing depends on them.
4. **Delete** them once you are satisfied. Their content is either in this repository (history, ARCHITECTURE.md section 5) or regenerated by every build.

## Checklist

- [ ] Dashboard deployed, all pages checked (step 1)
- [ ] `dev.avenx-js.com` served by the dashboard over HTTPS; a legacy URL redirects (step 2)
- [ ] `dev-docs.yml` and `quality-results.yml` deleted, docs and comments updated in `avenx-js` (step 3)
- [ ] `PAT_TOKEN` deleted and the token revoked (step 3)
- [ ] DNS records for `coverage.` and `benchmarks.avenx-js.com` removed (step 4)
- [ ] Pages unpublished, repositories archived, then deleted (step 4)
