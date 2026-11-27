# 0006: Format inspector ("Inside the file"): sources, parsers and legal boundary

Date: 2026-11-22. Status: accepted.

## Context
Format pages show example files (0005). v1.2 adds a way to look inside them: annotated text
for text formats, a hex view with a structure map for binary ones, and a written explainer
for formats we can only link. Engineering file formats sit close to vendor intellectual
property, so how the parsers are made and what they may read has to be explicit. The site is
educational and non-commercial (confirmed by Chase).

## Name
"Inside the file" on pages and links (the route is `/formats/<id>/inside/`); "format
inspector" in code and docs. Not "sample viewer".

## Boundary
Allowed:
1. Published specifications and standards (ISO, IEEE, SEMI, OMG, Modelica Association, The
   HDF Group, Khronos, PKWARE) and public vendor documentation (user guides, command and
   format references a vendor publishes without a login).
2. Our own parsers written from those documents (clean-room in the ordinary sense: written
   from the description, not from another implementation's code).
3. Constants and layouts read from open-source code whose license allows it, with the
   license recorded (`docs/third-party-licenses.md`).
4. Files we generated (CC0) or third-party files under licenses that allow redistribution
   (0005). The inspector reads only files already hosted under 0005.

Not allowed: decompiling or disassembling vendor binaries, using leaked or licensed-only
SDKs or headers, bypassing license checks or encryption, and hosting files whose terms
forbid redistribution. Where a format's internals are not public (CATIA, Creo, NX,
SOLIDWORKS, Inventor native files), the explainer says so and describes only the public
routes out (export formats, documented APIs) and what is visible without tools (a text first
line, a public container format).

## What reads what
All parsers live in `src/scripts/inspect/` and load only on an inside page.

| Format (files) | How it is read | Source of the layout |
|---|---|---|
| STEP, IFC | Part 21 statements, entity index, #id links | ISO 10303-21; entity notes from ISO 10303 APs and the buildingSMART IFC schema docs |
| IGES | 80-column sections, directory fields, global parameters | IGES 5.3 (US PRO/NIST) |
| OBJ, DXF, G-code, Gerber X2, Excellon | line grammars | Wavefront OBJ appendix; Autodesk DXF reference; RS-274/ISO 6983 conventions; Ucamco Gerber spec; Excellon format description |
| Abaqus .inp, LS-DYNA .k, Nastran .bdf, Ansys .cdb | keyword decks, fixed columns | Public user and command references (Abaqus keywords, LS-DYNA keyword manual, MSC/Siemens QRG, Ansys command reference for NBLOCK/EBLOCK) |
| Gmsh .msh, VTK legacy and XML, Tecplot ASCII, XDMF | sections and blocks | Gmsh reference manual, VTK file formats document, Tecplot data format guide, XDMF documentation |
| ACIS .sat, Parasolid .x_t | header and record framing; record pointers | Spatial SAT format documentation; Siemens Parasolid XT Format Reference |
| USD ASCII, DEF, Verilog, SPICE, Modelica, SysML v2, QIF, ReqIF, AMF, URDF, SDFormat, MJCF, 3MF model | syntax and element notes | Each language or schema's published specification |
| STL binary, PLY, glTF GLB | full field decode | Public STL description, PLY description, Khronos glTF 2.0 |
| 3MF (ZIP container) | local headers, central directory, inflate in the browser | PKWARE APPNOTE |
| GDSII | full record decode | GDSII Stream Format manual (public) |
| OASIS | records incl. CBLOCK inflate; record numbers cross-checked against gdstk (BSL-1.0) | SEMI P39 |
| HDF5 (CGNS, MED, Exodus II, XDMF heavy data) | superblock, v1 root header, signed blocks, heap names, OHDR messages | HDF5 File Format Specification |
| Nastran OP2 | Fortran record framing, tables, markers | pyNastran documentation (BSD-3) |
| Rhino .3dm | header and chunk tree | openNURBS `opennurbs_3dm.h` typecodes (McNeel, permissive license) |
| Fluent .cas | text and binary sections | Fluent case and data file format appendix (public documentation) |

Bytes a parser does not understand are labeled "Not decoded" rather than guessed.

## Explainers
`data/structure.yaml` holds one entry per format without a hosted file (15 linked formats plus
JT): summary, layout parts, sources. The build validates format ids, required fields, source
URLs and the no-dash rule.

## Libraries
No third-party code in the inspector. (The 3D cluster view that used 3d-force-graph,
three-spritetext and d3-force-3d was removed in v1.3; see 0007.)
