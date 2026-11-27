# Third-party code and references

Runtime libraries shipped to the browser, and open-source code used as a reference for file
layouts. Example files and their licenses are in `data/examples/` (decision 0005); the
inspector's sources are in decision 0006.

## Shipped in the site
| Package | License | Where it loads |
|---|---|---|
| sigma, graphology, @sigma/node-border | MIT | Map (`/`) |
| three | MIT | 3D preview on format pages |
| occt-import-js (with Open CASCADE) | LGPL-2.1 (OCCT: LGPL-2.1 with exception) | STEP and IGES preview only, served unmodified from `/vendor/occt-import-js/` (0005) |
| IBM Plex Mono (Fontsource) | SIL OFL 1.1 | All pages |

## Used at build time only
| Package | License | Use |
|---|---|---|
| d3-hierarchy | ISC | Ownership circle layout in `scripts/build-graph.mjs` |
| graphology-layout-forceatlas2 | MIT | Force layouts in `scripts/build-graph.mjs` |

## Read as a reference, not shipped
| Project | License | What was taken |
|---|---|---|
| openNURBS (`opennurbs_3dm.h`), McNeel | openNURBS license (permissive, as-is) | 3dm chunk typecode values and their names |
| gdstk (`oasis.hpp`), Lucas Heitzmann Gabrielli | BSL-1.0 | OASIS record numbers, to cross-check the SEMI P39 list |
| pyNastran documentation | BSD-3-Clause | OP2 record framing, marker and table conventions |

No code from these projects is copied into the repository.
