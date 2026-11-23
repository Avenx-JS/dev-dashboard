# Avenx.js Developer Dashboard

API reference, test coverage and performance benchmarks of [Avenx.js](https://github.com/Avenx-JS/avenx-js) in one static site, built and deployed by one GitHub Actions workflow.

It replaces `dev.avenx-js.com` (`Avenx-JS/dev-docs`), `coverage.avenx-js.com` (`Avenx-JS/test-cov`) and `benchmarks.avenx-js.com` (`Avenx-JS/bench-results`), and the workflows in `Avenx-JS/avenx-js` that published to them.

| Area | Source | Updated |
| --- | --- | --- |
| **API Reference** — modules, classes, members, search, documentation health | `jsdoc -c jsdoc.json -X` on the framework | daily, on push, on demand |
| **Test Coverage** — totals, trend, test results, directories and files, line-by-line c8 report | `npm run test:coverage` | daily, on push, on demand; recorded weekly |
| **Benchmarks** — latest results, change against the previous run, history per benchmark | `node benches/run.js --json` | weekly (Saturday 10:00 UTC), on demand |

## Quick start

```bash
git clone https://github.com/Avenx-JS/avenx-js ../avenx-js && (cd ../avenx-js && npm ci)
npm run collect -- --upstream ../avenx-js
npm run build
npm run serve        # http://localhost:4173/
```

The dashboard has no dependencies of its own; Node 22 is enough. Without `collect` the site builds from the recorded history in `data/`.

| Command | |
| --- | --- |
| `npm run collect -- --upstream DIR [--only docs,coverage,benchmarks]` | Run the framework's commands and write `.cache/collected/` |
| `npm run build` | Render `dist/` (`BASE_PATH` sets the path it is served under) |
| `npm run check` | Fail on broken internal links, anchors or redirects in `dist/` |
| `npm run serve` | Preview `dist/` like GitHub Pages does |
| `npm test` | Unit tests and build smoke tests |
| `npm run record` | Append the collection to `data/` — CI only |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — what was replaced, how the pipeline works, data formats, design decisions
- [docs/MIGRATION.md](docs/MIGRATION.md) — switching domains and decommissioning the legacy repositories and workflows
- [docs/VALIDATION.md](docs/VALIDATION.md) — tests carried out and their results
