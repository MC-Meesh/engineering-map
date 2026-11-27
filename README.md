# The engineering map

A sourced, navigable map of the engineering software landscape: the tools (CAD, CAE, CFD, EDA,
CAM, PLM, MBSE, robotics, ML surrogates and more), the geometry kernels they are built on, the
vendors and ownership chains behind them, the file formats that connect them, and the
acquisitions that consolidated the industry.

**Live site:** https://engineering-map.mchaseallen.com

Every record carries its sources and the date it was last checked. Edges are never drawn by
hand: they are derived from fields on the records, so every line on the map inherits a source.

## Why it exists

The structure of engineering software (who owns what, what runs on which kernel, what can
exchange data with what) is invisible from any single vendor's site. This project puts it in
one place, in plain language, so someone who has never heard of a product can find out in a
minute or two who owns it, what it does, which formats it reads and writes, and where it sits
in an engineering workflow. The full concept is in [`docs/CONCEPT.md`](docs/CONCEPT.md).

## Contributing

Corrections and additions are very welcome, and most need no programming. Every tool, vendor
and format page has an **Edit this record** link that opens its YAML file in GitHub's editor,
and a **report a problem** link for when you know something is wrong but not the fix.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the data rules (sources, ownership, plain
summaries) and how review works.

## Running it locally

Needs Node 22.

```sh
npm ci
npm run dev        # validates the data, then serves on http://localhost:3480
npm run build      # validate + static build into dist/
npm run data       # validation only: schema, references, layout
```

The build fails on any schema error, unknown reference, duplicate id, or em dash in the data.
If `npm run data` passes, the site will build.

## Layout

| Path | What it holds |
|---|---|
| `data/{tools,vendors,formats,acquisitions,brands}/<id>.yaml` | One file per record. The source of truth. |
| `data/taxonomy.yaml` | Domains, categories and workflow stages. |
| `data/plain.yaml`, `data/structure.yaml` | Plain-language category explainers and file-format layouts. |
| `data/examples/` | Manifests for the example files under `public/examples/`. |
| `schema/schemas.json` | JSON Schema for each record type. |
| `scripts/build-graph.mjs` | Validates the data, derives edges, computes layouts, writes the graph. |
| `src/` | The Astro site. `src/scripts/map.ts` is the interactive map. |
| `docs/decisions/` | Why things are the way they are. Read before proposing a structural change. |

Other scripts: `npm run check-links` (checks every source URL, writes `link-report.md`),
`npm run stale` (lists records not checked in a year), `npm run e2e` and `npm run shots`
(browser checks against a running preview; set `CHROME_PATH` if Chrome is not at
`/usr/bin/google-chrome`).

## How it is maintained

- Every pull request is validated and built by CI and needs a maintainer's review.
- Merges to `main` deploy to GitHub Pages. Nothing reaches the site without review.
- A weekly job checks every source link and lists records that have not been re-checked in
  a year, in a single "Maintenance report" issue. Those are good first contributions.

## License

- **Code** (everything outside `data/` and `public/examples/`): [MIT](LICENSE).
- **Data** (`data/`): [CC BY-SA 4.0](LICENSE-DATA). Reuse it freely with attribution; share
  changes to the data under the same license.
- **Example files** (`public/examples/`): each file's license is recorded in its manifest in
  `data/examples/`. Ours are CC0; third-party files keep their own licenses, shipped beside them.
- Third-party libraries are listed in [`docs/third-party-licenses.md`](docs/third-party-licenses.md).

Product and company names are trademarks of their owners and are used only to identify them.
The project is not affiliated with any vendor listed.

Started by [Chase Allen](https://www.mchaseallen.com).
