// 3D XML (.3dxml): the ZIP layout from the generic ZIP annotator, plus what the archive means,
// read with the shared 3D XML reader: the header (SchemaVersion, Generator), the product tree
// with each instance's placement, and triangle and vertex counts per .3DRep file.
import type { BinDoc } from './types';
import { esc } from './types';
import { zip } from './bin';
import { read3dxml } from '../threedxml';
import type { Node3dx } from '../threedxml';

const n = (x: number) => x.toLocaleString('en-US');
const plural = (k: number, w: string) => `${n(k)} ${w}${k === 1 ? '' : 's'}`;

export function threeDxml(bytes: Uint8Array): BinDoc {
  const base = zip(bytes, 'A 3D XML file');
  const d = read3dxml(bytes);
  const repByFile = new Map([...d.reps.values()].map((r) => [r.file, r]));
  const repLine = (f: string) => { const r = repByFile.get(f); return r ? `${plural(r.triangles, 'triangle')}, ${n(r.vertices)} vertices in ${plural(r.reps, 'polygonal rep')}${r.lods ? `, plus ${plural(r.lods, 'coarser level')} of detail` : ''}` : ''; };
  for (const it of base.items) {
    const m = it.label.match(/^Data: (.*)$/);
    if (!m) continue;
    const f = m[1];
    if (/^manifest\.xml$/i.test(f)) it.note = `${it.note} The manifest: names the root file${d.manifestRoot ? ` (${d.manifestRoot})` : ''} that a reader opens first.`;
    else if (f === d.rootFile) it.note = `${it.note} The root file: header and product structure (Reference3D, Instance3D, InstanceRep, ReferenceRep), default view and material links.`;
    else if (repByFile.has(f)) { it.note = `${it.note} A tessellated representation (.3DRep): PolygonalRep elements with Faces (triangles, strips, fans) indexing a VertexBuffer.`; it.value = `${it.value ? `${it.value}; ` : ''}${repLine(f)}`; }
  }
  for (const it of base.items) {
    const m = it.label.match(/^Local header: (.*)$/);
    if (m && repByFile.has(m[1])) it.value = `${it.value}; ${repLine(m[1])}`;
  }

  // The product tree as text, with placements and the rep files each part shows.
  const lines: string[] = [];
  const h = d.header;
  lines.push('Header');
  for (const k of ['SchemaVersion', 'Generator', 'Title', 'Author', 'Created']) if (h[k]) lines.push(`  ${k}: ${h[k]}`);
  lines.push(`  Manifest root: ${d.manifestRoot || '(none)'}${d.rootFile && d.rootFile !== d.manifestRoot ? ` (stored as ${d.rootFile})` : ''}`);
  lines.push('', 'Product tree (instance -> reference [rep files] at its translation)');
  const fmt = (x: number) => { const s = x.toFixed(1); return s === '0.0' || s === '-0.0' ? '0' : s; };
  const walk = (node: Node3dx, pre: string, last: boolean, top: boolean) => {
    const label = node.instance ? `${node.instance} -> ${node.name}` : `${node.name} (root)`;
    const reps = node.reps.length ? ` [${node.reps.join(', ')}]` : '';
    const at = node.matrix ? ` at (${node.matrix.slice(9).map(fmt).join(', ')})` : '';
    lines.push(`${top ? '' : `${pre}${last ? '`-- ' : '|-- '}`}${label}${reps}${at}`);
    node.children.forEach((c, i) => walk(c, top ? '' : `${pre}${last ? '    ' : '|   '}`, i === node.children.length - 1, false));
  };
  if (d.tree) walk(d.tree, '', true, true);
  lines.push('', 'Representations (full detail)');
  for (const r of d.reps.values()) lines.push(`  ${r.file}: ${repLine(r.file)}`);
  lines.push('', 'Archive contents');
  for (const f of d.files) lines.push(`  ${f.name} (${n(f.size)} bytes inflated)`);

  const tris = [...d.reps.values()].reduce((s, r) => s + r.triangles, 0);
  base.aside = { title: 'Header, product tree and meshes (decoded in your browser)', text: lines.join('\n'), first: true };
  base.summary = esc(`A 3D XML file is a ZIP archive (local file headers with deflated parts, then a central directory). ${plural(d.files.length, 'part')}: Manifest.xml names the root file${d.manifestRoot ? `, ${d.manifestRoot}` : ''}, which holds the header (schema ${h.SchemaVersion ?? '?'}, written by ${h.Generator ?? 'an unnamed program'}) and the product structure: ${plural(d.counts.references, 'reference')} placed by ${plural(d.counts.instances, 'instance')}, showing ${plural(d.counts.repFiles, 'tessellated .3DRep file')} with ${plural(tris, 'triangle')} at full detail. The decoded header, tree and mesh counts are above the bytes; any part opens as text.`);
  return base;
}
