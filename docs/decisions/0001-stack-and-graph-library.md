# 0001 Stack: Astro static output, sigma.js + graphology for the map

Date: 2026-11-21. Status: accepted.

## Context
About 580 visible nodes and 1,300 non-stage edges, roughly 600 static pages, one heavy
interactive view. Must be fast on phones and deployable as static files.

## Decision
- **Astro, static output.** Every tool, vendor, format and category page is plain HTML built
  from the generated graph. Only the map, table filters and chart tooltips ship JS. Next.js
  static export would also work, but Astro ships zero JS by default and fits a content site.
- **sigma.js v3 on graphology** for the map. WebGL rendering keeps 500 to 5,000 nodes smooth,
  including on mobile GPUs; graphology gives neighbor queries and a multigraph for typed
  edges; `@sigma/node-border` gives ringed nodes (formats, kernels, focus).
- **Layout precomputed at build time** with `graphology-layout-forceatlas2` (LinLog, strong
  gravity, deterministic seeded start by domain sector). The browser never runs a simulation,
  so the map is stable between visits and loads without jank.

## Alternatives considered
- Cytoscape.js: richer built-in styling and layouts, but canvas rendering slows past a few
  hundred nodes with labels, and the bundle is larger.
- d3-force with SVG/canvas: maximum control, but live simulation on mobile is costly and
  everything (hit testing, label collision, camera) would be hand-built.
