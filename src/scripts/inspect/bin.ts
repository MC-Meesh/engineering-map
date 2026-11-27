// Annotators for binary formats: clean-room parsers written from published specifications and
// public documentation (sources per format in docs/decisions/0006-format-inspector.md).
// Each returns byte ranges with what they mean; unclaimed ranges are labeled "not decoded".
import type { BinDoc, Item } from './types';
import { esc, f32, f64, u8, u16, u32, i32, ascii, text, fmtNum } from './types';

const hex = (n: number) => `0x${n.toString(16)}`;
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

async function inflateRaw(b: Uint8Array): Promise<Uint8Array> {
  const ds = new (window as any).DecompressionStream('deflate-raw');
  const out = new Response(new Blob([b as unknown as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** Adds "not decoded" items over gaps so every byte belongs to something. */
function fillGaps(items: Item[], len: number, note: string): Item[] {
  const top = items.filter((i) => i.depth === 0).sort((a, b) => a.from - b.from);
  const gaps: Item[] = [];
  let at = 0;
  for (const it of top) {
    if (it.from > at + 2) gaps.push({ label: 'Not decoded', note, depth: 0, from: at, to: it.from });
    at = Math.max(at, it.to);
  }
  if (at + 2 < len) gaps.push({ label: 'Not decoded', note, depth: 0, from: at, to: len });
  return [...items, ...gaps].sort((a, b) => a.from - b.from || a.depth - b.depth);
}

// ---------------------------------------------------------------- STL (binary)
export function stl(bytes: Uint8Array): BinDoc {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const n = dv.getUint32(80, true);
  const xyz = (name: string, off: number) => [0, 1, 2].map((k) => ({ off: off + 4 * k, len: 4, name: `${name}.${'xyz'[k]}`, fmt: f32 }));
  const items: Item[] = [
    { label: 'Header (80 bytes)', note: 'Free text, ignored by readers. It must not start with "solid", or some readers take the file for ASCII STL.', value: JSON.stringify(text(bytes.subarray(0, 80)).trim()), depth: 0, from: 0, to: 80 },
    { label: 'Triangle count', note: 'Unsigned 32-bit little-endian integer.', value: String(n), depth: 0, from: 80, to: 84 },
    {
      label: `Triangles (${n.toLocaleString('en-US')} x 50 bytes)`,
      note: 'Each triangle: normal (3 float32), three vertices (3 float32 each), then a 2-byte attribute count, usually 0. Vertices are not shared, so each corner is stored again for every triangle that uses it.',
      depth: 0, from: 84, to: 84 + n * 50,
      array: { name: 'Triangle', stride: 50, fields: [...xyz('normal', 0), ...xyz('v1', 12), ...xyz('v2', 24), ...xyz('v3', 36), { off: 48, len: 2, name: 'attribute', fmt: u16 }] },
    },
  ];
  return { kind: 'bin', bytes, items: fillGaps(items, bytes.length, 'Bytes after the last triangle.'), summary: `Binary STL: an 80-byte header, a 4-byte count and ${plural(n, 'triangle')} of 50 bytes each (${(84 + n * 50).toLocaleString('en-US')} bytes expected, ${bytes.length.toLocaleString('en-US')} in the file). Hover a byte to see which triangle and field it is.` };
}

// ---------------------------------------------------------------- glTF binary (GLB)
const COMP: Record<number, [string, number, (dv: DataView, o: number) => string]> = { 5120: ['int8', 1, (d, o) => String(d.getInt8(o))], 5121: ['uint8', 1, u8], 5122: ['int16', 2, (d, o) => String(d.getInt16(o, true))], 5123: ['uint16', 2, u16], 5125: ['uint32', 4, u32], 5126: ['float32', 4, f32] };
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
export function glb(bytes: Uint8Array): BinDoc {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const items: Item[] = [
    { label: 'Header', note: 'Magic "glTF", container version (2) and total length, three little-endian uint32.', value: `version ${dv.getUint32(4, true)}, length ${dv.getUint32(8, true)}`, depth: 0, from: 0, to: 12 },
  ];
  let at = 12;
  let json: any = null;
  let binStart = -1;
  while (at + 8 <= bytes.length) {
    const len = dv.getUint32(at, true);
    const type = text(bytes.subarray(at + 4, at + 8));
    items.push({ label: `${type} chunk header`, note: 'Chunk length (uint32) and chunk type: "JSON" or "BIN".', value: `length ${len}`, depth: 0, from: at, to: at + 8 });
    if (type === 'JSON') {
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(at + 8, at + 8 + len)));
      items.push({ label: 'JSON chunk', note: 'The glTF document: scenes, nodes, meshes, accessors and buffer views. Shown in full beside the bytes.', depth: 0, from: at + 8, to: at + 8 + len });
    } else {
      binStart = at + 8;
      items.push({ label: 'BIN chunk', note: 'The binary buffer that accessors read from, through buffer views.', depth: 0, from: at + 8, to: at + 8 + len });
    }
    at += 8 + len;
  }
  if (json && binStart >= 0) {
    (json.accessors ?? []).forEach((a: any, k: number) => {
      const bv = json.bufferViews?.[a.bufferView];
      if (!bv) return;
      const [cn, cs, fmt] = COMP[a.componentType] ?? ['?', 4, u32];
      const nc = NCOMP[a.type] ?? 1;
      const stride = bv.byteStride ?? cs * nc;
      const from = binStart + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
      const use = Object.entries(json.meshes?.[0]?.primitives?.[0]?.attributes ?? {}).find(([, v]) => v === k)?.[0] ?? (json.meshes?.[0]?.primitives?.[0]?.indices === k ? 'indices' : `accessor ${k}`);
      items.push({ label: `${use}: ${a.count} x ${a.type} ${cn}`, note: `Accessor ${k} reads ${a.count} ${a.type} elements of ${cn} through buffer view ${a.bufferView}${a.min ? `; bounds ${JSON.stringify(a.min)} to ${JSON.stringify(a.max)}` : ''}.`, depth: 1, from, to: from + stride * (a.count - 1) + cs * nc, array: { name: use, stride, fields: Array.from({ length: nc }, (_, c) => ({ off: c * cs, len: cs, name: nc > 1 ? 'xyzw'[c] ?? `c${c}` : 'value', fmt })) } });
    });
  }
  return { kind: 'bin', bytes, items: fillGaps(items, bytes.length, 'Padding or unused bytes.'), aside: json ? { title: 'JSON chunk', text: JSON.stringify(json, null, 2) } : undefined, summary: 'glTF 2.0 binary (GLB): a 12-byte header, a JSON chunk that describes the scene and a BIN chunk with the vertex and index data. Accessor ranges inside BIN are decoded per element.' };
}

// ---------------------------------------------------------------- PLY (binary little endian)
const PLYT: Record<string, [number, (dv: DataView, o: number) => string]> = { char: [1, (d, o) => String(d.getInt8(o))], uchar: [1, u8], uint8: [1, u8], short: [2, (d, o) => String(d.getInt16(o, true))], ushort: [2, u16], int: [4, i32], int32: [4, i32], uint: [4, u32], uint32: [4, u32], float: [4, f32], float32: [4, f32], double: [8, f64], float64: [8, f64] };
export function ply(bytes: Uint8Array): BinDoc {
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const end = head.indexOf('end_header\n') + 'end_header\n'.length;
  const items: Item[] = [{ label: 'ASCII header', note: 'Text header: "ply", the format line (binary_little_endian here), comments, then each element with its count and properties. It ends with end_header.', depth: 0, from: 0, to: end }];
  const els: { name: string; n: number; props: { name: string; t: string; list?: [string, string] }[] }[] = [];
  for (const l of head.slice(0, end).split('\n')) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'element') els.push({ name: p[1], n: Number(p[2]), props: [] });
    if (p[0] === 'property') els[els.length - 1].props.push(p[1] === 'list' ? { name: p[4], t: p[3], list: [p[2], p[3]] } : { name: p[2], t: p[1] });
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  let at = end;
  for (const e of els) {
    const fixed = e.props.every((p) => !p.list);
    if (fixed) {
      let off = 0;
      const fields = e.props.map((p) => { const [sz, fmt] = PLYT[p.t]; const f = { off, len: sz, name: p.name, fmt }; off += sz; return f; });
      items.push({ label: `${e.name} (${e.n.toLocaleString('en-US')} x ${off} bytes)`, note: `Element ${e.name}: ${e.props.map((p) => `${p.name} ${p.t}`).join(', ')}.`, depth: 0, from: at, to: at + e.n * off, array: { name: e.name, stride: off, fields } });
      at += e.n * off;
    } else {
      // List properties have a count before the values, so records vary in size: walk them.
      const from = at;
      const p = e.props[0];
      const [cs, cfmt] = PLYT[p.list![0]];
      const [vs] = PLYT[p.list![1]];
      let first = 0;
      for (let k = 0; k < e.n && at < bytes.length; k++) {
        const c = Number(cfmt(dv, at));
        if (k === 0) first = cs + c * vs;
        at += cs + c * vs;
      }
      items.push({ label: `${e.name} (${e.n.toLocaleString('en-US')} lists)`, note: `Element ${e.name}: each record is a ${p.list![0]} count, then that many ${p.list![1]} values (${p.name}). With 3-corner faces each record is ${first} bytes.`, depth: 0, from, to: at, array: first ? { name: e.name, stride: first, fields: [{ off: 0, len: cs, name: 'count', fmt: cfmt }, ...[0, 1, 2].map((k) => ({ off: cs + k * vs, len: vs, name: `index ${k}`, fmt: PLYT[p.list![1]][1] }))] } : undefined });
    }
  }
  return { kind: 'bin', bytes, items: fillGaps(items, bytes.length, 'Bytes past the declared elements.'), summary: `PLY: a text header that declares the elements, then the element data in binary. ${els.map((e) => `${e.n.toLocaleString('en-US')} ${e.name}`).join(', ')}.` };
}

// ---------------------------------------------------------------- ZIP (3MF package)
export function zip(bytes: Uint8Array, what: string): BinDoc {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const items: Item[] = [];
  const entries: BinDoc['entries'] = [];
  let at = 0;
  while (at + 30 <= bytes.length && dv.getUint32(at, true) === 0x04034b50) {
    const method = dv.getUint16(at + 8, true), cs = dv.getUint32(at + 18, true), us = dv.getUint32(at + 22, true);
    const nl = dv.getUint16(at + 26, true), xl = dv.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nl));
    items.push({ label: `Local header: ${name}`, note: 'Signature PK\\3\\4, version, flags, compression method (8 = deflate), time, date, CRC-32, compressed and uncompressed sizes, name length, extra length, then the name.', value: `method ${method}, ${cs} bytes compressed, ${us} bytes inflated`, depth: 0, from: at, to: at + 30 + nl + xl });
    const data = bytes.subarray(at + 30 + nl + xl, at + 30 + nl + xl + cs);
    items.push({ label: `Data: ${name}`, note: method === 8 ? 'Deflate-compressed contents. Choose this part beside the bytes to inflate it in your browser.' : 'Stored contents.', depth: 0, from: at + 30 + nl + xl, to: at + 30 + nl + xl + cs });
    entries.push({ name, open: async () => new TextDecoder().decode(method === 8 ? await inflateRaw(data) : data) });
    at += 30 + nl + xl + cs;
  }
  while (at + 46 <= bytes.length && dv.getUint32(at, true) === 0x02014b50) {
    const nl = dv.getUint16(at + 28, true), xl = dv.getUint16(at + 30, true), cl = dv.getUint16(at + 32, true);
    items.push({ label: `Central directory: ${new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nl))}`, note: 'Central directory entry (PK\\1\\2): the same facts as the local header plus the offset of that header. Readers start from here.', value: `local header at ${hex(dv.getUint32(at + 42, true))}`, depth: 0, from: at, to: at + 46 + nl + xl + cl });
    at += 46 + nl + xl + cl;
  }
  if (at + 22 <= bytes.length && dv.getUint32(at, true) === 0x06054b50) items.push({ label: 'End of central directory', note: 'PK\\5\\6: number of entries, size and offset of the central directory. A reader finds this record by scanning back from the end of the file.', value: `${dv.getUint16(at + 10, true)} entries, directory at ${hex(dv.getUint32(at + 16, true))}`, depth: 0, from: at, to: bytes.length });
  return { kind: 'bin', bytes, items: fillGaps(items, bytes.length, 'Unrecognized bytes.'), entries, summary: `${what} is a ZIP package (PKWARE APPNOTE layout): local file headers with compressed parts, then a central directory and its end record. ${plural(entries.length, 'part')}; open any part as text beside the bytes.` };
}

// ---------------------------------------------------------------- GDSII stream
const GDS: Record<number, [string, string]> = {
  0: ['HEADER', 'Stream version.'], 1: ['BGNLIB', 'Library begins: modification and access dates (12 int16).'], 2: ['LIBNAME', 'Library name.'], 3: ['UNITS', 'Two 8-byte reals: user units per database unit, and database unit in meters.'], 4: ['ENDLIB', 'End of library.'], 5: ['BGNSTR', 'Structure (cell) begins: dates.'], 6: ['STRNAME', 'Structure name.'], 7: ['ENDSTR', 'End of structure.'], 8: ['BOUNDARY', 'A polygon element begins.'], 9: ['PATH', 'A path element begins.'], 10: ['SREF', 'A structure reference (cell instance).'], 11: ['AREF', 'An array reference.'], 12: ['TEXT', 'A text element.'], 13: ['LAYER', 'Layer number.'], 14: ['DATATYPE', 'Datatype number.'], 15: ['WIDTH', 'Path width.'], 16: ['XY', 'Coordinates: pairs of int32 in database units. A boundary repeats its first point at the end.'], 17: ['ENDEL', 'End of element.'], 18: ['SNAME', 'Name of the referenced structure.'], 19: ['COLROW', 'Columns and rows of an array.'], 22: ['TEXTTYPE', 'Text type.'], 23: ['PRESENTATION', 'Text font and justification.'], 25: ['STRING', 'Text string.'], 26: ['STRANS', 'Transformation flags.'], 27: ['MAG', 'Magnification.'], 28: ['ANGLE', 'Rotation angle.'], 33: ['PATHTYPE', 'Path end type.'], 43: ['PROPATTR', 'Property attribute number.'], 44: ['PROPVALUE', 'Property value.'],
};
const gdsReal = (dv: DataView, o: number) => {
  const b0 = dv.getUint8(o);
  const sign = b0 & 0x80 ? -1 : 1;
  const exp = (b0 & 0x7f) - 64;
  let mant = 0;
  for (let k = 1; k < 8; k++) mant = mant * 256 + dv.getUint8(o + k);
  return sign * (mant / 2 ** 56) * 16 ** exp;
};
export function gds(bytes: Uint8Array): BinDoc {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const items: Item[] = [];
  let at = 0;
  while (at + 4 <= bytes.length) {
    const len = dv.getUint16(at, false);
    if (len < 4) break;
    const rt = bytes[at + 2], dt = bytes[at + 3];
    const [name, note] = GDS[rt] ?? [`record ${rt}`, 'Record type not in the table here.'];
    let value = '';
    const body = at + 4, n = len - 4;
    if (dt === 2) value = Array.from({ length: n / 2 }, (_, k) => dv.getInt16(body + 2 * k, false)).join(' ');
    else if (dt === 3) { const v = Array.from({ length: n / 4 }, (_, k) => dv.getInt32(body + 4 * k, false)); value = rt === 16 ? v.reduce((s, x, k) => s + (k % 2 ? `,${x})` : ` (${x}`), '').trim() : v.join(' '); }
    else if (dt === 5) value = Array.from({ length: n / 8 }, (_, k) => fmtNum(gdsReal(dv, body + 8 * k))).join(' ');
    else if (dt === 6) value = JSON.stringify(text(bytes.subarray(body, body + n)));
    items.push({ label: name, note: `${note} Record: 2-byte length (${len}), 1-byte record type (${rt}), 1-byte data type (${['none', 'bit array', 'int16', 'int32', 'real4', 'real8 (excess-64)', 'ASCII'][dt] ?? dt}), then data. All big-endian.`, value: value.slice(0, 400), depth: [5, 6, 7].includes(rt) || [1, 2, 3, 0, 4].includes(rt) ? 0 : [8, 9, 10, 11, 12, 17].includes(rt) ? 1 : 2, from: at, to: at + len });
    at += len;
  }
  return { kind: 'bin', bytes, items: fillGaps(items, bytes.length, 'Padding after ENDLIB (files are often padded to a block size).'), summary: `GDSII stream: a flat sequence of ${plural(items.length, 'record')}, each with a big-endian length, record type and data type. Reals use the IBM excess-64 format.` };
}

// ---------------------------------------------------------------- OASIS (SEMI P39)
const OAS: Record<number, string> = { 0: 'PAD', 1: 'START', 2: 'END', 3: 'CELLNAME', 4: 'CELLNAME (with reference number)', 5: 'TEXTSTRING', 6: 'TEXTSTRING (with reference number)', 7: 'PROPNAME', 8: 'PROPNAME (with reference number)', 9: 'PROPSTRING', 10: 'PROPSTRING (with reference number)', 11: 'LAYERNAME', 12: 'LAYERNAME (text)', 13: 'CELL (by reference number)', 14: 'CELL (by name)', 15: 'XYABSOLUTE', 16: 'XYRELATIVE', 17: 'PLACEMENT', 18: 'PLACEMENT (magnification and angle)', 19: 'TEXT', 20: 'RECTANGLE', 21: 'POLYGON', 22: 'PATH', 23: 'TRAPEZOID', 24: 'TRAPEZOID', 25: 'TRAPEZOID', 26: 'CTRAPEZOID', 27: 'CIRCLE', 28: 'PROPERTY', 29: 'PROPERTY (repeat last)', 30: 'XNAME', 31: 'XNAME', 32: 'XELEMENT', 33: 'XGEOMETRY', 34: 'CBLOCK' };
class R {
  constructor(public b: Uint8Array, public p = 0) {}
  u(): number { let v = 0, s = 1; for (;;) { const c = this.b[this.p++]; v += (c & 0x7f) * s; s *= 128; if (!(c & 0x80) || this.p >= this.b.length) return v; } }
  s(): number { const v = this.u(); return v & 1 ? -Math.floor(v / 2) : Math.floor(v / 2); }
  str(): string { const n = this.u(); const t = new TextDecoder().decode(this.b.subarray(this.p, this.p + n)); this.p += n; return t; }
  real(): number {
    const t = this.u();
    if (t === 0) return this.u(); if (t === 1) return -this.u(); if (t === 2) return 1 / this.u(); if (t === 3) return -1 / this.u();
    if (t === 4) return this.u() / this.u(); if (t === 5) return -this.u() / this.u();
    const dv = new DataView(this.b.buffer, this.b.byteOffset + this.p);
    if (t === 6) { this.p += 4; return dv.getFloat32(0, true); }
    this.p += 8; return dv.getFloat64(0, true);
  }
  gdelta(): string { const a = this.u(); if (!(a & 1)) return `${['E', 'N', 'W', 'S', 'NE', 'NW', 'SW', 'SE'][(a >> 1) & 7]} ${Math.floor(a / 16)}`; const x = (a & 2 ? -1 : 1) * Math.floor(a / 4); return `(${x},${this.s()})`; }
  rep(): string {
    const t = this.u();
    const g = () => this.u();
    switch (t) {
      case 0: return 'repeat previous';
      case 1: return `${g() + 2} x ${g() + 2} grid, spacing ${g()} by ${g()}`;
      case 2: case 3: return `${g() + 2} in a ${t === 2 ? 'row' : 'column'}, spacing ${g()}`;
      case 4: case 6: { const n = g() + 2; const sp = Array.from({ length: n - 1 }, g); return `${n} at spacings ${sp.join(' ')}`; }
      case 5: case 7: { const n = g() + 2; const gr = g(); const sp = Array.from({ length: n - 1 }, g); return `${n}, grid ${gr}, spacings ${sp.join(' ')}`; }
      case 8: return `${g() + 2} x ${g() + 2}, displacements ${this.gdelta()} and ${this.gdelta()}`;
      case 9: return `${g() + 2} along ${this.gdelta()}`;
      case 10: { const n = g() + 2; return `${n} at ${Array.from({ length: n - 1 }, () => this.gdelta()).join(' ')}`; }
      default: { const n = g() + 2; g(); return `${n} at ${Array.from({ length: n - 1 }, () => this.gdelta()).join(' ')}`; }
    }
  }
  points(): string {
    const t = this.u(), n = this.u();
    const out: string[] = [];
    for (let k = 0; k < n; k++) {
      if (t <= 1) out.push(String(this.s()));
      else if (t === 2) { const v = this.u(); out.push(`${['E', 'N', 'W', 'S'][v & 3]} ${Math.floor(v / 4)}`); }
      else if (t === 3) { const v = this.u(); out.push(`${['E', 'N', 'W', 'S', 'NE', 'NW', 'SW', 'SE'][v & 7]} ${Math.floor(v / 8)}`); }
      else out.push(this.gdelta());
    }
    return `${n} deltas (${['manhattan, horizontal first', 'manhattan, vertical first', 'manhattan', 'octangular', 'general', 'double delta'][t] ?? t}): ${out.join(' ')}`;
  }
}
/** Reads one OASIS record at r.p; returns a description, or null when it cannot. */
function oasRecord(r: R, endFlag: number): { name: string; value: string } | null {
  const id = r.u();
  const name = OAS[id] ?? `record ${id}`;
  const v: string[] = [];
  switch (id) {
    case 0: break;
    case 1: v.push(`version ${r.str()}`, `unit ${fmtNum(r.real())} database units per micron`); { const f = r.u(); v.push(`table offsets ${f ? 'in END' : 'here'}`); if (!f) for (let k = 0; k < 12; k++) r.u(); } break;
    case 3: case 5: case 7: case 9: v.push(JSON.stringify(r.str())); break;
    case 4: case 6: case 8: case 10: v.push(JSON.stringify(r.str()), `reference ${r.u()}`); break;
    case 13: v.push(`cell name reference ${r.u()}`); break;
    case 14: v.push(JSON.stringify(r.str())); break;
    case 15: case 16: break;
    case 17: case 18: {
      const info = r.b[r.p++];
      if (info & 0x80) v.push(info & 0x40 ? `cell reference ${r.u()}` : `cell ${JSON.stringify(r.str())}`);
      if (id === 18) { if (info & 4) v.push(`magnification ${fmtNum(r.real())}`); if (info & 2) v.push(`angle ${fmtNum(r.real())}`); }
      if (info & 0x20) v.push(`x ${r.s()}`); if (info & 0x10) v.push(`y ${r.s()}`); if (info & 8) v.push(r.rep());
      if (id === 17) v.push(`rotation ${((info >> 1) & 3) * 90}`); if (info & 1) v.push('flipped');
      break;
    }
    case 19: { const info = r.b[r.p++]; if (info & 0x40) v.push(info & 0x20 ? `text reference ${r.u()}` : JSON.stringify(r.str())); if (info & 1) v.push(`textlayer ${r.u()}`); if (info & 2) v.push(`texttype ${r.u()}`); if (info & 0x10) v.push(`x ${r.s()}`); if (info & 8) v.push(`y ${r.s()}`); if (info & 4) v.push(r.rep()); break; }
    case 20: { const info = r.b[r.p++]; if (info & 1) v.push(`layer ${r.u()}`); if (info & 2) v.push(`datatype ${r.u()}`); if (info & 0x40) v.push(`width ${r.u()}`); if (info & 0x20) v.push(`height ${r.u()}`); if (info & 0x80) v.push('square'); if (info & 0x10) v.push(`x ${r.s()}`); if (info & 8) v.push(`y ${r.s()}`); if (info & 4) v.push(r.rep()); break; }
    case 21: { const info = r.b[r.p++]; if (info & 1) v.push(`layer ${r.u()}`); if (info & 2) v.push(`datatype ${r.u()}`); if (info & 0x20) v.push(r.points()); if (info & 0x10) v.push(`x ${r.s()}`); if (info & 8) v.push(`y ${r.s()}`); if (info & 4) v.push(r.rep()); break; }
    case 22: { const info = r.b[r.p++]; if (info & 1) v.push(`layer ${r.u()}`); if (info & 2) v.push(`datatype ${r.u()}`); if (info & 0x40) v.push(`half width ${r.u()}`); if (info & 0x80) { const e = r.u(); if ((e >> 2 & 3) === 3) r.s(); if ((e & 3) === 3) r.s(); v.push(`extension scheme ${e}`); } if (info & 0x20) v.push(r.points()); if (info & 0x10) v.push(`x ${r.s()}`); if (info & 8) v.push(`y ${r.s()}`); if (info & 4) v.push(r.rep()); break; }
    case 27: { const info = r.b[r.p++]; if (info & 1) v.push(`layer ${r.u()}`); if (info & 2) v.push(`datatype ${r.u()}`); if (info & 0x20) v.push(`radius ${r.u()}`); if (info & 0x10) v.push(`x ${r.s()}`); if (info & 8) v.push(`y ${r.s()}`); if (info & 4) v.push(r.rep()); break; }
    case 28: {
      const info = r.b[r.p++];
      if (info & 4) v.push(info & 2 ? `name reference ${r.u()}` : `name ${JSON.stringify(r.str())}`);
      if (!(info & 8)) {
        let n = info >> 4; if (n === 15) n = r.u();
        for (let k = 0; k < n; k++) { const t = r.u(); if (t <= 7) { r.p--; v.push(fmtNum(r.real())); } else if (t === 8) v.push(String(r.u())); else if (t === 9) v.push(String(r.s())); else if (t <= 12) v.push(JSON.stringify(r.str())); else v.push(`string reference ${r.u()}`); }
      }
      break;
    }
    case 29: break;
    case 2: return { name, value: `table offsets ${endFlag ? 'follow' : 'in START'}; padding and a validation scheme fill this record to 256 bytes` };
    default: return null;
  }
  return { name, value: v.join(', ') };
}
export async function oasis(bytes: Uint8Array): Promise<BinDoc> {
  const items: Item[] = [{ label: 'Magic', note: 'The 13 bytes "%SEMI-OASIS" plus CR LF.', depth: 0, from: 0, to: 13 }];
  const r = new R(bytes, 13);
  let endFlag = 0;
  while (r.p < bytes.length) {
    const from = r.p;
    if (bytes[from] === 2) { items.push({ label: 'END', note: 'END record: table offsets (when START says so), a padding string and a validation scheme (none, CRC-32 or checksum), 256 bytes in all, always last.', depth: 0, from, to: bytes.length }); break; }
    if (bytes[from] === 34) {
      r.p++;
      const ct = r.u(), us = r.u(), cs = r.u();
      const data = bytes.subarray(r.p, r.p + cs);
      r.p += cs;
      let inner = '';
      try {
        const raw = await inflateRaw(data);
        const ir = new R(raw);
        const lines: string[] = [];
        while (ir.p < raw.length) { const rec = oasRecord(ir, endFlag); if (!rec) { lines.push('(stopped: record not decoded)'); break; } lines.push(`${rec.name}${rec.value ? `: ${rec.value}` : ''}`); }
        inner = lines.join(' | ');
      } catch { inner = 'could not inflate'; }
      items.push({ label: 'CBLOCK (compressed records)', note: `Compression type ${ct} (0 is deflate), ${us} bytes inflated, ${cs} bytes stored. The records inside are decoded here: ${inner}`, value: inner.slice(0, 300), depth: 0, from, to: r.p });
      continue;
    }
    const rec = oasRecord(r, endFlag);
    if (!rec) { items.push({ label: 'Not decoded', note: 'A record this inspector does not decode; reading stops here.', depth: 0, from, to: bytes.length }); break; }
    if (rec.name === 'START') endFlag = /in END/.test(rec.value) ? 1 : 0;
    items.push({ label: rec.name, note: `OASIS record ${bytes[from]}. Integers are variable length (7 bits per byte, low bits first); signed ones keep the sign in the lowest bit.`, value: rec.value, depth: 0, from, to: r.p });
  }
  return { kind: 'bin', bytes, items: fillGaps(items, bytes.length, 'Not decoded.'), summary: 'OASIS (SEMI P39): a magic string, a START record, records with variable-length integers (cells and their shapes, often inside deflate-compressed CBLOCKs, decoded here in your browser), name tables, and a 256-byte END record.' };
}

// ---------------------------------------------------------------- HDF5 (CGNS, MED, Exodus II, XDMF heavy data)
const H5MSG: Record<number, string> = { 0: 'NIL', 1: 'Dataspace (rank and dimensions)', 2: 'Link Info', 3: 'Datatype', 4: 'Fill Value (old)', 5: 'Fill Value', 6: 'Link (a named member of a group)', 7: 'External Data Files', 8: 'Data Layout (where the data bytes are)', 10: 'Group Info', 11: 'Filter Pipeline (compression)', 12: 'Attribute', 13: 'Object Comment', 14: 'Modification Time (old)', 15: 'Shared Message Table', 16: 'Continuation (more messages elsewhere)', 17: 'Symbol Table (old-style group: B-tree and heap addresses)', 18: 'Modification Time', 19: 'B-tree K Values', 20: 'Driver Info', 21: 'Attribute Info', 22: 'Reference Count', 23: 'File Space Info' };
const H5SIG: Record<string, string> = { TREE: 'Version 1 B-tree node: indexes group members or dataset chunks.', HEAP: 'Local heap: holds the names of an old-style group\'s members.', SNOD: 'Symbol table node: entries pointing from member names (heap offsets) to object headers.', GCOL: 'Global heap collection: variable-length data such as strings.', OHDR: 'Version 2 object header: the messages that define a group or dataset.', OCHK: 'Object header continuation block.', FRHP: 'Fractal heap header: storage for new-style group links or attributes.', FHDB: 'Fractal heap direct block.', FHIB: 'Fractal heap indirect block.', BTHD: 'Version 2 B-tree header.', BTIN: 'Version 2 B-tree internal node.', BTLF: 'Version 2 B-tree leaf node.', FSHD: 'Free-space manager header.', FSSE: 'Free-space section list.', SMTB: 'Shared message table.' };
export function hdf5(bytes: Uint8Array, what: string): BinDoc {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const items: Item[] = [];
  const ver = bytes[8];
  const O = ver < 2 ? bytes[13] : bytes[9];
  const L = ver < 2 ? bytes[14] : bytes[10];
  const addr = (o: number) => (O === 8 ? Number(dv.getBigUint64(o, true)) : dv.getUint32(o, true));
  let root = -1;
  if (ver < 2) {
    let p = 24 + (ver === 1 ? 4 : 0);
    const base = addr(p), eof = addr(p + 2 * O);
    root = addr(p + 4 * O + O);
    const end = p + 4 * O + 2 * O + 8 + 16;
    items.push({ label: `Superblock version ${ver}`, note: 'Signature (\\x89HDF\\r\\n\\x1a\\n), format versions, sizes of offsets and lengths, B-tree K values and flags, then the base, free-space, end-of-file and driver addresses and the root group\'s symbol table entry.', value: `offsets ${O} bytes, lengths ${L} bytes, base ${hex(base)}, end of file ${hex(eof)}, root object header ${hex(root)}`, depth: 0, from: 0, to: end });
    items.push({ label: 'Signature', note: 'Eight bytes chosen to catch text-mode transfers: a high byte, "HDF", CR LF, Ctrl-Z, LF.', depth: 1, from: 0, to: 8 });
    items.push({ label: 'Root group symbol table entry', note: 'Link name offset, object header address of the root group, cache type and scratch pad (cached B-tree and heap addresses).', depth: 1, from: p + 4 * O, to: end });
  } else {
    root = addr(12 + 3 * O);
    items.push({ label: `Superblock version ${ver}`, note: 'Signature, version, sizes of offsets and lengths, flags, base address, superblock extension address, end-of-file address, root group object header address and a checksum.', value: `offsets ${O} bytes, root object header ${hex(root)}`, depth: 0, from: 0, to: 12 + 4 * O + 4 });
  }
  // Version 1 object header of the root group (no signature, reached by address).
  if (root > 0 && root < bytes.length && bytes[root] === 1) {
    const n = dv.getUint16(root + 2, true), size = dv.getUint32(root + 8, true);
    items.push({ label: 'Root group object header (v1)', note: 'Version, message count, reference count and header size, then the messages that define the root group.', value: `${n} messages, ${size} bytes`, depth: 0, from: root, to: root + 16 + size });
    let p = root + 16;
    for (let k = 0; k < n && p + 8 <= root + 16 + size; k++) {
      const t = dv.getUint16(p, true), s = dv.getUint16(p + 2, true);
      items.push({ label: `Message: ${H5MSG[t] ?? `type ${t}`}`, note: 'Message header: type (2 bytes), size (2), flags (1), reserved (3), then the message data.', depth: 1, from: p, to: p + 8 + s });
      p += 8 + s;
    }
  }
  // Signed structures anywhere in the file.
  const td = new TextDecoder();
  for (let p = 8; p + 4 <= bytes.length; p++) {
    const c = bytes[p];
    if (c < 65 || c > 90) continue;
    const sig = td.decode(bytes.subarray(p, p + 4));
    if (!H5SIG[sig]) continue;
    let to = p + 8;
    let value = '';
    if (sig === 'HEAP') {
      const dsz = L === 8 ? Number(dv.getBigUint64(p + 8, true)) : dv.getUint32(p + 8, true);
      const da = addr(p + 8 + 2 * L);
      to = p + 8 + 2 * L + O;
      if (da > 0 && da + dsz <= bytes.length) {
        const names = td.decode(bytes.subarray(da, da + dsz)).split('\0').filter((x) => /^[\x20-\x7e]+$/.test(x));
        value = `member names: ${names.join(', ')}`;
        items.push({ label: 'Local heap data', note: 'Null-terminated member names of a group, padded to 8 bytes.', value, depth: 0, from: da, to: da + dsz });
      }
    } else if (sig === 'OHDR') {
      const flags = bytes[p + 5];
      let q = p + 6 + (flags & 0x20 ? 16 : 0) + (flags & 0x10 ? 4 : 0);
      const w = [1, 2, 4, 8][flags & 3];
      const size = w === 1 ? bytes[q] : w === 2 ? dv.getUint16(q, true) : dv.getUint32(q, true);
      q += w;
      const end = q + size;
      const msgs: string[] = [];
      while (q + 4 <= end) {
        const t = bytes[q], s = dv.getUint16(q + 1, true), mf = bytes[q + 3];
        const h = 4 + (flags & 4 ? 2 : 0);
        const d = q + h;
        let extra = '';
        if (t === 12 && bytes[d] >= 1 && bytes[d] <= 3) { const nl = dv.getUint16(d + 2, true); const off = bytes[d] === 3 ? d + 9 : d + 8; extra = ` "${td.decode(bytes.subarray(off, off + nl - 1)).replace(/\0/g, '')}"`; }
        if (t === 6) { const lf = bytes[d + 1]; let r = d + 2 + (lf & 8 ? 1 : 0) + (lf & 4 ? 8 : 0) + (lf & 16 ? 1 : 0); const lw = [1, 2, 4, 8][lf & 3]; const nl = lw === 1 ? bytes[r] : dv.getUint16(r, true); r += lw; extra = ` "${td.decode(bytes.subarray(r, r + nl))}"`; }
        if (t) msgs.push(`${H5MSG[t]?.split(' (')[0] ?? `type ${t}`}${extra}`);
        void mf;
        q = d + s;
      }
      to = end + 4;
      value = msgs.join('; ');
    } else if (sig === 'TREE') {
      to = p + 8 + 2 * O;
      value = `node type ${bytes[p + 4] === 0 ? 'group' : 'chunk'}, level ${bytes[p + 5]}, ${dv.getUint16(p + 6, true)} entries`;
    } else if (sig === 'SNOD') {
      const n = dv.getUint16(p + 6, true);
      to = p + 8 + n * (2 * O + 24);
      value = `${n} entries`;
    }
    if (to > bytes.length) continue;
    items.push({ label: `${sig} block`, note: H5SIG[sig], value: value.slice(0, 500), depth: 0, from: p, to });
    p = to - 1;
  }
  const clean: Item[] = [];
  for (const it of items.sort((a, b) => a.from - b.from || a.depth - b.depth)) {
    const prev = clean.filter((x) => x.depth === 0).pop();
    if (it.depth === 0 && prev && it.from < prev.to) continue;
    clean.push(it);
  }
  return { kind: 'bin', bytes, items: fillGaps(clean, bytes.length, 'Dataset contents (raw arrays, possibly compressed) and structures not decoded here.'), summary: `${what} is stored in HDF5: a superblock at offset 0, then object headers, B-trees and heaps linked by file addresses, and the raw array data. Signed structures (OHDR, TREE, HEAP and others) are found and decoded; group member and attribute names are read out where they appear. Layout from the HDF5 File Format Specification (The HDF Group).` };
}

// ---------------------------------------------------------------- Nastran OP2 (Fortran unformatted records)
const OP2T: Record<string, string> = { GEOM1: 'Grid points and coordinate systems.', GEOM1S: 'Grid points (superelement).', GEOM2: 'Element connectivity.', GEOM2S: 'Element connectivity (superelement).', GEOM3: 'Static loads.', GEOM4: 'Constraints.', EPT: 'Element properties.', EPTS: 'Element properties.', MPT: 'Material properties.', MPTS: 'Material properties.', DYNAMIC: 'Dynamic loads and tables.', CASECC: 'Case control, per subcase.', PVT0: 'Parameters.', EQEXIN: 'External to internal id equivalence.', EQEXINS: 'External to internal id equivalence.', BGPDT: 'Basic grid point definitions.', BGPDTS: 'Basic grid point definitions.', GPL: 'Grid point list.', CSTM: 'Coordinate system transformations.', OUGV1: 'Displacements.', OPG1: 'Applied loads.', OQG1: 'Single point constraint forces.', OEF1X: 'Element forces.', OES1X1: 'Element stresses.', OES1X: 'Element stresses.', OSTR1X: 'Element strains.', OGPWG: 'Grid point weight.', OGPFB1: 'Grid point force balance.', OEFIT: 'Failure indices.', ONRGY1: 'Strain energy.', OPHIG: 'Eigenvectors.', LAMA: 'Eigenvalues.', OUGV1PAT: 'Displacements.' };
export function op2(bytes: Uint8Array): BinDoc {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const items: Item[] = [];
  const tables: Item[] = [];
  let at = 0, n = 0;
  let table: Item | null = null;
  while (at + 8 <= bytes.length) {
    const len = dv.getInt32(at, true);
    if (len < 0 || at + 8 + len > bytes.length || dv.getInt32(at + 4 + len, true) !== len) break;
    const d = at + 4;
    let label = `Record ${n}: ${len} bytes`;
    let note = 'Data record: the payload depends on the table and its position in it.';
    let value = '';
    if (len === 4) { const v = dv.getInt32(d, true); label = `Marker ${v}`; note = 'A one-word record. Negative values count the records of a table (-1, -2, ...), 0 ends a table, and small positive values announce the length of the next record in words.'; value = String(v); }
    else if (len === 8 && /^[\x20-\x7e]{8}$/.test(text(bytes.subarray(d, d + 8)))) {
      const nm = text(bytes.subarray(d, d + 8)).trim();
      label = `Name "${nm}"`;
      note = OP2T[nm] ? `Table name: ${OP2T[nm]}` : 'An 8-character name: a table name or a label.';
      if (OP2T[nm] || /^[A-Z][A-Z0-9]+$/.test(nm) && nm !== 'XXXXXXXX') {
        if (table) table.to = at;
        if (!table || !table.label.startsWith(nm)) { table = { label: `${nm} table`, note: OP2T[nm] ?? 'A data block (table).', depth: 0, from: at, to: bytes.length }; tables.push(table); }
      }
    } else if (len === 28) { label = 'Header or trailer (7 words)'; note = 'Seven 32-bit words: a table trailer or a record header (for results: approach code, table code, element type, subcase and so on).'; value = Array.from({ length: 7 }, (_, k) => dv.getInt32(d + 4 * k, true)).join(' '); }
    else if (/^[\x20-\x7e]{6}/.test(text(bytes.subarray(d, d + 6)))) value = JSON.stringify(text(bytes.subarray(d, d + Math.min(len, 64))));
    items.push({ label: `${label}`, note: `${note} Fortran framing: a 4-byte length before and after the payload.`, value, depth: 1, from: at, to: at + 8 + len, array: len > 64 ? { name: 'word', stride: 4, fields: [{ off: 0, len: 4, name: 'int32', fmt: i32 }, { off: 0, len: 4, name: 'float32', fmt: f32 }] } : undefined });
    at += 8 + len;
    n++;
  }
  // Header records before the first table.
  const first = tables[0]?.from ?? at;
  const out = [{ label: 'File header', note: 'Date, the "NASTRAN FORT TAPE ID CODE" record and a label, then markers.', depth: 0, from: 0, to: first } as Item, ...tables, ...items.map((x) => ({ ...x, depth: 1 }))];
  const shown = items.length > 400 ? [...out.slice(0, tables.length + 1), ...items.slice(0, 400)] : out;
  return { kind: 'bin', bytes, items: fillGaps(shown.sort((a, b) => a.from - b.from || a.depth - b.depth), bytes.length, 'Records not listed (the outline lists the first 400) or trailing bytes.'), summary: `Nastran OP2 (little-endian): Fortran unformatted records, each framed by its length in bytes before and after. ${plural(n, 'record')} in ${plural(tables.length, 'table')}; tables start with their name and are cut into records by markers. Layout from the public documentation of the open-source pyNastran reader (BSD-3).` };
}

// ---------------------------------------------------------------- Rhino 3DM (openNURBS chunks)
const TC: Record<number, string> = { 0x00000001: 'Comment block', 0x00007fff: 'End of file', 0x10000010: 'Material table', 0x10000011: 'Layer table', 0x10000012: 'Light table', 0x10000013: 'Object table', 0x10000014: 'Properties table', 0x10000015: 'Settings table', 0x10000016: 'Bitmap table', 0x10000017: 'User table', 0x10000018: 'Group table', 0x10000019: 'Font table', 0x10000020: 'Dimension style table', 0x10000021: 'Instance definition table', 0x10000022: 'Hatch pattern table', 0x10000023: 'Linetype table', 0x10000025: 'Texture mapping table', 0x10000026: 'History record table', 0xffffffff: 'End of table', 0x20008070: 'Object record', 0x20008050: 'Layer record', 0x20008040: 'Material record', 0x20008024: 'Application properties', 0x20008022: 'Notes', 0x20008021: 'Revision history', 0xa0000026: 'openNURBS version', 0x20008031: 'Units and tolerances', 0x82000071: 'Object type', 0x02008072: 'Object attributes', 0x8200007f: 'Object record end', 0x00027ffa: 'openNURBS class', 0x00027ffb: 'Class UUID', 0x00027ffc: 'Class data', 0x80027fff: 'Class end', 0x40008000: 'Anonymous chunk', 0x20008078: 'Linetype record', 0x20008075: 'Dimension style record', 0x20008077: 'Hatch pattern record', 0x2000807a: 'Texture mapping record', 0x20008074: 'Font record', 0x20008073: 'Group record' };
export function rhino(bytes: Uint8Array): BinDoc {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const version = Number(text(bytes.subarray(24, 32)).trim());
  const big = version >= 50;
  const items: Item[] = [{ label: 'File header', note: 'Thirty-two ASCII bytes: "3D Geometry File Format " and the archive version, right-aligned (70 is Rhino 7 and later layouts with 8-byte chunk lengths).', value: `archive version ${version}`, depth: 0, from: 0, to: 32 }];
  const hs = big ? 12 : 8;
  const parse = (from: number, to: number, depth: number): boolean => {
    let at = from;
    const local: Item[] = [];
    while (at + hs <= to) {
      const tc = dv.getUint32(at, true);
      const len = big ? Number(dv.getBigInt64(at + 4, true)) : dv.getInt32(at + 4, true);
      const short = (tc & 0x80000000) !== 0;
      const size = short ? 0 : len;
      if (!short && (len < 0 || at + hs + len > to)) return false;
      const name = TC[tc >>> 0] ?? `chunk ${hex(tc >>> 0)}`;
      local.push({ label: name, note: `Chunk: 4-byte typecode (${hex(tc >>> 0)}), then an ${big ? '8' : '4'}-byte length${short ? '; in a short chunk (high bit set) the length field holds the value itself and no data follows' : ', then the data'}${tc & 0x8000 && !short ? '; the last 4 data bytes are a CRC-32' : ''}.`, value: short ? `value ${len}` : `${len} bytes`, depth, from: at, to: at + hs + size });
      if (!short && depth < 3 && (tc & 0x30000000 || (tc >>> 0) === 0x00027ffa) && size > hs) {
        const inner = (tc & 0x8000) ? size - 4 : size;
        parse(at + hs, at + hs + inner, depth + 1);
      }
      at += hs + size;
    }
    if (at !== to && depth > 0) return false;
    items.push(...local);
    return true;
  };
  parse(32, bytes.length, 0);
  const seen = new Set<string>();
  const out = items.filter((x) => { const k = `${x.from}:${x.depth}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (out.length > 1 && out[1].label === 'Comment block') out[1].note += ' The first chunk is a text comment naming the writing application and toolkit version.';
  return { kind: 'bin', bytes, items: fillGaps(out.sort((a, b) => a.from - b.from || a.depth - b.depth), bytes.length, 'Not decoded.'), summary: 'Rhino .3dm (openNURBS archive): a 32-byte header, then nested chunks, each a typecode and a length. Tables (properties, settings, layers, objects) hold records, and records hold class chunks with the geometry. Typecodes from the openNURBS source (opennurbs_3dm.h), which McNeel publishes under a permissive license.' };
}

// ---------------------------------------------------------------- Fluent case (mixed text and binary)
const FL: Record<number, string> = { 0: 'Comment.', 1: 'Header.', 2: 'Dimensions (2 or 3).', 4: 'Machine configuration: byte order and type sizes.', 10: 'Nodes: zone id, first index, last index (hex), type, dimensions; coordinates follow in the body.', 12: 'Cells: zone id, first, last, type, element type.', 13: 'Faces: zone id, first, last, boundary condition type, face type; then per face its nodes and the cells on each side.', 18: 'Periodic shadow faces.', 37: 'Case variables (solver settings).', 39: 'Zone: id, type and name, with boundary condition settings.', 45: 'Zone: id, type and name.', 40: 'Partitions.', 58: 'Cell tree.', 59: 'Face tree.' };
export function fluent(bytes: Uint8Array): BinDoc {
  const items: Item[] = [];
  const td = new TextDecoder('latin1');
  const marker = new TextEncoder().encode('End of Binary Section');
  const findMarker = (from: number) => { outer: for (let i = from; i + marker.length <= bytes.length; i++) { for (let k = 0; k < marker.length; k++) if (bytes[i + k] !== marker[k]) continue outer; return i; } return -1; };
  let at = 0;
  while (at < bytes.length) {
    if (bytes[at] !== 40) { at++; continue; }
    const m = td.decode(bytes.subarray(at, at + 24)).match(/^\((\d+)/);
    if (!m) { at++; continue; }
    const idx = Number(m[1]);
    const from = at;
    const base = idx % 1000;
    const binary = idx >= 2000;
    let to: number;
    if (binary) {
      const e = findMarker(at);
      to = e < 0 ? bytes.length : bytes.indexOf(41, e) + 1;
    } else {
      let depth = 0, inStr = false, i = at;
      for (; i < bytes.length; i++) { const c = bytes[i]; if (c === 34) inStr = !inStr; if (inStr) continue; if (c === 40) depth++; if (c === 41 && --depth === 0) break; }
      to = i + 1;
    }
    const head = td.decode(bytes.subarray(from, Math.min(to, from + 90))).split('\n')[0];
    items.push({ label: `(${idx}) ${binary ? `${idx < 3000 ? 'single' : 'double'} precision binary ` : ''}${(FL[base] ?? 'section').split(':')[0].replace('.', '')}`, note: `${FL[base] ?? 'Section.'} ${binary ? `Index ${idx} is section ${base} written in binary (${idx < 3000 ? '20xx single' : '30xx double'} precision): a text header in parentheses, then raw values in parentheses, closed by "End of Binary Section ${idx})".` : 'Text section: an index, then its contents in parentheses.'}`, value: head, depth: 0, from, to, array: binary && base === 10 ? { name: 'value', stride: idx < 3000 ? 4 : 8, fields: [{ off: 0, len: idx < 3000 ? 4 : 8, name: idx < 3000 ? 'float32' : 'float64', fmt: idx < 3000 ? f32 : f64 }] } : undefined });
    at = to;
  }
  return { kind: 'bin', bytes, items: fillGaps(items, bytes.length, 'Whitespace between sections.'), summary: `Fluent case file: sections written as "(index contents)", text for settings and zones, binary for the mesh (indices 20xx and 30xx). ${plural(items.length, 'section')}. Layout from the case and data file format appendix of the public Fluent documentation.` };
}

export const BIN_EXT = /\.(stl|glb|ply|3mf|3dxml|gds|oas|h5|cgns|med|exo|op2|3dm|cas)$/i;
export { esc };
