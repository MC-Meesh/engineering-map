# 0007: Drop the 3D cluster view

Date: 2026-11-22. Status: accepted. Supersedes the 3D part of the v1.2 notes.

## Context
v1.2 added `/3d/`, a 3d-force-graph view of the same graph clustered by domain, category or
owner group. Chase reviewed it and judged it not good: it added a second, weaker way to read
the same data, cost about 400 KB of script, and split attention from the 2D map.

## Decision
Remove it completely: the `/3d/` page, `src/scripts/map3d.ts`, the 3d-force-graph,
three-spritetext and d3-force-3d dependencies, every link to it (site nav, map sidebar, the map
detail panel) and its rows in `docs/third-party-licenses.md`. The effort goes into the 2D map
and the ownership hierarchy instead.

## What stays
three.js stays for the example-file preview on format pages (0005); it is a different
feature and loads only there. The relationship lenses (`src/scripts/lenses.ts`) stay; they
were shared and now serve the map alone.

## Consequences
Old `/3d/` links return the 404 page. No data or build step depended on the view.
