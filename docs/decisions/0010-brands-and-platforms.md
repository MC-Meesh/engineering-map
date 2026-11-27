# 0010: Brands (product families) as a level; 3DEXPERIENCE split into platform and ENOVIA

Date: 2026-11-22. Status: accepted. Extends 0002 (data model).

## Context
Vendors market products in named families (SIMULIA, Simcenter, SOLIDWORKS). Before v1.4 the
families appeared only inside website URLs, so the hierarchy jumped from Dassault Systemes
straight to Abaqus. One record, "3DEXPERIENCE (ENOVIA)", mixed Dassault's platform with its
PLM product line.

## Decision
- New record type `brand` in `data/brands/brand-<name>.yaml` (schema `brand`; ids carry a `brand-` prefix because brand and product names often coincide): name, owning `vendor`,
  `products` (at least two tool ids), website, summary, sources, as_of, confidence. A brand is
  a grouping, not a tool: it has no edges and no map node.
- The build checks that each product exists, is sold by the brand's vendor or a company it
  owns (through vendor parents), and belongs to one brand only.
- Brands show in the ownership circles (a dash-dot circle inside the vendor that sells the
  products), the breadcrumb (Dassault Systemes > SIMULIA > Abaqus), the ownership tree (a row
  per brand under its vendor), the map detail panel and the tool page ("Brand" row and
  lineage line).
- Products renamed into another company's brand but still sold by the acquired company
  (Simcenter-named Altair products) sit in a Simcenter circle inside Altair.
- First set, from vendor pages: CATIA (CATIA, CATIA Magic, Dymola), SOLIDWORKS (with
  Simulation, Flow Simulation, PDM), SIMULIA (Abaqus, CST Studio Suite, PowerFLOW, XFlow,
  Isight, fe-safe, Tosca, Simpack), Simcenter (Siemens and renamed Altair products), Teamcenter
  (Teamcenter, Teamcenter Simulation), Tecnomatix (Plant Simulation, Process Simulate).
- Not added: single-product names (NX, DELMIA, ENOVIA) stay as tools; Siemens Xcelerator as a
  portfolio (no loadable page names its members), Autodesk industry collections (licensing
  bundles, not product families), Ansys Workbench (a platform, recorded as `built_on` where
  sourced), Hexagon MSC (already a vendor level) and Altair HyperWorks (now Simcenter).

## 3DEXPERIENCE
Split. `3dexperience` is now "3DEXPERIENCE platform" (what apps run on); the new `enovia`
record is the PLM product line, `built_on` the platform, and takes over the PLM competition
links (Teamcenter, Windchill). The vendor page says ENOVIA is "powered by the 3DEXPERIENCE
platform".
