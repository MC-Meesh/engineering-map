// Annotators for text formats. Each one reads the file the way its published specification
// describes it and returns an outline (Items over line ranges), a tokenizer and per-line notes.
// Sources are listed per format in docs/decisions/0006-format-inspector.md.
import type { Item, Note, TextDoc } from './types';
import { esc } from './types';
import { rules, TOK } from './tok';

const NUM_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?/;
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

/** Items for runs of lines that start with the same keyword (blocks run to the next keyword line). */
function blocks(lines: string[], isHead: (l: string) => string | null, note: (k: string, line: string) => string | undefined, depth = 0): Item[] {
  const out: Item[] = [];
  let cur: Item | null = null;
  lines.forEach((l, i) => {
    const k = isHead(l);
    if (k === null) return;
    if (cur) cur.to = i;
    cur = { label: k, note: note(k, l), depth, from: i, to: lines.length };
    out.push(cur);
  });
  return out;
}
/** Groups repeated keyword blocks so the outline stays short: one entry per keyword with jumps. */
function groupRepeats(items: Item[], max = 60): Item[] {
  if (items.length <= max) return items;
  const by = new Map<string, Item[]>();
  for (const it of items) { if (!by.has(it.label)) by.set(it.label, []); by.get(it.label)!.push(it); }
  return [...by.values()].map((g) => ({ ...g[0], label: g.length > 1 ? `${g[0].label} (${g.length})` : g[0].label, jumps: g.length > 1 ? g.map((x) => x.from) : undefined })).sort((a, b) => a.from - b.from);
}

// ---------------------------------------------------------------- STEP and IFC (ISO 10303-21)
const P21_HEAD: Record<string, string> = {
  'ISO-10303-21': 'Opens an exchange structure in the clear text encoding of ISO 10303-21 (STEP Part 21).',
  HEADER: 'Header section: three required instances that describe the file, not the product.',
  FILE_DESCRIPTION: 'Free text description, then the implementation level ("2;1" is edition 2, conformance class 1).',
  FILE_NAME: 'Name, time stamp, author, organization, preprocessor version (the program that wrote the file), originating system and authorization.',
  FILE_SCHEMA: 'The EXPRESS schema the data section follows. AUTOMOTIVE_DESIGN is AP214, CONFIG_CONTROL_DESIGN is AP203, AP242_MANAGED_MODEL_BASED_3D_ENGINEERING is AP242; IFC2X3 or IFC4 for building models.',
  ENDSEC: 'Closes a section.',
  DATA: 'Data section: one instance per statement, written "#id = TYPE(arguments);". Arguments refer to other instances by #id, $ means not set and * means derived. Instances can appear in any order.',
  'END-ISO-10303-21': 'Closes the exchange structure.',
};
const STEP_TYPES: Record<string, string> = {
  CARTESIAN_POINT: 'A point: a name and its coordinates.',
  DIRECTION: 'A direction vector (not normalized by the format).',
  VECTOR: 'A direction plus a magnitude.',
  AXIS2_PLACEMENT_3D: 'A local coordinate system: origin point, Z axis direction and reference X direction.',
  AXIS2_PLACEMENT_2D: 'A 2D placement in a parameter space, used by pcurves.',
  LINE: 'An unbounded line: a point and a vector. The edge that uses it supplies the bounds.',
  CIRCLE: 'A circle: a placement and a radius.',
  PLANE: 'An unbounded plane, given by a placement.',
  CYLINDRICAL_SURFACE: 'An unbounded cylinder: a placement and a radius. Holes are faces on these.',
  TOROIDAL_SURFACE: 'A torus: placement, major radius and minor radius. Fillets around a bend often use these.',
  B_SPLINE_CURVE_WITH_KNOTS: 'A B-spline curve: degree, control points, knot multiplicities and knot values.',
  B_SPLINE_SURFACE_WITH_KNOTS: 'A B-spline surface: degrees, a grid of control points, knots in u and v.',
  VERTEX_POINT: 'A topological vertex, placed at a CARTESIAN_POINT.',
  EDGE_CURVE: 'A topological edge: start vertex, end vertex, the curve it lies on, and whether it runs along the curve.',
  ORIENTED_EDGE: 'An edge used in a loop, with a direction flag (.T. along the edge, .F. against it).',
  EDGE_LOOP: 'A closed chain of oriented edges.',
  FACE_BOUND: 'A loop that bounds a face (an inner loop, such as a hole outline, or any loop when there is no outer one).',
  FACE_OUTER_BOUND: 'The outer loop of a face.',
  ADVANCED_FACE: 'A face: its bounding loops, the surface it lies on, and whether its normal agrees with the surface normal.',
  CLOSED_SHELL: 'A closed set of faces enclosing a volume.',
  MANIFOLD_SOLID_BREP: 'A solid bounded by one closed shell: the B-rep body itself.',
  ADVANCED_BREP_SHAPE_REPRESENTATION: 'The shape representation that holds the B-rep solid, with its unit and tolerance context.',
  SURFACE_CURVE: 'A curve that lies on surfaces, carrying its 3D curve and its pcurves on each surface.',
  SEAM_CURVE: 'A surface curve where a closed surface (such as a cylinder) meets itself.',
  PCURVE: 'A curve in the 2D parameter space of a surface.',
  DEFINITIONAL_REPRESENTATION: 'Holds the 2D curve of a pcurve together with its parameter space context.',
  PRODUCT: 'The product (part): id, name, description and the contexts it belongs to.',
  PRODUCT_DEFINITION_FORMATION: 'A version of the product.',
  PRODUCT_DEFINITION: 'A view of a product version, here the design view.',
  PRODUCT_DEFINITION_SHAPE: 'Says the product definition has a shape.',
  SHAPE_DEFINITION_REPRESENTATION: 'Links the product shape to the representation that carries the geometry.',
  PRODUCT_CONTEXT: 'The discipline the product belongs to (mechanical).',
  PRODUCT_DEFINITION_CONTEXT: 'The life cycle stage of the definition (design).',
  APPLICATION_CONTEXT: 'The application this data was made for.',
  APPLICATION_PROTOCOL_DEFINITION: 'Names the application protocol (for example automotive_design, AP214) and its year.',
  PRODUCT_RELATED_PRODUCT_CATEGORY: 'A category for the product (part, assembly).',
  UNCERTAINTY_MEASURE_WITH_UNIT: 'The modeling tolerance: distances below this value count as equal.',
  STYLED_ITEM: 'Presentation: attaches a style (such as a color) to a geometric item.',
  COLOUR_RGB: 'A color as red, green and blue from 0 to 1.',
};
const IFC_TYPES: Record<string, string> = {
  IFCPROJECT: 'The project: root of the spatial structure, with units and the representation context.',
  IFCSITE: 'The site, part of the spatial structure (project > site > building > storey).',
  IFCBUILDING: 'A building in the spatial structure.',
  IFCBUILDINGSTOREY: 'A storey (floor level) of a building.',
  IFCSPACE: 'A space (room or area).',
  IFCWALL: 'A wall element.',
  IFCWALLSTANDARDCASE: 'A wall with a constant thickness along its path.',
  IFCSLAB: 'A slab (floor, roof or landing).',
  IFCWINDOW: 'A window.',
  IFCDOOR: 'A door.',
  IFCCOLUMN: 'A column.',
  IFCBEAM: 'A beam.',
  IFCOWNERHISTORY: 'Who created or changed an object, with which application, and when.',
  IFCPERSON: 'A person.',
  IFCORGANIZATION: 'An organization.',
  IFCAPPLICATION: 'The software that wrote the data.',
  IFCLOCALPLACEMENT: 'Places an object relative to another placement.',
  IFCAXIS2PLACEMENT3D: 'A local coordinate system.',
  IFCCARTESIANPOINT: 'A point.',
  IFCDIRECTION: 'A direction.',
  IFCSHAPEREPRESENTATION: 'A geometric representation of a product (for example "Body" as a swept solid or B-rep).',
  IFCPRODUCTDEFINITIONSHAPE: 'Collects the shape representations of a product.',
  IFCEXTRUDEDAREASOLID: 'A solid made by extruding a 2D profile along a direction.',
  IFCRELAGGREGATES: 'Decomposition: the whole and its parts (project into site, building into storeys).',
  IFCRELCONTAINEDINSPATIALSTRUCTURE: 'Puts elements into a spatial container such as a storey.',
  IFCPROPERTYSET: 'A named set of properties.',
  IFCPROPERTYSINGLEVALUE: 'One property: name and value.',
  IFCRELDEFINESBYPROPERTIES: 'Attaches a property set to objects.',
  IFCMATERIAL: 'A material.',
  IFCRELASSOCIATESMATERIAL: 'Associates a material with elements.',
  IFCGEOMETRICREPRESENTATIONCONTEXT: 'The coordinate space, precision and true north for geometry.',
  IFCUNITASSIGNMENT: 'The units used in the project.',
  IFCSIUNIT: 'An SI unit, with an optional prefix such as MILLI.',
};

export function p21(src: string, kind: 'step' | 'ifc'): TextDoc {
  const lines = src.split(/\r?\n/);
  const dict = kind === 'ifc' ? IFC_TYPES : STEP_TYPES;
  const stmtOf = new Int32Array(lines.length);
  const refs = new Map<string, number>();
  const types = new Map<string, number[]>();
  const items: Item[] = [];
  let start = 0, inStr = false, open = true;
  let headerAt = -1, dataAt = -1, endsec: number[] = [];
  const stmtType = new Map<number, string>();
  for (let i = 0; i < lines.length; i++) {
    if (open) { start = i; open = false; }
    stmtOf[i] = start;
    for (const ch of lines[i]) { if (ch === "'") inStr = !inStr; else if (ch === ';' && !inStr) open = true; }
    if (start === i) {
      const t = lines[i].trim();
      const m = t.match(/^#(\d+)\s*=\s*([A-Z][A-Z0-9_]*)?/i);
      if (m) {
        refs.set(`#${m[1]}`, i);
        const ty = (m[2] ?? 'complex').toUpperCase();
        stmtType.set(i, ty);
        if (!types.has(ty)) types.set(ty, []);
        types.get(ty)!.push(i);
      } else if (/^HEADER;/.test(t)) headerAt = i;
      else if (/^DATA;/.test(t)) dataAt = i;
      else if (/^ENDSEC;/.test(t)) endsec.push(i);
      else {
        const h = t.match(/^([A-Z_]+)\s*\(/);
        if (h && P21_HEAD[h[1]]) stmtType.set(i, h[1]);
      }
    }
  }
  if (headerAt >= 0) {
    const end = endsec.find((e) => e > headerAt) ?? headerAt;
    items.push({ label: 'HEADER section', note: P21_HEAD.HEADER, depth: 0, from: headerAt, to: end + 1 });
    for (const [s, ty] of stmtType) if (s > headerAt && s < end && P21_HEAD[ty]) {
      let e = s; while (e + 1 < lines.length && stmtOf[e + 1] === s) e++;
      items.push({ label: ty, note: P21_HEAD[ty], depth: 1, from: s, to: e + 1 });
    }
  }
  if (dataAt >= 0) {
    const end = endsec.find((e) => e > dataAt) ?? lines.length - 1;
    items.push({ label: `DATA section, ${plural(refs.size, 'instance')}`, note: P21_HEAD.DATA, depth: 0, from: dataAt, to: end + 1 });
    for (const [ty, at] of [...types.entries()].sort((a, b) => b[1].length - a[1].length)) {
      let e = at[0]; while (e + 1 < lines.length && stmtOf[e + 1] === at[0]) e++;
      items.push({ label: `${ty} x${at.length}`, note: dict[ty] ?? (kind === 'ifc' ? 'An IFC entity instance; see the IFC schema documentation for its attributes.' : 'An instance of this STEP entity type; see the application protocol for its attributes.'), depth: 1, from: at[0], to: e + 1, jumps: at });
    }
  }
  const tok = rules([
    [/\/\*.*?(?:\*\/|$)/, 'c'],
    [/'(?:[^']|'')*'?/, 's'],
    [/#\d+/, 'ref'],
    [/\.[A-Z_]+\./, 'k'],
    [/(?:END-)?ISO-10303-21|HEADER|ENDSEC|DATA/, 'k'],
    [/[A-Z][A-Z0-9_]*(?=\s*\()/i, 'e'],
    [/[A-Za-z_]\w*/, ''],
    [NUM_RE, 'n'],
    [/[$*]/, 'p'],
  ]);
  const lineNote = (i: number): Note | null => {
    const s = stmtOf[i];
    const ty = stmtType.get(s);
    const t = lines[s].trim();
    if (!ty) {
      const k = Object.keys(P21_HEAD).find((x) => t.startsWith(x));
      return k ? { title: k, text: P21_HEAD[k] } : null;
    }
    if (P21_HEAD[ty]) return { title: ty, text: P21_HEAD[ty] };
    const id = t.match(/^#(\d+)/)?.[1];
    const body = lines.slice(s, Math.min(lines.length, s + 6)).join(' ').replace(/\s+/g, ' ');
    const n = body.match(/#\d+/g)?.length ?? 1;
    return { title: `#${id} ${ty}`, value: body.length > 240 ? body.slice(0, 240) + '...' : body, text: `${dict[ty] ?? 'An entity instance.'} It references ${plural(n - 1, 'other instance')}; hover or click a #number to follow it.` };
  };
  const schema = src.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/)?.[1] ?? '';
  return {
    kind: 'text', lines, items, tok, lineNote, refs,
    summary: `${kind === 'ifc' ? 'IFC model in STEP Part 21 encoding' : 'STEP Part 21 exchange file'}: ${plural(refs.size, 'instance')} of ${plural(types.size, 'entity type')}${schema ? `, schema <span class="mono">${esc(schema)}</span>` : ''}. The outline groups instances by type; references between them are links.`,
  };
}

// ---------------------------------------------------------------- IGES 5.3
const IGES_TYPES: Record<number, string> = {
  100: 'circular arc', 102: 'composite curve', 104: 'conic arc', 106: 'copious data', 108: 'plane', 110: 'line', 112: 'parametric spline curve', 116: 'point', 118: 'ruled surface', 120: 'surface of revolution', 122: 'tabulated cylinder', 123: 'direction', 124: 'transformation matrix', 126: 'rational B-spline curve', 128: 'rational B-spline surface', 141: 'boundary', 142: 'curve on a parametric surface', 143: 'bounded surface', 144: 'trimmed surface', 186: 'manifold solid B-rep object', 190: 'plane surface', 192: 'right circular cylindrical surface', 194: 'right circular conical surface', 196: 'spherical surface', 198: 'toroidal surface', 212: 'general note', 308: 'subfigure definition', 314: 'color definition', 402: 'associativity instance', 406: 'property', 408: 'singular subfigure instance', 502: 'vertex list', 504: 'edge list', 508: 'loop', 510: 'face', 514: 'shell',
};
const IGES_SECTION: Record<string, string> = {
  S: 'Start section: free text for a human reader.',
  G: 'Global section: 26 parameters about the whole file (delimiters, sender, units, precision, dates, IGES version), separated by the parameter delimiter.',
  D: 'Directory entry section: two 80-column lines per entity, ten 8-column fields each. Field 2 points to the entity\'s parameter data.',
  P: 'Parameter data section: each entity\'s parameters in columns 1-64, starting with its type number; columns 65-72 point back to its directory entry.',
  T: 'Terminate section: the number of lines in each of the other sections.',
};
const IGES_G = ['Parameter delimiter', 'Record delimiter', 'Product id from sender', 'File name', 'Native system id', 'Preprocessor version', 'Bits in an integer', 'Single precision magnitude', 'Single precision significant digits', 'Double precision magnitude', 'Double precision significant digits', 'Product id for receiver', 'Model space scale', 'Units flag (2 = mm)', 'Units name', 'Maximum line weight gradations', 'Maximum line width', 'Date and time of generation', 'Minimum resolution', 'Maximum coordinate', 'Author', 'Organization', 'IGES version flag (11 = 5.3)', 'Drafting standard', 'Model created or modified', 'Application protocol'];
const D1 = ['Entity type', 'Parameter data pointer', 'Structure', 'Line font pattern', 'Level', 'View', 'Transformation matrix', 'Label display', 'Status number'];
const D2 = ['Entity type', 'Line weight', 'Color', 'Parameter line count', 'Form number', 'Reserved', 'Reserved', 'Entity label', 'Entity subscript'];

export function iges(src: string): TextDoc {
  const lines = src.split(/\r?\n/).filter((l, i, a) => l.length || i < a.length - 1);
  const sec = lines.map((l) => l[72] ?? '');
  const seq = lines.map((l) => Number(l.slice(73, 80)));
  const refs = new Map<string, number>();
  lines.forEach((l, i) => { if (sec[i] === 'D' || sec[i] === 'P') refs.set(`${sec[i]}${seq[i]}`, i); });
  const items: Item[] = [];
  for (const s of ['S', 'G', 'D', 'P', 'T']) {
    const at = sec.flatMap((x, i) => (x === s ? [i] : []));
    if (!at.length) continue;
    items.push({ label: `${s} section, ${plural(at.length, 'line')}`, note: IGES_SECTION[s], depth: 0, from: at[0], to: at[at.length - 1] + 1 });
  }
  // Entity types from the directory, with jumps to each entity's first D line.
  const byType = new Map<number, number[]>();
  lines.forEach((l, i) => { if (sec[i] === 'D' && seq[i] % 2 === 1) { const t = Number(l.slice(0, 8)); if (!byType.has(t)) byType.set(t, []); byType.get(t)!.push(i); } });
  const dIdx = items.findIndex((x) => x.label.startsWith('D'));
  const typeItems = [...byType.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, at]) => ({ label: `${t} ${IGES_TYPES[t] ?? 'entity'} x${at.length}`, note: `Entity type ${t}: ${IGES_TYPES[t] ?? 'see the IGES 5.3 specification'}. Click again to step through each directory entry.`, depth: 1, from: at[0], to: at[0] + 2, jumps: at }));
  items.splice(dIdx + 1, 0, ...typeItems);
  // Global parameters, decoded (Hollerith strings are "nH" followed by n characters).
  const g = lines.filter((_, i) => sec[i] === 'G').map((l) => l.slice(0, 72)).join('');
  const gp: string[] = [];
  {
    let i = 0, cur = '';
    const delim = g[0] === ',' || g[0] !== '1' ? ',' : g[2];
    while (i < g.length) {
      const h = g.slice(i).match(/^(\d+)H/);
      if (h && (cur.trim() === '')) { const n = Number(h[1]); cur = g.substr(i + h[0].length, n); i += h[0].length + n; continue; }
      if (g[i] === delim || g[i] === ';') { gp.push(cur.trim()); cur = ''; i++; if (g[i - 1] === ';') break; continue; }
      cur += g[i++];
    }
  }
  const tok = (l: string, i: number) => {
    const body = l.slice(0, 72), s = l.slice(72, 73), n = l.slice(73);
    let html = '';
    if (sec[i] === 'D') {
      for (let k = 0; k < 9; k++) {
        const f = body.slice(k * 8, k * 8 + 8);
        const v = Number(f);
        html += k === 1 && seq[i] % 2 === 1 && v > 0 ? `<span class="f${k % 2}"><span class="ref" data-ref="P${v}">${esc(f)}</span></span>` : `<span class="f${k % 2}">${esc(f)}</span>`;
      }
    } else if (sec[i] === 'P') {
      html = TOK.keyword(/$^/, /$^/)(body.slice(0, 64)) + `<span class="ref" data-ref="D${Number(body.slice(64, 72))}">${esc(body.slice(64, 72))}</span>`;
    } else if (sec[i] === 'G') {
      html = rules([[/\d+H/, 'k'], [NUM_RE, 'n']])(body);
    } else html = `<span class="c">${esc(body)}</span>`;
    return `${html}<span class="k">${esc(s)}</span><span class="c">${esc(n)}</span>`;
  };
  const lineNote = (i: number): Note | null => {
    const l = lines[i];
    const s = sec[i];
    if (s === 'D') {
      const first = seq[i] % 2 === 1;
      const names = first ? D1 : D2;
      const vals = names.map((nm, k) => `${nm} ${l.slice(k * 8, k * 8 + 8).trim() || '0'}`);
      const t = Number(l.slice(0, 8));
      return { title: `Directory entry ${first ? seq[i] : seq[i] - 1}, line ${first ? 1 : 2}: type ${t} (${IGES_TYPES[t] ?? 'entity'})`, value: vals.join('; '), text: IGES_SECTION.D };
    }
    if (s === 'P') {
      const t = Number(l.split(/[,;]/)[0]);
      const de = Number(l.slice(64, 72));
      return { title: `Parameter data of directory entry ${de}${IGES_TYPES[t] ? `: ${t} ${IGES_TYPES[t]}` : ''}`, value: l.slice(0, 64).trim(), text: IGES_SECTION.P };
    }
    if (s === 'G') return { title: 'Global section', value: gp.map((v, k) => `${k + 1} ${IGES_G[k] ?? ''}: ${v || '(default)'}`).join(' | '), text: IGES_SECTION.G };
    if (s === 'T') {
      const m = l.match(/S(\d+)G(\d+)D(\d+)P(\d+)/);
      return { title: 'Terminate section', value: m ? `Start ${+m[1]} lines, Global ${+m[2]}, Directory ${+m[3]}, Parameter ${+m[4]}` : l, text: IGES_SECTION.T };
    }
    if (s === 'S') return { title: 'Start section', text: IGES_SECTION.S };
    return null;
  };
  return { kind: 'text', lines, items, tok, lineNote, refs, summary: `IGES file in the fixed 80-column ASCII form: column 73 holds the section letter (S, G, D, P, T) and columns 74-80 a sequence number. ${plural(byType.size, 'entity type')}, ${plural([...byType.values()].reduce((a, b) => a + b.length, 0), 'entity')}. Directory pointers are links.` };
}

// ---------------------------------------------------------------- Wavefront OBJ
export function obj(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const OBJ: Record<string, string> = { v: 'Geometric vertex: x y z (and an optional w).', vn: 'Vertex normal: x y z.', vt: 'Texture coordinate: u v.', f: 'Face: vertex references, each v, v/vt, v//vn or v/vt/vn, 1-based (negative counts back from the end).', o: 'Object name.', g: 'Group name.', s: 'Smoothing group.', usemtl: 'Material to use from the material library.', mtllib: 'Material library (.mtl) file.', l: 'Polyline: vertex references.', '#': 'Comment.' };
  const vAt: number[] = [];
  lines.forEach((l, i) => { if (/^v\s/.test(l)) vAt.push(i); });
  const refs = new Map<string, number>();
  vAt.forEach((li, k) => refs.set(`v${k + 1}`, li));
  const items = groupRepeats(
    (() => {
      const out: Item[] = [];
      let cur: Item | null = null;
      lines.forEach((l, i) => {
        const k = l.trim().split(/\s+/)[0] || '';
        if (!k) return;
        if (cur && cur.label.split(' ')[0] === k) { cur.to = i + 1; return; }
        cur = { label: k, note: OBJ[k] ?? 'Statement.', depth: 0, from: i, to: i + 1 };
        out.push(cur);
      });
      for (const it of out) it.label = `${it.label} ${it.label === '#' ? 'comment' : ''}x${it.to - it.from}`.replace('  ', ' ');
      return out;
    })(),
  );
  const base = rules([[/#.*/, 'c'], [/^(?:v|vn|vt|f|o|g|s|l|usemtl|mtllib)\b/, 'k'], [NUM_RE, 'n']]);
  const tok = (l: string) => {
    if (!/^f\s/.test(l)) return base(l);
    return '<span class="k">f</span>' + l.slice(1).replace(/(\s+)(-?\d+)((?:\/-?\d*){0,2})/g, (_, sp, v, rest) => {
      const n = Number(v) < 0 ? vAt.length + Number(v) + 1 : Number(v);
      return `${sp}<span class="ref" data-ref="v${n}">${v}</span><span class="n">${esc(rest)}</span>`;
    });
  };
  const lineNote = (i: number): Note | null => {
    const l = lines[i].trim();
    const k = l.split(/\s+/)[0];
    if (k === 'f') {
      const vs = l.split(/\s+/).slice(1).map((x) => x.split('/')[0]);
      return { title: `Face with ${vs.length} corners`, value: `vertices ${vs.join(', ')}`, text: OBJ.f };
    }
    if (k === 'v') return { title: `Vertex ${vAt.indexOf(i) + 1}`, value: l.slice(2), text: OBJ.v };
    return OBJ[k] ? { title: k, text: OBJ[k] } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, refs, summary: `Wavefront OBJ, a line-based mesh format: one statement per line, keyword first. ${plural(vAt.length, 'vertex')}${vAt.length === 1 ? '' : ''}, ${plural(lines.filter((l) => /^f\s/.test(l)).length, 'face')}. Face indices link to their vertex lines.`.replace('vertexs', 'vertices') };
}

// ---------------------------------------------------------------- DXF (group code / value pairs)
const DXF_CODES: Record<number, string> = {
  0: 'Start of an entity, table entry or section marker (SECTION, ENDSEC, EOF)', 1: 'Primary text value', 2: 'Name (section, block, table or attribute tag)', 3: 'Other text or name value', 5: 'Entity handle (hex)', 6: 'Linetype name', 7: 'Text style name', 8: 'Layer name', 9: 'Header variable name ($ACADVER and others)', 10: 'Primary point, X', 20: 'Primary point, Y', 30: 'Primary point, Z', 11: 'Second point, X', 21: 'Second point, Y', 31: 'Second point, Z', 39: 'Thickness', 40: 'Floating point value (radius, height, scale)', 41: 'Floating point value', 42: 'Bulge or floating point value', 43: 'Floating point value', 50: 'Angle in degrees', 51: 'Angle in degrees', 62: 'Color number', 70: 'Integer flags or count', 71: 'Integer value', 72: 'Integer value', 90: '32-bit integer (count or flags)', 100: 'Subclass marker (AcDbEntity, AcDbLine and so on)', 102: 'Control string, start or end of an application group', 210: 'Extrusion direction X', 220: 'Extrusion direction Y', 230: 'Extrusion direction Z', 330: 'Soft pointer handle (owner object)', 340: 'Hard pointer handle', 360: 'Hard owner handle', 370: 'Line weight', 999: 'Comment',
};
const dxfCode = (c: number) => DXF_CODES[c] ?? (c >= 1000 ? 'Extended data' : c >= 10 && c < 60 ? 'Coordinate or floating point value' : c >= 60 && c < 100 ? 'Integer value' : 'Value');
const DXF_SECTIONS: Record<string, string> = {
  HEADER: 'Header variables: drawing settings such as $ACADVER (file version) and $INSUNITS (units), each a code 9 name and its values.',
  CLASSES: 'Application-defined classes used by objects in the file.',
  TABLES: 'Symbol tables: layers, linetypes, text styles, views, block records.',
  BLOCKS: 'Block definitions: named groups of entities that can be inserted.',
  ENTITIES: 'The drawing itself: LINE, ARC, CIRCLE, LWPOLYLINE and other graphical entities.',
  OBJECTS: 'Non-graphical objects: dictionaries, layouts, plot settings.',
};
export function dxf(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items: Item[] = [];
  let sec: Item | null = null;
  let ent: Item | null = null;
  const ents = new Map<string, number[]>();
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    const val = lines[i + 1].trim();
    if (code !== 0) continue;
    if (ent) { ent.to = i; ent = null; }
    if (val === 'SECTION') { const name = lines[i + 3]?.trim() ?? ''; sec = { label: `${name} section`, note: DXF_SECTIONS[name] ?? 'A section.', depth: 0, from: i, to: i + 2 }; items.push(sec); continue; }
    if (val === 'ENDSEC') { if (sec) sec.to = i + 2; sec = null; continue; }
    if (val === 'EOF') { items.push({ label: 'EOF', note: 'End of file.', depth: 0, from: i, to: i + 2 }); continue; }
    if (sec && /ENTITIES|BLOCKS/.test(sec.label)) {
      ent = { label: val, depth: 1, from: i, to: i + 2 };
      if (!ents.has(val)) ents.set(val, []);
      ents.get(val)!.push(i);
    }
  }
  for (const [name, at] of ents) items.push({ label: `${name} x${at.length}`, note: `${name} entities; each runs from its code 0 line to the next code 0.`, depth: 1, from: at[0], to: at[0] + 2, jumps: at });
  items.sort((a, b) => a.from - b.from || a.depth - b.depth);
  const tok = (l: string, i: number) => (i % 2 === 0 ? `<span class="a">${esc(l)}</span>` : /^\s*[-+]?\d/.test(l) ? `<span class="n">${esc(l)}</span>` : Number(lines[i - 1]) === 0 ? `<span class="e">${esc(l)}</span>` : `<span class="s">${esc(l)}</span>`);
  const lineNote = (i: number): Note => {
    const k = i % 2 === 0 ? i : i - 1;
    const code = Number(lines[k].trim());
    return { title: `Group code ${code}: ${dxfCode(code)}`, value: `value ${lines[k + 1]?.trim()}`, text: 'DXF is a list of pairs: a line with an integer group code that says what the next line means, then the value line.' };
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: `AutoCAD DXF in ASCII: ${plural(Math.floor(lines.length / 2), 'group code and value pair')}. Codes are shown in one color, values in another; hover either line of a pair for its meaning.` };
}

// ---------------------------------------------------------------- G-code (RS-274 style)
const GWORDS: Record<string, string> = { G0: 'rapid move', G00: 'rapid move', G1: 'linear move at feed', G01: 'linear move at feed', G2: 'clockwise arc', G02: 'clockwise arc', G3: 'counterclockwise arc', G03: 'counterclockwise arc', G17: 'XY plane for arcs', G20: 'inch units', G21: 'millimeter units', G28: 'return to home', G40: 'cutter compensation off', G43: 'tool length offset', G49: 'cancel tool length offset', G54: 'work coordinate system 1', G80: 'cancel canned cycle', G90: 'absolute coordinates', G91: 'incremental coordinates', G94: 'feed per minute', M0: 'program stop', M3: 'spindle on, clockwise', M03: 'spindle on, clockwise', M5: 'spindle stop', M05: 'spindle stop', M6: 'tool change', M06: 'tool change', M8: 'coolant on', M9: 'coolant off', M30: 'end of program, rewind', M2: 'end of program' };
const GLETTER: Record<string, string> = { X: 'X position', Y: 'Y position', Z: 'Z position', I: 'arc center X offset', J: 'arc center Y offset', K: 'arc center Z offset', R: 'arc radius', F: 'feed rate', S: 'spindle speed', T: 'tool number', N: 'line number', O: 'program number', P: 'dwell or parameter', H: 'tool length offset register', D: 'cutter radius offset register' };
export function gcode(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  // Structure by what the blocks do, not by comments: header, setup modes, tool change,
  // spindle, the cutting moves, spindle stop and program end.
  const items: Item[] = [];
  const code = (l: string) => l.replace(/\(.*?\)|;.*/g, '').toUpperCase();
  const isComment = (l: string) => /^\s*\(.*\)\s*$|^\s*;/.test(l);
  const first = lines.findIndex((l) => !isComment(l) && l.trim());
  if (first > 0) items.push({ label: 'Header comments', note: 'Comments before the first block: what the program is for. The control ignores them.', depth: 0, from: 0, to: first });
  const add = (label: string, note: string, test: (c: string) => boolean) => {
    const at = lines.flatMap((l, i) => (test(code(l)) ? [i] : []));
    if (at.length) items.push({ label, note, depth: 0, from: at[0], to: at[at.length - 1] + 1, jumps: at.length > 1 ? at : undefined });
  };
  add('Setup modes', 'Modal settings for the whole program: G21 millimeters, G90 absolute coordinates, G17 XY plane, G94 feed per minute, G54 the work offset.', (c) => /\bG(21|20|90|91|17|94|5[4-9])\b/.test(c) && !/\bG0?[0-3]\b/.test(c));
  add('Tool change', 'T selects the tool, M6 swaps it into the spindle.', (c) => /\bM0?6\b/.test(c));
  add('Spindle on', 'S sets the spindle speed (rpm); M3 starts it clockwise.', (c) => /\bM0?3\b/.test(c));
  const moves = lines.flatMap((l, i) => (/\bG0?[0-3]\b|^[XYZ]/.test(code(l).trim()) ? [i] : []));
  // Contiguous runs of motion blocks: the cut, then any moves after the spindle stops.
  const runs: number[][] = [];
  for (const i of moves) { const r = runs[runs.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]); }
  runs.forEach((r, k) => items.push({
    label: k === 0 ? `Toolpath (${r.length} moves)` : `Return move${r.length > 1 ? 's' : ''}`,
    note: k === 0 ? 'G0 rapid moves position the tool without cutting; G1 feeds in a straight line at F (mm/min); G2 and G3 cut arcs.' : 'Rapid moves after cutting, back to a safe or home position.',
    depth: 0, from: r[0], to: r[r.length - 1] + 1,
  }));
  add('Spindle stop', 'M5 stops the spindle.', (c) => /\bM0?5\b/.test(c));
  add('Program end', 'M30 ends the program and rewinds it; M2 ends without rewind.', (c) => /\bM(30|0?2)\b/.test(c));
  items.sort((x, y) => x.from - y.from);
  const tok = rules([[/\(.*?\)|;.*/, 'c'], [/[GM]\d+(?:\.\d+)?/i, 'k'], [/[A-Z](?=[-+.\d])/i, 'a'], [NUM_RE, 'n'], [/%/, 'p']]);
  const lineNote = (i: number): Note | null => {
    const code = lines[i].replace(/\(.*?\)|;.*/g, '').toUpperCase();
    const words = code.match(/[A-Z][-+]?[\d.]+/g) ?? [];
    if (!words.length) return lines[i].trim() === '%' ? { title: '%', text: 'Tape start or end marker.' } : { title: 'Comment', text: 'Comments are in parentheses or follow a semicolon; the control ignores them.' };
    return { title: 'Block (one line of program)', value: words.map((w) => `${w}: ${GWORDS[w] ?? GWORDS[w[0] + String(Number(w.slice(1)))] ?? GLETTER[w[0]] ?? 'word'}`).join('; '), text: 'Each word is a letter address followed by a number. G words set modes and motion, M words switch machine functions.' };
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'G-code (RS-274 style) for a milling profile: one block per line, each a list of letter-number words. Illustrative only; not post-processed for a specific machine.' };
}

// ---------------------------------------------------------------- Gerber X2 and Excellon
export function gerber(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const fs = src.match(/%FSLAX(\d)(\d)Y(\d)(\d)\*%/);
  const dec = fs ? Number(fs[2]) : 6;
  const items: Item[] = [];
  const attr = lines.flatMap((l, i) => (/^%T[FAOD]/.test(l) ? [i] : []));
  if (attr.length) items.push({ label: 'Attributes (X2)', note: 'Gerber X2 attributes: %TF sets file attributes (what the file is: FileFunction, FilePolarity, GenerationSoftware), %TA aperture attributes, %TO object attributes, %TD deletes.', depth: 0, from: attr[0], to: attr[attr.length - 1] + 1 });
  lines.forEach((l, i) => {
    if (/^%FS/.test(l)) items.push({ label: 'Format specification', note: `%FSLA: leading zeros omitted, absolute coordinates; X${fs?.[1]}${fs?.[2]} means ${fs?.[1]} integer and ${fs?.[2]} decimal digits.`, depth: 0, from: i, to: i + 1 });
    if (/^%MO/.test(l)) items.push({ label: 'Units', note: '%MOMM is millimeters, %MOIN inches.', depth: 0, from: i, to: i + 1 });
    if (/^%AD/.test(l)) items.push({ label: `Aperture ${l.match(/D\d+/)?.[0]}`, note: 'Aperture definition: a D code and a shape (C circle, R rectangle, O obround, P polygon) with its size.', depth: 0, from: i, to: i + 1 });
    if (/^M02/.test(l)) items.push({ label: 'End of file', note: 'M02 ends the file.', depth: 0, from: i, to: i + 1 });
  });
  const firstOp = lines.findIndex((l) => /D0[123]\*/.test(l));
  if (firstOp >= 0) items.push({ label: 'Graphics operations', note: 'D01 draws (interpolates) to a point with the current aperture, D02 moves without drawing, D03 flashes the aperture. G01 linear, G02 or G03 circular, G75 multi-quadrant arcs.', depth: 0, from: firstOp, to: lines.findLastIndex((l) => /D0[123]\*/.test(l)) + 1 });
  items.sort((a, b) => a.from - b.from);
  const tok = rules([[/G04.*/, 'c'], [/%|\*/, 'p'], [/T[FAOD]\.?[\w.]*|FS|MO|AD|LP|D\d+|G\d+|M\d+/, 'k'], [/[XYIJ](?=[-\d])/, 'a'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    const l = lines[i];
    const m = l.match(/X(-?\d+)?Y(-?\d+)?.*?(D0[123])/);
    if (m) {
      const c = (v?: string) => (v ? (Number(v) / 10 ** dec).toString() : 'same');
      const op = { D01: 'draw to', D02: 'move to', D03: 'flash at' }[m[3]];
      return { title: `${m[3]}: ${op}`, value: `X ${c(m[1])}, Y ${c(m[2])} (coordinates have ${dec} implied decimal places)`, text: 'Operation code: D01 draws, D02 moves, D03 flashes.' };
    }
    if (/^G04/.test(l)) return { title: 'Comment', text: 'G04 starts a comment.' };
    if (/^%TF/.test(l)) return { title: 'File attribute', value: l, text: 'Standard attributes describe the file so a fabricator need not guess which layer it is.' };
    if (/^D\d+\*/.test(l)) return { title: `Select aperture ${l.replace('*', '')}`, text: 'Following operations use this aperture.' };
    return null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'Gerber X2 (RS-274X with attributes): extended commands between % signs set format, units, apertures and attributes; the rest are draw, move and flash operations, each ending with *.' };
}
export function excellon(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const hEnd = lines.findIndex((l) => l.trim() === '%');
  const items: Item[] = [];
  if (hEnd > 0) items.push({ label: 'Header (M48 to %)', note: 'Header: M48 starts it, METRIC or INCH sets units (with LZ or TZ for zero suppression), TnCd defines tool n with diameter d, % ends it.', depth: 0, from: 0, to: hEnd + 1 });
  items.push({ label: 'Body: tool selects and hits', note: 'Tn selects a tool; each XY line drills one hole with it. M30 ends the program.', depth: 0, from: hEnd + 1, to: lines.length });
  const tok = rules([[/;.*/, 'c'], [/M\d+|G\d+|T\d+(?:C[\d.]+)?|METRIC|INCH|LZ|TZ|%/, 'k'], [/[XY](?=[-\d])/, 'a'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    const l = lines[i].trim();
    if (/^T\d+C/.test(l)) return { title: `Tool ${l.match(/^T(\d+)/)![1]} definition`, value: `diameter ${l.split('C')[1]}`, text: 'Tool table entry in the header.' };
    if (/^T\d+$/.test(l)) return { title: `Select tool ${l.slice(1)}`, text: 'The holes that follow use this drill.' };
    if (/^X/.test(l)) return { title: 'Hole', value: l, text: 'A drill hit at this position with the selected tool.' };
    const k: Record<string, string> = { M48: 'Start of header.', M30: 'End of program.', '%': 'End of header.', METRIC: 'Millimeter units.', INCH: 'Inch units.' };
    const key = Object.keys(k).find((x) => l.startsWith(x));
    return key ? { title: key, text: k[key] } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'Excellon drill file: a header that defines tools, then tool selects and hole coordinates.' };
}

// ---------------------------------------------------------------- Keyword decks (Abaqus, LS-DYNA, Nastran, Ansys)
const ABQ: Record<string, string> = {
  HEADING: 'Title and free text for the job.', NODE: 'Node definitions: node number, then x, y, z.', ELEMENT: 'Element definitions: element number, then its node numbers in the order the element type defines. TYPE names the element (C3D4 is a 4-node linear tetrahedron, C3D10 a 10-node quadratic one).', NSET: 'A named set of nodes.', ELSET: 'A named set of elements.', 'SOLID SECTION': 'Assigns a material to a set of solid elements.', MATERIAL: 'Starts a material definition.', ELASTIC: 'Linear elastic constants: Young\'s modulus and Poisson\'s ratio.', DENSITY: 'Mass density.', STEP: 'Starts an analysis step.', STATIC: 'Static stress procedure.', BOUNDARY: 'Boundary conditions: node or set, first and last degree of freedom, value.', CLOAD: 'Concentrated loads.', 'END STEP': 'Ends the step.', OUTPUT: 'Output requests.',
};
export function abaqus(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items = groupRepeats(blocks(lines, (l) => (/^\*[^*]/.test(l) ? l.slice(1).split(',')[0].trim().toUpperCase() : null), (k, l) => `${ABQ[k] ?? 'Keyword block: the keyword line with its parameters, then data lines until the next keyword.'}${/type=/i.test(l) ? ` Parameters: ${l.split(',').slice(1).join(',').trim()}.` : ''}`));
  for (const it of items) it.label = `*${it.label}${it.to - it.from > 1 ? ` (${(it.to - it.from - 1).toLocaleString('en-US')} lines)` : ''}`;
  const tok = rules([[/\*\*.*/, 'c'], [/^\*[\w ]+/, 'k'], [/\b\w+(?==)/, 'a'], [NUM_RE, 'n']]);
  const kwAt = (i: number) => { for (let k = i; k >= 0; k--) if (/^\*[^*]/.test(lines[k])) return k; return -1; };
  const lineNote = (i: number): Note | null => {
    const l = lines[i];
    if (/^\*\*/.test(l)) return { title: 'Comment', text: 'Lines starting with ** are comments.' };
    const k = kwAt(i);
    if (k < 0) return null;
    const kw = lines[k].slice(1).split(',')[0].trim().toUpperCase();
    if (k === i) return { title: `*${kw}`, value: l, text: ABQ[kw] ?? 'Keyword line.' };
    const f = l.split(',').map((x) => x.trim());
    if (kw === 'NODE') return { title: `Node ${f[0]}`, value: `x ${f[1]}, y ${f[2]}, z ${f[3]}`, text: ABQ.NODE };
    if (kw === 'ELEMENT') return { title: `Element ${f[0]}`, value: `nodes ${f.slice(1).join(', ')}`, text: `${lines[k].match(/type=([\w]+)/i)?.[1] ?? ''} element. ${ABQ.ELEMENT}` };
    return { title: `Data line of *${kw}`, value: l, text: ABQ[kw] };
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: `Abaqus input deck: keyword lines start with *, comments with **, and data lines follow their keyword. ${plural(items.length, 'keyword block')}. This one is mesh only (no material or loads).` };
}

const DYNA: Record<string, string> = {
  KEYWORD: 'First line of a keyword deck.', TITLE: 'Job title.', NODE: 'Nodes in fixed columns: NID (8 characters), X, Y, Z (16 each), then translational and rotational constraint codes (8 each).', ELEMENT_SOLID: 'Solid elements: EID, PID (part), then up to 8 node ids, 8 columns each.', ELEMENT_SHELL: 'Shell elements: EID, PID, then 4 node ids.', PART: 'A part: title line, then PID, section id, material id, equation of state id and others.', MAT: 'Material model; the suffix names the model.', SECTION: 'Element formulation and properties for a part.', CONTROL: 'Solution controls.', DATABASE: 'Output database requests.', BOUNDARY: 'Boundary conditions.', LOAD: 'Loads.', END: 'End of the deck.', PARAMETER: 'Parameters.', EOS: 'Equation of state.', CONTACT: 'Contact definition.', INITIAL: 'Initial conditions.', SET: 'Set of nodes, parts, segments or elements.',
};
const dynaNote = (k: string) => DYNA[k] ?? DYNA[k.split('_')[0]] ?? 'Keyword card: data lines in fixed 10-character columns (or 8 or 16 for some cards) until the next keyword. Lines starting with $ are comments, often naming the columns.';
export function lsdyna(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items = groupRepeats(blocks(lines, (l) => (/^\*/.test(l) ? l.slice(1).trim().toUpperCase() : null), (k) => dynaNote(k)), 80);
  for (const it of items) it.label = `*${it.label}`;
  const tok = rules([[/^\$.*/, 'c'], [/^\*[\w-]+/, 'k'], [NUM_RE, 'n']]);
  const kwAt = (i: number) => { for (let k = i; k >= 0; k--) if (/^\*/.test(lines[k])) return k; return -1; };
  const lineNote = (i: number): Note | null => {
    const l = lines[i];
    if (/^\$/.test(l)) return { title: 'Comment', text: 'A $ line is a comment; decks often use one to name the columns of the next card.' };
    const k = kwAt(i);
    if (k < 0) return null;
    const kw = lines[k].slice(1).trim().toUpperCase();
    if (k === i) return { title: `*${kw}`, text: dynaNote(kw) };
    if (kw === 'NODE') return { title: `Node ${l.slice(0, 8).trim()}`, value: `x ${l.slice(8, 24).trim()}, y ${l.slice(24, 40).trim()}, z ${l.slice(40, 56).trim()}`, text: DYNA.NODE };
    if (kw.startsWith('ELEMENT')) {
      const f = l.match(/.{1,8}/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
      return { title: `${kw.toLowerCase()} line`, value: `fields ${f.join(', ')}`, text: dynaNote(kw) };
    }
    const f = l.match(/.{1,10}/g)?.map((x) => x.trim()) ?? [];
    return { title: `Card of *${kw}`, value: `10-column fields: ${f.join(' | ')}`, text: dynaNote(kw) };
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: `LS-DYNA keyword deck: cards start with *, $ lines are comments, data are fixed-width columns. ${plural(blocks(lines, (l) => (/^\*/.test(l) ? 'k' : null), () => '').length, 'keyword card')}; repeated keywords are grouped (click again to step through them).` };
}

const NAS: Record<string, string> = {
  GRID: 'Grid point: ID, CP (input coordinate system), X1, X2, X3, CD (output system), PS (permanent constraints), SEID.', CTETRA: 'Tetrahedral element: EID, PID, then 4 or 10 grid ids.', CTRIA3: 'Triangular shell: EID, PID, G1, G2, G3.', CQUAD4: 'Quadrilateral shell: EID, PID, G1 to G4.', CHEXA: 'Hexahedral element: EID, PID, 8 or 20 grids.', PSOLID: 'Solid element property: PID, MID (material) and options.', PSHELL: 'Shell property: PID, MID, thickness.', MAT1: 'Isotropic material: MID, E, G, NU, RHO.', SPC1: 'Single point constraints on a list of grids.', FORCE: 'Concentrated force on a grid.', ENDDATA: 'End of the bulk data.', 'BEGIN BULK': 'Start of the bulk data section (model definition).', CEND: 'End of the executive control section.', SOL: 'Solution sequence (101 linear static).',
};
export function nastran(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const card = (l: string) => (/^\$/.test(l) ? '$' : l.match(/^([A-Z][A-Z0-9]*\*?)/)?.[1]?.replace('*', '') ?? (l.startsWith('BEGIN BULK') ? 'BEGIN BULK' : null));
  const runs: Item[] = [];
  let cur: Item | null = null;
  lines.forEach((l, i) => {
    const c = card(l);
    if (!c) { if (cur) cur.to = i + 1; return; }
    if (cur && cur.label === c) { cur.to = i + 1; return; }
    cur = { label: c, note: c === '$' ? 'Comment lines.' : NAS[c] ?? 'Bulk data card: name in field 1, then 8-character fields (or comma separated free fields; * marks 16-character large fields).', depth: 0, from: i, to: i + 1 };
    runs.push(cur);
  });
  const items = groupRepeats(runs).map((it) => ({ ...it, label: `${it.label} ${it.label === '$' ? 'comment' : ''} (${(it.to - it.from).toLocaleString('en-US')} lines)`.replace('  ', ' ') }));
  const tok = (l: string) => {
    if (/^\$/.test(l)) return `<span class="c">${esc(l)}</span>`;
    if (l.includes(',')) return rules([[/^[A-Z][A-Z0-9]*\*?/, 'k'], [NUM_RE, 'n']])(l);
    const f = l.match(/.{1,8}/g) ?? [];
    return f.map((x, k) => (k === 0 ? `<span class="k">${esc(x)}</span>` : `<span class="f${k % 2}">${esc(x)}</span>`)).join('');
  };
  const lineNote = (i: number): Note | null => {
    const l = lines[i];
    const c = card(l);
    if (!c || c === '$') return c === '$' ? { title: 'Comment', text: 'A $ starts a comment.' } : null;
    const f = l.includes(',') ? l.split(',').map((x) => x.trim()) : (l.match(/.{1,8}/g) ?? []).map((x) => x.trim());
    return { title: `${c} card`, value: `fields: ${f.join(' | ')}`, text: NAS[c] ?? 'Bulk data card.' };
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'Nastran bulk data in small field format: each card is 80 columns, ten fields of 8 characters (field 1 is the card name). Fields are shaded alternately. This deck is mesh only.' };
}

const APDL: Record<string, string> = {
  '/COM': 'Comment.', '/PREP7': 'Enter the preprocessor.', '/NOPR': 'Suppress printout while reading.', '/TITLE': 'Job title.', ANTYPE: 'Analysis type (2 = modal).', MODOPT: 'Modal analysis options: method (LANB is Block Lanczos) and number of modes.', ET: 'Element type: reference number and element name or number (185 is SOLID185, an 8-node brick).', KEYOPT: 'Element key options.', MP: 'Material property: label (EX Young\'s modulus, NUXY Poisson\'s ratio, DENS density), material number, value.', MPDATA: 'Material property data.', NBLOCK: 'Node block: header with field count, then a Fortran format line, then one node per line (node number, solid model refs, x, y, z). Ends with N,R5.3,LOC,-1.', EBLOCK: 'Element block: header, a Fortran format line, then per element: material, type, real constant, section, coordinate system, birth/death flag, solid model refs, shape flag, node count, unused, element number, then node numbers. Ends with -1.', CMBLOCK: 'Component (named set) block.', SECTYPE: 'Section type.', SECDATA: 'Section data.', R: 'Real constant set.', D: 'Degree of freedom constraint.', F: 'Force.', FINISH: 'Leave the current processor.', CSYS: 'Active coordinate system.', N: 'Node.', LOCAL: 'Local coordinate system.',
};
export function cdb(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const head = (l: string) => { const m = l.match(/^(\/?[A-Z][A-Z0-9]*)/); return m ? m[1] : null; };
  const items: Item[] = [];
  lines.forEach((l, i) => {
    const h = head(l);
    if (h === 'NBLOCK' || h === 'EBLOCK' || h === 'CMBLOCK') {
      let e = i + 2; while (e < lines.length && !/^\s*-1\s*$|^N,R5|^[A-Z\/]/.test(lines[e])) e++;
      items.push({ label: `${h}${h === 'CMBLOCK' ? ` ${l.split(',')[1] ?? ''}` : ''} (${e - i - 2} lines)`, note: APDL[h], depth: 0, from: i, to: Math.min(lines.length, e + 1) });
    } else if (h && APDL[h] && h !== 'N') {
      items.push({ label: h, note: APDL[h], depth: 1, from: i, to: i + 1 });
    }
  });
  const tok = rules([[/^\/COM.*/, 'c'], [/^\/?[A-Z][A-Z0-9]*/, 'k'], [/\([\w.,]+\)/, 's'], [NUM_RE, 'n']]);
  const blockOf = (i: number) => items.find((x) => x.depth === 0 && i >= x.from && i < x.to);
  const lineNote = (i: number): Note | null => {
    const l = lines[i];
    const b = blockOf(i);
    if (b && i === b.from + 1) return { title: 'Fortran format line', value: l.trim(), text: 'Says how the data lines are laid out: for example 3i9 is three 9-wide integers and 6e21.13e3 six 21-wide reals. A reader slices each line by these widths.' };
    if (b && i > b.from + 1 && /^NBLOCK/.test(b.label)) {
      const ints = [l.slice(0, 9), l.slice(9, 18), l.slice(18, 27)].map((x) => x.trim());
      const reals = (l.slice(27).match(/.{1,21}/g) ?? []).map((x) => x.trim());
      return { title: `Node ${ints[0]}`, value: `x ${reals[0] ?? ''}, y ${reals[1] ?? ''}, z ${reals[2] ?? ''}`, text: APDL.NBLOCK };
    }
    if (b && i > b.from + 1 && /^EBLOCK/.test(b.label)) {
      const f = (l.match(/.{1,9}/g) ?? []).map((x) => x.trim());
      return { title: `Element ${f[10] ?? ''}`, value: `material ${f[0]}, type ${f[1]}, real ${f[2]}, section ${f[3]}, nodes ${f.slice(11).join(' ')}`, text: APDL.EBLOCK };
    }
    const h = head(l);
    return h && APDL[h] ? { title: h, value: l.trim(), text: APDL[h] } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'Ansys Mechanical APDL archive (.cdb): APDL commands, with nodes and elements in NBLOCK and EBLOCK blocks whose layout is given by a Fortran format line. Layout from the public Ansys command reference.' };
}

// ---------------------------------------------------------------- Gmsh MSH 4.1
const MSH_TYPES: Record<number, string> = { 1: '2-node line', 2: '3-node triangle', 3: '4-node quadrangle', 4: '4-node tetrahedron', 5: '8-node hexahedron', 8: '3-node line', 9: '6-node triangle', 11: '10-node tetrahedron', 15: '1-node point' };
const MSH_SEC: Record<string, string> = {
  MeshFormat: 'Version (4.1), file type (0 ASCII, 1 binary) and the size of a floating point number in bytes.',
  PhysicalNames: 'Named physical groups: dimension, tag and name. Solvers use them for boundary conditions and materials.',
  Entities: 'The CAD entities the mesh came from: counts of points, curves, surfaces and volumes, then one line per entity with its bounding box, physical tags and bounding entities.',
  Nodes: 'Nodes in blocks, one block per entity: a header line (entity dimension, entity tag, parametric flag, node count), then the node tags, then their coordinates.',
  Elements: 'Elements in blocks: a header line (entity dimension, entity tag, element type, element count), then one line per element: its tag and node tags.',
};
export function msh(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items: Item[] = [];
  const blockHead = new Map<number, string>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\$(\w+)/);
    if (!m || m[1].startsWith('End')) continue;
    const name = m[1];
    const end = lines.findIndex((l, k) => k > i && l.startsWith(`$End${name}`));
    items.push({ label: `$${name}`, note: MSH_SEC[name] ?? 'Section.', depth: 0, from: i, to: end + 1 });
    if (name === 'Nodes' || name === 'Elements') {
      let k = i + 2;
      while (k < end) {
        const h = lines[k].trim().split(/\s+/).map(Number);
        const n = h[3];
        if (name === 'Nodes') {
          blockHead.set(k, `Node block: entity dimension ${h[0]}, entity tag ${h[1]}, parametric ${h[2]}, ${n} nodes. Next ${n} lines are tags, then ${n} lines of coordinates.`);
          items.push({ label: `node block dim ${h[0]} tag ${h[1]} (${n})`, note: blockHead.get(k), depth: 1, from: k, to: k + 1 + 2 * n });
          k += 1 + 2 * n;
        } else {
          blockHead.set(k, `Element block: entity dimension ${h[0]}, entity tag ${h[1]}, type ${h[2]} (${MSH_TYPES[h[2]] ?? 'see the Gmsh manual'}), ${n} elements.`);
          items.push({ label: `${MSH_TYPES[h[2]] ?? `type ${h[2]}`} block, tag ${h[1]} (${n})`, note: blockHead.get(k), depth: 1, from: k, to: k + 1 + n });
          k += 1 + n;
        }
      }
    }
    i = end;
  }
  const tok = rules([[/^\$\w+/, 'k'], [/"[^"]*"/, 's'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    if (blockHead.has(i)) return { title: 'Block header', value: lines[i], text: blockHead.get(i) };
    const sec = items.find((x) => x.depth === 0 && i >= x.from && i < x.to);
    if (!sec) return null;
    const sub = items.find((x) => x.depth === 1 && i > x.from && i < x.to);
    if (sub && sec.label === '$Nodes') {
      const n = (sub.to - sub.from - 1) / 2;
      return i <= sub.from + n ? { title: 'Node tag', value: lines[i], text: 'Tags first, coordinates after, in the same order.' } : { title: 'Node coordinates', value: lines[i], text: 'x y z of the node with the matching tag above.' };
    }
    if (sub && sec.label === '$Elements') { const f = lines[i].trim().split(/\s+/); return { title: `Element ${f[0]}`, value: `nodes ${f.slice(1).join(', ')}`, text: sub.note }; }
    return { title: sec.label, text: sec.note };
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'Gmsh MSH 4.1 in ASCII: $Section ... $EndSection blocks. Nodes and elements are grouped by the CAD entity they belong to.' };
}

// ---------------------------------------------------------------- VTK legacy and Tecplot ASCII
const VTK_CELL: Record<number, string> = { 1: 'vertex', 3: 'line', 5: 'triangle', 9: 'quad', 10: 'tetrahedron', 12: 'hexahedron', 13: 'wedge', 14: 'pyramid', 24: 'quadratic tetrahedron' };
const VTK_KW: Record<string, string> = {
  POINTS: 'Point coordinates: count and type, then x y z for each point.', CELLS: 'Cell connectivity. In version 5.1 two arrays follow: OFFSETS (where each cell starts) and CONNECTIVITY (point ids).', OFFSETS: 'Start of each cell in the connectivity array.', CONNECTIVITY: 'Point ids of all cells, one after another.', CELL_TYPES: 'One VTK cell type number per cell (10 is a tetrahedron).', POINT_DATA: 'Data attached to points follows.', CELL_DATA: 'Data attached to cells follows.', SCALARS: 'A scalar field: name, type and component count, then a LOOKUP_TABLE line and the values.', LOOKUP_TABLE: 'Color table to use; "default" for none.', FIELD: 'A field data block with named arrays.', DATASET: 'The kind of dataset (UNSTRUCTURED_GRID here).', METADATA: 'Optional metadata such as information keys.',
};
export function vtk(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items: Item[] = [{ label: 'Header', note: 'Line 1: "# vtk DataFile Version"; line 2: a title; line 3: ASCII or BINARY; line 4: the dataset type.', depth: 0, from: 0, to: 4 }];
  const kws = lines.map((l) => l.match(/^([A-Z_]+)\b/)?.[1] ?? null);
  kws.forEach((k, i) => {
    if (i < 3 || !k || !VTK_KW[k]) return;
    let e = i + 1; while (e < lines.length && !(kws[e] && VTK_KW[kws[e]!])) e++;
    items.push({ label: lines[i].slice(0, 48), note: VTK_KW[k], depth: k === 'OFFSETS' || k === 'CONNECTIVITY' ? 1 : 0, from: i, to: e });
  });
  const tok = rules([[/^#.*/, 'c'], [/^[A-Z_]+\b/, 'k'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    const it = [...items].reverse().find((x) => i >= x.from && i < x.to);
    if (!it) return null;
    if (/^CELL_TYPES/.test(it.label) && i > it.from) {
      const counts = new Map<string, number>();
      for (const v of lines[i].trim().split(/\s+/)) counts.set(VTK_CELL[Number(v)] ?? v, (counts.get(VTK_CELL[Number(v)] ?? v) ?? 0) + 1);
      return { title: 'Cell types', value: [...counts].map(([k, n]) => `${n} x ${k}`).join(', '), text: VTK_KW.CELL_TYPES };
    }
    return { title: it.label, value: i > it.from ? `${lines[i].trim().split(/\s+/).length} values on this line` : undefined, text: it.note };
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'VTK legacy file (ASCII): four header lines, then keyword blocks for points, cells, cell types and point data. Long value lines are shortened on screen.' };
}
export function tecplot(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const vars = (src.match(/VARIABLES\s*=\s*(.*)/)?.[1] ?? '').match(/"[^"]*"/g)?.map((s) => s.slice(1, -1)) ?? [];
  const nN = Number(src.match(/NODES\s*=\s*(\d+)/i)?.[1] ?? 0);
  const nE = Number(src.match(/ELEMENTS\s*=\s*(\d+)/i)?.[1] ?? 0);
  const items: Item[] = [{ label: 'Header: TITLE, VARIABLES, ZONE', note: 'TITLE names the dataset, VARIABLES lists the columns, ZONE gives node and element counts, the packing (BLOCK: all values of one variable, then the next) and the zone type (FETETRAHEDRON: tetrahedra).', depth: 0, from: 0, to: 0 }];
  let i = 0;
  while (i < lines.length && !/^\s*[-+\d.]/.test(lines[i])) i++;
  items[0].to = i;
  let count = 0, v = 0, start = i;
  for (; i < lines.length && v < vars.length; i++) {
    count += lines[i].trim().split(/\s+/).filter(Boolean).length;
    if (count >= nN) { items.push({ label: `${vars[v]}: ${nN.toLocaleString('en-US')} values`, note: `All ${nN} node values of variable ${vars[v]} (BLOCK packing).`, depth: 0, from: start, to: i + 1 }); v++; count = 0; start = i + 1; }
  }
  if (start < lines.length) items.push({ label: `Connectivity: ${nE.toLocaleString('en-US')} elements`, note: 'One line per element: its node numbers, 1-based (4 for a tetrahedron).', depth: 0, from: start, to: lines.length });
  const tok = rules([[/^[A-Z]+(?=\s*=)/, 'k'], [/\b[A-Z]+(?=\s*=)/, 'a'], [/"[^"]*"/, 's'], [NUM_RE, 'n']]);
  return { kind: 'text', lines, items, tok, summary: `Tecplot ASCII data: a header, then ${vars.length} variable blocks of ${nN.toLocaleString('en-US')} node values each and ${nE.toLocaleString('en-US')} element lines.` };
}

// ---------------------------------------------------------------- ACIS SAT and Parasolid XT (text)
const SAT_TYPES: Record<string, string> = {
  body: 'Top of the topology: a body holds lumps (and wires), with a transform.', lump: 'A connected solid region; holds shells.', shell: 'A set of connected faces.', face: 'A face: next face, its first loop, the shell it belongs to, its surface and its sense.', loop: 'A boundary loop of a face: a ring of coedges.', coedge: 'An edge as used by one loop: next and previous coedges, the partner coedge on the adjacent face, the edge, and its sense.', edge: 'An edge: start and end vertices, parameter range and its curve.', vertex: 'A vertex, pointing to a point.', point: 'A position: x y z.', 'plane-surface': 'A plane: root point and normal.', 'cone-surface': 'A cone or cylinder: center, axis, major axis, ratio and half angle.', 'sphere-surface': 'A sphere: center and radius.', 'torus-surface': 'A torus: center, normal, major and minor radius.', 'spline-surface': 'A spline surface, usually in a nested subtype block.', 'straight-curve': 'A straight line: root point and direction.', 'ellipse-curve': 'An ellipse or circle: center, normal, major axis and ratio.', 'intcurve-curve': 'An intersection or spline curve.', transform: 'A transformation matrix applied to the body.',
};
export function sat(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const refs = new Map<string, number>();
  let rec = 0;
  const recLine: number[] = [];
  const firstRec = lines.findIndex((l, i) => i >= 3 && /^-?\d*\s*[a-z][\w-]*\s+\$/.test(l));
  const types = new Map<string, number[]>();
  for (let i = Math.max(0, firstRec); i < lines.length; i++) {
    const m = lines[i].match(/^(?:-(\d+)\s+)?([a-z][\w-]*)\s/);
    if (!m) continue;
    const n = m[1] !== undefined ? Number(m[1]) : rec;
    refs.set(`$${n}`, i);
    recLine[n] = i;
    rec = n + 1;
    if (!types.has(m[2])) types.set(m[2], []);
    types.get(m[2])!.push(i);
  }
  const items: Item[] = [
    { label: 'Header', note: 'Line 1: save version (2800 is ACIS 28), number of records, number of entities, history flag. Line 2: product id, ACIS version and date as length-prefixed strings. Line 3: units in millimeters per file unit, resolution absolute and normal tolerances.', depth: 0, from: 0, to: Math.max(1, firstRec) },
    { label: `Entity records (${refs.size})`, note: 'One record per entity: its type name, then fields; $n refers to record n (counting from 0) and $-1 is null. Each record ends with #.', depth: 0, from: Math.max(0, firstRec), to: lines.length },
    ...[...types.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, at]) => ({ label: `${t} x${at.length}`, note: SAT_TYPES[t] ?? (t.includes('attrib') ? 'An attribute attached to an entity (names, colors, application data).' : 'An entity record.'), depth: 1, from: at[0], to: at[0] + 1, jumps: at })),
  ];
  const tok = rules([[/\$-?\d+/, 'ref'], [/^(?:-\d+\s+)?[a-z][\w-]*/, 'e'], [/@\d+\s/, 'k'], [/#\s*$/, 'p'], [/\b[TFIR]\b/, 'k'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    const m = lines[i].match(/^(?:-\d+\s+)?([a-z][\w-]*)/);
    if (!m || i < firstRec) return i < firstRec ? { title: 'Header', text: items[0].note } : null;
    const n = recLine.indexOf(i);
    return { title: `Record $${n}: ${m[1]}`, value: lines[i].slice(0, 200), text: `${SAT_TYPES[m[1]] ?? 'Entity record.'} Hover a $n to see the record it points to.` };
  };
  return { kind: 'text', lines, items, tok, lineNote, refs, summary: `ACIS SAT text file: a three-line header, then ${plural(refs.size, 'entity record')} linked by $n pointers (body > lump > shell > face > loop > coedge > edge > vertex, plus geometry). Layout from Spatial's published SAT format documentation.` };
}
export function xt(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const p1 = at(/^\*\*PART1;/), p2 = at(/^\*\*PART2;/), p3 = at(/^\*\*PART3;/), end = at(/^\*\*END_OF_HEADER/);
  const items: Item[] = [
    { label: 'Character set check lines', note: 'Two lines of letters and punctuation. A reader compares them to detect character set translation (for example EBCDIC or a mangled transfer) before reading anything else.', depth: 0, from: 0, to: 2 },
    ...(p1 >= 0 ? [{ label: 'PART1: machine and application', note: 'Key=value pairs: machine, operating system, application name and version, file name and date. Informational.', depth: 0, from: p1, to: p2 > 0 ? p2 : p1 + 1 }] : []),
    ...(p2 >= 0 ? [{ label: 'PART2: format keys', note: 'Keys a reader needs: the schema (SCH_...) that defines the node types in this file and the user field size.', depth: 0, from: p2, to: p3 > 0 ? p3 : p2 + 1 }] : []),
    ...(p3 >= 0 ? [{ label: 'PART3: free text', note: 'Application text, ignored by Parasolid.', depth: 0, from: p3, to: end > 0 ? end : p3 + 1 }] : []),
    ...(end >= 0 ? [{ label: 'Transmit data', note: 'After the header: a line naming the transmit format, modeller version and schema, then the model as a sequence of nodes (each a node type number, an index, then its fields), ending with a terminator. Pointers between nodes are indices. Layout from the Parasolid XT Format Reference that Siemens publishes.', depth: 0, from: end, to: lines.length }] : []),
  ];
  const tok = rules([[/^\*\*\w+;?/, 'k'], [/\b[A-Z_]+(?==)/, 'a'], [/SCH_\w+/, 's'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    const it = [...items].reverse().find((x) => i >= x.from && i < x.to);
    const kv = lines[i].match(/^([A-Z_]+)=(.*?);?$/);
    if (kv) return { title: kv[1], value: kv[2], text: it?.note };
    return it ? { title: it.label, text: it.note } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'Parasolid transmit file in text form (.x_t): a human-readable header in three parts, then the model data written against the schema the header names.' };
}

// ---------------------------------------------------------------- Languages and small text formats
export function usda(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items: Item[] = [{ label: 'Layer header and metadata', note: '#usda 1.0 marks a USD ASCII layer; the parenthesized block holds layer metadata: defaultPrim, metersPerUnit, upAxis.', depth: 0, from: 0, to: Math.max(1, lines.findIndex((l) => /^def /.test(l))) }];
  const stack: Item[] = [];
  let depth = 0;
  lines.forEach((l, i) => {
    const d = l.match(/^\s*def\s+(\w+)\s+"([^"]+)"/);
    if (d) { const it: Item = { label: `${d[1]} "${d[2]}"`, note: d[1] === 'Mesh' ? 'A Mesh prim: points, faceVertexCounts (corners per face), faceVertexIndices (point ids, flat) and optional normals.' : d[1] === 'Xform' ? 'A transformable prim; groups its children.' : 'A prim definition.', depth, from: i, to: lines.length }; items.push(it); stack.push(it); }
    for (const ch of l) { if (ch === '{') depth++; if (ch === '}') { depth--; const it = stack.pop(); if (it) it.to = i + 1; } }
  });
  const ATTR: Record<string, string> = { points: 'Point positions (point3f array).', faceVertexCounts: 'Number of corners of each face.', faceVertexIndices: 'Point indices of all faces, one after another.', normals: 'Normals.', extent: 'Bounding box: min and max corners.', subdivisionScheme: 'none means render as a polygon mesh, not a subdivision surface.', doubleSided: 'Render both sides.' };
  const tok = TOK.code(['def', 'over', 'class', 'uniform', 'custom', 'float3', 'point3f', 'normal3f', 'int', 'token', 'bool', 'double', 'float', 'string', 'color3f']);
  const lineNote = (i: number): Note | null => {
    const a = Object.keys(ATTR).find((k) => new RegExp(`\\b${k}\\b`).test(lines[i]));
    return a ? { title: a, text: ATTR[a] } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'USD ASCII layer (.usda): a header, then nested prim definitions with typed attributes.' };
}
export function def(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const DEF: Record<string, string> = { VERSION: 'DEF syntax version.', DIVIDERCHAR: 'Hierarchy divider in names.', BUSBITCHARS: 'Bus bit delimiters.', DESIGN: 'Design name.', UNITS: 'Database units per micron.', DIEAREA: 'Die boundary in database units.', ROW: 'A placement row: name, site, origin, orientation, repeat count and step.', TRACKS: 'Routing tracks on a layer: direction, start, count and step.', GCELLGRID: 'Global routing cell grid.', VIAS: 'Via definitions.', COMPONENTS: 'Placed cell instances: name, cell type and placement.', PINS: 'Top-level pins: net, direction, layer and placement.', SPECIALNETS: 'Power and ground nets with their routing.', NETS: 'Signal nets: the pins each connects, and routing if present.', 'END DESIGN': 'End of the design.' };
  const items: Item[] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^([A-Z]+)\b/);
    if (!m || !DEF[m[1]]) return;
    let to = i + 1;
    if (/^(COMPONENTS|PINS|NETS|SPECIALNETS|VIAS)\b/.test(l)) { const e = lines.findIndex((x, k) => k > i && x.startsWith(`END ${m[1]}`)); to = e + 1; }
    items.push({ label: l.split(';')[0].trim().slice(0, 40), note: DEF[m[1]], depth: 0, from: i, to });
  });
  const tok = rules([[/#.*/, 'c'], [/\b[A-Z][A-Z_]+\b/, 'k'], [/"[^"]*"/, 's'], [/[-+;()]/, 'p'], [NUM_RE, 'n']]);
  return { kind: 'text', lines, items: groupRepeats(items, 40), tok, summary: 'DEF (Design Exchange Format) for a placed and routed design: statements end with ";", list sections run to END, coordinates are in database units.' };
}
const LANG: Record<string, { kw: string[]; comment?: RegExp; title: string; summary: string; notes: Record<string, string> }> = {
  verilog: { kw: ['module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'always', 'assign', 'begin', 'end', 'if', 'else', 'posedge', 'negedge', 'parameter', 'localparam'], title: 'Verilog', summary: 'Verilog source: a module with its ports, internal signals and behavior. Text, so any editor or simulator can read it.', notes: { module: 'Declares a module and its port list.', input: 'Input port.', output: 'Output port.', reg: 'A variable that holds its value between assignments.', always: 'A block that runs on the listed events, here on each rising clock edge.', assign: 'Continuous assignment.', endmodule: 'Ends the module.', posedge: 'Rising edge.' } },
  spice: { kw: [], comment: /^\*.*|;.*/, title: 'SPICE netlist', summary: 'SPICE netlist: the first line is the title, each element line starts with a letter for its kind, dot lines are control statements, .end closes the deck.', notes: {} },
  modelica: { kw: ['model', 'end', 'parameter', 'Real', 'equation', 'der', 'within', 'import', 'extends', 'annotation', 'initial', 'constant'], title: 'Modelica', summary: 'Modelica model: declarations, then equations solved together (acausal). der(x) is the time derivative of x.', notes: { model: 'Starts a model class.', parameter: 'A parameter: fixed during a simulation.', Real: 'A real-valued variable.', equation: 'Equations follow; their order does not matter.', end: 'Ends the class.' } },
  sysml: { kw: ['package', 'part', 'def', 'attribute', 'port', 'connect', 'to', 'import', 'doc', 'item', 'action', 'requirement', 'satisfy', 'ref', 'in', 'out'], title: 'SysML v2', summary: 'SysML v2 textual notation: definitions (part def) and usages (part) in packages, with attributes and ports.', notes: { package: 'A package groups model elements.', part: 'A part usage or, with def, a part definition (a type).', attribute: 'An attribute with a type and an optional value.', port: 'A port: an interaction point.', import: 'Imports a library package, such as ISQ quantities or SI units.' } },
};
const SPICE_EL: Record<string, string> = { R: 'resistor: two nodes and a value', C: 'capacitor: two nodes and a value', L: 'inductor', V: 'independent voltage source: nodes, then DC, AC or a waveform', I: 'independent current source', D: 'diode', Q: 'bipolar transistor', M: 'MOSFET', X: 'subcircuit instance', E: 'voltage-controlled voltage source' };
export function lang(src: string, id: keyof typeof LANG): TextDoc {
  const lines = src.split(/\r?\n/);
  const L = LANG[id];
  const tok = id === 'spice' ? rules([[/^\*.*|;.*/, 'c'], [/^\.\w+/, 'k'], [/^[A-Za-z]\w*/, 'e'], [/\b\d+(?:\.\d+)?[a-zA-Z]*\b/, 'n']]) : TOK.code(L.kw, L.comment);
  const items: Item[] = [];
  lines.forEach((l, i) => {
    if (id === 'spice') {
      if (i === 0) items.push({ label: 'Title line', note: 'The first line of a SPICE deck is always the title.', depth: 0, from: 0, to: 1 });
      else if (/^\./.test(l)) items.push({ label: l.trim().split(/\s+/)[0], note: 'Control statement: analysis (.tran, .ac, .op), options or .end.', depth: 0, from: i, to: i + 1 });
      else if (/^[A-Za-z]/.test(l)) items.push({ label: `${l.split(/\s+/)[0]} (${SPICE_EL[l[0].toUpperCase()]?.split(':')[0] ?? 'element'})`, note: SPICE_EL[l[0].toUpperCase()], depth: 1, from: i, to: i + 1 });
    } else {
      const m = l.match(/^\s*(?:\w+\s+)?(module|model|package|part def|part|equation|always|port def)\b\s*(\w*)/);
      if (m) items.push({ label: `${m[1]} ${m[2]}`.trim(), note: L.notes[m[1].split(' ')[0]], depth: /^\s{2,}/.test(l) ? 1 : 0, from: i, to: i + 1 });
    }
  });
  const lineNote = (i: number): Note | null => {
    const l = lines[i];
    if (id === 'spice') {
      if (i === 0) return { title: 'Title', text: 'The first line is the title, whatever it says.' };
      const e = SPICE_EL[l.trim()[0]?.toUpperCase()];
      if (/^\*/.test(l)) return { title: 'Comment', text: 'Lines starting with * are comments.' };
      if (/^\./.test(l)) return { title: l.trim().split(/\s+/)[0], value: l.trim(), text: 'Control statement.' };
      return e ? { title: l.split(/\s+/)[0], value: l.trim(), text: `A ${e}.` } : null;
    }
    const k = Object.keys(L.notes).find((w) => new RegExp(`\\b${w}\\b`).test(l));
    return k ? { title: k, text: L.notes[k] } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: L.summary };
}

// ---------------------------------------------------------------- KiCad board (S-expression)
// From the KiCad developer documentation (dev-docs.kicad.org/en/file-formats/sexpr-pcb/): one
// nested list per item; units are millimeters.
const KICAD: Record<string, string> = {
  kicad_pcb: 'The board file itself; everything else is nested inside it.',
  version: 'File format version (a date-like number), so KiCad knows how to read it.',
  generator: 'The program that wrote the file.',
  general: 'Board-wide settings such as the board thickness in millimeters.',
  layers: 'The layers of the board: copper (F.Cu front, B.Cu back) and non-copper layers such as silkscreen, solder mask and Edge.Cuts (the outline).',
  setup: 'Design settings, such as mask clearances.',
  net: 'A net: a named electrical connection. Pads and tracks refer to nets by number.',
  footprint: 'A component placed on the board: its library name, position (at x y) and pads.',
  pad: 'A pad: copper where a component lead is soldered. thru_hole pads are drilled; smd pads sit on the surface.',
  gr_line: 'A drawn line. On the Edge.Cuts layer these lines are the board outline the factory cuts.',
  segment: 'A copper track between two points, with a width, on a copper layer, carrying one net.',
  via: 'A plated hole that connects tracks on different layers.',
  zone: 'A copper fill area, often a ground plane.',
  property: 'A property of a footprint, such as its reference (R1) or value (10k).',
};
export function kicadPcb(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items: Item[] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(\t*)\((\w+)/);
    if (!m) return;
    const depth = m[1].length;
    if (depth > 1) return;
    // A top-level item runs until the line that closes it.
    let to = i + 1;
    if (!/\)\s*$/.test(l) || (l.match(/\(/g) ?? []).length > (l.match(/\)/g) ?? []).length) {
      while (to < lines.length && !new RegExp(`^\\t{${depth}}\\)`).test(lines[to])) to++;
      to = Math.min(lines.length, to + 1);
    }
    const name = m[2];
    const label = name === 'footprint' ? `footprint ${(l.match(/"([^"]+)"/) ?? [])[1] ?? ''}` : name === 'net' ? `net ${(l.match(/"([^"]*)"/) ?? [])[1] || '(none)'}` : name;
    items.push({ label, note: KICAD[name] ?? 'A board item.', depth, from: i, to });
  });
  const tok = rules([[/"[^"]*"/, 's'], [/\((\w+)/, 'k'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    const m = lines[i].match(/\((\w+)/);
    return m && KICAD[m[1]] ? { title: m[1], text: KICAD[m[1]] } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: `KiCad board file: readable text made of nested lists in parentheses (S-expressions). ${plural(items.filter((x) => x.depth === 1).length, 'top-level item')}: layers, nets, footprints with their pads, the outline (gr_line on Edge.Cuts) and copper tracks (segment). Units are millimeters.` };
}

// ---------------------------------------------------------------- OpenSCAD script
// From the OpenSCAD User Manual: a program of statements that build a solid from primitives and
// combine them (union, difference, intersection) under transforms.
const SCAD: Record<string, string> = {
  difference: 'Keeps the first shape and cuts away all the shapes after it, here the holes.',
  union: 'Joins shapes into one solid.',
  intersection: 'Keeps only the volume the shapes share.',
  cube: 'A box: [x, y, z] sizes in millimeters, one corner at the origin.',
  cylinder: 'A cylinder: d is the diameter, h the height; $fn sets how many facets approximate the circle.',
  sphere: 'A sphere.',
  translate: 'Moves the shape that follows by [x, y, z].',
  rotate: 'Rotates the shape that follows by [x, y, z] degrees.',
  for: 'Repeats the shape for each value in the list.',
  module: 'Defines a reusable part.',
};
export function scad(src: string): TextDoc {
  const lines = src.split(/\r?\n/);
  const items: Item[] = [];
  const firstCode = lines.findIndex((l) => l.trim() && !l.trim().startsWith('//'));
  if (firstCode > 0) items.push({ label: 'Header comments', note: 'Comments start with //; OpenSCAD ignores them.', depth: 0, from: 0, to: firstCode });
  const vars = lines.flatMap((l, i) => (/^\s*\w+\s*=/.test(l) ? [i] : []));
  if (vars.length) items.push({ label: 'Parameters', note: 'Named values the shapes below use, so a dimension changes in one place.', depth: 0, from: vars[0], to: vars[vars.length - 1] + 1 });
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(difference|union|intersection|module)\b/);
    if (m) {
      let depth = 0, to = i;
      for (let k = i; k < lines.length; k++) { depth += (lines[k].match(/\{/g) ?? []).length - (lines[k].match(/\}/g) ?? []).length; if (depth <= 0 && k > i) { to = k; break; } }
      items.push({ label: m[1], note: SCAD[m[1]], depth: /^\s{4,}/.test(l) ? 1 : 0, from: i, to: to + 1 });
    }
  });
  const tok = rules([[/\/\/.*/, 'c'], [/\b(?:difference|union|intersection|cube|cylinder|sphere|translate|rotate|for|module)\b/, 'k'], [/\$fn|\b[a-z]\w*(?=\s*=)/, 'a'], [NUM_RE, 'n']]);
  const lineNote = (i: number): Note | null => {
    const k = Object.keys(SCAD).find((w) => new RegExp(`\\b${w}\\b`).test(lines[i]));
    return k ? { title: k, text: SCAD[k] } : null;
  };
  return { kind: 'text', lines, items, tok, lineNote, summary: 'OpenSCAD script: a small program, not a stored shape. OpenSCAD runs it to build the solid: primitives (cube, cylinder) are moved into place and combined, and difference() cuts the holes.' };
}
