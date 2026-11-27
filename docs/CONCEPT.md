# Concept: the engineering map

## The idea (Chase)
There is an enormous amount of software for engineering, and its structure (who owns what,
what runs on what, what can talk to what) is invisible from any single vendor's site. A graph
is the natural data structure for it.

## Refinement
1. **It is a map of dependencies and ownership, not a product directory.** Directories list
   features. The map's value is the edges nobody publishes in one place: which kernel a CAD
   tool is built on, which brand a product is sold under versus who developed it, which group
   owns that brand today, and which formats actually connect two tools.
2. **Four node types, one auxiliary.** Tools (with geometry kernels singled out), vendors
   (including absorbed companies, so ownership can be traced), formats, and workflow stages
   as a tag that can also be drawn as nodes.
3. **Edges are derived, never drawn.** Every edge comes from a field on a node file
   (`vendor`, `origin`, `built_on`, `formats.reads/writes`, `plugin_of`, `competes_with`,
   `open_source_alternative_to`, `stages`) or an acquisition record. That keeps the graph
   reproducible and every edge inherits a source.
4. **Provenance is first-class.** Each node carries sources, an as-of date and a confidence
   mark, and the site shows them. The honest version (some records marked low) is more
   credible than a large unsourced one.
5. **Several views of one dataset.** The force graph is the hook, but the questions people
   ask are better answered by derived views: the interop matrix (format by category), the
   pipeline (tools by stage, with the formats that carry each hand-off), the consolidation
   timeline (deals by buyer and year, and who controls the tools today), and plain tables as
   the accessible fallback for the canvas.
6. **Breadth capped by accuracy.** v1 aims for roughly 300 tools, 200 vendors (about 150
   active), 60 formats and 85 deals, each checked or flagged. Growth happens by pull request
   on YAML files.

## What it demonstrates
Domain knowledge (CAE/CAD/EDA landscape, kernels, formats), data modeling and validation,
graph layout and WebGL rendering, and information design across several chart forms.
