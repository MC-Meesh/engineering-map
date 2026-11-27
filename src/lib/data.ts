// Typed access to the build output of scripts/build-graph.mjs.
import graph from '../generated/graph.json';

export type Source = { url: string; label?: string };
export type Base = {
  id: string;
  name: string;
  summary?: string;
  notes?: string;
  confidence: 'high' | 'medium' | 'low';
  as_of: string;
  sources: Source[];
  website?: string;
  wikipedia?: string;
  x: number;
  y: number;
  degree: number;
};
export type Tool = Base & {
  nodeType: 'tool' | 'kernel';
  category: string;
  domain: string;
  vendor: string;
  origin?: string;
  open_source: boolean;
  license?: string;
  status: string;
  first_release?: number;
  stages: string[];
  built_on?: string[];
  formats?: { reads?: string[]; writes?: string[] };
  plugin_of?: string;
  integrates_with?: string[];
  competes_with?: string[];
  open_source_alternative_to?: string[];
  ownerChain: string[];
  ultimateOwner: string;
};
export type Vendor = Base & {
  nodeType: 'vendor';
  kind: string;
  hq?: string;
  founded?: number;
  parent?: string;
  status: string;
  ownerChain: string[];
  ultimateOwner: string;
  portfolio: string[];
  originated: string[];
  subsidiaries: string[];
  controlledTools: number;
};
export type Format = Base & {
  nodeType: 'format';
  extensions?: string[];
  kind: string;
  standard?: string;
  steward: string;
  steward_vendor?: string;
  open_spec: boolean;
  first_published?: number;
  readers: string[];
  writers: string[];
};
export type Acquisition = {
  id: string;
  acquirer: string;
  target: string;
  announced?: string;
  completed: string;
  status: string;
  value?: string;
  summary?: string;
  confidence: 'high' | 'medium' | 'low';
  as_of: string;
  sources: Source[];
};
export type Edge = { source: string; target: string; kind: string; date?: string; same?: string; since?: number };

const g = graph as any;
export const stats = g.stats;
export const taxonomy = g.taxonomy as {
  domains: { id: string; name: string; blurb: string }[];
  categories: { id: string; name: string; domain: string; blurb: string }[];
  stages: { id: string; name: string; order: number; blurb: string }[];
};
export const nodes = g.nodes as any[];
export const edges = g.edges as Edge[];
export const acquisitions = (g.acquisitions as Acquisition[]).slice().sort((a, b) => a.completed.localeCompare(b.completed));

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
export const tools = nodes.filter((n) => n.nodeType === 'tool' || n.nodeType === 'kernel').sort(byName) as Tool[];
export const vendors = nodes.filter((n) => n.nodeType === 'vendor').sort(byName) as Vendor[];
export const formats = nodes.filter((n) => n.nodeType === 'format').sort(byName) as Format[];

export const toolById = new Map(tools.map((t) => [t.id, t]));
export const vendorById = new Map(vendors.map((v) => [v.id, v]));
export const formatById = new Map(formats.map((f) => [f.id, f]));
export const categoryById = new Map(taxonomy.categories.map((c) => [c.id, c]));
export const domainById = new Map(taxonomy.domains.map((d) => [d.id, d]));
export const stageById = new Map(taxonomy.stages.map((s) => [s.id, s]));

export const toolsIn = (cat: string) => tools.filter((t) => t.category === cat);
export const vendorName = (id?: string) => (id ? vendorById.get(id)?.name ?? id : '');
export const toolName = (id: string) => toolById.get(id)?.name ?? id;
export const formatName = (id: string) => formatById.get(id)?.name ?? id;

/** Tools that list `id` as something they are an open-source alternative to. */
export const alternativesFor = (id: string) => tools.filter((t) => t.open_source_alternative_to?.includes(id));
/** Undirected competes-with neighbours that are made by other owners. */
export const competitorsOf = (id: string) =>
  edges.filter((e) => e.kind === 'competes-with' && !e.same && (e.source === id || e.target === id)).map((e) => (e.source === id ? e.target : e.source));
/** Competitors that now share an owner with this tool: [other id, common owner, year or 0]. */
export const overlapsOf = (id: string) =>
  edges.filter((e) => e.kind === 'competes-with' && e.same && (e.source === id || e.target === id)).map((e) => [e.source === id ? e.target : e.source, e.same!, e.since ?? 0] as [string, string, number]);
export const integratesOf = (id: string) =>
  edges.filter((e) => e.kind === 'integrates-with' && (e.source === id || e.target === id)).map((e) => (e.source === id ? e.target : e.source));
export const builtOnBy = (id: string) => tools.filter((t) => t.built_on?.includes(id));
export const pluginsOf = (id: string) => tools.filter((t) => t.plugin_of === id);

export const ownerLine = (vendorId: string) => {
  const v = vendorById.get(vendorId);
  if (!v) return [];
  return [v.id, ...v.ownerChain];
};
export const yearOf = (d: string) => Number(String(d).slice(0, 4));

export type Example = {
  format: string;
  title?: string;
  file?: string;
  url?: string;
  source_url?: string;
  contains: string;
  origin: 'generated' | 'third-party' | 'vendor-sample';
  license: string;
  attribution: string;
  generated_by?: string;
  note?: string;
  size?: number;
  sha256?: string;
  as_of: string;
};
export const examples = (g.examples ?? []) as Example[];
export const examplesFor = (formatId: string) => examples.filter((e) => e.format === formatId);
export const formatsWithExamples = new Set(examples.map((e) => e.format));
/** Extensions the in-browser viewer can open. */
export const previewable = (file?: string) => !!file && /\.(step|stp|igs|iges|stl|obj|ply|3mf|3dxml|glb|gltf|vtu|gds|gbr)$/i.test(file);
export const fmtBytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

export type Explainer = { format: string; summary: string; layout: { part: string; what: string }[]; sources: { url: string; label?: string }[] };
export const explainers = (g.structure ?? []) as Explainer[];
export const explainerFor = (formatId: string) => explainers.find((x) => x.format === formatId);
/** Extensions the format inspector can open. */
export const inspectable = (file?: string) => !!file && /\.(stl|glb|ply|3mf|3dxml|gds|oas|h5|cgns|med|exo|op2|3dm|cas|step|stp|ifc|igs|iges|obj|dxf|nc|gcode|gbr|drl|inp|k|bdf|cdb|msh|vtk|dat|sat|x_t|usda|def|v|cir|mo|sysml|qif|reqif|amf|urdf|sdf|vtu|xdmf|xml|kicad_pcb|scad)$/i.test(file);

/** Marketed product families (brands) between a vendor and its products (decision 0010). */
export type Brand = { id: string; name: string; vendor: string; products: string[]; summary: string; website: string; confidence: string; as_of: string; notes?: string; sources: Source[] };
export const brands = ((graph as any).brands ?? []) as Brand[];
export const brandById = new Map(brands.map((b) => [b.id, b]));
/** The brand a product is marketed under, if any. */
export const brandOfTool = new Map(brands.flatMap((b) => b.products.map((p) => [p, b] as const)));

// ------------------------------------------------------------------ Plain language
export type Term = { id: string; term: string; plain: string };
const plainData = ((graph as any).plain ?? { categories: {}, glossary: [] }) as { categories: Record<string, { plain: string; users: string; workflow: string; upstream: string[]; downstream: string[] }>; glossary: Term[] };
export const glossary = [...plainData.glossary].sort((a, b) => a.term.localeCompare(b.term));
export const categoryPlain = (id: string) => plainData.categories[id];
const termIndex = new Map(glossary.flatMap((g) => [[g.id, g], [g.term.toLowerCase(), g]] as const));
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Plain text with [[term]] markers as HTML: each term becomes a link to the glossary with its
 *  definition as a tooltip. */
export function termsHtml(text: string): string {
  return escHtml(text).replace(/\[\[([^\]]+)\]\]/g, (_, t: string) => {
    const g = termIndex.get(t.toLowerCase());
    return g ? `<a class="term" href="/glossary/#${g.id}" title="${escHtml(g.plain)}">${escHtml(t)}</a>` : escHtml(t);
  });
}

// ------------------------------------------------------------------ Files and workflow
/** A tool's own (native) formats among the format records: named in its native_files, or
 *  written by it and defined by its maker (or the maker's owners), or written by it and named
 *  after it (open projects such as OpenFOAM). */
export function ownFormats(t: Tool): Format[] {
  const makers = new Set(ownerLine(t.vendor));
  const word = t.name.split(/[\s(]/)[0].toLowerCase();
  const named = new Set(((t as any).native_files ?? []).map((n: any) => n.format).filter(Boolean));
  // When the tool's own documentation names its files, those are its native formats, nothing else.
  if ((t as any).native_files?.length) return [...named].map((f) => formatById.get(f as string)!).filter(Boolean);
  // A maker's format counts as the tool's own only if the tool both opens and writes it (an
  // export to manufacturing, such as ODB++ from Xpedition, is not its save file).
  const opens = new Set(t.formats?.reads ?? []);
  return (t.formats?.writes ?? []).map((f) => formatById.get(f)!).filter((f) => f && opens.has(f.id) && (named.has(f.id) || ((f as any).steward_vendor && makers.has((f as any).steward_vendor)) || (!(f as any).steward_vendor && word.length >= 4 && f.name.toLowerCase().startsWith(word))));
}
type Flow = { category: string; name: string; tools: Tool[]; via: Format[] };
/** Where a tool's data goes (tools that read what it writes) and where it comes from (tools
 *  that write what it reads), grouped by category, largest first. */
export function dataFlow(t: Tool): { out: Flow[]; in: Flow[] } {
  const group = (pairs: [Tool, Format][]) => {
    const by = new Map<string, Flow>();
    for (const [x, f] of pairs) {
      if (x.id === t.id) continue;
      if (!by.has(x.category)) by.set(x.category, { category: x.category, name: categoryById.get(x.category)?.name ?? x.category, tools: [], via: [] });
      const g = by.get(x.category)!;
      if (!g.tools.includes(x)) g.tools.push(x);
      if (!g.via.includes(f)) g.via.push(f);
    }
    for (const g of by.values()) g.tools.sort((a, b) => b.degree - a.degree);
    return [...by.values()].sort((a, b) => b.tools.length - a.tools.length);
  };
  const out: [Tool, Format][] = [], inn: [Tool, Format][] = [];
  // Only along the usual pipeline for this kind of tool (data/plain.yaml): a CFD code shares STEP
  // with circuit board tools, but that is not where its work comes from.
  const pc = plainData.categories[t.category];
  const down = new Set(pc?.downstream ?? []), up = new Set(pc?.upstream ?? []);
  for (const fid of t.formats?.writes ?? []) { const f = formatById.get(fid); if (f) for (const r of (f as any).readers ?? []) { const x = toolById.get(r); if (x && down.has(x.category)) out.push([x, f]); } }
  for (const fid of t.formats?.reads ?? []) { const f = formatById.get(fid); if (f) for (const w of (f as any).writers ?? []) { const x = toolById.get(w); if (x && up.has(x.category)) inn.push([x, f]); } }
  return { out: group(out), in: group(inn) };
}
/** Workflow stages in pipeline order. */
export const stagesInOrder = [...taxonomy.stages].sort((a: any, b: any) => a.order - b.order);
