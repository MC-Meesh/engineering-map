// How two things on the map are related, in plain sentences. Shared by the tool pages (built at
// build time), the path finder page and the map's "Explain" toggle (in the browser), so every
// view words a relationship the same way. Nothing here adds facts: each sentence restates one
// sourced edge from scripts/build-graph.mjs.

export type RNode = { id: string; name: string; type: string; category?: string; vendor?: string; brand?: string; platform?: boolean; aka?: string[]; owner?: string; summary?: string };

/** A name with its best-known earlier name, e.g. "Designcenter (formerly NX)". */
export const nameAka = (n?: RNode) => (n ? (n.aka?.length && !n.name.includes(n.aka[0]) ? `${n.name} (formerly ${n.aka[0]})` : n.name) : '');
export type REdge = { s: string; t: string; kind: string; date?: string; status?: string; same?: string; since?: number };
export type Step = { from: string; to: string; edge: REdge; sentence: string };
export type Path = { nodes: string[]; steps: Step[]; cost: number };

/** What kind of thing a node is, for a newcomer. */
const CATEGORY_NOUN: Record<string, string> = {
  cad: 'a design (CAD) application, where engineers draw parts and assemblies',
  'geometry-kernel': 'a geometry kernel: the engine inside design programs that builds and edits shapes',
  interop: 'a translation tool that converts models between programs',
  'cae-fea': 'a structural simulation application (it predicts how parts bend, vibrate or break)',
  cfd: 'a fluid simulation application (it predicts how air and liquids flow)',
  multiphysics: 'a simulation application for coupled physics such as electromagnetics and heat',
  meshing: 'a meshing tool that prepares models for simulation',
  'solver-library': 'a programming library that simulation software is built from',
  eda: 'an electronics design application (chips or circuit boards)',
  cam: 'a manufacturing (CAM) application that turns models into machine instructions',
  'plm-pdm': 'a data-management (PLM) system that keeps product files, versions and parts lists',
  sdm: 'a system for simulation data, workflows and computing',
  'digital-twin': 'a digital-twin platform that keeps a live copy of a real product or plant',
  'systems-mbse': 'a systems engineering application for whole-system models',
  'robotics-controls': 'a robotics and machine-control application',
  optimization: 'a design optimization application that tries many variants',
  'ml-engineering': 'a machine-learning tool for engineering predictions',
  visualization: 'a results visualization application',
};
export function kindPhrase(n: RNode): string {
  if (n.platform) {
    const noun = CATEGORY_NOUN[n.category ?? ''];
    return noun && n.category !== 'sdm' && n.category !== 'plm-pdm' ? noun : n.category === 'plm-pdm' ? 'a platform: software other applications run on and share data through, including product data management (PLM)' : 'a platform: software that other applications run on and share data through';
  }
  if (n.type === 'vendor') return 'a software company';
  if (n.type === 'format') return 'a file format';
  if (n.type === 'brand') return 'a brand: a named family of products from one company';
  if (n.type === 'stage') return 'a workflow stage';
  return CATEGORY_NOUN[n.category ?? ''] ?? 'an engineering application';
}

/** One edge as a sentence. */
export function edgeSentence(e: REdge, nodes: Map<string, RNode>): string {
  const S = nodes.get(e.s)?.name ?? e.s, T = nodes.get(e.t)?.name ?? e.t;
  const tn = nodes.get(e.t);
  const year = e.date ? ` in ${String(e.date).slice(0, 4)}` : '';
  switch (e.kind) {
    case 'made-by': return `${S} is made and sold by ${T}.`;
    case 'originated-at': return `${S} was first developed at ${T}.`;
    case 'built-on': {
      const sn = nodes.get(e.s);
      const by = tn?.owner && tn.owner !== sn?.owner ? `, owned by ${tn.owner}` : '';
      if (tn?.type === 'kernel' || tn?.category === 'geometry-kernel') {
        const role = (/constraint solver/i.test(tn.summary ?? '') && !/kernel/i.test(tn.summary ?? '')) || /constraint/i.test(tn.name) ? 'components that solve sketch and assembly constraints' : 'a geometry kernel: the engine that builds and edits its shapes';
        return `${S} is built on ${T}${by}, ${role}.`;
      }
      return `${S} is built on ${T}${by}.`;
    }
    case 'runs-on': return `${S} can run on ${/platform$/i.test(T) ? `the ${T}` : `the ${T} platform`}.`;
    case 'plugin-of': return `${S} is a plugin that runs inside ${T}.`;
    case 'integrates-with': {
      const sn = nodes.get(e.s);
      const plm = sn?.category === 'plm-pdm' ? [S, T] : tn?.category === 'plm-pdm' ? [T, S] : null;
      if (tn?.platform && !sn?.platform) return `${S} connects to the ${/platform$/i.test(T) ? T : `${T} platform`} as a separate desktop program; it does not run inside the platform.`;
      if (sn?.platform && !tn?.platform) return `${T} connects to the ${/platform$/i.test(S) ? S : `${S} platform`} as a separate desktop program; it does not run inside the platform.`;
      if (plm) return `${plm[0]}, a data-management (PLM) system, is documented to work with ${plm[1]}, keeping its design files, versions and parts lists.`;
      return `${S} and ${T} are documented to work together.`;
    }
    case 'competes-with': {
      if (e.same) {
        const owner = (nodes.get(e.same)?.name ?? e.same).replace(/ Digital Industries Software$/, '');
        return e.since ? `${S} and ${T} overlap: they do the same job and have had the same owner, ${owner}, since ${e.since}.` : `${S} and ${T} overlap: they do the same job and are made by the same company, ${owner}.`;
      }
      return `${S} and ${T} compete for the same users.`;
    }
    case 'alternative-to': return `${S} is an open-source alternative to ${T}.`;
    case 'acquired-by': return `${S} was bought by ${T}${year}${e.status && e.status !== 'completed' ? ` (${e.status})` : ''}.`;
    case 'subsidiary-of': return `${S} is part of ${T}.`;
    case 'reads': return `${S} can open ${T} files.`;
    case 'writes': return `${S} can save ${T} files.`;
    case 'stewarded-by': return `${S} is a file format defined by ${T}.`;
    case 'brand': return `${S} is sold under the ${T} brand.`;
    default: return `${S} is linked to ${T}.`;
  }
}

/** Relationship types, in the order a page explains them, each explained once. */
export const RELATION_TYPES: { id: string; title: string; explain: string; kinds: string[] }[] = [
  { id: 'owner', title: 'Who makes it', explain: 'The company that sells it, and where it was first developed.', kinds: ['made-by', 'originated-at', 'brand'] },
  { id: 'platform', title: 'Platform', explain: 'A platform is software other applications run on and share data through.', kinds: ['runs-on'] },
  { id: 'usedby', title: 'Built on it', explain: 'Products that use this inside them.', kinds: ['built-on:in'] },
  { id: 'built', title: 'What it is built on', explain: 'Components inside it: a geometry kernel is the engine that builds and edits shapes; other components handle constraints, translation or solving.', kinds: ['built-on'] },
  { id: 'plugins', title: 'Plugins', explain: 'A plugin is a smaller program that runs inside a host application.', kinds: ['plugin-of'] },
  { id: 'works', title: 'What it works with', explain: 'Products documented to work together, for example a PLM system that stores a design tool’s files.', kinds: ['integrates-with'] },
  { id: 'overlaps', title: 'Overlaps under the same owner', explain: 'Products that do the same job but now have one owner, usually because it bought the other maker. They are not rivals any more.', kinds: ['overlaps'] },
  { id: 'rivals', title: 'Competitors and alternatives', explain: 'Products from other owners that do the same job.', kinds: ['competes-with', 'alternative-to'] },
];

// ------------------------------------------------------------------ path finding
// Costs make the sentences people need come first: ownership, brands, platforms and components
// before shared file formats, and long competition chains last.
const COST: Record<string, number> = {
  'made-by': 1, brand: 1, 'built-on': 1, 'runs-on': 0.7, 'plugin-of': 1, 'subsidiary-of': 1, 'acquired-by': 1.2,
  'originated-at': 1.5, 'integrates-with': 1.2, reads: 2.5, writes: 2.5, 'stewarded-by': 2.5, 'competes-with': 3, 'alternative-to': 3,
};

export type RGraph = { nodes: Map<string, RNode>; adj: Map<string, { other: string; edge: REdge }[]> };
export function buildGraph(nodes: RNode[], edges: REdge[], brands: { id: string; name: string; products: string[] }[]): RGraph {
  const nm = new Map(nodes.map((n) => [n.id, n]));
  const all = edges.filter((e) => COST[e.kind] !== undefined && nm.has(e.s) && nm.has(e.t));
  for (const b of brands) {
    const bid = `brand:${b.id}`;
    nm.set(bid, { id: bid, name: b.name, type: 'brand' });
    for (const p of b.products) if (nm.has(p)) all.push({ s: p, t: bid, kind: 'brand' });
  }
  // Platforms: anything other tools run on.
  for (const e of all) if (e.kind === 'runs-on') { const p = nm.get(e.t); if (p) p.platform = true; }
  const adj = new Map<string, { other: string; edge: REdge }[]>();
  const add = (a: string, other: string, edge: REdge) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push({ other, edge }); };
  for (const e of all) { add(e.s, e.t, e); add(e.t, e.s, e); }
  return { nodes: nm, adj };
}

function dijkstra(g: RGraph, a: string, b: string, penalty: Map<REdge, number>): Path | null {
  const dist = new Map<string, number>([[a, 0]]);
  const prev = new Map<string, { node: string; edge: REdge }>();
  const done = new Set<string>();
  // Small graphs (a few thousand edges): a simple scan is fast enough.
  while (true) {
    let u = '', best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; u = n; }
    if (!u || u === b) break;
    done.add(u);
    // Do not route through formats' long reader lists or hub vendors' product lists more than once.
    for (const { other, edge } of g.adj.get(u) ?? []) {
      if (done.has(other)) continue;
      const hub = (g.adj.get(other)?.length ?? 0) > 40 && other !== b ? 1.5 : 0;
      const d = best + COST[edge.kind] * (penalty.get(edge) ?? 1) + hub;
      if (d < (dist.get(other) ?? Infinity)) { dist.set(other, d); prev.set(other, { node: u, edge }); }
    }
  }
  if (!dist.has(b)) return null;
  const nodes = [b], steps: Step[] = [];
  let cur = b;
  while (cur !== a) {
    const p = prev.get(cur)!;
    steps.unshift({ from: p.node, to: cur, edge: p.edge, sentence: edgeSentence(p.edge, g.nodes) });
    nodes.unshift(p.node);
    cur = p.node;
  }
  return { nodes, steps, cost: dist.get(b)! };
}

/** Up to k short, different paths between two nodes. */
export function findPaths(g: RGraph, a: string, b: string, k = 3): Path[] {
  if (!g.nodes.has(a) || !g.nodes.has(b) || a === b) return [];
  const out: Path[] = [];
  const penalty = new Map<REdge, number>();
  for (let i = 0; i < k * 3 && out.length < k; i++) {
    const p = dijkstra(g, a, b, penalty);
    if (!p) break;
    const key = p.steps.map((s) => `${s.edge.s}|${s.edge.t}|${s.edge.kind}`).join(' ');
    for (const s of p.steps) penalty.set(s.edge, (penalty.get(s.edge) ?? 1) * 6);
    if (out.some((q) => q.steps.map((s) => `${s.edge.s}|${s.edge.t}|${s.edge.kind}`).join(' ') === key)) continue;
    // Real cost (without penalties), and skip detours much longer than the best path.
    const real = p.steps.reduce((sum, s) => sum + COST[s.edge.kind], 0);
    if (out.length && real > out[0].cost + 4) break;
    // An alternative that detours through another application tells a newcomer nothing new.
    if (out.length && p.nodes.slice(1, -1).some((x) => { const n = g.nodes.get(x); return n && (n.type === 'tool') && !n.platform; })) continue;
    if (out.length && p.steps.some((s) => s.edge.kind === 'competes-with' || s.edge.kind === 'alternative-to')) continue;
    out.push({ ...p, cost: real });
  }
  return out.sort((x, y) => x.steps.length - y.steps.length || x.cost - y.cost);
}
