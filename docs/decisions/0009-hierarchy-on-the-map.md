# 0009: The map opens on the ownership hierarchy; examples render on format pages

Date: 2026-11-22. Status: accepted.

## Context
Review of v1.2: "I still don't see a hierarchy of any type." The ownership tree existed at
`/vendors/tree/` but was not findable, and every map lens was a force layout, so a first
visit landed on a hairball. Format pages sent readers to other pages to see an example.

## Decisions
1. **Ownership lens as nested circles** (`scripts/build-graph.mjs`, d3-hierarchy `pack`, build
   time only). Root > owner family > subsidiary (recursively) > product. A vendor's own node
   is packed first so it sits at the centre of its circle. Placement follows the same rules as
   `src/lib/ownership.ts` (the `parent` field, else the latest completed or pending deal); the
   graph JSON carries `owner` and `hulls.ownership` ([vendor, x, y, r, depth, tools]).
   Circle packing was chosen over a radial tree because 21 families plus about 130
   single-vendor companies would make a radial tree's outer ring unreadable, while circles
   show containment at a glance and give each family a region to name.
2. **Ownership is the default lens.** A bare map URL opens on it; `#lens=overview` is the old
   force layout ("Everything", now last).
3. **Focus in the ownership lens moves nothing.** The camera frames the company's circle, the
   lineage lights up (circles and edges), the rest of the circle stays in colour, and a
   breadcrumb (Siemens > Altair > Simcenter Hypermesh) sits under the lens bar on desktop and
   at the top of the detail sheet on phones. Clicking inside a circle focuses that company.
4. **Crowded focus rings** (more than 24 neighbors, e.g. STEP in the file formats lens) are
   ordered by category, label only their best-connected members (14, or 8 on phones; the rest
   on hover) and carry one name per category sector. The file formats lens names its 18 most
   used formats and keeps tool names for hover; its edges stay grey until something is
   pointed at.
5. **Top-level nav** gains "Ownership" (the tree), and the tree page gets a family index and
   "on the map" links per vendor.
6. **Example panel on format pages** (`src/components/ExamplePanel.astro`): beside the
   description on desktop (sticky), under it on phones. Geometry files open in the 3D viewer,
   other hosted files in the inspector (stacked by container query), linked-only formats show
   their structure explainer. Both are dynamic imports triggered by an IntersectionObserver,
   so no other page loads three.js, OCCT or the parsers. `/formats/<id>/inside/` stays as the
   full-width view.
