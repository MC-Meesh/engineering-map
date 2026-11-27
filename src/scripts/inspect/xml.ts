// XML-based formats: one structural pass that finds element spans by line, then a
// per-format dictionary that explains the elements (from each format's published schema
// or specification).
import type { Item, Note, TextDoc } from './types';
import { TOK } from './tok';

const DICTS: Record<string, { summary: string; el: Record<string, string> }> = {
  qif: { summary: 'QIF (ANSI/DMSC Quality Information Framework) document: XML validated by the QIF schemas. Product definition, features, characteristics and, when present, measurement results, all cross-referenced by numeric ids.', el: { QIFDocument: 'Root element; carries the QIF version and schema location.', Version: 'Document version and a unique id.', Header: 'Author, organization, application and scope.', FileUnits: 'Units for length, angle and others.', DatumDefinitions: 'Datum definitions referenced by characteristics.', Product: 'The product: parts, assemblies and their geometry and topology.', PartSet: 'Parts.', FeatureDefinitions: 'Feature definitions (shape types such as a cylinder of a given size).', FeatureNominals: 'Nominal features: definition plus location in the part.', FeatureItems: 'Feature items: what is inspected.', Characteristics: 'Tolerances and dimensions (GD&T): definitions, nominals and items.', CharacteristicDefinitions: 'Characteristic definitions: tolerance type and value.', CharacteristicNominals: 'Nominal characteristics tied to features and datums.', CharacteristicItems: 'Characteristic items to be measured.', MeasurementResources: 'Measurement equipment.', MeasurementsResults: 'Measured values.', Statistics: 'Statistical results.' } },
  reqif: { summary: 'ReqIF (OMG Requirements Interchange Format): requirements with typed attributes, organized in specifications, all referenced by identifiers.', el: { 'REQ-IF': 'Root element.', 'THE-HEADER': 'Header container.', 'REQ-IF-HEADER': 'Creation time, tool, title and ReqIF version.', 'CORE-CONTENT': 'Holds the content.', 'REQ-IF-CONTENT': 'Data types, specification types, objects, relations and specifications.', DATATYPES: 'Data type definitions (string, integer, enumeration, XHTML).', 'SPEC-TYPES': 'Types for objects, specifications and relations, with their attribute definitions.', 'SPEC-OBJECTS': 'The requirements themselves, each with attribute values.', 'SPEC-OBJECT': 'One requirement.', 'SPEC-RELATIONS': 'Links between requirements.', SPECIFICATIONS: 'Documents: hierarchies that arrange the spec objects.', 'SPEC-HIERARCHY': 'One node in a specification tree, pointing to a spec object.', 'ATTRIBUTE-VALUE-STRING': 'A string attribute value.' } },
  amf: { summary: 'AMF (ISO/ASTM 52915 Additive Manufacturing File): XML with objects made of a vertex list and triangle volumes, plus units and optional materials.', el: { amf: 'Root element; the unit attribute sets the length unit.', object: 'An object to be built.', mesh: 'The object mesh: vertices, then volumes.', vertices: 'Shared vertex list.', vertex: 'A vertex.', coordinates: 'x, y, z of a vertex.', volume: 'A closed volume made of triangles; may reference a material.', triangle: 'A triangle: v1, v2, v3 are 0-based vertex indices.', metadata: 'Name-value metadata.', material: 'A material definition.' } },
  urdf: { summary: 'URDF (Unified Robot Description Format, ROS): links (rigid bodies with visual, collision and inertial data) joined by joints into a tree.', el: { robot: 'Root element: the robot name.', link: 'A rigid body.', visual: 'What the link looks like.', collision: 'Shape used for collision checking.', inertial: 'Mass, center of mass and inertia tensor.', geometry: 'A box, cylinder, sphere or mesh.', joint: 'A joint between a parent and a child link: type (revolute, prismatic, fixed, continuous).', parent: 'Parent link.', child: 'Child link.', origin: 'Pose: xyz and roll-pitch-yaw.', axis: 'Joint axis.', limit: 'Joint limits: lower, upper, effort, velocity.', material: 'Color or texture.' } },
  sdformat: { summary: 'SDFormat (Gazebo): models with links, joints, sensors and plugins; poses are explicit.', el: { sdf: 'Root element with the SDFormat version.', model: 'A model.', link: 'A rigid body.', pose: 'Position and orientation (x y z roll pitch yaw).', inertial: 'Mass and inertia.', collision: 'Collision geometry.', visual: 'Visual geometry.', geometry: 'Shape.', joint: 'A joint: type, parent, child and axis.', axis: 'Joint axis and limits.', world: 'A simulation world.' } },
  mjcf: { summary: 'MJCF (MuJoCo XML): a kinematic tree of nested bodies with geoms and joints, plus compiler options and actuators.', el: { mujoco: 'Root element: the model name.', compiler: 'Compiler settings, such as angle units.', option: 'Simulation options: timestep, gravity, integrator.', worldbody: 'The world body; bodies nest inside it to form the tree.', body: 'A body: its pose relative to its parent.', geom: 'Collision and visual geometry attached to a body.', joint: 'A joint giving the body degrees of freedom relative to its parent.', actuator: 'Actuators section.', motor: 'A motor acting on a joint.', default: 'Default attribute values.' } },
  xdmf: { summary: 'XDMF: light data in XML (this file) that describes heavy data stored in HDF5. Each DataItem points into the .h5 file by path.', el: { Xdmf: 'Root element with the XDMF version.', Domain: 'Holds grids.', Grid: 'A mesh with its topology, geometry and attributes.', Topology: 'Cell type and count (Tetrahedron here).', Geometry: 'How node coordinates are stored (XYZ: interleaved).', DataItem: 'An array: dimensions, number type and where it lives ("file.h5:/path" for HDF5).', Attribute: 'A field on the mesh: name and center (Node or Cell).', Information: 'Name-value information.' } },
  vtu: { summary: 'VTK XML unstructured grid (.vtu): XML structure with DataArrays. Here arrays are format="binary": base64 text of zlib-compressed blocks, each array prefixed with a header (block count, block size, last block size, compressed sizes).', el: { VTKFile: 'Root: dataset type, version, byte order, header type and compressor.', UnstructuredGrid: 'An unstructured grid dataset.', Piece: 'A piece of the dataset: NumberOfPoints and NumberOfCells.', Points: 'Point coordinates (one DataArray with 3 components).', Cells: 'Cell connectivity, offsets and types arrays.', PointData: 'Arrays attached to points.', CellData: 'Arrays attached to cells.', DataArray: 'An array: type, name, number of components and format (ascii, binary or appended).', FieldData: 'Arrays not attached to points or cells.' } },
  '3mf': { summary: '3MF model part: XML with resources (objects with meshes) and a build list that places them.', el: { model: 'Root: unit and namespaces.', metadata: 'Name-value metadata.', resources: 'Objects and materials.', object: 'An object: type (model, support) and a mesh or components.', mesh: 'Vertices, then triangles.', vertices: 'Vertex list.', vertex: 'x, y, z.', triangles: 'Triangle list.', triangle: 'v1, v2, v3: 0-based vertex indices.', build: 'What to print: items placing objects.', item: 'A build item: object id and optional transform.' } },
};

export function xml(src: string, kind: keyof typeof DICTS | string): TextDoc {
  const lines = src.split(/\r?\n/);
  const d = DICTS[kind] ?? { summary: 'XML document.', el: {} };
  const items: Item[] = [];
  const stack: { name: string; item?: Item }[] = [];
  const tagRe = /<(\/?)([\w:.-]+)[^>]*?(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
  const lineStarts: number[] = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const lineAt = (pos: number) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStarts[m] <= pos) lo = m; else hi = m - 1; } return lo; };
  const counts = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    if (!m[2]) continue;
    const name = m[2].replace(/^\w+:/, '');
    const ln = lineAt(m.index);
    if (m[1]) {
      const top = stack.pop();
      if (top?.item) top.item.to = ln + 1;
      continue;
    }
    const depth = stack.length;
    let item: Item | undefined;
    // Outline: the first two levels, plus any element the dictionary explains, capped per name.
    const c = (counts.get(name) ?? 0) + 1;
    counts.set(name, c);
    if ((depth <= 2 || d.el[name]) && depth <= 5 && c <= 12) {
      item = { label: `<${m[2]}>`, note: d.el[name] ?? 'Element.', depth: Math.min(depth, 4), from: ln, to: ln + 1 };
      items.push(item);
    }
    if (!m[3]) stack.push({ name, item });
  }
  const lineNote = (i: number): Note | null => {
    const tag = lines[i].match(/<\/?([\w:.-]+)/);
    if (kind === 'vtu' && !tag && /^\s*[A-Za-z0-9+/=]{16,}/.test(lines[i])) return vtuHeader(lines[i], src);
    if (!tag) return null;
    const name = tag[1].replace(/^\w+:/, '');
    const attrs = [...lines[i].matchAll(/([\w:.-]+)="([^"]*)"/g)].map((a) => `${a[1]} = ${a[2]}`).join('; ');
    return { title: `<${tag[1]}>`, value: attrs || undefined, text: d.el[name] ?? 'Element.' };
  };
  return { kind: 'text', lines, items, tok: TOK.xml, lineNote, summary: d.summary };
}

// The first bytes of a VTK binary DataArray, decoded: the compression header.
function vtuHeader(line: string, src: string): Note {
  const b64 = line.trim().slice(0, 64);
  const u64 = /header_type="UInt64"/.test(src);
  try {
    const bin = atob(b64.slice(0, Math.floor(b64.length / 4) * 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const dv = new DataView(bytes.buffer);
    const w = u64 ? 8 : 4;
    const get = (k: number) => (u64 ? Number(dv.getBigUint64(k * w, true)) : dv.getUint32(k * w, true));
    const n = get(0);
    const vals = [`${n} block${n === 1 ? '' : 's'}`, `block size ${get(1)} bytes`, `last block ${get(2)} bytes`];
    if (bytes.length >= (4 + Math.min(n, 1)) * w) vals.push(`first block compressed to ${get(3)} bytes`);
    return { title: 'Binary DataArray (base64)', value: vals.join(', '), text: `Decoded from the first characters: the ${u64 ? 'UInt64' : 'UInt32'} header that precedes the zlib-compressed blocks. The data after it inflates to the raw array.` };
  } catch {
    return { title: 'Binary DataArray (base64)', text: 'Base64 text of a header and zlib-compressed blocks.' };
  }
}
