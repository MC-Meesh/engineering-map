# Roadmap

Open work, grouped by area. Items marked "Needs a primary source" or "Uncertain" are facts
the map cannot settle yet: if you can find a vendor page, release note or filing that
answers one, open a pull request or an issue (see CONTRIBUTING.md). They are good first
contributions.

## Dependencies
- [ ] Upgrade the major versions Dependabot skips: Astro 5 to 7, sigma and @sigma/node-border 3 to 4
      (a rewrite of the rendering programs, see sigma's v3 to v4 migration guide), js-yaml 4 to 5
      (no default export; switch to named imports in the build scripts)

## Data
- [ ] Open verification items (release years without a primary source,
      Excellicon closing date, a few founding years)
- [ ] Siemens/Defacto: watch for the closing notice
- [ ] Re-verify the remaining medium records field by field; target 50% high

## Format examples
- [ ] JT: find a freely licensed sample (none found; Siemens samples need a login)
- [ ] Open the Autodesk DWG sample page by hand once (blocks automated checks)
- [ ] Our own OpenFOAM cavity case and an FMU built from SpringMass.mo (both currently linked)
- [ ] Preview for meshes and results (VTK, Exodus) and 2D formats (DXF, Gerber, GDSII)
      (their structure is now browsable in "Inside the file"; a rendered preview is still open)
- [ ] Inspector: decode more of HDF5 (B-tree keys, dataset values), OP2 result tables by
      table code, Parasolid XT node types, DWG-style explainers for more natives
- [ ] Inspector: a JT explainer is in; add an inspectable JT once a freely licensed sample exists

## v1.2 follow-ups
- [ ] Time slider could reuse the ownership tree's deal dates

## v1.3 follow-ups
- [ ] Map: when the detail panel covers an edge's far end (an owner outside the framed
      circle), shift the view or draw a short "to Siemens" stub at the panel edge
- [ ] Phone map: the round ownership layout leaves bands above and below on tall screens;
      consider a short lens legend there

## v1.4 follow-ups
- [ ] Competition gaps with no usable public source yet: acusolve, flow-3d vs Fluent,
      nanofluidx, fun3d, nek5000, simscale-platform, cognite, itwin, omniverse, plant
      simulation, twin builder, simpleware, meshgems, netgen; G2, Gartner and TrustRadius
      comparison pages block automated fetches and need a person in a browser
- [ ] Numerical libraries (33%) and CAD (47%) competition coverage
- [ ] Brands: Siemens Xcelerator portfolio once a page names its members; more vendors'
      families (Cadence, Synopsys, Hexagon) where they market named families
- [ ] OpenFOAM comparisons that do not name a distribution are recorded on openfoam-org;
      revisit if a study names it

## Site features and missing tools
- [ ] Map: label collision handling in focus mode on phones (dense neighbor clusters overlap)
- [ ] Fuller format support per tool (import/export lists from docs)
- [ ] Missing tools the review flagged: TopSolid, NX CAM, Creo Elements/Direct, Bambu Studio,
      OrcaSlicer, SOLIDWORKS CAM, CAD Exchanger, build123d, Propel, Motor-CAD, MSC Apex,
      PAM-STAMP, JuliaSim/ModelingToolkit, SysON, Altium 365, Flux.ai, Siemens Capital,
      PrimeSim, Fusion Electronics, Intrinsic Flowstate, Aspen Plus/HYSYS, CODE V, LightTools
- [ ] Time slider on the map: replay ownership as of any year from the acquisition records
- [ ] Kernel family tree view (ACIS to ShapeManager, Parasolid lineage)
- [ ] Per-node change history page from git log
- [ ] OG images per page, RSS of data changes (site-wide OG image and sitemap done in v1.1)
- [ ] "Path between two tools" query (shortest format chain from A to B)

## Open questions: Dassault and Siemens records
- [ ] cgm, `first_release`: 1998 (CATIA V5) or 1999 (Dassault's V5 architecture year); a note that Spatial made CGM licensable on 2011-06-29 is supported by syndicated copies only
- [ ] solidworks-flow, `origin` / `first_release`: NIKA FloWorks lineage (same code as FLOEFD) rests on trade press; origin would be `nika`, and 1999 vs 2001 is open
- [ ] solidworks-pdm, `origin`: Conisio from GCS Scandinavia AB; the deal date (2006-05-04 or 2006-09-26) has no primary source and the SolidWorks blog URL is dead
- [ ] xflow, `first_release`: nothing supports 2009; 2011 (first customer ship) is secondary, a 2010 pre-release is possible
- [ ] solid-edge, `first_release` / `confidence`: 1995 or 1996; only Wikipedia backs it, so `high` breaks the rule; needs a primary source
- [ ] femap, `origin` (Siemens design and PLM group): Enterprise Software Products (George Rudy, 1985), then SDRC; the cited Siemens blog does not name them
- [ ] femap, `origin` (Simcenter group): same lineage; the blog says only that Femap started in the 90s and SDRC bought it, which also conflicts with first_release 1985
- [ ] polarion-co, `hq`: CZ or US (Alameda); release body not readable, Polarion had German, Czech and US entities
- [ ] flotherm, `first_release`: a Siemens blog treats 1988 as the birth year; the confirmed change to 1989 rests on Microwave Journal
- [ ] teamcenter, `first_release` / `origin`: 1996 has no source; the brand dates from 2001 or 2002 over iMAN and Metaphase, and the origin is shared by UGS and SDRC
- [ ] parasolid, `origin`: Shape Data Ltd (Cambridge, Parasolid v1.0 1988); widely reported, no primary source, needs a vendor record
- [ ] parasolid-xt, `open_spec`: Siemens' XT Format Reference vs the IANA note that the binary spec is unpublished
- [ ] jt, `first_published` / `website` / `standard`: 2012 is the first ISO edition, not the format's first publication; the ISO 14306 multi-part editions and what iso.org/standard/77802 is are unverified (ISO pages blocked)
- [ ] renamed Altair products (16 records), `vendor`: siemens with origin altair under the vendor rule, vs the 2026-11-22 decision to keep altair; the id altair-flux no longer matches its name
- [ ] renamed Altair products (17 with openradioss), `vendor` / `origin`: same proposal from the EDA group; confirmed finding 3.15 (same change) is also held for this decision
- [ ] tia-portal, `vendor`: a Siemens AG factory automation product, not a DISW product; modeling flag only
- [ ] simcenter-nastran, `origin` / `notes`: the 2019.1 rename note is confirmed (add it); origin ugs, msc or nasa is disputed
- [ ] acusolve, radioss, altair-flux, pbs-pro, `origin`: ACUSIM, Mecalog, CEDRAT and NASA/Veridian need vendor and deal records, each with its own primary source
- [ ] xpedition, `origin` / `first_release`: VeriBest (1999) lineage is secondary only; 2000 has no source (the Xpedition name dates from 2013, Expedition Enterprise from 2005)

## Missing records: Dassault and Siemens
Records the review asked for that were not added: no primary source opened, out of the engineering scope, a
single product needing a brand, or no taxonomy category. Each line names the reason.
- [ ] Dassault ENOVIA lineage deals: IBM Product Manager (1998), SmarTeam (1999), MatrixOne (2006) (acquisitions page lists them; per-deal releases not opened)
- [ ] DELMIA Quintiq, Ortems, DELMIAWorks, 3DLean, Augmented Experiences and their deals (Deneb, Intercim, Apriso, Quintiq, Ortems, IQMS, Diota, Ascon Qube): supply chain and ERP sit outside the map; product pages not opened
- [ ] SOLIDWORKS family: CAM (CAMWorks), DraftSight, Electrical (Elecworks), 3DEXPERIENCE Works / xDesign, Visualize, Composer, Plastics, Manage, eDrawings (product pages not opened)
- [ ] CATIA V5 vs 3DEXPERIENCE CATIA, ICEM Surf, MagicDraw, Tuleap and the Enalean deal (closing date not found)
- [ ] Modelon GmbH (2015), Geensoft, Argosim deals (Modelon AB stays independent; needs a separate vendor)
- [ ] Distene (MeshGems) vendor and deal (only a Spatial newsletter; not on Dassault's acquisitions list)
- [ ] Medidata, ArisGlobal, Accelrys, Gemcom, RTT, Centric, Contentserv: outside the engineering scope
- [ ] 3D XML format: no format specification page opened
- [ ] SIMULIA Execution Engine (noted on isight), Antenna Magus, Fest3D, Spark3D, IdEM, WASP-NET, IVCAD Suite, Manatee, PowerFLOW companions, 3DEXPERIENCE SIMULIA roles: product pages not opened
- [ ] Next Limit Technologies vendor (noted on next-limit; independent company, not an owner of anything here)
- [ ] Dotmatics, Mendix and their deals: outside the engineering scope (Dotmatics noted on the siemens vendor)
- [ ] Siemens Xcelerator portfolio record: still no page names its members (see v1.4 follow-ups)
- [ ] Opcenter: brand page only, single product, no manufacturing operations category
- [ ] Designcenter X and Designcenter X Solid Edge SaaS tiers (mentioned in the Designcenter brand)
- [ ] Valor and Solido vendor and deal records (Mentor bought Valor in 2010, Siemens bought Solido in 2017; no primary source opened)
- [ ] Tecnomatix vendor and ugs--tecnomatix--2005; Shape Data and D-Cubed vendors and ugs--d-cubed--2004; SDRC and I-DEAS: lineage from blogs and secondary sources only
- [ ] Simcenter Testlab and SCADAS: no taxonomy category for physical test systems
- [ ] Simcenter Motionview, Hypergraph, Hypercrash, Compose, Embed, PSIM, Flow Simulator, Fluxmotor, Hyperlife, SEAM, ESAComp, S-Frame, Genesis, Inspire Cast/Form/Mold/Extrude, Simcenter X, Prescan, Madymo, Tire (TASS), Culgi, Zona, M-Star, Battery Design Studio, Micred, System Architect, Studio, System Analyst, Executable Digital Twin Gateway: product pages not opened in this pass
- [ ] Infolytica (MAGNET origin), Flowmaster, Samtech vendors and the Flomerics/NIKA deal (closing date unconfirmed)
- [ ] ACUSIM, Mecalog, CEDRAT vendors and Altair deals (trade press; the CEDRAT S-1 not reopened)
- [ ] STAR-CD (legacy; not on the current offerings page)
- [ ] Rapidminer product records (AI Studio, Monarch, Panopticon, SLC, Knowledge Studio, Graph Studio) and a Rapidminer brand: data analytics rather than engineering; vendor and deal added
- [ ] HPCWorks Access, NavOps, Breeze, Mistral, Unlimited and OpenPBS (OpenPBS noted on pbs-pro)
- [ ] Altair One and Altair Units: a cloud gateway and a licensing model, not tools
- [ ] HyperWorks retired platform record (noted on the altair vendor)
- [ ] Valor PollEx and Altair/Polliwog (2019); Altair/Datawatch (2018); Altair/Veridian PBS (2003, noted on pbs-pro)
- [ ] Mentor/Innoveda (2002), Mentor/VeriBest (1999), PADS Software/HyperLynx (1997) with vendors: Mentor 10-K covers Innoveda only; the rest is secondary
- [ ] HEEDS AI Simulation Predictor: launched 2023-11-28 but no longer listed as its own product (noted on heeds)
- [ ] TestWay (ASTER): vendor and deal added; no product page opened
- [ ] Siemens/Defacto: the review asks to remove `completed` (it holds the announcement date), but the schema requires it and `src/lib/data.ts` sorts deals on it; needs a schema and site change for pending deals without a date

## Gaps found in newcomer reviews
- [ ] Native files without a primary page we could open: ANSA (.ansa database), Ansys HFSS
      (.aedt project), Cimatron, Cadence Virtuoso (OpenAccess), Mastercam, Simpack, MSC Nastran,
      hyperMILL, Pointwise, fe-safe, SOLIDWORKS (help needs JavaScript)
- [ ] Lineage gaps: Cimatron (original developer and owners before CAMBRIO), Allegro (1985 vs
      Cadence 1988), Revit, Gazebo, FreeCAD origins; origin facts now only in notes for CATIA and CFX
- [ ] Imports not recorded for KiCad and Allegro (KiCad's importers are for other EDA projects,
      not format records yet)
- [ ] ANSA first_release 1990 is shown while its note says it is unconfirmed
- [ ] A real flow-field sample (current VTU is a height field on the bracket)
- [ ] Map labels still crowd dots at phone width in the ownership view
- [ ] Render MED and other HDF5 meshes (SALOME's sample is bytes only)
- [ ] Plant Simulation and similar factory tools: record their data routes (databases, Excel,
      layouts) and outputs
- [ ] ParaView .pvsm and Capella .capella samples or explainers (open formats, no sample yet)
- [ ] Allegro inputs (netlist routes) and LS-DYNA results files (d3plot) as format records
- [ ] The 39 tools still without any file information (blocked or JavaScript-only vendor docs)
- [ ] Moldflow sits under Multiphysics; consider a manufacturing simulation category

## Relationships
- runs_on still unsourced, so not added: SIMULIA apps (Abaqus and others) on 3DEXPERIENCE, PTC Windchill and Creo (they integrate; whether Creo runs on Windchill needs a PTC page), Autodesk Platform Services (no APS record yet), Siemens Xcelerator (a portfolio name, not a runtime platform; leave it out unless Siemens documents apps running on it).
- Misconceptions (the clarifies field): only CATIA so far. Candidates that need a primary source: SOLIDWORKS on Parasolid despite being a Dassault product; Simcenter names on Altair products after the 2025 deal; Fluent runs standalone as well as in Workbench.
- Path finder: brands are joined only through products, so two brand names cannot be compared directly.
- Map Explain cards give way when they collide; the panel lists every sentence. A layout that spreads the cards out would show more of them at once.

- Kernel data missing for 8 Dassault and 16 Siemens design and simulation tools (vendor pages list them under no kernel recorded); add built_on only with a primary source.

## Open questions: geometry kernels
- [ ] Uncertain: abaqus, built_on, acis: The mirrored Abaqus Scripting Reference does list the exception 'File is from a newer version of ACIS than the CAE kernel' / 'ACIS File version exceeds Kernel'. That strongly hints the Abaqus/CAE kernel is ACIS-based, but it is indirect and comes from a university mirror, not a Dassault page that says so. Map check: abaqus has only acis-sat as a format.
- [ ] Needs a primary source: solidworks built_on d-cubed (map has it): no Siemens or Dassault page names D-Cubed specifically for SOLIDWORKS; Siemens only lists 'Solidworks' as a PLM Components customer in general
- [ ] Needs a primary source: nx built_on d-cubed (map has it): no primary page states NX uses D-Cubed 2D/3D DCM by name; only the portfolio-level 'we build our own products with the same PLM Components'
- [ ] Needs a primary source: catia constraint solver: nothing primary on which sketch/assembly solver CATIA uses (Spatial sells a separate Constraint Design Solver, but no page ties it to CATIA)
- [ ] Needs a primary source: 3DEXPERIENCE SOLIDWORKS apps (xDesign, xShape) on CGM: no Dassault or Spatial statement; only the Siemens Solid Edge blog saying the 3DEXPERIENCE platform uses CGM
- [ ] Needs a primary source: Dassault-side confirmation that SOLIDWORKS uses Parasolid (solidworks.com / 3ds.com): not found, Siemens-side sources only
- [ ] Needs a primary source: abaqus built_on acis: no current 3ds.com statement; only the scripting reference line on a university mirror (help.3ds.com needs login), and the abaqus-docs.mit.edu copy returned HTTP 410
- [ ] Needs a primary source: opera (SIMULIA Opera) geometry kernel: nothing found
- [ ] Needs a primary source: simcenter star-ccm (3D-CAD) geometry kernel: no Siemens page or release note names Parasolid for 3D-CAD; Wikipedia lists it, pointer only
- [ ] Needs a primary source: femap built_on parasolid (map has it) and simcenter-3d built_on nx/parasolid (map has it): no fresh primary quote retrieved in this pass (a Siemens Parasolid fact sheet reportedly calls Parasolid the corporate standard for NX, Solid Edge, Femap and Teamcenter, but the PDF URL now returns an HTML page)
- [ ] Needs a primary source: floefd kernel: Siemens describes it only as CAD-embedded in NX, Solid Edge, CATIA and Creo using native geometry; no kernel named for the standalone version
- [ ] Needs a primary source: Simcenter Flotherm XT kernel: not named in sources found
- [ ] Needs a primary source: magnet (Simcenter MAGNET) geometry kernel: nothing found
- [ ] Needs a primary source: process-simulate runs_on teamcenter: Siemens has a 'Process Simulate on Teamcenter' fact sheet (integrated with Teamcenter) but I did not retrieve a verbatim quote, and Process Simulate also ships standalone; plant-simulation platform: nothing found
- [ ] Needs a primary source: simsolid: no primary statement on kernel or on being faceted/meshless without a B-rep kernel
- [ ] Needs a primary source: Mesh or particle based tools with no B-rep kernel (xflow, powerflow, ultrafluidx, nanofluidx, edem, acusolve, radioss, optistruct, motionsolve, simcenter-nastran, flightstream, altair-flux): no primary source states the absence of a kernel, so no claims made
- [ ] Needs a primary source: Altair 2013 agreements (Parasolid Designer across HyperWorks; D-Cubed 2D and 3D DCM across the product line, 2013-10-22): found only on syndication sites (aeccafe, hpcwire, Digital Engineering), no original Siemens or Altair URL
- [ ] Needs a primary source: Spatial naming BricsCAD/Bricsys, Alibre, IronCAD, Ansys (HFSS, Maxwell, SpaceClaim) or Autodesk as current ACIS licensees: not found on spatial.com; a 3ds.com press release on the Spatial acquisition reportedly calls Autodesk a long-time ACIS licensee but I did not retrieve the quote
- [ ] Needs a primary source: Siemens naming nTop, Plasticity, Cimatron, GibbsCAM, Moldex3D or RecurDyn as Parasolid licensees: not on the pages read
- [ ] Needs a primary source: Siemens' full D-Cubed customer list ('a list of some of our customers and their products on our web pages') and the Parasolid partners page: the partners page names no companies; no per-product list found
- [ ] Needs a primary source: T-FLEX CAD 16 using D-Cubed 2D DCM: a Siemens PLM Components blog post exists (blogs.sw.siemens.com/plm-components/?p=9) but I did not fetch a verbatim quote
- [ ] Needs a primary source: Photron CAD system on CGM Core Modeler: headline seen on Spatial's blog, post not fetched
- [ ] Needs a primary source: Platform (runs_on 3dexperience) relations for SIMULIA tools (abaqus, cst-studio, simpack, tosca, isight, fe-safe, powerflow, xflow, wave6, opera), dymola and cameo: not researched to a quotable primary source in this pass
- [ ] Needs a primary source: Kineo, meshgems and spatial-interop licensees: not researched beyond what the kernel pages showed (Coreform uses legacy MeshGems per Spatial)
- [ ] Uncertain: shapemanager, timeline, Spatial Corp. v. Autodesk and D-Cubed, filed 2001-12-27: The filing date, the parties and the D-Cubed disclosure injunction are all in the 10-K. But 'which shows D-Cubed worked on the Autodesk kernel after the fork' goes beyond the source. These were only Spatial's allegations, Spatial dropped its trade-secret claims against Autodesk and D-Cubed on 2002-10-16, and the court granted D-Cubed summary judgment on 2003-02-13. Keep the timeline fact and drop the inference.
- [ ] Uncertain: creo, built_on, granite: The Creo Elements/Direct 20.8 help table is titled 'Compatible versions for data exchange'. It pairs Granite 15 to 18 with Creo 9.0 to 12.0 and CED 20.5 to 20.8, which shows file compatibility, not that Creo Parametric is built on Granite. A more direct PTC source: the Creo Granite topic sheet offers 'Direct-read of PTC Creo Parametric part and assembly files, as well as models from other PTC Creo Granite based applications', which implies Creo Parametric is Granite-based. Better source: https://support.ptc.com/images/cs/articles/2020/06/1593411762dEcH/PTC_Creo_Granite_Interoperability_Kernel._Final.pdf
- [ ] Uncertain: fusion, runs_on, autodesk-platform-services: The APS blog of 2022-11-28 lists Fusion, Forma, Flow and APS as four components of the Autodesk Platform. It says APS is 'used internally to build Autodesk's industry clouds and products'. It never says Fusion runs on APS. Fusion runs_on APS is a two-step inference; built-with is closer to the wording than runs_on.
- [ ] Needs a primary source: Autodesk's 2001-11-27 ShapeManager press release (investors.autodesk.com/node/8081, already cited on the map's autocad record): the investor site and its gcs-web mirror return 403 or refuse the connection, and there is no Wayback snapshot, so the 'forked from ACIS 7.0' wording and the Inventor 5.3 first-ship date could not be re-read. The FY2003 10-K confirms 'derived from ACIS' but does not give the version number 7.0.
- [ ] Needs a primary source: A primary Autodesk source saying AutoCAD's 3D solids use ShapeManager (map: autocad built_on shapemanager). AutoCAD help pages only talk about ACIS SAT import and export; the Fusion blog post and Autodesk University class page that reportedly say ASM is shared by AutoCAD, Inventor and Fusion return 403.
- [ ] Needs a primary source: A primary Autodesk statement that Fusion's modeling kernel is ShapeManager in so many words. Only the Fusion export help (SMT is the ASM file type) was readable; the Fusion blog post (?p=56002) is blocked.
- [ ] Needs a primary source: Revit's geometry kernel: no Autodesk page found saying whether Revit uses ShapeManager or its own kernel. Only the SAT 7.0 import limit was sourced.
- [ ] Needs a primary source: Alias and Moldflow kernels or constraint solvers: nothing found on vendor pages. Moldflow as an early Granite licensee (in the map's granite notes, from CGW 2001) has no PTC or Autodesk primary source.
- [ ] Needs a primary source: Which specific Autodesk and PTC products embed which D-Cubed component (2D DCM in Inventor, AutoCAD parametric drawing or Creo sketcher; 3D DCM for assembly constraints). The Siemens page lists the vendors only, per application area.
- [ ] Needs a primary source: Which D-Cubed components Onshape uses (2D DCM for sketches, 3D DCM for mates): no Onshape or Siemens page found that says so; only the licensee listing.
- [ ] Needs a primary source: Constraint solver of Creo Parametric and of Creo Elements/Direct: no PTC statement found on whether these are in-house or D-Cubed.
- [ ] Needs a primary source: Whether Windchill+ runs on PTC Atlas: the 2022-04-19 Windchill+ release does not mention Atlas; only Creo+, Onshape, Vuforia Expert Capture and Creo GDX are sourced as Atlas products.
- [ ] Needs a primary source: Cloud provider under PTC Atlas, Creo+ and Windchill+ (Azure or AWS): not stated on the pages read.
- [ ] Needs a primary source: PTC's official English statement of the Creo Elements/Direct kernel: only the PTC Japan blog names ACIS and K2; the English product page and help do not name a kernel.
- [ ] Needs a primary source: Granite first release (2001) and the 'Granite One' name from a PTC source: map still rests on CGW; PTC pages read give no date.
- [ ] Needs a primary source: Onshape first release year and the Onshape Inc. founding facts from a primary source (not searched beyond the acquisition releases).
- [ ] Needs a primary source: A primary source that Autodesk Vault, Fusion Manage or Upchain run on Autodesk Platform Services, and the Upchain acquisition date and price (map record points at the site root).
- [ ] Needs a primary source: aps.autodesk.com/FAQ (403) and the Autodesk AWS partner page (403), so no Autodesk statement that Fusion as a whole is hosted on AWS; only the AWS case study on generative design.
- [ ] Needs a primary source: Autodesk Inventor's kernel in current documentation (2026 help): the only primary statement found is the FY2003 10-K; the Inventor file-types help page has no mention of ASM.
- [ ] Needs a primary source: ThingWorx first release 2009 and Windchill Navigate's product page as a separate tool record (only the help center landing page was read).
- [ ] Needs a primary source: PTC's 2015 Vuforia completion release (investor.ptc.com returns 403); the November 2015 date and about $65M come from the FY2016 10-K. SEC filing quotes (Autodesk FY2003 10-K, PTC FY2008 and FY2016 10-K, Alias 8-K, Moldflow release) were extracted by the fetch tool's summarizer, since sec.gov refuses plain automated fetches; worth one by-hand check of the exact wording before they go into the data.
- [ ] Needs a primary source: SketchUp: no primary source for its geometry kernel or any constraint solver (only a SketchUp forum post attributed to staff saying the kernel is unique to SketchUp; Trimble help pages do not name a kernel)
- [ ] Needs a primary source: Rhino: no primary McNeel page naming Rhino's in-house kernel or stating outright that it licenses no third-party kernel (forum posts only); the openNURBS page only shows that the full geometry functions live in the Rhino SDKs
- [ ] Needs a primary source: Plasticity: no primary source for the C3D-to-Parasolid switch or its date (Plasticity site and manual mention only Parasolid and xNURBS; an Onshape forum post is the only mention of C3D); no source for a constraint solver
- [ ] Needs a primary source: Ansys Discovery: no statement that Discovery itself changed kernels in 2025 R1 (the release note names SpaceClaim only), and no product-level source that Discovery or SpaceClaim use D-Cubed (Siemens lists ANSYS only at vendor level)
- [ ] Needs a primary source: Hexagon product level: Edgecam, WORKNC, VISI, Hexagon Designer and ESPRIT kernel statements on Hexagon pages (hexagon.com blocks automated fetches); only Siemens vendor-level licensee lists for Vero Software and DP Technology were found
- [ ] Needs a primary source: Mastercam: no mastercam.com statement that its solids run on Parasolid (the site only lists Parasolid as an import format); only the Siemens vendor-level list naming CNC Software
- [ ] Needs a primary source: BricsCAD: no current (post-2012) primary statement that today's BricsCAD still uses the LGS solvers; evidence is the 2011-2012 LEDAS/Bricsys releases
- [ ] Needs a primary source: IronCAD, ZWCAD, Vectorworks: which D-Cubed component (2D DCM, 3D DCM, other) each licenses; Siemens lists the vendors without naming the component
- [ ] Needs a primary source: ZWCAD: geometry kernel for its 3D solids (ACIS or other) and any Open Design Alliance relation; zwsoft.com/zwcad names no kernel
- [ ] Needs a primary source: ZW3D: constraint solver (own or licensed); the Overdrive page does not mention one
- [ ] Needs a primary source: nTop: whether it licenses Parasolid or another B-rep kernel for CAD import and CAD body handling; the nTop 5.0 kernel notice on docs.ntop.com and support.ntop.com could not be fetched (JS/Cloudflare); the Siemens NX implicit integration was not sourced
- [ ] Needs a primary source: Allplan: Allplan's own 2015 press release on the Parasolid integration (allplan.com returned Access Denied); the claim rests on the Siemens licensee list
- [ ] Needs a primary source: Bentley: the original Siemens press releases for the 2007 and 2012 Parasolid/D-Cubed agreements (only syndicated copies on Quality Digest, MCADCafe, Digital Engineering); kernel for iTwin, STAAD, PLAXIS not sourced
- [ ] Needs a primary source: Archicad: geometry kernel (only Wikipedia's 'own kernel' table)
- [ ] Needs a primary source: Revit: geometry kernel or constraint solver (Autodesk help only documents ACIS SAT import; nothing naming ShapeManager or D-Cubed inside Revit)
- [ ] Needs a primary source: Tekla Structures: geometry kernel (no Trimble third-party notice found)
- [ ] Needs a primary source: Autodesk Alias: kernel statement
- [ ] Needs a primary source: T-FLEX CAD: constraint solver (tflex.com product page names neither kernel nor solver)
- [ ] Needs a primary source: KOMPAS-3D: nothing found to support or correct the map note that C3D was extracted from KOMPAS-3D in 2012 beyond C3D Labs' own pages (not fetched in detail)
- [ ] Needs a primary source: FreeCAD: wiki.freecad.org pages (Sketcher, Assembly, OpenCASCADE) are behind an Anubis bot wall; planegcs is evidenced only by the source file path and header, not a prose statement
- [ ] Needs a primary source: Alibre Design: the version 29 page did not show a component list, so the ACIS/DCM versions quoted are from version 28
- [ ] Needs a primary source: CAM and other empty built_on records not sourced: gibbscam, cimatron, solidcam, camworks, hypermill, powermill, nx-cam, grasshopper (beyond being a Rhino plugin), hypermesh, tekla
- C3D Labs and ASCON: the KOMPAS-3D note calls C3D Labs an ASCON subsidiary (research claim), but the C3D Labs customer page only describes a working relationship; add a parent link only with a source that states ownership.
- Kernel pages show a generic sample of a format "kernels and components tools most often open"; replace with something meaningful or nothing.
- Dassault products with no kernel recorded (Abaqus, xDesign and others): source each or say mesh-based where documented.
- Simpack and SOLIDWORKS xDesign: no primary source names their geometry basis (a 3DS blog says Simpack imports or creates CAD geometry; only a CIO Review opinion piece says xDesign is on CGM). Record only with a Dassault, SOLIDWORKS or Spatial source.
- Abaqus/CAE on ACIS rests on the 2016 and 2017 Abaqus manuals (latest public statement); recheck if a newer manual says otherwise.
