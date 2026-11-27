// Relationship lenses used by the map. A lens picks which edge kinds are
// drawn, which nodes take part, which layout is used (precomputed per lens by
// scripts/build-graph.mjs) and how each edge kind is styled.
export type Lens = { id: string; name: string; blurb: string; kinds: string[] };

export const LENSES: Lens[] = [
  { id: 'ownership', name: 'Ownership', blurb: 'Who owns what. Each circle is a company, circles inside it are companies it bought, dots are products. Click one to follow its lineage.', kinds: ['made-by', 'originated-at', 'acquired-by', 'subsidiary-of'] },
  { id: 'interop', name: 'File formats', blurb: 'Import and export. Arrows run from a format into each tool that reads it, and from a tool to each format it writes. Formats are named; point at a tool to name it.', kinds: ['reads', 'writes', 'stewarded-by'] },
  { id: 'built-on', name: 'Built on', blurb: 'What products are built on (geometry kernels and other components) and the platforms they run on, plus plugins to their host.', kinds: ['built-on', 'runs-on', 'plugin-of'] },
  { id: 'rivals', name: 'Competition', blurb: 'Direct competitors, and open-source alternatives to commercial tools. Products that compete but now have the same owner (usually after an acquisition) are marked as overlaps.', kinds: ['competes-with', 'alternative-to'] },
  { id: 'integrations', name: 'Integrations', blurb: 'Documented integrations between products.', kinds: ['integrates-with'] },
  { id: 'overview', name: 'Everything', blurb: 'Every node at once: tools in circles by domain and category, vendors grouped by owner, formats by kind. Point at a node to draw its relationships; choose which kinds show in the filters.', kinds: [] },
];
/** The lens a bare map URL opens in: the ownership hierarchy. */
export const DEFAULT_LENS = 'ownership';
export const lensOf = (id: string) => LENSES.find((l) => l.id === id) ?? LENSES[LENSES.length - 1];

// Edge style per kind: a color token (CSS custom property), a width and whether it is directed.
// Tokens: --e-a ink, --e-b blue, --e-c orange (defined in global.css for both themes).
export const EDGE_STYLE: Record<string, { c: string; w: number; dir: boolean; legend: string }> = {
  'made-by': { c: '--e-a', w: 0.9, dir: true, legend: 'sold by' },
  'originated-at': { c: '--e-b', w: 0.8, dir: true, legend: 'first developed at' },
  'acquired-by': { c: '--e-c', w: 1.4, dir: true, legend: 'acquired by (dated)' },
  'subsidiary-of': { c: '--e-c', w: 1.1, dir: true, legend: 'part of' },
  reads: { c: '--e-b', w: 0.7, dir: true, legend: 'imported by' },
  writes: { c: '--e-c', w: 0.7, dir: true, legend: 'exports to' },
  'stewarded-by': { c: '--e-a', w: 0.9, dir: true, legend: 'stewarded by' },
  'built-on': { c: '--e-b', w: 1.2, dir: true, legend: 'built on' },
  'plugin-of': { c: '--e-c', w: 1.0, dir: true, legend: 'plugin of' },
  'runs-on': { c: '--e-a', w: 1.2, dir: true, legend: 'runs on (platform)' },
  'competes-with': { c: '--e-c', w: 0.8, dir: false, legend: 'competes with' },
  'alternative-to': { c: '--e-b', w: 1.0, dir: true, legend: 'open-source alternative to' },
  'integrates-with': { c: '--e-b', w: 0.9, dir: false, legend: 'integrates with' },
};

/** Short text drawn on an edge while its node is focused. */
export function edgeLabel(kind: string, date?: string, status?: string, since?: number | null): string {
  // Competitors one company now owns: they overlap rather than compete.
  if (kind === 'competes-with' && since !== undefined && since !== null) return since ? `overlaps (same owner since ${since})` : 'overlaps (same maker)';
  const base: Record<string, string> = {
    'made-by': 'sold by',
    'originated-at': 'first developed at',
    'acquired-by': 'acquired',
    'subsidiary-of': 'part of',
    reads: 'import',
    writes: 'export',
    'stewarded-by': 'stewarded by',
    'built-on': 'built on',
    'plugin-of': 'plugin of',
    'runs-on': 'runs on',
    'competes-with': 'competes',
    'alternative-to': 'open alternative',
    'integrates-with': 'integrates',
    'used-in-stage': 'stage',
  };
  let t = base[kind] ?? kind;
  if (kind === 'acquired-by' && date) t += ` ${date.slice(0, 7)}`;
  if (status && status !== 'completed') t += ` (${status})`;
  return t;
}
