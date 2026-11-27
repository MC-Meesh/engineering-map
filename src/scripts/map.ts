// Interactive map: sigma.js (WebGL) over a graphology multigraph.
// Layouts are precomputed at build time (scripts/build-graph.mjs): ForceAtlas2 for the overview
// and most lenses, and a nested circle layout for the Ownership lens, whose circles (one per
// owner family and subsidiary) are drawn here on a canvas under the edges. The client only
// renders, filters, tweens between layouts and focuses.
import Graph from 'graphology';
import Sigma from 'sigma';
import { createNodeBorderProgram } from '@sigma/node-border';
import { EdgeArrowProgram, EdgeRectangleProgram } from 'sigma/rendering';
import { EDGE_STYLE, edgeLabel, lensOf, DEFAULT_LENS } from './lenses';
import { edgeSentence } from '../lib/relate';
import type { RNode } from '../lib/relate';

type LiteNode = { id: string; t: string; l: string; x: number; y: number; d: number; dm?: string; c?: string; v?: string; u?: string; f?: string; o?: 1; s?: string[]; st?: string; sm?: string; pl?: string; fn?: string; k?: string; b?: string; a?: string[]; cl?: string[]; nf?: string[]; nx?: [string, string, string][] };
type Lite = {
  stats: any;
  domains: { id: string; name: string }[];
  categories: { id: string; name: string; domain: string; p?: string }[];
  stages: { id: string; name: string }[];
  nodes: LiteNode[];
  edges: [string, string, string, string?, string?][];
  lenses: Record<string, string[]>;
  layouts: Record<string, Record<string, [number, number]>>;
  hulls: Record<string, [string, number, number, number, number, number, string?, string?][]>;
  owner: Record<string, [string, 1?]>;
  overlap?: Record<string, [string, number]>;
  brands: Record<string, [string, string, string[]]>;
  regions?: { independent?: { x: number; y: number; r: number; cx: number; cy: number; cr: number; members: string[] } };
};
type Hull = { v: string; x: number; y: number; r: number; depth: number; n: number; label?: string; style?: string; collapsed?: boolean };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LABEL_FONT = "'IBM Plex Mono', ui-monospace, monospace";
const LABEL_SIZE = 11;

const RELATION: Record<string, [string, string]> = {
  'made-by': ['Made by', 'Products'],
  'originated-at': ['Originally developed at', 'Originated here'],
  'built-on': ['Built on', 'Used by'],
  'runs-on': ['Runs on (platform)', 'Applications on this platform'],
  // Reads edges are stored format -> tool so arrows show the direction data moves.
  reads: ['Read by', 'Reads'],
  writes: ['Writes', 'Written by'],
  'plugin-of': ['Plugin of', 'Plugins'],
  'integrates-with': ['Integrates with', 'Integrates with'],
  'competes-with': ['Competes with', 'Competes with'],
  'alternative-to': ['Open-source alternative to', 'Open-source alternatives'],
  'acquired-by': ['Acquired by', 'Acquired'],
  'subsidiary-of': ['Part of', 'Subsidiaries'],
  'stewarded-by': ['Stewarded by', 'Stewards'],
  'used-in-stage': ['Stage', 'Tools'],
};
const TYPE_LABEL: Record<string, string> = { tool: 'Tool', kernel: 'Geometry kernel', vendor: 'Vendor', format: 'Format', stage: 'Workflow stage' };
// Past this many neighbors a focus ring labels only its best-connected members (the rest on
// hover) and is grouped into labelled sectors by category.
const CROWD = 24;
const LABEL_TOP = 14;
// Labels allowed by connection rank at each zoom step (opening view, closer, close).
// Phones open with company names only; product names come in as you zoom.
const ZOOM_QUOTA = window.innerWidth <= 860 ? [0, 20, 1e9] : [18, 70, 1e9];

async function main() {
  const host = $('#graph');
  const res = await fetch('/data/graph.json');
  const data: Lite = await res.json();
  // The canvas does not wait for web fonts; load the label faces before the first draw.
  await Promise.all([document.fonts.load(`400 ${LABEL_SIZE}px ${LABEL_FONT}`), document.fonts.load(`600 12px ${LABEL_FONT}`)]).catch(() => undefined);
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  const readTheme = () => ({
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    paper: v('--paper'),
    rule: v('--rule'),
    faint: v('--rule-2'),
    wash: v('--red-wash'),
    dom: Object.fromEntries(data.domains.map((d) => [d.id, v(`--d-${d.id}`)])) as Record<string, string>,
  });
  const theme = readTheme();
  const edgeColor = (kind: string) => v(EDGE_STYLE[kind]?.c ?? '--e-a') || theme.ink2;
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const catPlain = new Map(data.categories.map((c) => [c.id, c.p ?? '']));
  const owner = data.owner ?? {};
  // Plain sentences for the Explain toggle, worded as on the tool pages and the path finder.
  const vname0 = new Map(data.nodes.filter((n) => n.t === 'vendor').map((n) => [n.id, n.l.replace(/ Digital Industries Software$/, '')]));
  const rnodes = new Map<string, RNode>(data.nodes.map((n) => [n.id, { id: n.id, name: n.l, type: n.t, category: n.c, summary: n.sm, owner: vname0.get(n.u ?? n.v ?? '') }]));
  const sentence = (s: string, t: string, attr: any) => edgeSentence({ s, t, kind: attr.kind, date: attr.date, status: attr.status, same: attr.same, since: attr.since }, rnodes);

  const graph = new Graph({ multi: true, type: 'directed', allowSelfLoops: false });
  const paint = (n: LiteNode) => {
    let color = theme.ink2;
    let borderColor = theme.paper;
    if (n.t === 'tool' || n.t === 'kernel') color = theme.dom[n.dm!] || theme.ink2;
    if (n.t === 'kernel') borderColor = theme.ink;
    if (n.t === 'vendor') color = theme.ink;
    if (n.t === 'format') { color = theme.paper; borderColor = theme.ink; }
    if (n.t === 'stage') { color = theme.paper; borderColor = theme.ink2; }
    return { color, borderColor };
  };
  for (const n of data.nodes) {
    const base = n.t === 'vendor' ? 2.6 + Math.sqrt(n.d) * 1.15 : n.t === 'format' ? 2.4 + Math.sqrt(n.d) * 0.75 : n.t === 'stage' ? 9 : 2.4 + Math.sqrt(n.d) * 0.95;
    const size = Math.min(n.t === 'kernel' ? base + 2 : base, 16);
    graph.addNode(n.id, { x: n.x, y: -n.y, size, ...paint(n), label: n.l, nt: n.t });
  }
  // The header's light/dark switch recolours the map in place.
  window.addEventListener('themechange', () => {
    Object.assign(theme, readTheme());
    for (const n of data.nodes) graph.mergeNodeAttributes(n.id, paint(n));
    graph.forEachEdge((e) => graph.setEdgeAttribute(e, 'color', theme.rule));
    renderer.setSetting('labelColor', { color: theme.ink });
    renderer.setSetting('edgeLabelColor', { attribute: 'labelColor', color: theme.ink2 });
    renderer.refresh();
  });
  for (const [s0, t0, k, date, status] of data.edges) {
    // Reads point from the format into the tool: the direction the data moves on import.
    const [s, t] = k === 'reads' ? [t0, s0] : [s0, t0];
    if (!graph.hasNode(s) || !graph.hasNode(t)) continue;
    const ov = k === 'competes-with' ? data.overlap?.[`${s0}|${t0}`] : undefined;
    graph.addEdgeWithKey(`${s0}|${t0}|${k}`, s, t, { kind: k, date, status, ...(ov ? { same: ov[0], since: ov[1] } : {}), size: k === 'acquired-by' || k === 'made-by' ? 0.7 : 0.45, color: theme.rule });
  }

  // Positions per lens. "overview" is the main layout; the others come from build-graph.mjs.
  const layouts = new Map<string, Map<string, { x: number; y: number }>>();
  layouts.set('overview', new Map(data.nodes.map((n) => [n.id, { x: n.x, y: -n.y }])));
  // A structured overview from the build replaces the force layout where it has a position.
  for (const [id, [x, y]] of Object.entries(data.layouts?.overview ?? {})) layouts.get('overview')!.set(id, { x, y: -y });
  for (const [lens, pos] of Object.entries(data.layouts ?? {})) {
    if (lens === 'overview') continue;
    layouts.set(lens, new Map(Object.entries(pos).map(([id, [x, y]]) => [id, { x, y: -y }])));
  }
  const lensNodes = (lens: string) => (lens === 'overview' ? null : layouts.get(lens) ?? null);

  // Ownership hierarchy: circles, lineage and the tools each vendor sells.
  const toHull = ([hv, x, y, r, depth, n, label, style]: [string, number, number, number, number, number, string?, string?]): Hull => ({ v: hv, x, y: -y, r, depth, n, label: label || undefined, style: style || undefined });
  const hullsBy: Record<string, Hull[]> = Object.fromEntries(Object.entries(data.hulls ?? {}).map(([k, list]) => [k, list.map(toHull)]));
  const hulls: Hull[] = hullsBy.ownership ?? [];
  // Circles keyed by a vendor (the ownership lens); regions such as "Independent companies" are not.
  const hullOf = new Map(hulls.filter((h) => nodeById.has(h.v)).map((h) => [h.v, h]));
  // The independents region opens on request; collapsed, it is a small circle by the families.
  const indep = data.regions?.independent;
  const indepSet = new Set(indep?.members ?? []);
  const curHulls = () => {
    const hs = hullsBy[state.lens] ?? [];
    if (state.lens !== 'ownership' || !indep || state.indepOpen) return hs;
    return hs.map((h) => (h.v === '#independent' ? { ...h, x: indep.cx, y: -indep.cy, r: indep.cr, collapsed: true } : h));
  };
  const brandName = (n?: LiteNode) => (n?.b ? data.brands?.[n.b]?.[0] : undefined);
  /** The brand circle a product sits in (ownership lens), keyed b:<brand>:<selling vendor>. */
  const brandKey = (n?: LiteNode) => (n?.b && n.v ? `b:${n.b}:${n.v}` : '');
  const hullVisible = (h: Hull) => { const v = h.style === 'brand' ? h.v.split(':')[2] : h.v; return !nodeById.has(v) || visible.has(v); };
  /** The vendor a circle belongs to: itself, or the seller for a brand circle (b:<brand>:<vendor>). */
  const hullVendor = (h: Hull) => (h.style === 'brand' ? h.v.split(':')[2] : h.v);
  const hullName = (h: Hull) => h.label ?? nodeById.get(h.v)?.l ?? h.v;
  // Rank of each node by connections, for labels that appear as the map is zoomed in.
  // (Ranked within each kind of node, so products are not crowded out by vendors.)
  const rank = new Map<string, number>();
  for (const t of ['tool', 'vendor', 'format', 'stage']) data.nodes.filter((n) => (n.t === 'kernel' ? 'tool' : n.t) === t).sort((a, b) => b.d - a.d).forEach((n, i) => rank.set(n.id, i));
  const lineage = (id: string): string[] => {
    const n = nodeById.get(id);
    if (!n) return [];
    const out = [id];
    let cur = n.t === 'vendor' ? owner[id]?.[0] : n.t === 'tool' || n.t === 'kernel' ? n.v : undefined;
    const seen = new Set(out);
    while (cur && !seen.has(cur)) { out.unshift(cur); seen.add(cur); cur = owner[cur]?.[0]; }
    return out;
  };
  const vendorKids = new Map<string, string[]>();
  for (const [kid, [p]] of Object.entries(owner)) { if (!vendorKids.has(p)) vendorKids.set(p, []); vendorKids.get(p)!.push(kid); }
  const productsOf = new Map<string, string[]>();
  for (const n of data.nodes) if (n.v && (n.t === 'tool' || n.t === 'kernel')) { if (!productsOf.has(n.v)) productsOf.set(n.v, []); productsOf.get(n.v)!.push(n.id); }
  const subtree = (id: string, out = new Set<string>()) => {
    if (out.has(id)) return out;
    out.add(id);
    for (const t of productsOf.get(id) ?? []) out.add(t);
    for (const k of vendorKids.get(id) ?? []) subtree(k, out);
    return out;
  };
  /** The circle that frames a node in the ownership lens: its own, else its seller's or owner's. */
  const frameHull = (id: string): Hull | undefined => {
    for (const x of [...lineage(id)].reverse()) { const h = hullOf.get(x); if (h) return h; }
    return undefined;
  };

  const topFormats = new Set(data.nodes.filter((n) => n.t === 'format').sort((a, b) => b.d - a.d).slice(0, 18).map((n) => n.id));

  // State
  const state = {
    lens: DEFAULT_LENS,
    types: new Set(['tool', 'kernel', 'vendor', 'format']),
    domains: new Set(data.domains.map((d) => d.id)),
    stage: '',
    category: '',
    vendor: '',
    oss: false,
    edgeKinds: new Set(['made-by', 'built-on', 'acquired-by', 'subsidiary-of', 'alternative-to', 'plugin-of', 'originated-at']),
    focus: '' as string,
    hover: '' as string,
    // A node pointed at in the detail panel: marked on the map without changing the focus.
    peek: '' as string,
    neighbors: new Set<string>(),
    // Ownership lens: the focused node's lineage and everything it owns.
    family: new Set<string>(),
    // ...and the rest of the circle that frames it, kept visible as context.
    context: new Set<string>(),
    lineage: new Set<string>(),
    quiet: new Set<string>(),
    roll: new Set<string>(),
    explain: false,
    indepOpen: false,
  };
  const lensKinds = () => new Set(lensOf(state.lens).kinds);
  const inLens = (kind: string) => state.lens === 'overview' || lensKinds().has(kind);
  const isTree = () => state.lens === 'ownership' && hulls.length > 0;

  function passes(n: LiteNode): boolean {
    const ln = lensNodes(state.lens);
    if (ln && !ln.has(n.id)) return false;
    if (state.lens === 'ownership' && !state.indepOpen && indepSet.has(n.id)) return false;
    if (n.t === 'stage') return !ln && state.types.has('stage');
    if (n.d === 0) return false;
    if (!state.types.has(n.t)) return false;
    if (n.t === 'tool' || n.t === 'kernel') {
      if (!passesTool(n)) return false;
    } else if (state.oss || state.stage || state.category || state.vendor || state.domains.size < data.domains.length) {
      // Context nodes stay only when connected to a visible tool.
      let keep = false;
      graph.forEachNeighbor(n.id, (nb) => {
        if (keep) return;
        const m = nodeById.get(nb)!;
        if ((m.t === 'tool' || m.t === 'kernel') && passesTool(m)) keep = true;
      });
      if (state.vendor && (n.id === state.vendor)) keep = true;
      return keep;
    }
    return true;
  }
  function passesTool(n: LiteNode) {
    if (!state.types.has(n.t) || !state.domains.has(n.dm!)) return false;
    if (state.oss && !n.o) return false;
    if (state.stage && !n.s?.includes(state.stage)) return false;
    if (state.category && n.c !== state.category) return false;
    if (state.vendor && n.v !== state.vendor && n.u !== state.vendor) return false;
    return true;
  }
  let visible = new Set<string>();
  function recompute() {
    visible = new Set(data.nodes.filter(passes).map((n) => n.id));
    if (state.focus) visible.add(state.focus);
    const ln = lensNodes(state.lens);
    const total = state.lens === 'overview' ? data.nodes.filter((n) => n.t !== 'stage' && n.d > 0).length : ln!.size;
    // The focused node stays on screen even outside the lens; it is not counted as shown.
    $('#count').textContent = `${[...visible].filter((id) => nodeById.get(id)!.t !== 'stage' && (!ln || ln.has(id)) && (state.lens !== 'overview' || nodeById.get(id)!.d > 0)).length} / ${total}`;
  }
  recompute();

  const active = () => state.focus || state.hover;
  // Edges of a node that count under the current lens.
  function lensEdges(id: string, cb: (key: string, attr: any, other: string, out: boolean) => void) {
    graph.forEachEdge(id, (key, attr, s, t) => {
      if (attr.kind === 'used-in-stage' && (!state.types.has('stage') || state.lens !== 'overview')) return;
      if (!inLens(attr.kind)) return;
      cb(key, attr, s === id ? t : s, s === id);
    });
  }
  const LENS_LINKS: Record<string, string> = { ownership: 'ownership links', interop: 'file format links', 'built-on': 'built-on or plugin links', rivals: 'competition links', integrations: 'integration links' };
  const kindCount = new Map<string, number>();
  // Products (tools and kernels) a company owns, directly or through companies it bought.
  function rollMembers(vid: string): string[] {
    return data.nodes.filter((m) => (m.t === 'tool' || m.t === 'kernel') && visible.has(m.id) && lineage(m.id).includes(vid)).map((m) => m.id);
  }
  const shortName = (id: string) => (nodeById.get(id)?.l ?? id).replace(/ Digital Industries Software$/, '');
  // The company's roll-up, grouped for the ring and the panel: what it owns in this lens and
  // what other companies' products connect to it.
  function rollGroups(vid: string): { name: string; short: string; ids: string[] }[] {
    const own = new Set(state.roll);
    const V = shortName(vid);
    const sortL = (xs: Iterable<string>) => [...new Set(xs)].sort((x, y) => nodeById.get(y)!.d - nodeById.get(x)!.d || nodeById.get(x)!.l.localeCompare(nodeById.get(y)!.l));
    const mine = (x: string) => own.has(x) || lineage(x).includes(vid);
    const out: { name: string; short: string; ids: string[] }[] = [];
    if (state.lens === 'built-on') {
      const isK = (x: string) => nodeById.get(x)?.t === 'kernel' || nodeById.get(x)?.c === 'geometry-kernel';
      const kernels = new Set<string>(), insideK = new Set<string>(), othersK = new Set<string>();
      const blocks = new Set<string>(), insideB = new Set<string>(), othersB = new Set<string>();
      const usesOther = new Set<string>(), otherComps = new Set<string>();
      for (const m of own) lensEdges(m, (_k, _attr, other, outward) => {
        if (!visible.has(other)) return;
        if (outward) {
          if (!mine(other)) { usesOther.add(m); otherComps.add(other); }
          else if (isK(other)) { kernels.add(other); insideK.add(m); }
          else { blocks.add(other); insideB.add(m); }
        } else if (!mine(other)) {
          if (isK(m)) { kernels.add(m); othersK.add(other); } else { blocks.add(m); othersB.add(other); }
        }
      });
      const minus = (a: Set<string>, ...bs: Set<string>[]) => [...a].filter((x) => !bs.some((b) => b.has(x)));
      out.push({ name: `${V} kernels and components`, short: 'Kernels', ids: sortL(kernels) });
      out.push({ name: `Built on them inside ${V}`, short: 'Built on them', ids: sortL(minus(insideK, kernels)) });
      out.push({ name: `Other companies' tools built on ${V} kernels`, short: 'Others using them', ids: sortL(othersK) });
      out.push({ name: `Other ${V} products that others build on or run on`, short: 'Platforms, solvers', ids: sortL(minus(blocks, kernels)) });
      out.push({ name: `On those, inside ${V}`, short: 'On those', ids: sortL(minus(insideB, kernels, blocks, insideK)) });
      out.push({ name: `On those, from other companies`, short: 'Others on those', ids: sortL(minus(othersB, othersK)) });
      out.push({ name: `${V} tools built on other companies' components`, short: `On others' parts`, ids: sortL(minus(usesOther, kernels)) });
      out.push({ name: `Those components`, short: `Others' parts`, ids: sortL(otherComps) });
    } else {
      const farName: Record<string, string> = { interop: 'File formats they open or save', rivals: `Rival products from other companies`, integrations: 'Products they are documented to work with' };
      const far = new Set<string>(), inner = new Set<string>();
      for (const m of own) lensEdges(m, (_k, _attr, other) => { if (visible.has(other)) (mine(other) ? inner : far).add(other); });
      out.push({ name: `${V} products with ${LENS_LINKS[state.lens] ?? 'links'}`, short: `${V} products`, ids: sortL(new Set([...own, ...inner])) });
      if (far.size) out.push({ name: farName[state.lens] ?? 'Linked products', short: state.lens === 'interop' ? 'Formats' : 'Other companies', ids: sortL(far) });
    }
    return out.filter((g) => g.ids.length);
  }
  // Every sentence the Explain toggle can show, listed in the panel too (some cards give way
  // to others on a crowded map).
  function explainList(id: string): string {
    const items: string[] = [];
    const seen = new Set<string>();
    const add = (k: string, s0: string, t0: string, attr: any) => { if (seen.has(k) || !visible.has(s0) || !visible.has(t0)) return; seen.add(k); items.push(sentence(s0, t0, attr)); };
    graph.forEachEdge(id, (k, attr, s0, t0) => { if (inLens(attr.kind) && attr.kind !== 'used-in-stage') add(k, s0, t0, attr); });
    for (const m of state.roll) graph.forEachEdge(m, (k, attr, s0, t0) => { if (inLens(attr.kind)) add(k, s0, t0, attr); });
    if (!items.length) return '';
    const MAX = 24;
    return `<div class="explain-list"><h3>The links, in sentences <span class="muted num">${items.length}</span></h3><ul>${[...new Set(items)].slice(0, MAX).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${items.length > MAX ? `<p class="muted">And ${items.length - MAX} more; open the page for all of them.</p>` : ''}</div>`;
  }
  function rollSummary(vid: string): string {
    const groups = rollGroups(vid);
    if (!groups.length) return '';
    const MAX = 14;
    const names = (ids: string[]) => ids.slice(0, MAX).map((x) => `<button type="button" class="linkish" data-focus="${x}">${esc(nodeById.get(x)!.l)}</button>`).join(', ') + (ids.length > MAX ? ` and ${ids.length - MAX} more` : '');
    let lines = groups.map((g) => `<li><b>${esc(g.name)}:</b> ${names(g.ids)}.</li>`);
    if (state.lens === 'built-on') {
      // One line per kernel the company owns: its own users, then other companies'.
      const V = shortName(vid);
      const ks = groups.find((g) => g.short === 'Kernels')?.ids ?? [];
      const users = (k: string, mineOnly: boolean) => { const xs: string[] = []; lensEdges(k, (_e, _a, other, outward) => { if (!outward && visible.has(other) && lineage(other).includes(vid) === mineOnly) xs.push(other); }); return xs; };
      const role = (k: string) => { const sm = nodeById.get(k)?.sm ?? ''; return /constraint solver/i.test(sm) && !/kernel/i.test(sm) ? 'constraint solver' : 'geometry kernel'; };
      const kl = ks.map((k) => { const m = users(k, true), o = users(k, false); return `<li><b>${esc(nodeById.get(k)!.l)}</b> <span class="muted">(${role(k)})</span>: ${m.length ? `used in ${V}${/s$/.test(V) ? "'" : "'s"} ${names(m)}` : `no ${esc(V)} product is recorded as built on it`}${o.length ? `; licensed to other companies for ${names(o)}` : ''}.</li>`; });
      const rest = groups.filter((g) => !['Kernels', 'Built on them', 'Others using them'].includes(g.short)).map((g) => `<li><b>${esc(g.name)}:</b> ${names(g.ids)}.</li>`);
      lines = [...kl, ...rest];
      if (ks.some((k) => !users(k, true).length)) lines.push(`<li class="muted">A company can own a kernel that none of its own products use: it licenses it to others.</li>`);
    }
    return `<div class="detail-plain detail-roll"><b>In this lens, through its products.</b><ul>${lines.join('')}</ul></div>`;
  }
  function computeNeighbors() {
    state.neighbors.clear();
    state.family.clear();
    state.context.clear();
    state.lineage = new Set();
    state.quiet.clear();
    kindCount.clear();
    const a = active();
    if (!a) return;
    lensEdges(a, (_k, attr, other) => {
      state.neighbors.add(other);
      kindCount.set(attr.kind, (kindCount.get(attr.kind) ?? 0) + 1);
    });
    // A company selected in a lens other than ownership speaks for its products: their links
    // in this lens (and the far ends) are shown, so a company is never a lone dot.
    state.roll.clear();
    if (!isTree() && state.lens !== 'overview' && nodeById.get(a)?.t === 'vendor') {
      for (const m of rollMembers(a)) {
        let any = false;
        lensEdges(m, (_k, _attr, other) => { if (visible.has(other)) { any = true; state.neighbors.add(other); } });
        if (any) { state.roll.add(m); state.neighbors.add(m); }
      }
    }
    state.lineage = new Set(lineage(a));
    if (isTree()) {
      for (const x of lineage(a)) state.family.add(x);
      if (nodeById.get(a)?.t === 'vendor') subtree(a, state.family);
      const fh = frameHull(a);
      if (fh) subtree(fh.v, state.context);
    }
    // Crowded neighborhoods: label only the best-connected few; the rest show on hover.
    const shown = [...state.neighbors].filter((n) => visible.has(n));
    if (shown.length > CROWD) {
      const top = new Set(shown.sort((x, y) => nodeById.get(y)!.d - nodeById.get(x)!.d).slice(0, window.innerWidth <= 860 ? 8 : LABEL_TOP));
      for (const n of shown) if (!top.has(n) && n !== state.peek) state.quiet.add(n);
    }
  }

  // Left x for a label of width w beside a node at viewport x nx (radius ns); null when
  // the node itself is off the map.
  const EDGE = 6;
  // Right limit for labels: the map edge, or the detail panel's left edge while it is open
  // beside the map (set in focus()).
  let labelRight = 0;
  function labelLeft(nx: number, ns: number, w: number, side?: string): number | null {
    const W = labelRight || host.clientWidth;
    if (nx < -ns || nx > host.clientWidth + ns) return null;
    // Nodes on the left half of a focus ring carry side "l" so their labels point outward.
    if (side === 'l' && nx - ns - 4 - w >= EDGE) return nx - ns - 4 - w;
    let x = nx + ns + 4;
    if (x + w > W - EDGE && nx < W) x = nx - ns - 4 - w;
    return Math.max(EDGE, x);
  }
  const measure = document.createElement('canvas').getContext('2d')!;
  // Labels drawn this frame, so a forced label never lands on top of another one.
  let placedLabels: [number, number, number, number][] = [];
  // Node label boxes from the previous frame: edge labels are drawn first and give way to them.
  let prevLabels: [number, number, number, number][] = [];
  // Explain boxes drawn this frame: a sentence, wrapped, on a paper card at the edge's middle,
  // skipped when it would cover another card or a node label.
  let explainBoxes: [number, number, number, number][] = [];
  function drawExplain(ctx: CanvasRenderingContext2D, text: string, sd: any, td: any, settings: any) {
    const size = settings.edgeLabelSize + 0.5;
    ctx.font = `400 ${size}px ${settings.edgeLabelFont}`;
    const maxW = window.innerWidth <= 860 ? 150 : 210;
    const lines: string[] = [];
    let cur = '';
    for (const w of text.split(' ')) { const nx = cur ? `${cur} ${w}` : w; if (ctx.measureText(nx).width > maxW && cur) { lines.push(cur); cur = w; } else cur = nx; }
    if (cur) lines.push(cur);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)), lh = size + 3, h = lines.length * lh;
    const cx = sd.x + (td.x - sd.x) * 0.5, cy = sd.y + (td.y - sd.y) * 0.5;
    const box: [number, number, number, number] = [cx - w / 2 - 5, cy - h / 2 - 4, cx + w / 2 + 5, cy + h / 2 + 4];
    const hit = (b: [number, number, number, number]) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1];
    if (explainBoxes.some(hit) || prevLabels.some(hit)) return;
    explainBoxes.push(box);
    ctx.fillStyle = theme.paper;
    ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    ctx.strokeStyle = theme.ink3;
    ctx.lineWidth = 1;
    ctx.strokeRect(box[0] + 0.5, box[1] + 0.5, box[2] - box[0] - 1, box[3] - box[1] - 1);
    ctx.fillStyle = theme.ink;
    lines.forEach((l, i) => ctx.fillText(l, cx - w / 2, box[1] + 4 + size - 1 + i * lh));
  }
  const labelFree = (x0: number, y0: number, x1: number, y1: number) => !placedLabels.some(([a0, b0, a1, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0);
  // A selected node's label is an inverted block, the portfolio's highlight.
  function drawBlockLabel(ctx: CanvasRenderingContext2D, d: any, size: number, invert: boolean) {
    const label = d.label || '';
    if (!label) return;
    ctx.font = `${invert ? 600 : 400} ${size}px ${LABEL_FONT}`;
    const w = ctx.measureText(label).width;
    const x = labelLeft(d.x, d.size, w + 14, d.side);
    if (x === null) return;
    const y = d.y - size / 2 - 6;
    placedLabels.push([x, y, x + w + 14, y + size + 12]);
    ctx.fillStyle = invert ? theme.ink : theme.paper;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w + 14, size + 12);
    ctx.fill();
    if (!invert) ctx.stroke();
    ctx.fillStyle = invert ? theme.paper : theme.ink;
    ctx.fillText(label, x + 7, d.y + size / 3);
  }

  // Zoom step for semantic labels (0 opening view, 1 closer, 2 close), set from the camera.
  let zoomStep = 0;
  const renderer = new Sigma(graph, host, {
    defaultNodeType: 'bordered',
    nodeProgramClasses: {
      bordered: createNodeBorderProgram({
        borders: [
          { size: { value: 0.22 }, color: { attribute: 'borderColor' } },
          { size: { fill: true }, color: { attribute: 'color' } },
        ],
      }),
    },
    edgeProgramClasses: { line: EdgeRectangleProgram, arrow: EdgeArrowProgram },
    labelFont: LABEL_FONT,
    labelSize: LABEL_SIZE,
    labelWeight: '400',
    labelColor: { color: theme.ink },
    labelDensity: 0.55,
    labelGridCellSize: 100,
    labelRenderedSizeThreshold: 7.5,
    renderEdgeLabels: true,
    edgeLabelFont: LABEL_FONT,
    edgeLabelSize: 10,
    edgeLabelWeight: '400',
    edgeLabelColor: { attribute: 'labelColor', color: theme.ink2 },
    stagePadding: 36,
    zIndex: true,
    minCameraRatio: 0.03,
    maxCameraRatio: 3,
    // Edge labels sit beside the middle of their edge, parallel to it and offset from the line,
    // and only where the edge is long enough on screen to keep them clear of both ends.
    defaultDrawEdgeLabel: (ctx, e: any, sd: any, td: any, settings) => {
      if (!e.label) return;
      if (e.explain) { drawExplain(ctx, e.label, sd, td, settings); return; }
      const size = settings.edgeLabelSize;
      ctx.font = `${settings.edgeLabelWeight} ${size}px ${settings.edgeLabelFont}`;
      const w = ctx.measureText(e.label).width;
      const dx = td.x - sd.x, dy = td.y - sd.y;
      const len = Math.hypot(dx, dy);
      if (len < w + sd.size + td.size + 48) return;
      let a = Math.atan2(dy, dx);
      if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
      const mx = sd.x + dx * 0.5, my = sd.y + dy * 0.5;
      // Offset to the upper side of the line, whichever way it runs.
      let nx = -Math.sin(a), ny = Math.cos(a);
      if (ny > 0) { nx = -nx; ny = -ny; }
      const cx = mx + nx * 8, cy = my + ny * 8;
      const hw = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * size) / 2 + 2, hh = (Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * size) / 2 + 2;
      if (prevLabels.some(([x0, y0, x1, y1]) => cx - hw < x1 && cx + hw > x0 && cy - hh < y1 && cy + hh > y0)) return;
      ctx.save();
      ctx.translate(mx + nx * 8, my + ny * 8);
      ctx.rotate(a);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.paper;
      ctx.strokeText(e.label, -w / 2, size / 3);
      ctx.fillStyle = theme.ink2;
      ctx.fillText(e.label, -w / 2, size / 3);
      ctx.restore();
    },
    // Labels sit right of their node, and flip to the left when they would run past the
    // map's right edge; they are never drawn past the left edge either.
    defaultDrawNodeLabel: (ctx, d: any, settings) => {
      if (!d.label || d.quiet) return;
      const size = settings.labelSize;
      if (d.mark) { drawBlockLabel(ctx, d, size + 1, true); return; }
      ctx.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
      const w = ctx.measureText(d.label).width;
      const x = labelLeft(d.x, d.size, w + 14, d.side);
      if (x === null) return;
      const box: [number, number, number, number] = [x + 4, d.y - size / 2 - 3, x + w + 10, d.y + size / 2 + 3];
      if (!labelFree(...box)) return;
      placedLabels.push(box);
      // Around a focus, labels sit on a paper backing so edges never run through the text;
      // elsewhere a paper-coloured halo keeps them legible.
      {
        // Every label sits on a paper backing, so dots and edges never run through the text.
        ctx.fillStyle = theme.paper;
        ctx.globalAlpha = state.focus ? 0.88 : 0.75;
        ctx.fillRect(x + 4, d.y - size / 2 - 3, w + 6, size + 6);
        ctx.globalAlpha = 1;
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.paper;
      ctx.strokeText(d.label, x + 7, d.y + size / 3);
      ctx.fillStyle = theme.ink;
      ctx.fillText(d.label, x + 7, d.y + size / 3);
    },
    defaultDrawNodeHover: (ctx, d: any, settings) => {
      drawBlockLabel(ctx, { ...d, label: d.label || d.full }, settings.labelSize + (d.mark ? 1 : 0), !!d.mark);
    },
    nodeReducer: (node, attr) => {
      const res: any = { ...attr };
      if (!visible.has(node)) { res.hidden = true; return res; }
      const tree = isTree();
      const nt = attr.nt as string;
      if (tree) {
        // In the ownership circles, size says rank: owners, then subsidiaries, then products.
        const h = hullOf.get(node);
        res.size = nt === 'vendor' ? (h ? (h.depth === 1 ? 6.5 : 5) : 3.4) : nt === 'kernel' ? 3.6 : 3;
        // An owner's name is written on its circle; its own dot stays unlabelled.
        if (h) { res.full = res.label; res.label = ''; }
        // Semantic zoom: the best-connected products are named at the opening view, more as
        // the map is zoomed in (the label collision check keeps them apart).
        else if (!active() && (rank.get(node) ?? 1e9) < ZOOM_QUOTA[zoomStep]) res.forceLabel = true;
      } else if (state.lens === 'overview' && !active()) {
        res.size = Math.min(res.size, nt === 'vendor' ? 5 : 4.5);
        if (nt !== 'stage' && (rank.get(node) ?? 1e9) < ZOOM_QUOTA[zoomStep]) res.forceLabel = true;
        else if (nt !== 'stage') { res.full = res.label; if (zoomStep < 2) res.label = ''; }
      } else if (state.lens === 'interop' && !active()) {
        // File formats lens: name the most used formats; tools are named on hover or focus.
        if (nt !== 'format') { res.full = res.label; res.label = ''; }
        else if (topFormats.has(node)) res.forceLabel = true;
      }
      const a = active();
      if (a) {
        const related = tree ? state.family.has(node) || state.neighbors.has(node) : state.neighbors.has(node);
        if (node === a) {
          res.highlighted = true;
          res.borderColor = theme.ink;
          res.zIndex = 3;
          res.forceLabel = true;
          res.mark = node === state.focus;
          res.size = (tree ? Math.max(res.size, 6) : res.size) * 1.25;
          if (!res.label) res.label = res.full;
        } else if (related) {
          if (!res.label && res.full && state.neighbors.has(node) && !hullOf.has(node)) res.label = res.full;
          // Owners up the lineage are named at their dot (their circle's name may be off screen).
          if (tree && !res.label && res.full && state.lineage.has(node) && frameHull(a)?.v !== node) { res.label = res.full; res.forceLabel = true; }
          if (state.quiet.has(node)) res.quiet = true;
          else res.forceLabel = state.neighbors.size <= 60 || (tree && state.family.size <= 60);
          res.zIndex = 2;
        } else if (tree && state.context.has(node)) {
          // The rest of the company's circle stays in colour but steps back: smaller, unlabelled.
          res.label = '';
          res.size = Math.min(res.size * 0.6, 2.4);
          res.zIndex = 1;
        } else {
          // Everything else recedes to small, low-contrast specks.
          res.color = theme.faint;
          res.borderColor = theme.faint;
          res.size = Math.min(res.size * 0.4, 1.8);
          res.label = '';
          res.zIndex = 0;
        }
      }
      if (state.peek && node === state.peek) {
        res.highlighted = true;
        res.forceLabel = true;
        res.quiet = false;
        res.mark = true;
        res.zIndex = 4;
        res.color = attr.color;
        res.borderColor = theme.ink;
        if (!res.label) res.label = res.full || attr.label;
      }
      return res;
    },
    edgeReducer: (edge, attr) => {
      const res: any = { ...attr };
      const [s, t] = graph.extremities(edge);
      if (!visible.has(s) || !visible.has(t)) { res.hidden = true; return res; }
      const lens = state.lens !== 'overview';
      const tree = isTree();
      const st = EDGE_STYLE[attr.kind];
      if (lens) {
        if (!inLens(attr.kind)) { res.hidden = true; return res; }
        res.color = edgeColor(attr.kind);
        res.size = st?.w ?? 0.6;
        if (attr.status === 'divested') res.color = theme.rule;
        if (attr.same) res.color = theme.ink3;
        if (st?.dir) res.type = 'arrow';
      }
      const a = active();
      if ((state.lens === 'interop' || state.lens === 'overview') && !a) {
        if (state.lens === 'overview') {
          // Under the subject circles every relationship is a faint thread until pointed at.
          if (!state.edgeKinds.has(attr.kind)) { res.hidden = true; return res; }
          res.color = theme.faint;
          res.size = 0.35;
          res.type = 'line';
          return res;
        }
        // Hundreds of import and export arrows read as texture; colour waits for a pointer.
        res.color = theme.rule;
        res.size = 0.45;
        res.type = 'line';
        return res;
      }
      if (tree && !a) {
        // The circles carry the hierarchy; edges are the quiet spokes inside them, and the
        // cross-family "first developed at" links wait for a focus.
        if (attr.kind === 'originated-at') { res.hidden = true; return res; }
        res.color = theme.rule;
        res.size = 0.5;
        res.type = 'line';
        return res;
      }
      if (a) {
        const direct = s === a || t === a;
        const rolled = state.roll.has(s) || state.roll.has(t);
        if (direct || rolled || (tree && state.family.has(s) && state.family.has(t) && attr.kind !== 'originated-at')) {
          if (attr.kind === 'used-in-stage' && (!state.types.has('stage') || lens)) { res.hidden = true; return res; }
          if (!inLens(attr.kind)) { res.hidden = true; return res; }
          res.color = lens ? res.color : theme.ink;
          res.size = lens ? (st?.w ?? 0.6) * (direct || rolled ? 1.8 : 1.1) : 1;
          res.zIndex = 2;
          // Label the lens's edges around the focus, except kinds so common that their labels
          // would pile up (the detail panel lists those).
          if (state.explain && state.focus === a && (direct || rolled)) {
            res.label = sentence(s, t, attr);
            res.explain = true;
            res.forceLabel = true;
            res.labelColor = theme.ink;
          } else if (direct && state.focus === a && (lens || state.neighbors.size <= 30) && (kindCount.get(attr.kind) ?? 0) <= 8) {
            res.label = edgeLabel(attr.kind, attr.date, attr.status, attr.same ? attr.since : undefined);
            res.forceLabel = true;
            res.labelColor = theme.ink2;
          }
        } else {
          res.hidden = true;
        }
        return res;
      }
      if (!lens && !state.edgeKinds.has(attr.kind)) res.hidden = true;
      return res;
    },
  });

  // Zoom steps are relative to the opening view, which differs between screen shapes.
  let homeRatio = 1;
  renderer.getCamera().on('updated', (c: any) => {
    const rel = c.ratio / homeRatio;
    const st = rel > 0.6 ? 0 : rel > 0.25 ? 1 : 2;
    if (st !== zoomStep) { zoomStep = st; renderer.refresh({ skipIndexation: true }); }
  });

  // One fixed camera box over every layout, so moving nodes never re-normalizes the view.
  {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const m of layouts.values()) for (const p of m.values()) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    renderer.setCustomBBox({ x: [x0, x1], y: [y0, y1] });
  }

  // Overlay canvases: ownership circles under the edges, their names above the node labels,
  // and the sector names of a crowded focus ring.
  renderer.createCanvasContext('hulls', { beforeLayer: 'edges' } as any);
  renderer.createCanvasContext('hullLabels', { afterLayer: 'labels' } as any);
  renderer.resize(true);
  const hullCtx = renderer.getCanvases().hulls.getContext('2d')!;
  const hullLabelCtx = renderer.getCanvases().hullLabels.getContext('2d')!;
  let hullAlpha = 0;
  let hullHover = '';
  let sectors: { text: string; a: number; r: number; cx: number; cy: number }[] = [];
  const toView = (x: number, y: number) => renderer.graphToViewport({ x, y });
  // A circle's on-screen radii, measured along both axes: the graph-to-screen mapping is not
  // guaranteed to scale x and y alike, and drawing with one radius made packed circles overlap.
  const viewRadius = (h: { x: number; y: number; r: number }) => {
    const c = toView(h.x, h.y);
    const e = toView(h.x + h.r, h.y);
    const f = toView(h.x, h.y + h.r);
    return { cx: c.x, cy: c.y, r: Math.hypot(e.x - c.x, e.y - c.y), ry: Math.hypot(f.x - c.x, f.y - c.y) };
  };
  function fitText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, max: number) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 3 && ctx.measureText(t + '...').width > max) t = t.slice(0, -1);
    return t + '...';
  }
  // Where circle names go: top-level circles above their circle, inner ones just inside the
  // top of theirs; the lit lineage first, then larger circles; skipped where they would collide
  // or the circle is too small. Planned before each frame so node labels can keep clear.
  type HullLabel = { x: number; y: number; w: number; tw: number; size: number; weight: number; on: boolean; top: boolean; dc: string; text: string; count: string; text2?: string };
  function planHullLabels(): HullLabel[] {
    const hs = curHulls();
    const a = active();
    const tree = isTree();
    if (!hs.length || hullAlpha <= 0 || (a && !tree)) return [];
    const { width, height } = renderer.getDimensions();
    const lit = a && tree ? new Set([...lineage(a), brandKey(nodeById.get(a))]) : null;
    const placed: [number, number, number, number][] = [];
    const out: HullLabel[] = [];
    const named = [...hs].filter(hullVisible).sort((p, q) => Number(lit?.has(q.v) ?? 0) - Number(lit?.has(p.v) ?? 0) || p.depth - q.depth || q.n - p.n);
    for (const h of named) {
      const { cx, cy, r, ry } = viewRadius(h);
      const on = !!lit?.has(h.v);
      const top = h.depth === 1;
      const phone = window.innerWidth <= 860;
      const need = h.style === 'region' ? 8 : top ? (h.n >= 3 || h.style ? (phone ? (h.n >= 5 || h.style ? 30 : 60) : 16) : (phone ? 60 : 34)) : h.style === 'family' || h.style === 'brand' ? 26 : 40;
      if (!on && r < need) continue;
      if (lit && !on && !state.family.has(hullVendor(h)) && !state.context.has(hullVendor(h))) continue;
      const size = top ? 12 : 11;
      const weight = top || on ? 600 : 400;
      measure.font = `${weight} ${size}px ${LABEL_FONT}`;
      const tapOrClick = matchMedia('(pointer: coarse)').matches || window.innerWidth <= 860 ? 'tap' : 'click';
      const count = h.v === '#independent' ? `  ${h.n}, ${tapOrClick} to ${h.collapsed ? 'open' : 'close'}` : h.n ? `  ${h.n}` : '';
      // Long names over a small circle wrap onto two lines instead of running over neighbours.
      const full = hullName(h);
      let text = full, text2: string | undefined;
      if (!on && measure.measureText(full).width > r * 2 + (top ? 30 : -24) && full.includes(' ')) {
        const words = full.split(' ');
        let best = 1, bestW = Infinity;
        for (let k = 1; k < words.length; k++) { const wmax = Math.max(measure.measureText(words.slice(0, k).join(' ')).width, measure.measureText(words.slice(k).join(' ')).width); if (wmax < bestW) { bestW = wmax; best = k; } }
        text = words.slice(0, best).join(' ');
        text2 = fitText(measure, words.slice(best).join(' '), Math.max(r * 2 + 40, 90));
      } else text = fitText(measure, full, Math.max(r * 2 + (top ? 150 : 10), 90));
      const tw = Math.max(measure.measureText(text).width, text2 ? measure.measureText(text2).width : 0);
      measure.font = `400 ${size - 1}px ${LABEL_FONT}`;
      const w = tw + (count ? measure.measureText(count).width : 0);
      const y = top ? cy - ry - 10 - (text2 ? size + 3 : 0) : cy - ry + 16;
      const edge = phone ? 16 : 6;
      const x = Math.min(Math.max(cx - w / 2, edge), width - w - edge);
      if (y < 14 || y > height - 4) continue;
      const box: [number, number, number, number] = [x - 8, y - size - 5, x + w + 8, y + 10 + (text2 ? size + 3 : 0)];
      if (!on && placed.some(([a0, b0, a1, b1]) => box[0] < a1 && box[2] > a0 && box[1] < b1 && box[3] > b0)) continue;
      placed.push(box);
      out.push({ x, y, w, tw, size, weight, on, top, dc: h.style?.startsWith('domain:') ? theme.dom[h.style.slice(7)] : '', text, count, text2 });
    }
    return out;
  }
  function drawOverlays() {
    const { width, height } = renderer.getDimensions();
    hullCtx.clearRect(0, 0, width, height);
    hullLabelCtx.clearRect(0, 0, width, height);
    const hs = curHulls();
    if (hullAlpha > 0 && hs.length) {
      const a = active();
      const tree = isTree();
      const lit = a && tree ? new Set([...lineage(a), brandKey(nodeById.get(a))]) : null;
      const placed: [number, number, number, number][] = [];
      const free = (x0: number, y0: number, x1: number, y1: number) => !placed.some(([a0, b0, a1, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0);
      // With a focus outside the ownership circles, the regions step back.
      const quiet = !!a && !tree;
      hullCtx.globalAlpha = hullAlpha * (quiet ? 0.35 : 1);
      hullLabelCtx.globalAlpha = hullAlpha;
      const domainOf = (h: Hull) => (h.style?.startsWith('domain:') ? theme.dom[h.style.slice(7)] : '');
      // Outer circles first so the inner ones draw over them.
      const order = [...hs].sort((p, q) => p.depth - q.depth || q.n - p.n);
      for (const h of order) {
        if (!hullVisible(h)) continue;
        const { cx, cy, r, ry } = viewRadius(h);
        if (r < 3 || cx + r < 0 || cy + r < 0 || cx - r > width || cy - r > height) continue;
        const on = lit?.has(h.v);
        const dimmed = lit && !on && !state.family.has(hullVendor(h)) && !state.context.has(hullVendor(h));
        const dc = domainOf(h);
        hullCtx.beginPath();
        hullCtx.ellipse(cx, cy, r, ry, 0, 0, Math.PI * 2);
        if (dc && h.depth === 1) { hullCtx.save(); hullCtx.globalAlpha *= 0.07; hullCtx.fillStyle = dc; hullCtx.fill(); hullCtx.restore(); }
        else if (h.depth === 1 && h.style !== 'region' && !dimmed) { hullCtx.fillStyle = theme.wash; hullCtx.fill(); }
        hullCtx.setLineDash(h.style === 'region' ? [1, 4] : h.style === 'brand' ? [6, 2, 1, 2] : h.depth === 1 || h.style === 'family' ? [] : [3, 3]);
        hullCtx.lineWidth = on || h.v === hullHover ? 1.5 : h.style === 'region' ? 1.5 : 1;
        hullCtx.strokeStyle = on || h.v === hullHover ? theme.ink : dimmed ? theme.faint : dc && h.depth === 1 ? dc : h.depth === 1 || h.style === 'region' ? theme.ink3 : theme.rule;
        hullCtx.stroke();
      }
      hullCtx.setLineDash([]);
      hullCtx.globalAlpha = 1;
      // Names: top-level circles above their circle, inner ones just inside the top of theirs;
      // the lit lineage first, then larger circles, skipped where they would collide or the
      // circle is too small to carry one.
      if (!quiet) {
        for (const p of planHullLabels()) {
          const { x, y, w, tw, size, weight, on, top, dc, text, count, text2 } = p;
          const extra = text2 ? size + 3 : 0;
          if (on) {
            hullLabelCtx.fillStyle = theme.ink;
            hullLabelCtx.fillRect(x - 6, y - size - 3, w + 12, size + 10);
          } else {
            hullLabelCtx.fillStyle = theme.paper;
            hullLabelCtx.globalAlpha = hullAlpha;
            hullLabelCtx.fillRect(x - 4, y - size - 1, w + 8, size + 7 + extra);
            hullLabelCtx.globalAlpha = hullAlpha;
          }
          if (dc && top) { hullLabelCtx.fillStyle = dc; hullLabelCtx.fillRect(x - 3, y - size + 1, 3, size); }
          hullLabelCtx.font = `${weight} ${size}px ${LABEL_FONT}`;
          hullLabelCtx.fillStyle = on ? theme.paper : top ? theme.ink : theme.ink2;
          hullLabelCtx.fillText(text, x + (dc && top ? 4 : 0), y);
          if (text2) hullLabelCtx.fillText(text2, x + (dc && top ? 4 : 0), y + extra);
          if (count) {
            hullLabelCtx.font = `400 ${size - 1}px ${LABEL_FONT}`;
            hullLabelCtx.fillStyle = on ? theme.paper : theme.ink2;
            hullLabelCtx.fillText(count, x + tw + (dc && top ? 4 : 0), y);
          }
        }
      }
      hullLabelCtx.globalAlpha = 1;
    }
    // Sector names around a crowded focus ring.
    if (sectors.length && state.focus) {
      hullLabelCtx.font = `600 11px ${LABEL_FONT}`;
      for (const s of sectors) {
        const w = hullLabelCtx.measureText(s.text).width;
        const { x, y } = sectorBox(s, w, width);
        hullLabelCtx.fillStyle = theme.paper;
        hullLabelCtx.fillRect(x - 5, y - 12, w + 10, 17);
        hullLabelCtx.strokeStyle = theme.ink3;
        hullLabelCtx.lineWidth = 1;
        hullLabelCtx.strokeRect(x - 5.5, y - 12.5, w + 11, 18);
        hullLabelCtx.fillStyle = theme.ink2;
        hullLabelCtx.fillText(s.text, x, y);
      }
    }
  }
  renderer.on('beforeRender', () => {
    prevLabels = placedLabels;
    placedLabels = [];
    explainBoxes = [];
    // Marked labels (focus, peek) claim their place first.
    for (const id of [state.focus, state.peek]) {
      if (!id || !graph.hasNode(id)) continue;
      const d = renderer.getNodeDisplayData(id);
      if (!d) continue;
      const vp = renderer.framedGraphToViewport(d);
      const w = (graph.getNodeAttribute(id, 'label') || '').length * LABEL_SIZE * 0.62 + 14;
      const x = labelLeft(vp.x, 8, w);
      if (x !== null) placedLabels.push([x, vp.y - 12, x + w, vp.y + 12]);
    }
    // Circle names are drawn later on their own layer; node labels keep off them.
    for (const p of planHullLabels()) placedLabels.push([p.x - 8, p.y - p.size - 5, p.x + p.w + 8, p.y + 9 + (p.text2 ? p.size + 3 : 0)]);
    // Sector names of a crowded ring are drawn later on their own layer; keep node labels off them.
    if (sectors.length && state.focus) {
      measure.font = `600 11px ${LABEL_FONT}`;
      const { width } = renderer.getDimensions();
      for (const s of sectors) {
        const b = sectorBox(s, measure.measureText(s.text).width, width);
        placedLabels.push([b.x - 6, b.y - 13, b.x + b.w + 6, b.y + 7]);
      }
    }
  });
  function sectorBox(s: { a: number; r: number; cx: number; cy: number }, w: number, width: number) {
    const p = toView(s.cx + Math.cos(s.a) * s.r, s.cy + Math.sin(s.a) * s.r);
    const cx = toView(s.cx, s.cy).x;
    const left = p.x < cx - 20, mid = Math.abs(p.x - cx) <= 20;
    const x = Math.min(Math.max(left ? p.x - w : mid ? p.x - w / 2 : p.x, 6), (labelRight || width) - w - 6);
    return { x, y: p.y + 4, w };
  }
  renderer.on('afterRender', drawOverlays);
  let fade = 0;
  function fadeHulls(to: number) {
    cancelAnimationFrame(fade);
    if (reduced) { hullAlpha = to; renderer.refresh({ skipIndexation: true }); return; }
    const from = hullAlpha, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 320);
      hullAlpha = from + (to - from) * k;
      drawOverlays();
      if (k < 1) fade = requestAnimationFrame(step);
      // Once the circle names are in, redraw so node labels make room for them.
      else renderer.refresh({ skipIndexation: true });
    };
    fade = requestAnimationFrame(step);
  }
  /** Open or close the independents region, and move the camera to what changed. */
  function setIndependents(open: boolean) {
    if (state.indepOpen === open) return;
    state.indepOpen = open;
    recompute();
    renderer.refresh();
    const view = open && indep ? frameHullView({ v: '#independent', x: indep.x, y: -indep.y, r: indep.r, depth: 1, n: 0 }) : homeView();
    if (view) renderer.getCamera().animate(view, { duration: reduced ? 0 : 650, easing: 'cubicInOut' });
  }
  /** Innermost visible circle under a viewport point. */
  function hullAt(x: number, y: number): Hull | undefined {
    if (hullAlpha < 0.5 || (state.focus && !isTree())) return undefined;
    let best: Hull | undefined;
    for (const h of curHulls()) {
      if (!hullVisible(h)) continue;
      const c = viewRadius(h);
      if (((x - c.cx) / c.r) ** 2 + ((y - c.cy) / c.ry) ** 2 <= 1 && (!best || h.r < best.r)) best = h;
    }
    return best;
  }

  // Node motion: tween graph positions toward targets.
  let tween = 0;
  function moveNodes(targets: Map<string, { x: number; y: number }>, ms: number): Promise<void> {
    cancelAnimationFrame(tween);
    const from = new Map<string, { x: number; y: number }>();
    for (const id of targets.keys()) from.set(id, { x: graph.getNodeAttribute(id, 'x'), y: graph.getNodeAttribute(id, 'y') });
    if (reduced || ms === 0) {
      for (const [id, p] of targets) graph.mergeNodeAttributes(id, p);
      return Promise.resolve();
    }
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    return new Promise((done) => {
      const step = (now: number) => {
        const k = ease(Math.min(1, (now - t0) / ms));
        for (const [id, p] of targets) {
          const f = from.get(id)!;
          graph.mergeNodeAttributes(id, { x: f.x + (p.x - f.x) * k, y: f.y + (p.y - f.y) * k });
        }
        if (k < 1) tween = requestAnimationFrame(step);
        else done();
      };
      tween = requestAnimationFrame(step);
    });
  }
  const basePos = (id: string) => layouts.get(state.lens)?.get(id) ?? layouts.get('overview')!.get(id)!;

  // Interactions
  renderer.on('enterNode', ({ node }) => { state.hover = node; computeNeighbors(); renderer.refresh({ skipIndexation: true }); host.style.cursor = 'pointer'; });
  renderer.on('leaveNode', () => { state.hover = ''; computeNeighbors(); renderer.refresh({ skipIndexation: true }); host.style.cursor = ''; });
  renderer.on('clickNode', ({ node }) => focus(node, false));
  renderer.on('clickStage', ({ event }) => {
    // In the ownership circles, a click inside a circle opens that company; outside, it clears.
    const h = hullAt(event.x, event.y);
    if (h && h.v === '#independent' && !state.focus) { setIndependents(!state.indepOpen); return; }
    if (h && nodeById.has(h.v) && h.v !== state.focus) focus(h.v, false);
    else if (h && !nodeById.has(h.v) && !state.focus) {
      // A region or category circle: zoom into it.
      const view = frameHullView(h);
      if (view) renderer.getCamera().animate(view, { duration: reduced ? 0 : 600, easing: 'cubicInOut' });
    } else if (state.focus) focus('', false);
  });
  renderer.on('moveBody', ({ event }) => {
    const h = hullAt(event.x, event.y);
    const id = h?.v ?? '';
    if (id !== hullHover) {
      hullHover = id;
      host.style.cursor = id ? 'pointer' : '';
      host.title = h ? (nodeById.has(h.v) ? `${hullName(h)}: click to focus` : `${hullName(h)}: click to zoom in`) : '';
      drawOverlays();
    }
  });

  const detail = $('#detail');
  const crumbBar = $('#lineage');
  function pageHref(n: LiteNode) {
    if (n.t === 'tool' || n.t === 'kernel') return `/tools/${n.id}/`;
    if (n.t === 'vendor') return `/vendors/${n.id}/`;
    if (n.t === 'format') return `/formats/${n.id}/`;
    if (n.t === 'stage') return `/workflow/#${n.id.replace('stage-', '')}`;
    return '#';
  }
  function swatch(n: LiteNode) {
    const cls = n.t === 'vendor' ? 'sw vendor' : n.t === 'format' ? 'sw format' : n.t === 'kernel' ? 'sw kernel' : 'sw';
    return `<span class="${cls}" data-d="${n.dm ?? ''}" aria-hidden="true"></span>`;
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  function lineageHtml(id: string) {
    const ids = lineage(id);
    if (ids.length < 2) return '';
    // A product marketed under a brand shows it between the vendor and the product.
    const bnRaw = brandName(nodeById.get(id));
    const bn = bnRaw && bnRaw.toLowerCase() !== nodeById.get(id)!.l.toLowerCase() ? bnRaw : undefined;
    return `<ol class="lineage-list">${ids
      .map((x, i) => {
        if (bn && x === id) { const bv = data.brands?.[nodeById.get(id)!.b!]?.[1]; return `<li><span class="lin-brand" title="Brand (product family)">${esc(bn)}${bv && bv !== nodeById.get(id)!.v ? ` brand of ${esc(shortName(bv))}` : ''}</span></li><li><span aria-current="true">${esc(nodeById.get(x)!.l)}</span></li>`; }
        const n = nodeById.get(x)!;
        const pending = i < ids.length - 1 && nodeById.get(ids[i + 1])?.t === 'vendor' && owner[ids[i + 1]]?.[1] ? ' <span class="muted">(pending)</span>' : '';
        return `<li>${x === id ? `<span aria-current="true">${esc(n.l)}</span>` : `<button type="button" data-focus="${x}">${esc(n.l)}</button>`}${pending}</li>`;
      })
      .join('')}</ol>`;
  }

  const ORDER = ['Made by', 'Part of', 'Acquired by', 'Originally developed at', 'Runs on (platform)', 'Built on', 'Plugin of', 'Applications on this platform', 'Products', 'Originated here', 'Subsidiaries', 'Acquired', 'Used by', 'Plugins', 'Open-source alternative to', 'Open-source alternatives', 'Competes with', 'Integrates with', 'Reads', 'Writes', 'Read by', 'Written by', 'Stewarded by', 'Stewards', 'Stage', 'Tools'];
  function renderDetail(id: string) {
    // In a lens where the node has no links, say so instead of leaving an empty ring.
    const none = id && state.lens !== 'overview' && !state.neighbors.size ? `No ${LENS_LINKS[state.lens] ?? 'links'} for ${esc(nodeById.get(id)?.l ?? id)} yet.` : '';
    crumbBar.innerHTML = id ? lineageHtml(id) + (none ? `<p class="lens-note">${none}</p>` : '') : '';
    crumbBar.hidden = !crumbBar.innerHTML;
    if (!id) { detail.hidden = true; detail.classList.remove('in'); return; }
    const n = nodeById.get(id)!;
    const groups = new Map<string, { ids: string[]; lens: boolean; kind: string; dates: Map<string, string> }>();
    graph.forEachEdge(id, (key, attr, s, t) => {
      const out = s === id;
      const other = out ? t : s;
      const label = attr.same ? `Overlaps within ${shortName(attr.same)}` : RELATION[attr.kind]?.[out ? 0 : 1] ?? attr.kind;
      if (!groups.has(label)) groups.set(label, { ids: [], lens: state.lens !== 'overview' && inLens(attr.kind), kind: attr.kind, dates: new Map() });
      const g = groups.get(label)!;
      if (!g.ids.includes(other)) g.ids.push(other);
      if (attr.date) g.dates.set(other, String(attr.date).slice(0, 7) + (attr.status && attr.status !== 'completed' ? `, ${attr.status}` : ''));
    });
    const sections = [...groups.entries()]
      .sort((a, b) => Number(b[1].lens) - Number(a[1].lens) || ORDER.indexOf(a[0].startsWith('Overlaps within') ? 'Competes with' : a[0]) - ORDER.indexOf(b[0].startsWith('Overlaps within') ? 'Competes with' : b[0]))
      .map(([label, g]) => {
        const items = g.ids
          .map((o) => nodeById.get(o)!)
          .sort((a, b) => a.l.localeCompare(b.l))
          .map((m) => `<li>${swatch(m)}<button type="button" class="linkish" data-focus="${m.id}">${esc(m.l)}</button>${g.dates.has(m.id) ? `<span class="muted num rel-date">${esc(g.dates.get(m.id)!)}</span>` : ''}</li>`)
          .join('');
        const key = g.lens ? `<span class="rel-key" style="background:var(${label.startsWith('Overlaps within') ? '--ink-3' : EDGE_STYLE[g.kind]?.c ?? '--e-a'})" aria-hidden="true"></span>` : '';
        return `<h3 class="${g.lens ? 'in-lens' : ''}">${key}${label} <span class="muted num">${g.ids.length}</span></h3><ul>${items}</ul>`;
      })
      .join('');
    const meta: string[] = [TYPE_LABEL[n.t] ?? n.t];
    if (n.c && n.t !== 'kernel') meta.push(catName.get(n.c) ?? n.c);
    if (brandName(n)) meta.push(`${brandName(n)} brand`);
    if (n.o) meta.push('open source');
    if (n.st) meta.push(n.st);
    const inTree = n.t === 'vendor' ? n.id : n.t === 'tool' || n.t === 'kernel' ? n.v : '';
    const treeLink = inTree ? `<a class="btn-2" href="/vendors/tree/#v-${inTree}">In the ownership tree</a>` : '';
    const formatLink = n.t === 'format' ? `<a class="btn-2" href="/formats/${n.id}/#example">See an example file</a>` : '';
    detail.innerHTML = `
      <div class="detail-head">
        <div class="detail-top"><p class="detail-meta">${meta.map(esc).join(', ')}</p><button type="button" class="detail-close" data-clear aria-label="Clear focus" title="Clear focus (Esc)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5"/></svg></button></div>
        <nav class="detail-lineage" aria-label="Ownership">${lineageHtml(id)}</nav>
        <h2 id="detail-title">${swatch(n)}${esc(n.l)}</h2>
        ${n.sm ? `<p>${esc(n.sm)}</p>` : ''}
        ${(n.pl || catPlain.get(n.c ?? '')) && (n.t === 'tool' || n.t === 'kernel') ? `<p class="detail-plain"><b>What it does.</b> ${esc(n.pl ?? catPlain.get(n.c!)!)}</p>` : ''}
        ${n.fn ? `<p class="detail-plain"><b>Its data.</b> ${esc(n.fn)}</p>` : n.nx?.length ? `<p class="detail-plain"><b>Its own files.</b> ${n.nx.map(([ext, what, f]) => (f ? `<a href="/formats/${f}/">${esc(what)}</a>` : esc(what)) + ` <span class="mono">${esc(ext)}</span>`).join(', ')}</p>` : n.nf?.length ? `<p class="detail-plain"><b>Its own files.</b> ${n.nf.map((f) => `<a href="/formats/${f}/">${esc(nodeById.get(f)?.l ?? f)}</a>`).join(', ')}</p>` : ''}
        ${n.cl?.length ? n.cl.map((c) => `<p class="detail-plain detail-clar"><b>Often confused.</b> ${esc(c)}</p>`).join('') : ''}
        ${state.roll.size ? rollSummary(id) : ''}
        ${none ? `<p class="detail-none">${none}</p>` : ''}
        <p class="detail-actions"><a class="btn" href="${pageHref(n)}">Open the page</a>${formatLink}${treeLink}${state.lens !== 'overview' && state.neighbors.size ? `<button type="button" class="btn-2" data-explain aria-pressed="${state.explain}">${state.explain ? 'Hide explanations' : 'Explain the links'}</button>` : ''}<a class="btn-2" href="/path/?a=${encodeURIComponent(n.id)}">Compare with...</a></p>
        ${state.explain ? explainList(id) : ''}
      </div>
      <div class="detail-rel">${sections}</div>`;
    detail.hidden = false;
    detail.scrollTop = 0;
    requestAnimationFrame(() => detail.classList.add('in'));
  }

  // Camera that shows a set of points (framed-graph coordinates, with a node radius and a
  // label width each) inside the part of the map the detail panel and controls leave free.
  function frameAround(anchor: { x: number; y: number }, list: { x: number; y: number; s: number; w: number; lw?: number }[], closest = 0.06, topAlign = false) {
    const cam = renderer.getCamera();
    const { width, height } = renderer.getDimensions();
    const wide = window.innerWidth > 860;
    const top = (document.querySelector('.lensbar') as HTMLElement | null)?.offsetHeight ?? 60;
    const area = wide
      ? { x0: 24, x1: width - (detail.hidden ? 0 : detail.offsetWidth + 16) - 24, y0: top + 40, y1: height - 56 }
      : { x0: 12, x1: width - 12, y0: 72, y1: height - (detail.hidden ? ((document.querySelector('.m-help') as HTMLElement | null)?.offsetHeight ?? 0) + 76 : detail.offsetHeight) - 20 };
    if (area.x1 - area.x0 < 120 || area.y1 - area.y0 < 80) return null;
    const base = { x: anchor.x, y: anchor.y, ratio: 1, angle: cam.angle };
    const mid = { x: width / 2, y: height / 2 };
    const pts = list.map((p) => {
      const vp = renderer.framedGraphToViewport(p, { cameraState: base });
      return { ox: vp.x - mid.x, oy: vp.y - mid.y, s: p.s, w: p.w, lw: p.lw };
    });
    const box = (r: number) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) {
        const x = p.ox / r, y = p.oy / r, s = p.s / Math.sqrt(r);
        x0 = Math.min(x0, x - s - 4 - (p.lw ?? 0));
        // Labels flip to the left at the right limit, so reserve only a short run of each.
        x1 = Math.max(x1, x + s + 6 + Math.min(p.w, p.lw === undefined ? 96 : 400));
        y0 = Math.min(y0, y - s - 8);
        y1 = Math.max(y1, y + s + 8);
      }
      return { x0, x1, y0, y1 };
    };
    const fits = (r: number) => { const b = box(r); return b.x1 - b.x0 <= area.x1 - area.x0 && b.y1 - b.y0 <= area.y1 - area.y0; };
    // Smallest ratio (closest zoom) at which everything fits; never closer than 0.06.
    let ratio = closest;
    if (!fits(ratio)) {
      let lo = closest, hi = 2;
      if (fits(hi)) for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
      ratio = hi;
    }
    const b = box(ratio);
    const at = { ...base, ratio };
    const from = renderer.viewportToFramedGraph({ x: mid.x + (b.x0 + b.x1) / 2, y: mid.y + (b.y0 + b.y1) / 2 }, { cameraState: at });
    // Top-aligned (phones, opening view): content starts right under the controls.
    const ty = topAlign ? Math.min((area.y0 + area.y1) / 2, area.y0 + 12 + (b.y1 - b.y0) / 2) : (area.y0 + area.y1) / 2;
    const to = renderer.viewportToFramedGraph({ x: (area.x0 + area.x1) / 2, y: ty }, { cameraState: at });
    return { ...at, x: anchor.x + (from.x - to.x), y: anchor.y + (from.y - to.y) };
  }
  function frameFocus(id: string) {
    const d = renderer.getNodeDisplayData(id);
    if (!d) return null;
    measure.font = `400 ${LABEL_SIZE}px ${LABEL_FONT}`;
    const ids = [id, ...state.neighbors].filter((n) => n === id || visible.has(n));
    const pts = ids.map((n) => {
      const nd = renderer.getNodeDisplayData(n)!;
      return { x: nd.x, y: nd.y, s: graph.getNodeAttribute(n, 'size') as number, w: state.quiet.has(n) ? 0 : measure.measureText(graph.getNodeAttribute(n, 'label') || '').width };
    });
    // Leave room for the sector names around a crowded ring.
    for (const s of sectors) {
      const f = renderer.viewportToFramedGraph(toView(s.cx + Math.cos(s.a) * s.r, s.cy + Math.sin(s.a) * s.r));
      // Sector names hang left of the ring on its left side, right of it on the right.
      const w = measure.measureText(s.text).width + 12;
      const c = Math.cos(s.a);
      pts.push({ x: f.x, y: f.y, s: 8, w: c > 0.25 ? w : Math.abs(c) <= 0.25 ? w / 2 : 0, lw: c < -0.25 ? w : Math.abs(c) <= 0.25 ? w / 2 : 0 });
    }
    return frameAround(d, pts);
  }
  /** The view that shows the whole lens layout, clear of the lens bar and the panel. */
  function layoutView() {
    const pos = layouts.get(state.lens);
    if (!pos) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    // On a phone the ownership view opens on the owner families; the independents region is a
    // pan away, so the families are large enough to read.
    // The ownership view frames the families and the collapsed independents circle (on a phone,
    // the families alone); open, it frames everything.
    const fam = state.lens === 'ownership' && !state.indepOpen ? curHulls().filter((h) => h.depth === 1) : [];
    if (fam.length) for (const h of fam) { x0 = Math.min(x0, h.x - h.r); x1 = Math.max(x1, h.x + h.r); y0 = Math.min(y0, h.y - h.r); y1 = Math.max(y1, h.y + h.r); }
    else for (const p of pos.values()) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const pad = (x1 - x0) * 0.02;
    const pts = [[x0 - pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad], [x1 + pad, y0 - pad]].map(([x, y]) => renderer.viewportToFramedGraph(toView(x, y)));
    const c = renderer.viewportToFramedGraph(toView((x0 + x1) / 2, (y0 + y1) / 2));
    return frameAround(c, pts.map((p) => ({ x: p.x, y: p.y, s: 0, w: 0, lw: 0 })), 0.06, window.innerWidth <= 860);
  }
  const homeView = () => layoutView() ?? { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
  const home = (ms: number) => {
    const cam = renderer.getCamera();
    if (reduced || !ms) cam.setState(homeView());
    else cam.animate(homeView(), { duration: ms, easing: 'cubicInOut' });
  };
  /** Frame a whole circle, with room for its name above it; with a focus, also the owner's dot
   *  one level up, so the "acquired by" edge ends inside the visible area. */
  function frameHullView(h: Hull, id?: string) {
    const c = renderer.viewportToFramedGraph(toView(h.x, h.y));
    const e = renderer.viewportToFramedGraph(toView(h.x + h.r, h.y));
    const rr = Math.hypot(e.x - c.x, e.y - c.y) * 1.04;
    const pts = [[0, -1.12], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ x: c.x + dx * rr, y: c.y + dy * rr, s: 0, w: 0 }));
    const up = id ? owner[h.v]?.[0] : undefined;
    const ud = up && visible.has(up) ? renderer.getNodeDisplayData(up) : undefined;
    if (ud) pts.push({ x: ud.x, y: ud.y, s: 8, w: 0 });
    return frameAround(c, pts);
  }

  // Focus: in most lenses the neighbors fly in to a ring around the focused node, grouped by
  // relationship (and by category when there are many), while everything else fades. In the
  // ownership circles nothing moves: the camera frames the company's circle and its lineage
  // lights up. Clearing focus sends everything back to the lens layout.
  let extent = 1;
  {
    const o = layouts.get('overview')!;
    for (const p of o.values()) extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
  }
  function ringTargets(id: string, c: { x: number; y: number }): Map<string, { x: number; y: number; side: string }> {
    const out = new Map<string, { x: number; y: number; side: string }>();
    sectors = [];
    const groups = new Map<string, string[]>();
    const seen = new Set<string>();
    lensEdges(id, (_k, attr, other, outward) => {
      if (!visible.has(other) || other === id || seen.has(other)) return;
      seen.add(other);
      const label = RELATION[attr.kind]?.[outward ? 0 : 1] ?? attr.kind;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(other);
    });
    const rolled = state.roll.size ? rollGroups(id) : [];
    if (rolled.length) {
      const direct = [...seen];
      groups.clear();
      seen.clear();
      for (const g of rolled) { const ids = g.ids.filter((x) => x !== id && !seen.has(x)); groups.set(g.name, ids); for (const x of ids) seen.add(x); }
      for (const x of direct) seen.add(x);
    }
    const n = seen.size;
    if (!n) return out;
    const crowded = n > CROWD && !rolled.length;
    // Ordered runs around the circle; a crowded ring is split by category so each sector
    // can carry one name.
    const runs: { name: string; ids: string[] }[] = [];
    if (rolled.length) {
      const used = new Set<string>();
      for (const g of rolled) { const ids = g.ids.filter((x) => !used.has(x)); ids.forEach((x) => used.add(x)); if (ids.length) runs.push({ name: g.short, ids }); }
      for (const x of seen) if (!used.has(x)) { runs[runs.length - 1]?.ids.push(x); used.add(x); }
    } else if (!crowded) {
      for (const [label, ids] of [...groups.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))) runs.push({ name: label, ids: ids.sort((a, b) => nodeById.get(a)!.l.localeCompare(nodeById.get(b)!.l)) });
    } else {
      // The edge colours already say which relation each spoke is, so sectors go by category.
      const byCat = new Map<string, string[]>();
      for (const x of seen) {
        const m = nodeById.get(x)!;
        const k = m.c ? catName.get(m.c) ?? m.c : TYPE_LABEL[m.t] ?? m.t;
        if (!byCat.has(k)) byCat.set(k, []);
        byCat.get(k)!.push(x);
      }
      for (const [k, xs] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) runs.push({ name: k, ids: xs.sort((a, b) => nodeById.get(b)!.d - nodeById.get(a)!.d) });
    }
    const ordered = runs.flatMap((r) => r.ids);
    const gap = extent * 0.036;
    // Every neighbor gets its own angle so runs stay contiguous; crowded rings alternate
    // between a few radii so neighbors do not touch.
    const layers = Math.max(1, Math.ceil((n * gap) / (2 * Math.PI * extent * 0.16)));
    const r0 = Math.max(extent * (rolled.length ? 0.11 : 0.085), (Math.min(n, 18) * gap) / (2 * Math.PI));
    const rAt = (j: number) => r0 + (j % layers) * gap * 1.5;
    const a0 = -Math.PI / 2;
    ordered.forEach((x, j) => {
      const a = a0 + (j / n) * Math.PI * 2;
      const r = rAt(j);
      out.set(x, { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, side: Math.cos(a) < -0.2 ? 'l' : 'r' });
    });
    if (crowded || rolled.length) {
      let j = 0;
      const rOut = r0 + (layers - 1) * gap * 1.5 + gap * 0.9;
      for (const run of runs) {
        const mid = a0 + ((j + (run.ids.length - 1) / 2) / n) * Math.PI * 2;
        // Phones have room for the big sectors only.
        // On phones a company's grouped ring is named in the panel below, not on the map.
        if (run.ids.length >= (rolled.length ? (window.innerWidth <= 860 ? 1e9 : 1) : window.innerWidth <= 860 ? 8 : 3)) sectors.push({ text: `${run.name} ${run.ids.length}`, a: mid, r: rOut, cx: c.x, cy: c.y });
        j += run.ids.length;
      }
    }
    return out;
  }
  // One motion for every change of focus or lens: nodes tween to their places (lens layout,
  // plus a ring around the focus outside the ownership circles) while the camera moves to the
  // final framing, measured by applying the arrangement, framing it and restoring it.
  let motion = 0;
  async function arrange(ms: number) {
    const my = ++motion;
    const id = state.focus;
    const tree = isTree();
    sectors = [];
    const targets = new Map<string, { x: number; y: number }>();
    graph.forEachNode((nid, a) => { targets.set(nid, basePos(nid)); if (a.side) graph.removeNodeAttribute(nid, 'side'); });
    if (id && !tree) {
      targets.set(id, layouts.get(state.lens)?.get(id) ?? graph.getNodeAttributes(id) as any);
      for (const [nid, p] of ringTargets(id, targets.get(id)!)) {
        targets.set(nid, { x: p.x, y: p.y });
        graph.setNodeAttribute(nid, 'side', p.side);
      }
    }
    labelRight = id && window.innerWidth > 860 && !detail.hidden ? detail.getBoundingClientRect().left - host.getBoundingClientRect().left - 8 : 0;
    const start = new Map<string, { x: number; y: number }>();
    graph.forEachNode((nid, a) => start.set(nid, { x: a.x, y: a.y }));
    for (const [nid, p] of targets) graph.mergeNodeAttributes(nid, { x: p.x, y: p.y });
    renderer.refresh();
    let view: any = null;
    if (id) {
      const h = tree ? frameHull(id) : undefined;
      if (h) view = frameHullView(h, id);
      else if (state.neighbors.size) view = frameFocus(id);
      else {
        // No links in this lens: keep the node centred in the free area.
        const d = renderer.getNodeDisplayData(id);
        if (d) view = frameAround(d, [{ x: d.x, y: d.y, s: 12, w: 160 }], 0.35);
      }
    } else view = homeView();
    for (const [nid, p] of start) graph.mergeNodeAttributes(nid, p);
    renderer.refresh();
    const cam = renderer.getCamera();
    if (view) cam.animate(view, { duration: reduced ? 0 : ms, easing: 'cubicInOut' });
    await moveNodes(targets, ms);
    if (my === motion && curHulls().length && hullAlpha < 1) fadeHulls(1);
  }
  async function focus(id: string, fromHash: boolean) {
    if (id && indepSet.has(id) && !state.indepOpen) state.indepOpen = true;
    state.focus = id;
    state.peek = '';
    computeNeighbors();
    recompute();
    if (!fromHash) writeHash(false);
    renderDetail(id);
    await arrange(id ? 700 : 550);
  }
  detail.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-focus], [data-clear], [data-explain]');
    if (!t) return;
    if (t.dataset.explain !== undefined) {
      state.explain = !state.explain;
      renderDetail(state.focus);
      renderer.refresh();
      return;
    }
    if (t.dataset.focus) focus(t.dataset.focus, false);
    else focus('', false);
  });
  document.querySelector('.m-help')?.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-focus]');
    if (t) focus(t.dataset.focus!, false);
  });
  crumbBar.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-focus]');
    if (t) focus(t.dataset.focus!, false);
  });
  // Pointing at a name in the panel marks that node on the map.
  const peek = (id: string) => {
    if (id === state.peek) return;
    state.peek = id;
    if (state.focus) computeNeighbors();
    renderer.refresh({ skipIndexation: true });
  };
  for (const el of [detail, crumbBar]) {
    el.addEventListener('pointerover', (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-focus]'); if (t) peek(t.dataset.focus!); });
    el.addEventListener('pointerout', (e) => { if ((e.target as HTMLElement).closest('[data-focus]')) peek(''); });
    el.addEventListener('focusin', (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-focus]'); if (t) peek(t.dataset.focus!); });
    el.addEventListener('focusout', () => peek(''));
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.focus) focus('', false); });

  // Lens: switch edge kinds, node set, layout and styling.
  const lensButtons = document.querySelectorAll<HTMLButtonElement>('[data-lens]');
  const lensSelect = document.querySelector<HTMLSelectElement>('#lens-select');
  // Switching lens keeps the selection: the detail panel stays on it, the breadcrumb stays,
  // and one motion carries the map to the node's neighborhood in the new lens.
  async function setLens(id: string, fromHash = false) {
    if (!layouts.has(id) && id !== 'overview') id = 'overview';
    if (id === state.lens) return;
    state.lens = id;
    state.hover = '';
    state.peek = '';
    computeNeighbors();
    recompute();
    hullAlpha = 0;
    syncLensUi();
    if (!fromHash) writeHash(true);
    renderDetail(state.focus);
    await arrange(750);
  }
  function syncLensUi() {
    const lens = lensOf(state.lens);
    lensButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lens === state.lens)));
    if (lensSelect) lensSelect.value = state.lens;
    const blurb = document.querySelector('#lens-blurb');
    if (blurb) blurb.innerHTML = lens.blurb + (state.lens === 'ownership' ? ' <a href="/vendors/tree/">Read it as an indented tree</a>.' : '');
    const legend = document.querySelector<HTMLElement>('#lens-legend');
    if (legend) {
      const extra = state.lens === 'rivals' ? '<span><span class="ekey" style="--c:var(--ink-3)"></span>overlaps (same owner)</span>' : state.lens === 'ownership' ? '<span><span class="hkey" aria-hidden="true"></span>owner family</span><span><span class="hkey sub" aria-hidden="true"></span>subsidiary</span><span><span class="hkey brand" aria-hidden="true"></span>brand</span>' : '';
      legend.innerHTML = extra + lens.kinds
        .filter((k) => !(state.lens === 'ownership' && k === 'originated-at'))
        .map((k) => `<span><span class="ekey${EDGE_STYLE[k]?.dir ? ' dir' : ''}" style="--c:var(${EDGE_STYLE[k]?.c})"></span>${EDGE_STYLE[k]?.legend ?? k}</span>`)
        .join('');
      legend.hidden = !lens.kinds.length;
    }
    document.querySelector('#edges-fieldset')?.toggleAttribute('hidden', state.lens !== 'overview');
    document.body.dataset.lens = state.lens;
  }
  lensButtons.forEach((b) => b.addEventListener('click', () => setLens(b.dataset.lens!)));
  lensSelect?.addEventListener('change', () => setLens(lensSelect.value));
  // Lens changes add a history entry so back and forward step through them; focus changes
  // update the current entry.
  function writeHash(push: boolean) {
    const p = new URLSearchParams();
    if (state.lens !== DEFAULT_LENS) p.set('lens', state.lens);
    if (state.focus) p.set('n', state.focus);
    const h = p.toString();
    const url = h ? `#${h}` : location.pathname;
    if (url === (location.hash || location.pathname)) return;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }

  // Search
  const input = $<HTMLInputElement>('#search');
  const list = $('#search-results');
  let results: LiteNode[] = [];
  let sel = -1;
  const vendorNames = new Map(data.nodes.filter((n) => n.t === 'vendor').map((n) => [n.id, n.l]));
  function runSearch() {
    const q = input.value.trim().toLowerCase();
    sel = -1;
    if (!q) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    // Exact names first, then starts-with, contains, and every word found across the name and
    // its vendor ("Ansys LS-DYNA"); tools before formats and vendors on a tie.
    const words = q.split(/\s+/).filter(Boolean);
    const typeRank: Record<string, number> = { tool: 0, kernel: 0, vendor: 1, format: 2, stage: 3 };
    const scored = data.nodes
      .map((n) => {
        const l = n.l.toLowerCase();
        const aka = (n.a ?? []).map((x) => x.toLowerCase());
        const hay = `${l} ${aka.join(' ')} ${(vendorNames.get(n.v ?? '') ?? '').toLowerCase()} ${n.id}`;
        let s = l === q || l.replace(/\s*\(.*\)$/, '') === q || aka.includes(q) ? -1 : l.startsWith(q) ? 0 : aka.some((x) => x.startsWith(q)) ? 0.5 : l.includes(q) ? 1 : n.id.includes(q) ? 2 : words.length > 1 && words.every((w) => hay.includes(w)) ? 2.5 : (vendorNames.get(n.v ?? '') ?? '').toLowerCase().includes(q) ? 3 : 9;
        return [s, n] as const;
      })
      .filter(([s]) => s < 9)
      .sort((a, b) => a[0] - b[0] || (typeRank[a[1].t] ?? 9) - (typeRank[b[1].t] ?? 9) || b[1].d - a[1].d)
      .slice(0, 9);
    results = scored.map(([, n]) => n);
    list.innerHTML = results.length
      ? results.map((n, i) => `<li role="option" id="opt-${i}" data-id="${n.id}">${swatch(n)}<span>${esc(n.l)}</span><span class="muted">${TYPE_LABEL[n.t]}${n.v ? ', ' + esc(vendorNames.get(n.v) ?? '') : ''}</span></li>`).join('')
      : `<li class="empty">No match. Try a product, vendor or file extension name.</li>`;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  async function choose(i: number) {
    const n = results[i];
    if (!n) return;
    input.value = n.l;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (!visible.has(n.id)) {
      resetFilters();
      // A node outside the current lens: formats open in the file formats lens, anything else
      // in the full map.
      if (!visible.has(n.id)) await setLens(n.t === 'format' && layouts.get('interop')?.has(n.id) ? 'interop' : 'overview');
    }
    document.querySelector('#controls')?.classList.remove('open');
    $('#controls-toggle').setAttribute('aria-expanded', 'false');
    focus(n.id, false);
  }
  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { sel = Math.min(results.length - 1, sel + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(sel < 0 ? 0 : sel); e.preventDefault(); return; }
    else if (e.key === 'Escape') { list.hidden = true; return; }
    else return;
    list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === sel)));
    input.setAttribute('aria-activedescendant', sel >= 0 ? `opt-${sel}` : '');
  });
  list.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null;
    if (li) { e.preventDefault(); choose(results.findIndex((r) => r.id === li.dataset.id)); }
  });
  input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 120));
  // "/" jumps to search, as on most map and docs sites.
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      if (window.innerWidth <= 860) { $('#controls').classList.add('open'); $('#controls-toggle').setAttribute('aria-expanded', 'true'); }
      input.focus();
    }
  });

  // Filters
  const update = () => { recompute(); computeNeighbors(); renderer.refresh(); syncFilterUi(); };
  document.querySelectorAll<HTMLButtonElement>('[data-domain]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = b.dataset.domain!;
      const all = state.domains.size === data.domains.length;
      if (all) { state.domains = new Set([d]); }
      else if (state.domains.has(d)) { state.domains.delete(d); if (!state.domains.size) state.domains = new Set(data.domains.map((x) => x.id)); }
      else state.domains.add(d);
      update();
    }),
  );
  document.querySelectorAll<HTMLInputElement>('[data-type]').forEach((c) =>
    c.addEventListener('change', () => {
      const ts = c.dataset.type!.split(',');
      for (const t of ts) c.checked ? state.types.add(t) : state.types.delete(t);
      update();
    }),
  );
  document.querySelectorAll<HTMLInputElement>('[data-edges]').forEach((c) =>
    c.addEventListener('change', () => {
      for (const k of c.dataset.edges!.split(',')) c.checked ? state.edgeKinds.add(k) : state.edgeKinds.delete(k);
      update();
    }),
  );
  $<HTMLInputElement>('#f-oss').addEventListener('change', (e) => { state.oss = (e.target as HTMLInputElement).checked; update(); });
  $<HTMLSelectElement>('#f-stage').addEventListener('change', (e) => { state.stage = (e.target as HTMLSelectElement).value; update(); });
  $<HTMLSelectElement>('#f-cat').addEventListener('change', (e) => { state.category = (e.target as HTMLSelectElement).value; update(); });
  $<HTMLSelectElement>('#f-vendor').addEventListener('change', (e) => { state.vendor = (e.target as HTMLSelectElement).value; update(); });
  function resetFilters() {
    state.domains = new Set(data.domains.map((d) => d.id));
    state.oss = false; state.stage = ''; state.category = ''; state.vendor = '';
    $<HTMLInputElement>('#f-oss').checked = false;
    $<HTMLSelectElement>('#f-stage').value = '';
    $<HTMLSelectElement>('#f-cat').value = '';
    $<HTMLSelectElement>('#f-vendor').value = '';
    update();
  }
  $('#f-reset').addEventListener('click', resetFilters);
  function syncFilterUi() {
    const all = state.domains.size === data.domains.length;
    document.querySelectorAll<HTMLButtonElement>('[data-domain]').forEach((b) => b.setAttribute('aria-pressed', String(all || state.domains.has(b.dataset.domain!))));
    $('#domain-hint').textContent = all ? 'All domains. Pick one to isolate it.' : `${state.domains.size} of ${data.domains.length} domains.`;
  }
  syncFilterUi();
  syncLensUi();

  // Zoom controls. "Fit" returns to the focus framing while something is focused.
  $('#zoom-in').addEventListener('click', () => renderer.getCamera().animatedZoom({ duration: reduced ? 0 : 250 }));
  $('#zoom-out').addEventListener('click', () => renderer.getCamera().animatedUnzoom({ duration: reduced ? 0 : 250 }));
  $('#zoom-fit').addEventListener('click', () => {
    const h = state.focus && isTree() ? frameHull(state.focus) : undefined;
    const view = state.focus ? (h ? frameHullView(h) : frameFocus(state.focus)) : null;
    if (view) renderer.getCamera().animate(view, { duration: reduced ? 0 : 400 });
    else home(300);
  });

  // Mobile panel toggle
  const panel = $('#controls');
  $('#controls-toggle').addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    $('#controls-toggle').setAttribute('aria-expanded', String(open));
  });

  let first = true;
  const fromHash = async () => {
    const p = new URLSearchParams(location.hash.slice(1));
    const lens = p.get('lens') ?? DEFAULT_LENS;
    const id = p.get('n') ?? '';
    if (lens !== state.lens || first) {
      if (first) {
        // First paint: start in the lens layout without a tween.
        first = false;
        state.lens = layouts.has(lens) || lens === 'overview' ? lens : 'overview';
        recompute();
        syncLensUi();
        graph.forEachNode((nid) => graph.mergeNodeAttributes(nid, basePos(nid)));
        renderer.refresh();
        home(0);
        homeRatio = renderer.getCamera().getState().ratio;
        zoomStep = 0;
        if (curHulls().length) fadeHulls(1);
      } else await setLens(lens, true);
    }
    if (id && nodeById.has(id) && id !== state.focus) await focus(id, true);
    else if (!id && state.focus) await focus('', true);
  };
  // Back and forward (popstate), and hand-edited hashes (hashchange); fromHash ignores repeats.
  window.addEventListener('popstate', () => { fromHash(); });
  window.addEventListener('hashchange', () => { fromHash(); });
  await fromHash();
  host.dataset.ready = '1';
}

main().catch((e) => {
  const host = document.querySelector('#graph');
  if (host) host.innerHTML = `<p class="graph-error">The map could not load (${String(e.message || e)}). Every node is also listed in the <a href="/tools/">tools table</a>.</p>`;
});
