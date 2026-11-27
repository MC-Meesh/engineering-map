// 3D XML reader shared by the 3D viewer and the format inspector. A .3dxml file is a ZIP archive:
// Manifest.xml names the root product structure file (Model_3dxml with a Header and a
// ProductStructure of Reference3D, Instance3D, InstanceRep and ReferenceRep elements), and each
// ReferenceRep points through associatedFile="urn:3DXML:<name>.3DRep" at a tessellated
// representation (XMLRepresentation with PolygonalRepType reps: Faces/Face triangles, strips and
// fans indexing a VertexBuffer of positions). Written for this site from the public description
// of the format and the sample's own XML. The archive is unzipped with fflate, which three.js
// ships (the 3MF loader uses it too).
// @ts-ignore: three ships this module without type declarations
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';

export type Mesh3dx = { positions: Float32Array; normals?: Float32Array; index: Uint32Array };
export type Rep3dx = { file: string; meshes: Mesh3dx[]; reps: number; lods: number; triangles: number; vertices: number };
export type Node3dx = { id: string; name: string; instance?: string; matrix?: number[]; reps: string[]; children: Node3dx[] };
export type Doc3dx = {
  files: { name: string; size: number }[];
  manifestRoot: string;
  rootFile: string;
  header: Record<string, string>;
  tree: Node3dx | null;
  reps: Map<string, Rep3dx>;
  counts: { references: number; instances: number; repFiles: number };
};

const td = new TextDecoder();
const local = (el: Element) => el.localName;
const kids = (el: Element, name: string) => [...el.children].filter((c) => local(c) === name);
const kid = (el: Element, name: string) => kids(el, name)[0];
const txt = (el: Element | undefined) => (el?.textContent ?? '').trim();
const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const nums = (s: string) => s.trim().split(/[\s,]+/).filter(Boolean).map(Number);

/** Triangles of one Face: plain triangles, triangle strips and fans (lists separated by commas). */
function faceTriangles(face: Element, out: number[]) {
  const t = face.getAttribute('triangles');
  if (t) for (const v of nums(t)) out.push(v);
  for (const s of (face.getAttribute('strips') ?? '').split(',')) {
    const v = nums(s);
    for (let k = 0; k + 2 < v.length; k++) {
      if (k % 2 === 0) out.push(v[k], v[k + 1], v[k + 2]);
      else out.push(v[k + 1], v[k], v[k + 2]);
    }
  }
  for (const s of (face.getAttribute('fans') ?? '').split(',')) {
    const v = nums(s);
    for (let k = 1; k + 1 < v.length; k++) out.push(v[0], v[k], v[k + 1]);
  }
}

/** One .3DRep file: every PolygonalRep, at its full detail (the Faces directly under the rep;
 *  the PolygonalLOD elements beside it are coarser versions for distant views). */
export function readRep(file: string, src: string): Rep3dx {
  const doc = parseXml(src);
  const out: Rep3dx = { file, meshes: [], reps: 0, lods: 0, triangles: 0, vertices: 0 };
  for (const rep of [...doc.getElementsByTagName('*')].filter((e) => local(e) === 'Rep' && /PolygonalRepType$/.test(e.getAttribute('xsi:type') ?? e.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ?? ''))) {
    out.reps++;
    const lods = kids(rep, 'PolygonalLOD');
    out.lods += lods.length;
    const faces = kid(rep, 'Faces') ?? (lods.length ? kid(lods.sort((a, b) => Number(a.getAttribute('accuracy')) - Number(b.getAttribute('accuracy')))[0], 'Faces') : undefined);
    const vb = kid(rep, 'VertexBuffer');
    if (!faces || !vb) continue;
    const positions = Float32Array.from(nums(txt(kid(vb, 'Positions'))));
    const nrm = kid(vb, 'Normals') ? Float32Array.from(nums(txt(kid(vb, 'Normals')))) : undefined;
    const idx: number[] = [];
    for (const f of kids(faces, 'Face')) faceTriangles(f, idx);
    out.meshes.push({ positions, normals: nrm && nrm.length === positions.length ? nrm : undefined, index: Uint32Array.from(idx) });
    out.triangles += idx.length / 3;
    out.vertices += positions.length / 3;
  }
  return out;
}

export function read3dxml(bytes: Uint8Array): Doc3dx {
  const zip: Record<string, Uint8Array> = unzipSync(bytes);
  const names = Object.keys(zip);
  // Names in the archive are matched without regard to case, as CATIA writes them on Windows.
  const find = (n: string) => names.find((x) => x.toLowerCase() === n.toLowerCase());
  const manifestName = find('Manifest.xml');
  const manifestRoot = manifestName ? txt(kid(parseXml(td.decode(zip[manifestName])).documentElement, 'Root')) : '';
  const rootFile = find(manifestRoot) ?? names.find((n) => /\.3dxml$/i.test(n) && /<ProductStructure/.test(td.decode(zip[n]))) ?? '';
  const out: Doc3dx = { files: names.map((n) => ({ name: n, size: zip[n].length })), manifestRoot, rootFile, header: {}, tree: null, reps: new Map(), counts: { references: 0, instances: 0, repFiles: 0 } };
  if (!rootFile) return out;
  const doc = parseXml(td.decode(zip[rootFile])).documentElement;
  const header = kid(doc, 'Header');
  if (header) for (const h of [...header.children]) out.header[local(h)] = txt(h);
  const ps = kid(doc, 'ProductStructure');
  if (!ps) return out;
  const byId = new Map<string, Element>();
  for (const e of [...ps.children]) byId.set(e.getAttribute('id') ?? '', e);
  const childrenOf = new Map<string, Element[]>();
  for (const e of [...ps.children]) {
    const parent = txt(kid(e, 'IsAggregatedBy'));
    if (parent) { if (!childrenOf.has(parent)) childrenOf.set(parent, []); childrenOf.get(parent)!.push(e); }
  }
  out.counts.references = [...ps.children].filter((e) => local(e) === 'Reference3D').length;
  out.counts.instances = [...ps.children].filter((e) => local(e) === 'Instance3D').length;
  // The rep files each Reference3D shows, through InstanceRep -> ReferenceRep -> associatedFile.
  const repsOf = (refId: string) => (childrenOf.get(refId) ?? []).filter((e) => local(e) === 'InstanceRep').map((ir) => byId.get(txt(kid(ir, 'IsInstanceOf')))?.getAttribute('associatedFile') ?? '').map((u) => u.replace(/^urn:3DXML:/, '')).filter(Boolean);
  const build = (refId: string, inst: Element | undefined, depth: number): Node3dx => {
    const ref = byId.get(refId);
    const m = inst ? nums(txt(kid(inst, 'RelativeMatrix'))) : undefined;
    const node: Node3dx = { id: refId, name: ref?.getAttribute('name') ?? refId, instance: inst?.getAttribute('name') ?? undefined, matrix: m?.length === 12 ? m : undefined, reps: repsOf(refId), children: [] };
    if (depth < 32) for (const c of childrenOf.get(refId) ?? []) if (local(c) === 'Instance3D') node.children.push(build(txt(kid(c, 'IsInstanceOf')), c, depth + 1));
    return node;
  };
  out.tree = build(ps.getAttribute('root') ?? '', undefined, 0);
  const used = new Set<string>();
  const walk = (n: Node3dx) => { n.reps.forEach((r) => used.add(r)); n.children.forEach(walk); };
  walk(out.tree);
  for (const r of used) {
    const n = find(r);
    if (n) out.reps.set(r, readRep(n, td.decode(zip[n])));
  }
  out.counts.repFiles = out.reps.size;
  return out;
}

/** A 12-number RelativeMatrix (the 3x3 rotation as three axis columns, then the translation) as
 *  a column-major 4x4 matrix, ready for THREE.Matrix4.fromArray. */
export const matrix4 = (m: number[]) => [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, m[9], m[10], m[11], 1];
