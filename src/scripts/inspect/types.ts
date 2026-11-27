// Shared model for the format inspector ("Inside the file"). Every parser here is our own,
// written from published specifications or public documentation (docs/decisions/0006).
export type Note = { title: string; text?: string; value?: string };

/** A structural part of a file: a line range (text) or a byte range (binary), end exclusive. */
export type Item = {
  label: string;
  note?: string;
  value?: string;
  depth: number;
  from: number;
  to: number;
  /** Fixed-size records inside the range: hovering a byte names the record and field. */
  array?: { name: string; stride: number; fields: Field[] };
  /** Extra places to jump to when the item is chosen repeatedly (for example every entity of a type). */
  jumps?: number[];
};
export type Field = { off: number; len: number; name: string; fmt: (dv: DataView, at: number) => string };

export type TextDoc = {
  kind: 'text';
  lines: string[];
  items: Item[];
  summary: string;
  /** Tokenizer: returns HTML for one line (already escaped). */
  tok: (line: string, i: number) => string;
  /** Explanation of one line, shown on hover. */
  lineNote?: (i: number) => Note | null;
  /** Targets for reference tokens (`data-ref` keys) to line numbers. */
  refs?: Map<string, number>;
};
export type BinDoc = {
  kind: 'bin';
  bytes: Uint8Array;
  items: Item[];
  summary: string;
  /** A decoded part to show as text beside the bytes, such as a glTF JSON chunk. */
  aside?: { title: string; text: string; /** Show it above the bytes (the decoded meaning matters more than the layout). */ first?: boolean };
  /** Files inside a container (ZIP) that can be opened as text. */
  entries?: { name: string; open: () => Promise<string> }[];
};
export type Doc = TextDoc | BinDoc;

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Number formats for binary fields.
export const f32 = (dv: DataView, o: number) => fmtNum(dv.getFloat32(o, true));
export const f64 = (dv: DataView, o: number) => fmtNum(dv.getFloat64(o, true));
export const u8 = (dv: DataView, o: number) => String(dv.getUint8(o));
export const u16 = (dv: DataView, o: number) => String(dv.getUint16(o, true));
export const u32 = (dv: DataView, o: number) => String(dv.getUint32(o, true));
export const i32 = (dv: DataView, o: number) => String(dv.getInt32(o, true));
export const u16be = (dv: DataView, o: number) => String(dv.getUint16(o, false));
export const ascii = (len: number) => (dv: DataView, o: number) => JSON.stringify(text(new Uint8Array(dv.buffer, dv.byteOffset + o, len)));
export function fmtNum(x: number) {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  return a >= 1e6 || a < 1e-4 ? x.toExponential(4) : String(Math.round(x * 1e5) / 1e5);
}
export function text(b: Uint8Array) {
  let s = '';
  for (const c of b) s += c >= 32 && c < 127 ? String.fromCharCode(c) : c === 0 ? '' : '.';
  return s;
}
