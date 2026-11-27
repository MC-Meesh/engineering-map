// Renders a parsed file: an outline of its structure, a virtualized text or hex view, and a
// note box that explains whatever is under the pointer. Hovering an outline entry highlights
// its lines or bytes; hovering a line or byte names the part it belongs to.
import type { Doc, Item, Note, TextDoc, BinDoc } from './types';
import { esc } from './types';

const ROW = 18;
const MAX_LINE = 1600;

export function render(root: HTMLElement, doc: Doc) {
  root.innerHTML = `
    <div class="insp">
      <div class="insp-side">
        <p class="insp-summary"></p>
        <details class="insp-outline-wrap" open><summary>Structure <span class="muted num"></span></summary><ol class="insp-outline"></ol></details>
        <div class="insp-note" aria-live="polite"><p class="muted">Point at a line, a byte or an entry in the structure list to see what it is.</p></div>
      </div>
      <div class="insp-main">
        <div class="insp-view" tabindex="0" role="region" aria-label="File contents"><div class="insp-spacer"><div class="insp-rows"></div></div></div>
        <div class="insp-aside" hidden></div>
      </div>
    </div>`;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  $('.insp-summary').innerHTML = doc.summary;
  const outline = $('.insp-outline');
  const noteBox = $('.insp-note');
  const view = $('.insp-view');
  const spacer = $('.insp-spacer');
  const rowsEl = $('.insp-rows');
  const items = doc.items;
  $('.insp-outline-wrap summary .num').textContent = String(items.length);
  if (window.innerWidth < 700) $<HTMLDetailsElement>('.insp-outline-wrap').open = false;

  // Innermost item per unit (line or byte), deeper items drawn last so they win.
  const units = doc.kind === 'text' ? doc.lines.length : doc.bytes.length;
  const owner = new Int32Array(units).fill(-1);
  items
    .map((it, i) => [it, i] as const)
    .sort((a, b) => a[0].depth - b[0].depth || a[0].from - b[0].from)
    .forEach(([it, i]) => owner.fill(i, Math.max(0, it.from), Math.min(units, it.to)));

  let hi: [number, number] | null = null;
  let flash = -1;
  const showNote = (n: Note | null) => {
    if (!n) return;
    noteBox.innerHTML = `<p class="insp-note-title">${esc(n.title)}</p>${n.value ? `<p class="insp-note-value mono">${esc(n.value)}</p>` : ''}${n.text ? `<p>${esc(n.text)}</p>` : ''}`;
  };
  const itemNote = (it: Item): Note => ({ title: it.label, text: it.note, value: it.value });

  outline.innerHTML = items
    .map((it, i) => `<li style="--d:${it.depth}"><button type="button" data-i="${i}"><span>${esc(it.label)}</span><span class="muted num">${doc.kind === 'text' ? `${it.from + 1}${it.to - it.from > 1 ? `-${it.to}` : ''}` : `0x${it.from.toString(16)}`}</span></button></li>`)
    .join('');

  // Text and hex differ only in how a row is drawn.
  const bpr = () => (view.clientWidth < 560 ? 8 : 16);
  const rowCount = () => (doc.kind === 'text' ? doc.lines.length : Math.ceil(doc.bytes.length / bpr()));
  const unitRow = (u: number) => (doc.kind === 'text' ? u : Math.floor(u / bpr()));
  let drawn = '';
  function draw(force = false) {
    const n = rowCount();
    spacer.style.height = `${n * ROW + 8}px`;
    const first = Math.max(0, Math.floor(view.scrollTop / ROW) - 20);
    const last = Math.min(n, first + Math.ceil(view.clientHeight / ROW) + 40);
    const key = `${first}:${last}:${hi}:${flash}:${bpr()}`;
    if (!force && key === drawn) return;
    drawn = key;
    rowsEl.style.transform = `translateY(${first * ROW}px)`;
    rowsEl.innerHTML = doc.kind === 'text' ? textRows(doc, first, last) : hexRows(doc, first, last);
  }
  const inHi = (u: number) => !!hi && u >= hi[0] && u < hi[1];
  function textRows(d: TextDoc, a: number, b: number) {
    let html = '';
    for (let i = a; i < b; i++) {
      let line = d.lines[i];
      let more = '';
      if (line.length > MAX_LINE) { more = `<span class="t-more"> ... ${(line.length - MAX_LINE).toLocaleString('en-US')} more characters</span>`; line = line.slice(0, MAX_LINE); }
      const o = owner[i];
      html += `<div class="r${inHi(i) ? ' hi' : ''}${i === flash ? ' flash' : ''}" data-u="${i}"><span class="ln" style="--k:${o < 0 ? 'transparent' : `var(--tint-${o % 4})`}">${i + 1}</span><span class="tx">${d.tok(line, i)}${more}</span></div>`;
    }
    return html;
  }
  function hexRows(d: BinDoc, a: number, b: number) {
    const w = bpr();
    let html = '';
    for (let r = a; r < b; r++) {
      const base = r * w;
      let hex = '';
      let asc = '';
      for (let j = 0; j < w; j++) {
        const u = base + j;
        if (u >= d.bytes.length) { hex += '<span class="b e">  </span>'; asc += ' '; continue; }
        const v = d.bytes[u];
        const o = owner[u];
        const cls = `b${o >= 0 ? ` k${o % 4}` : ''}${inHi(u) ? ' hi' : ''}`;
        hex += `<span class="${cls}" data-u="${u}">${v.toString(16).padStart(2, '0')}</span>`;
        asc += `<span class="${cls}" data-u="${u}">${v >= 33 && v < 127 ? esc(String.fromCharCode(v)) : '.'}</span>`;
      }
      html += `<div class="r hx${unitRow(flash) === r ? ' flash' : ''}"><span class="ln">${base.toString(16).padStart(6, '0')}</span><span class="hex">${hex}</span><span class="asc">${asc}</span></div>`;
    }
    return html;
  }
  view.addEventListener('scroll', () => requestAnimationFrame(() => draw()), { passive: true });
  new ResizeObserver(() => draw(true)).observe(view);

  function goTo(u: number, it?: Item) {
    const r = unitRow(u);
    view.scrollTop = Math.max(0, r * ROW - view.clientHeight / 3);
    flash = u;
    hi = it ? [it.from, it.to] : hi;
    draw(true);
  }
  const jumpIdx = new Map<number, number>();
  outline.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const it = items[i];
    // Repeated clicks walk through every place the entry occurs.
    const spots = it.jumps?.length ? it.jumps : [it.from];
    const k = (jumpIdx.get(i) ?? -1) + 1;
    jumpIdx.set(i, k % spots.length);
    outline.querySelectorAll('button.sel').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    showNote({ ...itemNote(it), text: `${it.note ?? ''}${spots.length > 1 ? ` (${(k % spots.length) + 1} of ${spots.length}; click again for the next)` : ''}` });
    goTo(spots[k % spots.length], spots.length > 1 ? undefined : it);
  });
  outline.addEventListener('mouseover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    hi = [it.from, it.to];
    showNote(itemNote(it));
    draw();
  });

  // Pointer over the contents: explain the unit under it.
  let lastU = -2;
  view.addEventListener('mouseover', (e) => {
    const t = e.target as HTMLElement;
    const ref = t.closest<HTMLElement>('.ref');
    if (ref && doc.kind === 'text' && doc.refs) {
      const target = doc.refs.get(ref.dataset.ref!);
      if (target !== undefined) {
        showNote({ title: `Reference ${ref.dataset.ref}`, value: doc.lines[target].slice(0, 220), text: `Points to line ${target + 1}. Click to jump there.` });
        return;
      }
    }
    const el = t.closest<HTMLElement>('[data-u]');
    if (!el) return;
    const u = Number(el.dataset.u);
    if (u === lastU) return;
    lastU = u;
    const o = owner[u];
    const it = o >= 0 ? items[o] : undefined;
    if (doc.kind === 'text') {
      const n = doc.lineNote?.(u);
      // The line itself goes in the note too, since narrow views clip long lines.
      if (n) showNote({ ...n, value: n.value ?? doc.lines[u].slice(0, 400) });
      else if (it) showNote(itemNote(it));
    } else {
      showNote(byteNote(doc, u, it));
      if (it && (!hi || hi[0] !== it.from || hi[1] !== it.to)) { hi = [it.from, it.to]; draw(); }
    }
  });
  view.addEventListener('click', (e) => {
    const ref = (e.target as HTMLElement).closest<HTMLElement>('.ref');
    if (!ref || doc.kind !== 'text') return;
    const target = doc.refs?.get(ref.dataset.ref!);
    if (target !== undefined) goTo(target);
  });

  // Side text: a decoded part (glTF JSON) or a file inside a container.
  if (doc.kind === 'bin' && (doc.aside || doc.entries?.length)) {
    const aside = $('.insp-aside');
    aside.hidden = false;
    if (doc.aside?.first) aside.style.order = '-1';
    const entries = doc.entries ?? [];
    aside.innerHTML = `${entries.length ? `<label class="insp-entry">Open a part as text <select><option value="">Choose a part</option>${entries.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select></label>` : ''}<p class="insp-aside-title">${esc(doc.aside?.title ?? '')}</p><pre class="insp-pre">${esc(doc.aside?.text ?? '')}</pre>`;
    aside.querySelector('select')?.addEventListener('change', async (e) => {
      const i = (e.target as HTMLSelectElement).value;
      if (i === '') return;
      const x = entries[Number(i)];
      aside.querySelector('.insp-aside-title')!.textContent = `${x.name} (decompressed in your browser)`;
      const pre = aside.querySelector('.insp-pre')!;
      pre.textContent = 'Inflating...';
      try { const s = await x.open(); pre.textContent = s.length > 200000 ? `${s.slice(0, 200000)}\n... (${s.length.toLocaleString('en-US')} characters in all)` : s; }
      catch (err: any) { pre.textContent = `Could not open: ${err?.message ?? err}`; }
    });
  }
  draw(true);
}

function byteNote(doc: BinDoc, u: number, it?: Item): Note {
  const v = doc.bytes[u];
  const where = `Byte 0x${u.toString(16)} (${u}) = 0x${v.toString(16).padStart(2, '0')}`;
  if (!it) return { title: 'Not described', value: where };
  if (it.array) {
    const rel = u - it.from;
    const k = Math.floor(rel / it.array.stride);
    const at = rel - k * it.array.stride;
    const f = it.array.fields.find((x) => at >= x.off && at < x.off + x.len);
    const dv = new DataView(doc.bytes.buffer, doc.bytes.byteOffset);
    const start = it.from + k * it.array.stride;
    const all = it.array.fields.map((x) => `${x.name} ${start + x.off + x.len <= doc.bytes.length ? x.fmt(dv, start + x.off) : '?'}`).join(', ');
    return { title: `${it.array.name} ${k}${f ? `: ${f.name}` : ''}`, value: `${where}. ${all}`, text: it.note };
  }
  return { title: it.label, value: `${where}${it.value ? `. ${it.value}` : ''}`, text: it.note };
}
