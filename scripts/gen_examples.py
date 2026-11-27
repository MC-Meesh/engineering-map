#!/usr/bin/env python3
"""Generate the self-made example files under public/examples/<format>/ and write
data/examples/generated.yaml (one entry per file, with size and sha256).

Everything here is drawn by this script, so the files are ours to publish (CC0, see
docs/decisions/0005-format-examples.md). One part is the subject of most files: an L-bracket
(60 x 40 x 40 mm, two base holes, one hole in the upright, inside fillet), modeled with
CadQuery on OCCT, meshed with Gmsh, converted with meshio and trimesh.

Run from the repo root with the examples venv (cadquery gmsh meshio trimesh h5py netCDF4
gdstk rhino3dm):  python3 scripts/gen_examples.py
"""
import hashlib
import json
import os
import sys

import numpy as np

ROOT = os.getcwd()
OUT = os.path.join(ROOT, "public", "examples")
MANIFEST = os.path.join(ROOT, "data", "examples", "generated.yaml")
TODAY = os.environ.get("EXAMPLES_DATE", "2026-11-21")
GEN = "scripts/gen_examples.py"
entries = []


def path(fmt, name):
    d = os.path.join(OUT, fmt)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, name)


def add(fmt, name, contains, tool, extra=None, folder=None):
    folder = folder or fmt
    p = path(folder, name)
    data = open(p, "rb").read()
    e = {
        "format": fmt,
        "file": "examples/%s/%s" % (folder, name),
        "contains": contains,
        "origin": "generated",
        "license": "CC0-1.0",
        "attribution": "Drawn for the engineering map; no rights reserved.",
        "generated_by": "%s with %s" % (GEN, tool),
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "as_of": TODAY,
    }
    if extra:
        e.update(extra)
    entries.append(e)
    print("%-14s %-28s %8d" % (fmt, name, len(data)))


def write(fmt, name, text):
    with open(path(fmt, name), "w", newline="\n") as fh:
        fh.write(text)


# ---------------------------------------------------------------- geometry (CadQuery / OCCT)
import cadquery as cq
from OCP.IGESControl import IGESControl_Writer
from OCP.Interface import Interface_Static

base = cq.Workplane("XY").box(60, 40, 6, centered=(True, True, False))
upright = cq.Workplane("XY").box(60, 6, 40, centered=(True, False, False)).translate((0, -20, 0))
bracket = base.union(upright)
bracket = bracket.cut(cq.Workplane("XY").pushPoints([(-18, 6), (18, 6)]).circle(3.25).extrude(6))
bracket = bracket.cut(cq.Workplane("XZ").workplane(offset=0).center(0, 26).circle(4).extrude(40, both=True))
bracket = bracket.edges("|X").edges(cq.selectors.NearestToPointSelector((0, -14, 6))).fillet(4)
shape = bracket.val()
bb = shape.BoundingBox()
DESC = "L-bracket, 60 x 40 x 40 mm, 6 mm plate, two 6.5 mm base holes, one 8 mm hole in the upright, 4 mm inside fillet"

step = path("step", "bracket.step")
cq.exporters.export(bracket, step, exportType="STEP")
add("step", "bracket.step", "Exact B-rep solid (AP214) of the " + DESC + ".", "CadQuery 2.8 (OCCT 7.9)")

Interface_Static.SetCVal_s("write.iges.unit", "MM")
Interface_Static.SetIVal_s("write.iges.brep.mode", 1)
Interface_Static.SetCVal_s("write.iges.header.author", "Chase")  # else OCCT stamps the OS user name
w = IGESControl_Writer("MM", 1)
w.AddShape(shape.wrapped)
w.ComputeModel()
w.Write(path("iges", "bracket.igs"))
add("iges", "bracket.igs", "The same bracket as IGES 5.3 B-rep solid (types 186/514), millimeters.", "OCCT 7.9 IGESControl_Writer")

cq.exporters.export(bracket, path("stl", "bracket.stl"), exportType="STL", tolerance=0.05, angularTolerance=0.2)
add("stl", "bracket.stl", "Binary STL tessellation of the bracket (0.05 mm chord tolerance).", "CadQuery 2.8 (OCCT 7.9)")

cq.exporters.export(bracket, path("3mf", "bracket.3mf"), exportType="3MF", tolerance=0.05, angularTolerance=0.2)
add("3mf", "bracket.3mf", "3MF package with the tessellated bracket as one object, millimeters.", "CadQuery 2.8")

cq.exporters.export(bracket, path("amf", "bracket.amf"), exportType="AMF", tolerance=0.05, angularTolerance=0.2)
add("amf", "bracket.amf", "AMF (XML) with the tessellated bracket, millimeters.", "CadQuery 2.8")

section = bracket.section(3)
cq.exporters.export(section, path("dxf", "bracket-section.dxf"), exportType="DXF")
add("dxf", "bracket-section.dxf", "2D section of the bracket at z = 3 mm (base outline and the two holes) as DXF lines and arcs.", "CadQuery 2.8 DXF exporter (ezdxf)")

# ---------------------------------------------------------------- tessellated formats (trimesh)
import trimesh

tm = trimesh.load(path("stl", "bracket.stl"))
tm.merge_vertices()
tm.export(path("obj", "bracket.obj"))
add("obj", "bracket.obj", "Wavefront OBJ of the tessellated bracket (vertices, normals, faces).", "trimesh %s" % trimesh.__version__)
tm.export(path("ply", "bracket.ply"), encoding="binary")
add("ply", "bracket.ply", "Binary little-endian PLY of the tessellated bracket.", "trimesh %s" % trimesh.__version__)
tm.export(path("gltf", "bracket.glb"))
add("gltf", "bracket.glb", "Binary glTF 2.0 (.glb) with the bracket as one mesh. Coordinates are millimeters; glTF assumes meters, so scale by 0.001 on import.", "trimesh %s" % trimesh.__version__)

# USD (text layer), written directly from the mesh.
v = tm.vertices
f = tm.faces
usda = ['#usda 1.0', '(', '    defaultPrim = "Bracket"', '    metersPerUnit = 0.001', '    upAxis = "Z"', ')', '',
        'def Xform "Bracket"', '{', '    def Mesh "Body"', '    {',
        '        int[] faceVertexCounts = [%s]' % ", ".join(["3"] * len(f)),
        '        int[] faceVertexIndices = [%s]' % ", ".join(str(int(i)) for i in f.flatten()),
        '        point3f[] points = [%s]' % ", ".join("(%.4f, %.4f, %.4f)" % tuple(p) for p in v),
        '        uniform token subdivisionScheme = "none"', '    }', '}', '']
write("usd", "bracket.usda", "\n".join(usda))
add("usd", "bracket.usda", "USD text layer with the bracket as one triangle mesh, millimeters (metersPerUnit 0.001).", "this script (plain text writer)")

# Rhino 3dm via rhino3dm (openNURBS).
import rhino3dm

m3 = rhino3dm.File3dm()
m3.Settings.ModelUnitSystem = rhino3dm.UnitSystem.Millimeters
rm = rhino3dm.Mesh()
for p in v:
    rm.Vertices.Add(float(p[0]), float(p[1]), float(p[2]))
for a, b, c in f:
    rm.Faces.AddFace(int(a), int(b), int(c))
rm.Normals.ComputeNormals()
m3.Objects.AddMesh(rm)
# Write from inside the folder: openNURBS records the path it was given in the file.
_here = os.getcwd()
os.chdir(os.path.dirname(path("rhino-3dm", "bracket.3dm")))
m3.Write("bracket.3dm", 7)
os.chdir(_here)
add("rhino-3dm", "bracket.3dm", "Rhino 7 file with the tessellated bracket as a mesh object, millimeters.", "rhino3dm %s (openNURBS)" % rhino3dm.__version__)

# ---------------------------------------------------------------- hand-written native files (v1.5)
# KiCad board (S-expression format, dev-docs.kicad.org/en/file-formats/sexpr-pcb/), the same board
# as the Gerber example; and the bracket as an OpenSCAD script.
write("kicad-pcb", "board.kicad_pcb", '(kicad_pcb\n\t(version 20240108)\n\t(generator "engineering-map")\n\t(generator_version "8.0")\n\t(general\n\t\t(thickness 1.6)\n\t\t(legacy_teardrops no)\n\t)\n\t(paper "A4")\n\t(layers\n\t\t(0 "F.Cu" signal)\n\t\t(31 "B.Cu" signal)\n\t\t(37 "F.SilkS" user "F.Silkscreen")\n\t\t(39 "F.Mask" user)\n\t\t(44 "Edge.Cuts" user)\n\t)\n\t(setup\n\t\t(pad_to_mask_clearance 0)\n\t)\n\t(net 0 "")\n\t(net 1 "IN")\n\t(net 2 "OUT")\n\t(footprint "MountingHole:MountingHole_2.4mm_Pad"\n\t\t(layer "F.Cu")\n\t\t(at 3 17)\n\t\t(property "Reference" "H1" (at 0 -3) (layer "F.SilkS"))\n\t\t(pad "1" thru_hole circle (at 0 0) (size 2.4 2.4) (drill 1.2) (layers "*.Cu" "*.Mask") (net 1 "IN"))\n\t)\n\t(footprint "MountingHole:MountingHole_2.4mm_Pad"\n\t\t(layer "F.Cu")\n\t\t(at 27 3)\n\t\t(property "Reference" "H2" (at 0 -3) (layer "F.SilkS"))\n\t\t(pad "1" thru_hole circle (at 0 0) (size 2.4 2.4) (drill 1.2) (layers "*.Cu" "*.Mask") (net 2 "OUT"))\n\t)\n\t(footprint "Resistor_SMD:R_0805_2012Metric"\n\t\t(layer "F.Cu")\n\t\t(at 15 10)\n\t\t(property "Reference" "R1" (at 0 -1.65) (layer "F.SilkS"))\n\t\t(property "Value" "10k" (at 0 1.65) (layer "F.SilkS"))\n\t\t(pad "1" smd rect (at -2 0) (size 1.5 1) (layers "F.Cu" "F.Mask") (net 1 "IN"))\n\t\t(pad "2" smd rect (at 2 0) (size 1.5 1) (layers "F.Cu" "F.Mask") (net 2 "OUT"))\n\t)\n\t(gr_line (start 0 0) (end 30 0) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))\n\t(gr_line (start 30 0) (end 30 20) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))\n\t(gr_line (start 30 20) (end 0 20) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))\n\t(gr_line (start 0 20) (end 0 0) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))\n\t(segment (start 13 10) (end 3 17) (width 0.3) (layer "F.Cu") (net 1))\n\t(segment (start 17 10) (end 27 3) (width 0.3) (layer "F.Cu") (net 2))\n)\n')
add("kicad-pcb", "board.kicad_pcb", "KiCad board file for the same small board as the Gerber example: a 30 x 20 mm outline, two mounting holes, a 0805 resistor and two tracks, written by hand in the KiCad S-expression format.", "hand-written")
write("openscad-script", "bracket.scad", "// L-bracket, 60 x 40 x 40 mm, 6 mm plate: the site's test part as an OpenSCAD script.\n// Units are millimeters. Example for the engineering map, CC0.\nplate = 6;      // plate thickness\nw = 60;         // width (x)\nd = 40;         // depth of the base (y)\nh = 40;         // height of the upright (z)\n\ndifference() {\n    union() {\n        cube([w, d, plate]);              // base plate\n        cube([w, plate, h]);              // upright plate\n    }\n    // two 6.5 mm holes through the base\n    for (x = [15, 45])\n        translate([x, d - 12, -1]) cylinder(d = 6.5, h = plate + 2, $fn = 48);\n    // one 8 mm hole through the upright\n    translate([w / 2, -1, h - 14]) rotate([-90, 0, 0]) cylinder(d = 8, h = plate + 2, $fn = 48);\n}\n")
add("openscad-script", "bracket.scad", "The site's L-bracket as an OpenSCAD script: two plates joined, then three holes cut with difference().", "hand-written")

# 3D printing G-code (FDM), next to the milling program: what a slicer sends to a printer.
write("gcode", "square-print.gcode", '; 3D printing G-code for a small 20 x 20 mm square, two layers (FDM, 0.4 mm nozzle).\n; Example for the engineering map, CC0. Illustrative only: slicers add many more moves.\nM140 S60 ; heat the bed to 60 C\nM104 S210 ; heat the nozzle to 210 C\nM190 S60 ; wait for the bed\nM109 S210 ; wait for the nozzle\nG21 ; millimeters\nG90 ; absolute positions\nM82 ; absolute extrusion\nG28 ; home all axes\nG92 E0 ; reset the extruder position\n;LAYER:0\nG1 Z0.2 F1200 ; first layer height\nG0 X100 Y100 F6000\nG1 X120 Y100 E0.8 F1200 ; extrude plastic along one side\nG1 X120 Y120 E1.6\nG1 X100 Y120 E2.4\nG1 X100 Y100 E3.2\n;LAYER:1\nG1 Z0.4 F1200\nG1 X120 Y100 E4.0\nG1 X120 Y120 E4.8\nG1 X100 Y120 E5.6\nG1 X100 Y100 E6.4\nG1 E5.6 F2400 ; retract a little filament\nM104 S0 ; nozzle heater off\nM140 S0 ; bed heater off\nG28 X0 ; move the head out of the way\nM84 ; motors off\n')
add("gcode", "square-print.gcode", "3D printer G-code (FDM) for a 20 x 20 mm square, two layers: heater and homing commands, then moves with E (extruded filament) values. Hand-written, illustrative.", "hand-written")

# ---------------------------------------------------------------- volume mesh (Gmsh) and conversions (meshio)
import gmsh
import meshio

gmsh.initialize()
gmsh.option.setNumber("General.Terminal", 0)
gmsh.model.add("bracket")
gmsh.model.occ.importShapes(step)
gmsh.model.occ.synchronize()
vols = [t for d, t in gmsh.model.getEntities(3)]
gmsh.model.addPhysicalGroup(3, vols, 1, "bracket")
bottom = [t for d, t in gmsh.model.getEntities(2)
          if abs(gmsh.model.occ.getCenterOfMass(2, t)[2]) < 1e-6]
gmsh.model.addPhysicalGroup(2, bottom, 2, "fixed_base")
gmsh.option.setNumber("Mesh.MeshSizeMax", 4.0)
gmsh.option.setNumber("Mesh.MeshSizeMin", 1.5)
gmsh.model.mesh.generate(3)
gmsh.option.setNumber("Mesh.MshFileVersion", 4.1)
gmsh.write(path("gmsh-msh", "bracket.msh"))
# Solver decks get the volume only: a physical surface would be written as shell/membrane
# elements (CPS3, CTRIA3), which a solver would treat as real structure.
gmsh.model.removePhysicalGroups([(2, 2)])
gmsh.write(path("abaqus-inp", "bracket.inp"))
gmsh.option.setNumber("Mesh.BdfFieldFormat", 1)
gmsh.write(path("nastran-bdf", "bracket.bdf"))
nodes = len(gmsh.model.mesh.getNodes()[0])
gmsh.finalize()
gv = "Gmsh %s" % gmsh.__version__
add("gmsh-msh", "bracket.msh", "Linear tetrahedral mesh of the bracket (%d nodes), physical groups bracket and fixed_base, MSH 4.1 ASCII (the fixed_base surface group is in this file only)." % nodes, gv)
add("abaqus-inp", "bracket.inp", "Mesh-only Abaqus/CalculiX input: nodes and C3D4 elements in one element set. No materials, sections, steps or loads.", gv)
add("nastran-bdf", "bracket.bdf", "Mesh-only Nastran bulk data: GRID and CTETRA cards for the bracket. No properties, materials or subcases.", gv)

msh = meshio.read(path("gmsh-msh", "bracket.msh"))
tets = [c for c in msh.cells if c.type == "tetra"]
pts = msh.points
height = pts[:, 2].astype(float)
vm = meshio.Mesh(pts, [("tetra", np.vstack([c.data for c in tets]))], point_data={"z_height_mm": height})
FIELD = " One point field, z_height_mm (each node's height), so the file has data to plot; it is not a simulation result."
mv = "meshio %s" % meshio.__version__
meshio.write(path("vtk-legacy", "bracket.vtk"), vm, file_format="vtk", binary=False)
add("vtk-legacy", "bracket.vtk", "Legacy VTK ASCII unstructured grid of the bracket tetrahedra." + FIELD, mv)
meshio.write(path("vtk-xml", "bracket.vtu"), vm, file_format="vtu")
add("vtk-xml", "bracket.vtu", "VTK XML unstructured grid (.vtu, base64 binary) of the bracket tetrahedra." + FIELD, mv)
meshio.write(path("xdmf", "bracket.xdmf"), vm, file_format="xdmf")
add("xdmf", "bracket.xdmf", "XDMF 3 description of the bracket mesh; heavy data lives in bracket.h5 next to it." + FIELD, mv)
add("xdmf", "bracket.h5", "HDF5 companion of bracket.xdmf (point coordinates, connectivity, field).", mv)
add("hdf5", "bracket.h5", "Plain HDF5 file with the bracket mesh arrays (the heavy-data half of the XDMF example; open it with h5py or HDFView).", mv, folder="xdmf")
meshio.write(path("exodus", "bracket.exo"), vm, file_format="exodus")
add("exodus", "bracket.exo", "Exodus II (netCDF) mesh of the bracket, one tetra block." + FIELD, mv)
meshio.write(path("cgns", "bracket.cgns"), meshio.Mesh(pts, [("tetra", np.vstack([c.data for c in tets]))]), file_format="cgns")
add("cgns", "bracket.cgns", "CGNS (HDF5) unstructured zone with the bracket tetrahedra.", mv)
meshio.write(path("med", "bracket.med"), meshio.Mesh(pts, [("tetra", np.vstack([c.data for c in tets]))]), file_format="med")
add("med", "bracket.med", "MED (HDF5, SALOME) mesh of the bracket tetrahedra.", mv)
meshio.write(path("tecplot-plt", "bracket.dat"), vm, file_format="tecplot")
add("tecplot-plt", "bracket.dat", "Tecplot ASCII data file (.dat, FETETRAHEDRON zone) of the bracket. The binary .plt and .szplt forms are Tecplot's own and are not reproduced here." + FIELD, mv)

# ---------------------------------------------------------------- text formats authored here
write("verilog", "counter.v", """// 8-bit up counter with synchronous reset and enable. Example for the engineering map (CC0).
module counter #(parameter WIDTH = 8) (
    input  wire             clk,
    input  wire             rst,
    input  wire             en,
    output reg  [WIDTH-1:0] count
);
    always @(posedge clk) begin
        if (rst)
            count <= {WIDTH{1'b0}};
        else if (en)
            count <= count + 1'b1;
    end
endmodule
""")
add("verilog", "counter.v", "An 8-bit synchronous up counter with reset and enable (Verilog-2001).", "hand-written")

write("spice", "rc-lowpass.cir", """* RC low-pass filter, corner near 1.59 kHz. Example for the engineering map (CC0).
V1 in 0 AC 1 SIN(0 1 1k)
R1 in out 1k
C1 out 0 100n
.ac dec 20 10 1meg
.tran 10u 5m
.end
""")
add("spice", "rc-lowpass.cir", "A first-order RC low-pass netlist (1 kOhm, 100 nF) with AC sweep and transient analyses.", "hand-written")

write("modelica", "SpringMass.mo", """within ;
model SpringMass "Undamped mass on a linear spring; example for the engineering map (CC0)"
  parameter Real m(unit="kg") = 1.0 "Mass";
  parameter Real k(unit="N/m") = 100.0 "Spring stiffness";
  Real x(unit="m", start=0.01, fixed=true) "Displacement";
  Real v(unit="m/s", start=0, fixed=true) "Velocity";
equation
  der(x) = v;
  m*der(v) = -k*x;
  annotation(experiment(StopTime=2.0));
end SpringMass;
""")
add("modelica", "SpringMass.mo", "A one-degree-of-freedom spring and mass model with an experiment annotation.", "hand-written")

write("sysml", "bracket.sysml", """// SysML v2 textual notation. Example for the engineering map (CC0).
package BracketExample {
    private import ScalarValues::*;

    part def Bracket {
        attribute massKg : Real;
        attribute material : String;
        port mountingHoles[3];
    }

    part def Frame;

    part assembly {
        part frame : Frame;
        part bracket : Bracket {
            attribute redefines massKg = 0.08;
            attribute redefines material = "6061-T6";
        }
    }
}
""")
add("sysml", "bracket.sysml", "SysML v2 textual model: a Bracket part definition with attributes and ports, used in a small assembly.", "hand-written")

write("urdf", "two-link-arm.urdf", """<?xml version="1.0"?>
<!-- Planar two-link arm on a base. Example for the engineering map (CC0). -->
<robot name="two_link_arm">
  <link name="base">
    <visual><geometry><box size="0.2 0.2 0.05"/></geometry></visual>
    <collision><geometry><box size="0.2 0.2 0.05"/></geometry></collision>
    <inertial><mass value="2.0"/><inertia ixx="0.007" ixy="0" ixz="0" iyy="0.007" iyz="0" izz="0.013"/></inertial>
  </link>
  <link name="link1">
    <visual><origin xyz="0 0 0.15"/><geometry><cylinder radius="0.02" length="0.3"/></geometry></visual>
    <inertial><origin xyz="0 0 0.15"/><mass value="0.5"/><inertia ixx="0.0038" ixy="0" ixz="0" iyy="0.0038" iyz="0" izz="0.0001"/></inertial>
  </link>
  <link name="link2">
    <visual><origin xyz="0 0 0.125"/><geometry><cylinder radius="0.015" length="0.25"/></geometry></visual>
    <inertial><origin xyz="0 0 0.125"/><mass value="0.3"/><inertia ixx="0.0016" ixy="0" ixz="0" iyy="0.0016" iyz="0" izz="0.00003"/></inertial>
  </link>
  <joint name="shoulder" type="revolute">
    <parent link="base"/><child link="link1"/>
    <origin xyz="0 0 0.025"/><axis xyz="0 1 0"/>
    <limit lower="-1.57" upper="1.57" effort="20" velocity="2"/>
  </joint>
  <joint name="elbow" type="revolute">
    <parent link="link1"/><child link="link2"/>
    <origin xyz="0 0 0.3"/><axis xyz="0 1 0"/>
    <limit lower="-2.5" upper="2.5" effort="10" velocity="3"/>
  </joint>
</robot>
""")
add("urdf", "two-link-arm.urdf", "A planar two-link arm: three links with inertias and two revolute joints with limits.", "hand-written")

write("sdformat", "two-link-arm.sdf", """<?xml version="1.0"?>
<!-- The same two-link arm in SDFormat 1.9. Example for the engineering map (CC0). -->
<sdf version="1.9">
  <model name="two_link_arm">
    <link name="base">
      <inertial><mass>2.0</mass></inertial>
      <visual name="v"><geometry><box><size>0.2 0.2 0.05</size></box></geometry></visual>
      <collision name="c"><geometry><box><size>0.2 0.2 0.05</size></box></geometry></collision>
    </link>
    <link name="link1">
      <pose>0 0 0.175 0 0 0</pose>
      <inertial><mass>0.5</mass></inertial>
      <visual name="v"><geometry><cylinder><radius>0.02</radius><length>0.3</length></cylinder></geometry></visual>
    </link>
    <link name="link2">
      <pose>0 0 0.45 0 0 0</pose>
      <inertial><mass>0.3</mass></inertial>
      <visual name="v"><geometry><cylinder><radius>0.015</radius><length>0.25</length></cylinder></geometry></visual>
    </link>
    <joint name="shoulder" type="revolute">
      <parent>base</parent><child>link1</child>
      <pose>0 0 -0.15 0 0 0</pose>
      <axis><xyz>0 1 0</xyz><limit><lower>-1.57</lower><upper>1.57</upper></limit></axis>
    </joint>
    <joint name="elbow" type="revolute">
      <parent>link1</parent><child>link2</child>
      <pose>0 0 -0.125 0 0 0</pose>
      <axis><xyz>0 1 0</xyz><limit><lower>-2.5</lower><upper>2.5</upper></limit></axis>
    </joint>
  </model>
</sdf>
""")
add("sdformat", "two-link-arm.sdf", "The same two-link arm as an SDFormat 1.9 model (poses, links, revolute joints).", "hand-written")

write("mjcf", "two-link-arm.xml", """<!-- The same two-link arm in MuJoCo MJCF. Example for the engineering map (CC0). -->
<mujoco model="two_link_arm">
  <option timestep="0.002" gravity="0 0 -9.81"/>
  <worldbody>
    <light pos="0 0 2"/>
    <geom name="floor" type="plane" size="1 1 0.1"/>
    <body name="base" pos="0 0 0.025">
      <geom type="box" size="0.1 0.1 0.025" mass="2"/>
      <body name="link1" pos="0 0 0.025">
        <joint name="shoulder" type="hinge" axis="0 1 0" range="-1.57 1.57"/>
        <geom type="capsule" fromto="0 0 0 0 0 0.3" size="0.02" mass="0.5"/>
        <body name="link2" pos="0 0 0.3">
          <joint name="elbow" type="hinge" axis="0 1 0" range="-2.5 2.5"/>
          <geom type="capsule" fromto="0 0 0 0 0 0.25" size="0.015" mass="0.3"/>
        </body>
      </body>
    </body>
  </worldbody>
  <actuator>
    <motor joint="shoulder" gear="20" ctrlrange="-1 1"/>
    <motor joint="elbow" gear="10" ctrlrange="-1 1"/>
  </actuator>
</mujoco>
""")
add("mjcf", "two-link-arm.xml", "The same two-link arm in MJCF with hinge joints, capsule geoms and two motors.", "hand-written")

# G-code: one profile pass around the bracket base outline (illustrative, not for a real machine).
write("gcode", "bracket-profile.nc", """(Profile pass around a 60 x 40 mm plate, 6 mm end mill, climb milling)
(Example for the engineering map, CC0. Illustrative only: check against your machine before use.)
G21 G90 G17 G94
G54
T1 M6
S8000 M3
G0 X-33 Y-23
G0 Z5
G1 Z-6.5 F300
G1 X33 F800
G1 Y23
G1 X-33
G1 Y-23
G0 Z5
M5
G0 X0 Y0
M30
""")
add("gcode", "bracket-profile.nc", "A single profile pass (ISO/Fanuc-style G-code) around the 60 x 40 mm bracket base with a 6 mm cutter offset. Illustrative, not post-processed for a specific machine.", "hand-written")

# Gerber X2 board outline and copper, plus Excellon drill, for a 30 x 20 mm board with 4 holes.
def gx(mm):
    return "%d" % round(mm * 1e6)

outline = ["%TF.GenerationSoftware,engineering-map,gen_examples,1*%", "%TF.FileFunction,Profile,NP*%",
           "%FSLAX46Y46*%", "%MOMM*%", "%ADD10C,0.100000*%", "D10*",
           "X%sY%sD02*" % (gx(0), gx(0))]
for x, y in [(30, 0), (30, 20), (0, 20), (0, 0)]:
    outline.append("X%sY%sD01*" % (gx(x), gx(y)))
outline.append("M02*")
write("gerber", "board-outline.gbr", "\n".join(outline) + "\n")
add("gerber", "board-outline.gbr", "Gerber X2 board profile: a 30 x 20 mm rectangle in a 0.1 mm line.", "this script (plain text writer)")

holes = [(3, 3), (27, 3), (27, 17), (3, 17)]
cu = ["%TF.GenerationSoftware,engineering-map,gen_examples,1*%", "%TF.FileFunction,Copper,L1,Top*%",
      "%FSLAX46Y46*%", "%MOMM*%", "%ADD10C,2.400000*%", "%ADD11R,1.500000X1.000000*%", "%ADD12C,0.300000*%", "D10*"]
cu += ["X%sY%sD03*" % (gx(x), gx(y)) for x, y in holes]
cu += ["D11*", "X%sY%sD03*" % (gx(13), gx(10)), "X%sY%sD03*" % (gx(17), gx(10)),
       "D12*", "X%sY%sD02*" % (gx(13), gx(10)), "X%sY%sD01*" % (gx(3), gx(3)),
       "X%sY%sD02*" % (gx(17), gx(10)), "X%sY%sD01*" % (gx(27), gx(17)), "M02*"]
write("gerber", "board-top-copper.gbr", "\n".join(cu) + "\n")
add("gerber", "board-top-copper.gbr", "Gerber X2 top copper for the same board: four mounting-hole pads, two SMD pads and two 0.3 mm tracks.", "this script (plain text writer)")

drl = ["M48", "; Example for the engineering map (CC0)", "METRIC,TZ", "T1C1.600", "%", "G90", "G05", "T1"]
drl += ["X%.3fY%.3f" % (x, y) for x, y in holes] + ["M30"]
write("excellon", "board.drl", "\n".join(drl) + "\n")
add("excellon", "board.drl", "Excellon drill file for the same board: four 1.6 mm plated holes in millimeters.", "this script (plain text writer)")

# GDSII and OASIS: a small test cell (ring of boxes and a label) with gdstk.
import gdstk

lib = gdstk.Library("ENGMAP_EXAMPLE", unit=1e-6, precision=1e-9)
cell = lib.new_cell("TEST_CELL")
cell.add(gdstk.rectangle((0, 0), (20, 20), layer=1))
cell.add(gdstk.rectangle((4, 4), (16, 16), layer=2))
for i in range(4):
    cell.add(gdstk.rectangle((22 + 6 * i, 0), (26 + 6 * i, 4), layer=3))
cell.add(gdstk.Label("ENGMAP", (0, 22), layer=10))
top = lib.new_cell("TOP")
top.add(gdstk.Reference(cell, (0, 0), columns=2, rows=2, spacing=(50, 30)))
lib.write_gds(path("gdsii", "test-cell.gds"))
add("gdsii", "test-cell.gds", "GDSII stream: a TEST_CELL (boxes on layers 1 to 3 and a text label) placed as a 2 x 2 array in TOP; 1 um units.", "gdstk %s" % gdstk.__version__)
lib.write_oas(path("oasis", "test-cell.oas"))
add("oasis", "test-cell.oas", "The same layout as OASIS (SEMI P39).", "gdstk %s" % gdstk.__version__)

# ---------------------------------------------------------------- manifest
import yaml

os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
with open(MANIFEST, "w") as fh:
    fh.write("# Generated by scripts/gen_examples.py. Do not edit by hand; rerun the script.\n")
    yaml.safe_dump({"examples": entries}, fh, sort_keys=False, width=100, allow_unicode=False)
total = sum(e["size"] for e in entries)
print("%d files, %.2f MB" % (len(entries), total / 1e6))
if any(e["size"] > 5e6 for e in entries) or total > 100e6:
    sys.exit("size budget exceeded")
