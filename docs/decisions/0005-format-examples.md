# 0005: Format example files, licensing policy and preview

Date: 2026-11-21. Status: accepted.

## Context
Each format page should let a reader see what the format actually looks like. Example files
are other people's work unless we make them, and engineering vendors are strict about their
native formats, so the rules have to be explicit and checked by the build.

## Policy
1. **Host a file only when we may redistribute it:**
   - files we generate ourselves (scripts/gen_examples.py): CC0-1.0, said so on the page;
   - third-party files under a license that clearly allows redistribution: public domain
     (for example US government works such as NIST models), CC0, CC-BY (with the attribution
     shown), MIT, BSD or Apache-2.0 test fixtures from open-source projects. The manifest
     entry records the license, the attribution and the source URL (`source_url`).
   - Copyleft files (GPL, CC-BY-SA) are linked rather than copied unless the whole
     license obligation is clear and small; we do not mix them into our CC0 set.
   - A file in a proprietary format (Parasolid, ACIS, Fluent, Mechanical APDL CDB, OP2) is
     hosted only when its author published that file under a permissive license (for example
     Ansys's MIT `ansys/example-data`, pyNastran's BSD test models). The repository license
     is read from the GitHub API by `scripts/fetch_examples.py` and must match; three license
     files GitHub cannot classify (pyNastran, QIF community, buildingSMART) were read by hand.
     The license text is stored next to each file as `<name>.LICENSE.txt`.
   - Archives that contain native executables (FMU, SSP) are linked, never served.
2. **Link, never rehost, proprietary or unclear material:** native CAD formats (SLDPRT,
   CATPart, NX and Creo .prt, Inventor .ipt, Fusion .f3d, Solid Edge .par, Parasolid unless
   from a licensed public sample), proprietary results formats (ODB, OP2, Fluent case/data,
   EnSight from vendor kits), EDA vendor files, and anything from GrabCAD or vendor
   tutorial downloads whose terms do not allow redistribution. Linked entries say whose
   terms apply (`origin: vendor-sample`, no `file`).
3. **Every hosted file carries:** file name, size, what it contains, license and attribution,
   source URL or generated-by note, as-of date and a SHA-256 checksum.
4. **Budget:** under 5 MB per file and 100 MB in all; at v1.1 the 46 hosted files total about
   4 MB (1.6 MB generated, 2.4 MB third-party), covering 44 formats, plus 15 links; 59 of 60
   formats have something. JT has nothing yet: no freely licensed sample was found.
5. **Honesty about content:** generated files say what they are and are not. Mesh and result
   files carry a synthetic `z_height_mm` field so they have data to plot; the page says it is
   not a simulation result. Solver decks are mesh-only (no materials or loads). The G-code is
   illustrative and not post-processed for a machine.

## Enforcement
`data/examples/*.yaml` (`generated.yaml` by gen_examples.py, `third-party.yaml` by fetch_examples.py, `linked.yaml`
by hand) is validated against the `example` schema in
`schema/schemas.json`. `scripts/build-graph.mjs` fails the build when a hosted file is
missing, its size or SHA-256 differs from the manifest, a file is over 5 MB, the total is over
100 MB, the format id is unknown, or a vendor sample has a `file`.

## What we generate
One part, an L-bracket (60 x 40 x 40 mm), modeled with CadQuery on OCCT 7.9 and written as
STEP, IGES, STL, 3MF, AMF, DXF (section), OBJ, PLY, glTF (GLB), USD (usda) and Rhino 3dm;
meshed with Gmsh and written as Gmsh MSH, Abaqus INP, Nastran BDF; converted with meshio to
VTK legacy, VTK XML, XDMF plus HDF5, Exodus II, CGNS, MED and Tecplot ASCII. Hand-written:
Verilog, SPICE, Modelica, SysML v2, URDF, SDFormat, MJCF, G-code, Gerber X2, Excellon; GDSII
and OASIS with gdstk. Using one object across formats lets a reader compare them directly.

## In-browser preview
- STL, OBJ, PLY, 3MF and glTF load with three.js loaders (MIT).
- STEP and IGES are tessellated in the browser by occt-import-js 0.0.23 (Viktor Kovacs; OCCT
  compiled to WebAssembly). License: LGPL-2.1, with OCCT under LGPL-2.1 plus the OCCT
  exception. Compatibility: we ship it as separate, unmodified files
  (`public/vendor/occt-import-js/`, copied from npm at build time by
  `scripts/vendor-assets.mjs`) together with both license texts and a pointer to the source,
  loaded by a script tag at run time. A user can replace those files, which is what the LGPL
  requires of a work that uses the library; our own code stays under its own terms.
- Cost: the WebAssembly file is about 7.6 MB, and three.js about 0.6 MB. Both load only when a
  reader presses "Preview in 3D" on a format page; no other page fetches them.
