# engineering-map

Notes for coding agents (and anyone else) working in this repository. Human-facing docs:
`README.md` and `CONTRIBUTING.md`. Follow the data rules in CONTRIBUTING.md exactly.

## Layout
- `data/{tools,vendors,formats,acquisitions,brands}/<id>.yaml`: one file per record. Source of truth.
- `data/taxonomy.yaml`: domains (7, drive colour), categories, workflow stages.
- `schema/schemas.json`: JSON Schema per record type.
- `scripts/build-graph.mjs`: validate, check references, derive edges, layouts, write
  `src/generated/graph.json` (pages) and `public/data/graph.json` (client map).
- `src/pages/`: map, tools, vendors, formats (+ matrix), categories, workflow, acquisitions, about.
- `src/scripts/map.ts`: the interactive map (lenses, ownership circles, filters, search, focus, detail panel).
- `src/components/ExamplePanel.astro`: the example file on each format page (3D or inspector).

## Commands
- `npm run data` validates; `npm run build` validates and builds `dist/`.
- `npx astro preview --host 0.0.0.0 --port 3480` serves `dist/`.
- `npm run e2e` and `npm run shots` need the preview running and Chrome (`CHROME_PATH`).
- `npm run check-links` and `npm run stale` write reports at the repo root (gitignored).

## Rules
- Summaries in our own words, short. Never copy source text. No em or en dashes (build fails).
- Every record: `sources`, `as_of`, `confidence`. Do not raise confidence without checking the source.
- Edges are derived from record fields; never add a hand-drawn edge.
- Visual language (decision 0008): IBM Plex Mono only, black and white
  with grey, square hairline borders. Colour is for data only; the domain palette has 7 slots,
  do not add an 8th.
- Example files only through `scripts/gen_examples.py` or `scripts/fetch_examples.py`, with
  license, size and sha256 (decision 0005).
- Read `docs/decisions/` before structural changes; add a decision for a new one.
- Commits: plain messages.
