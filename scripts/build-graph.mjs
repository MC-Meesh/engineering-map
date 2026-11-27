// Build step: load every node file, validate against schema/schemas.json, check references,
// derive edges, compute a deterministic ForceAtlas2 layout, and write:
//   src/generated/graph.json   full data used by the static pages
//   public/data/graph.json     compact graph fetched by the interactive map
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { hierarchy, pack } from 'd3-hierarchy';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const errors = [];
const err = (m) => errors.push(m);

const taxonomy = yaml.load(fs.readFileSync(path.join(DATA, 'taxonomy.yaml'), 'utf8'));
// Plain-language texts for newcomers (category explanations and the glossary).
const plainRaw = fs.readFileSync(path.join(DATA, 'plain.yaml'), 'utf8');
const plain = yaml.load(plainRaw);
const schemas = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'schemas.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validators = {};
for (const t of ['tool', 'vendor', 'format', 'acquisition', 'brand']) {
  validators[t] = ajv.compile({ ...schemas[t], definitions: schemas.definitions });
}

function loadDir(dir, type) {
  const d = path.join(DATA, dir);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(d, f), 'utf8');
      if (raw.includes('—')) err(`${dir}/${f}: contains an em dash`);
      const obj = yaml.load(raw);
      if (obj.id !== f.replace(/\.yaml$/, '')) err(`${dir}/${f}: id "${obj.id}" does not match filename`);
      if (!validators[type](obj)) {
        for (const e of validators[type].errors) err(`${dir}/${f}: ${e.instancePath || '/'} ${e.message}`);
      }
      return obj;
    });
}

const tools = loadDir('tools', 'tool');
const vendors = loadDir('vendors', 'vendor');
const formats = loadDir('formats', 'format');
const acquisitions = loadDir('acquisitions', 'acquisition');
const brands = loadDir('brands', 'brand');

const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
const T = byId(tools);
const V = byId(vendors);
const F = byId(formats);
const B = byId(brands);
const C = byId(taxonomy.categories);
const S = byId(taxonomy.stages);
const D = byId(taxonomy.domains);

// Cross-type id collisions would make the graph ambiguous.
const seen = new Map();
for (const [kind, arr] of [['tool', tools], ['vendor', vendors], ['format', formats], ['brand', brands], ['stage', taxonomy.stages]]) {
  for (const x of arr) {
    const key = kind === 'stage' ? `stage-${x.id}` : x.id;
    if (seen.has(key)) err(`id collision: ${key} is both ${seen.get(key)} and ${kind}`);
    seen.set(key, kind);
  }
}

// Referential integrity
if (/[–—]/.test(plainRaw)) err('plain.yaml: contains an en or em dash');
for (const c of taxonomy.categories) {
  const pc = plain.categories?.[c.id];
  if (!pc?.plain || !pc.users || !pc.workflow) err(`plain.yaml: category ${c.id} needs plain, users and workflow`);
  for (const x of [...(pc?.upstream ?? []), ...(pc?.downstream ?? [])]) if (!C.has(x)) err(`plain.yaml: category ${c.id} names unknown category ${x}`);
}
{
  const terms = new Set((plain.glossary ?? []).flatMap((g) => [g.id, g.term.toLowerCase()]));
  for (const m of plainRaw.matchAll(/\[\[([^\]]+)\]\]/g)) if (!terms.has(m[1].toLowerCase())) err(`plain.yaml: [[${m[1]}]] is not in the glossary`);
}
// Brands: the owner exists, every product exists, is sold by the brand's vendor or a company it
// owns (through vendor parents), and belongs to one brand only.
const brandOf = new Map();
for (const b of brands) {
  if (!V.has(b.vendor)) err(`brands/${b.id}: unknown vendor ${b.vendor}`);
  for (const p of b.products) {
    const t = T.has(p) ? T.get(p) : null;
    if (!t) { err(`brands/${b.id}: unknown product ${p}`); continue; }
    let v = V.get(t.vendor), ok = false;
    const guard = new Set();
    while (v && !guard.has(v.id)) { guard.add(v.id); if (v.id === b.vendor) { ok = true; break; } v = V.get(v.parent); }
    if (!ok) err(`brands/${b.id}: ${p} is sold by ${t.vendor}, not by ${b.vendor} or a company it owns`);
    if (brandOf.has(p)) err(`brands/${b.id}: ${p} is already in brand ${brandOf.get(p)}`);
    brandOf.set(p, b.id);
  }
}
for (const c of taxonomy.categories) if (!D.has(c.domain)) err(`category ${c.id}: unknown domain ${c.domain}`);
for (const t of tools) {
  const at = `tools/${t.id}`;
  if (!C.has(t.category)) err(`${at}: unknown category ${t.category}`);
  if (!V.has(t.vendor)) err(`${at}: unknown vendor ${t.vendor}`);
  if (t.origin && !V.has(t.origin)) err(`${at}: unknown origin ${t.origin}`);
  for (const s of t.stages || []) if (!S.has(s)) err(`${at}: unknown stage ${s}`);
  for (const k of ['built_on', 'runs_on', 'integrates_with', 'competes_with', 'open_source_alternative_to']) {
    for (const x of t[k] || []) {
      if (!T.has(x)) err(`${at}: ${k} references unknown tool ${x}`);
      if (x === t.id) err(`${at}: ${k} references itself`);
    }
  }
  if (t.plugin_of && !T.has(t.plugin_of)) err(`${at}: plugin_of unknown tool ${t.plugin_of}`);
  for (const k of ['reads', 'writes']) for (const f of t.formats?.[k] || []) if (!F.has(f)) err(`${at}: unknown format ${f}`);
  if (t.open_source && !t.license) err(`${at}: open source without license`);
}
for (const v of vendors) {
  if (v.parent && !V.has(v.parent)) err(`vendors/${v.id}: unknown parent ${v.parent}`);
  if (v.parent === v.id) err(`vendors/${v.id}: parent is itself`);
}
for (const f of formats) if (f.steward_vendor && !V.has(f.steward_vendor)) err(`formats/${f.id}: unknown steward_vendor ${f.steward_vendor}`);
for (const a of acquisitions) {
  if (!V.has(a.acquirer)) err(`acquisitions/${a.id}: unknown acquirer ${a.acquirer}`);
  if (!V.has(a.target)) err(`acquisitions/${a.id}: unknown target ${a.target}`);
}

// Format examples (docs/decisions/0005-format-examples.md): data/examples/*.yaml, each
// { examples: [...] }. Hosted files must exist under public/, match size and sha256, and stay
// inside the size budget; linked ones need a URL and license or terms.
const EX_MAX_FILE = 5e6;
const EX_MAX_TOTAL = 100e6;
const examples = [];
{
  const d = path.join(DATA, 'examples');
  const validate = ajv.compile({ ...schemas.example, definitions: schemas.definitions });
  const F = new Set(formats.map((f) => f.id));
  const seen = new Set();
  let total = 0;
  for (const file of fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.yaml')).sort() : []) {
    const raw = fs.readFileSync(path.join(d, file), 'utf8');
    if (/[–—]/.test(raw)) err(`examples/${file}: contains an en or em dash`);
    for (const [i, e] of (yaml.load(raw)?.examples ?? []).entries()) {
      const where = `examples/${file}[${i}]`;
      if (!validate(e)) { for (const x of validate.errors) err(`${where}: ${x.instancePath || '/'} ${x.message}`); continue; }
      if (!F.has(e.format)) err(`${where}: unknown format ${e.format}`);
      if (e.file) {
        const key = `${e.format}|${e.file}`;
        if (seen.has(key)) err(`${where}: duplicate ${key}`);
        seen.add(key);
        const p = path.join(ROOT, 'public', e.file);
        if (!fs.existsSync(p)) { err(`${where}: missing file public/${e.file}`); continue; }
        const buf = fs.readFileSync(p);
        if (buf.length !== e.size) err(`${where}: size ${buf.length} does not match manifest ${e.size}`);
        const sha = crypto.createHash('sha256').update(buf).digest('hex');
        if (sha !== e.sha256) err(`${where}: sha256 does not match public/${e.file}`);
        if (buf.length > EX_MAX_FILE) err(`${where}: ${e.file} is over 5 MB`);
        if (!examples.some((x) => x.file === e.file)) total += buf.length;
      }
      examples.push(e);
    }
  }
  if (total > EX_MAX_TOTAL) err(`examples: hosted files total ${total} bytes, over the 100 MB budget`);
}

// Structure explainers (docs/decisions/0006-format-inspector.md): formats without a hosted
// file get a page that explains their layout from public documentation.
const structure = [];
{
  const p = path.join(DATA, 'structure.yaml');
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, 'utf8');
    if (/[–—]/.test(raw)) err('structure.yaml: contains an en or em dash');
    const F = new Set(formats.map((f) => f.id));
    const seenS = new Set();
    for (const [i, x] of (yaml.load(raw)?.explainers ?? []).entries()) {
      const where = `structure.yaml[${i}]`;
      if (!F.has(x.format)) err(`${where}: unknown format ${x.format}`);
      if (seenS.has(x.format)) err(`${where}: duplicate ${x.format}`);
      seenS.add(x.format);
      if (!x.summary || !Array.isArray(x.layout) || !x.layout.length) err(`${where}: needs summary and layout`);
      for (const l of x.layout ?? []) if (!l.part || !l.what) err(`${where}: layout entries need part and what`);
      if (!Array.isArray(x.sources) || !x.sources.length || x.sources.some((s) => !/^https?:\/\//.test(s.url))) err(`${where}: needs source URLs`);
      structure.push(x);
    }
  }
}

if (errors.length) {
  console.error(`\n${errors.length} data error(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

// Ownership chain: vendor -> ... -> ultimate parent
function chain(vid) {
  const out = [];
  let cur = V.get(vid);
  const guard = new Set();
  while (cur && cur.parent && !guard.has(cur.id)) {
    guard.add(cur.id);
    cur = V.get(cur.parent);
    out.push(cur.id);
  }
  return out;
}
const ultimate = (vid) => {
  const c = chain(vid);
  return c.length ? c[c.length - 1] : vid;
};

// Edges
const edges = [];
const edgeKey = new Set();
function addEdge(source, target, kind, extra = {}, undirected = false) {
  const a = undirected && source > target ? target : source;
  const b = undirected && source > target ? source : target;
  const key = `${a}|${b}|${kind}`;
  if (edgeKey.has(key)) return;
  edgeKey.add(key);
  edges.push({ source: a, target: b, kind, ...extra });
}
const acqTargets = new Set(acquisitions.filter((a) => a.status !== 'terminated').map((a) => `${a.target}|${a.acquirer}`));
for (const t of tools) {
  addEdge(t.id, t.vendor, 'made-by');
  if (t.origin && t.origin !== t.vendor) addEdge(t.id, t.origin, 'originated-at');
  for (const x of t.built_on || []) addEdge(t.id, x, 'built-on');
  for (const x of t.runs_on || []) addEdge(t.id, x, 'runs-on');
  for (const f of t.formats?.reads || []) addEdge(t.id, f, 'reads');
  for (const f of t.formats?.writes || []) addEdge(t.id, f, 'writes');
  if (t.plugin_of) addEdge(t.id, t.plugin_of, 'plugin-of');
  for (const x of t.integrates_with || []) addEdge(t.id, x, 'integrates-with', {}, true);
  for (const x of t.competes_with || []) addEdge(t.id, x, 'competes-with', {}, true);
  for (const x of t.open_source_alternative_to || []) addEdge(t.id, x, 'alternative-to');
  for (const s of t.stages || []) addEdge(t.id, `stage-${s}`, 'used-in-stage');
}
for (const a of acquisitions) {
  if (a.status === 'terminated') continue;
  addEdge(a.target, a.acquirer, 'acquired-by', { date: a.completed, status: a.status });
}
for (const v of vendors) {
  if (v.parent && !acqTargets.has(`${v.id}|${v.parent}`)) addEdge(v.id, v.parent, 'subsidiary-of');
}
for (const f of formats) if (f.steward_vendor) addEdge(f.id, f.steward_vendor, 'stewarded-by');

// Competitors under one owner "overlap" instead of competing: the lowest common owner of the
// two makers, and the year the last completed deal on either side brought them together
// (none when the same company made both). Computed from vendors and acquisitions only.
function joinYear(vid, top) {
  let year = 0, cur = vid;
  const guard = new Set();
  while (cur && cur !== top && !guard.has(cur)) {
    guard.add(cur);
    const parent = V.get(cur)?.parent;
    if (!parent) return null;
    const deal = acquisitions.find((a) => a.target === cur && a.acquirer === parent && a.status !== 'terminated');
    if (deal && deal.status !== 'completed') return null; // pending: not one owner yet
    if (deal?.completed) year = Math.max(year, Number(String(deal.completed).slice(0, 4)));
    cur = parent;
  }
  return cur === top ? year : null;
}
for (const e of edges) {
  if (e.kind !== 'competes-with') continue;
  const va = T.get(e.source)?.vendor, vb = T.get(e.target)?.vendor;
  if (!va || !vb) continue;
  const up = [va, ...chain(va)], upB = new Set([vb, ...chain(vb)]);
  const lca = up.find((x) => upB.has(x));
  if (!lca) continue;
  const ya = joinYear(va, lca), yb = joinYear(vb, lca);
  if (ya === null || yb === null) continue;
  // A product first developed at a company the owner later bought joined the owner with that deal
  // (CFX came to Ansys with CFX in 2003, Fluent with Fluent Inc in 2006).
  const viaOrigin = (tid) => { const o = T.get(tid)?.origin; if (!o || !V.has(o)) return 0; const y = joinYear(o, lca); return y ?? 0; };
  e.same = lca;
  e.since = Math.max(ya, yb, viaOrigin(e.source), viaOrigin(e.target)) || undefined;
}

// Layout
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const domainIds = taxonomy.domains.map((d) => d.id);
const toolDomain = (t) => C.get(t.category).domain;

const g = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
function place(id, angle, radius) {
  const r = rand(hash(id));
  const a = angle + (r() - 0.5) * 0.7;
  const rad = radius * (0.6 + r() * 0.6);
  return { x: Math.cos(a) * rad, y: Math.sin(a) * rad };
}
for (const t of tools) {
  const di = domainIds.indexOf(toolDomain(t));
  g.addNode(t.id, place(t.id, (di / domainIds.length) * Math.PI * 2, 100));
}
for (const v of vendors) g.addNode(v.id, place(v.id, (hash(v.id) % 628) / 100, 60));
for (const f of formats) g.addNode(f.id, place(f.id, (hash(f.id) % 628) / 100, 30));
const W = { 'made-by': 1.2, 'originated-at': 0.4, 'built-on': 0.8, 'runs-on': 0.8, reads: 0.12, writes: 0.12, 'plugin-of': 1, 'integrates-with': 0.4, 'competes-with': 1, 'alternative-to': 0.8, 'acquired-by': 0.8, 'subsidiary-of': 0.8, 'stewarded-by': 0.3 };
for (const e of edges) {
  if (e.kind === 'used-in-stage') continue;
  if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
  if (g.hasEdge(e.source, e.target)) {
    g.updateEdgeAttribute(e.source, e.target, 'weight', (w) => w + (W[e.kind] || 0.5));
  } else {
    g.addEdge(e.source, e.target, { weight: W[e.kind] || 0.5 });
  }
}
forceAtlas2.assign(g, {
  iterations: 900,
  getEdgeWeight: 'weight',
  settings: { ...forceAtlas2.inferSettings(g), barnesHutOptimize: true, strongGravityMode: true, gravity: Number(process.env.FA_G || 0.05), scalingRatio: Number(process.env.FA_S || 30), linLogMode: true, outboundAttractionDistribution: true, adjustSizes: false, edgeWeightInfluence: 1 },
});
// Nodes with no edges carry no structure; park them on the stage ring instead of letting them drift.
g.forEachNode((id) => {
  if (g.degree(id) === 0) g.setNodeAttribute(id, 'orphan', true);
});
// Stage nodes sit on a ring outside the cloud, in pipeline order.
let maxR = 0;
const radii = [];
g.forEachNode((_, a) => { if (!a.orphan) radii.push(Math.hypot(a.x, a.y)); });
radii.sort((a, b) => a - b);
maxR = radii[Math.floor(radii.length * 0.98)] || 1;

// Lens layouts: one ForceAtlas2 run per relationship lens over only that lens's edges, seeded
// from the overview positions so a switch between lenses reads as motion, not a reshuffle.
// Each result is scaled into the overview's extent so the client can keep one camera box.
const LENSES = {
  ownership: ['made-by', 'originated-at', 'acquired-by', 'subsidiary-of'],
  interop: ['reads', 'writes', 'stewarded-by'],
  'built-on': ['built-on', 'runs-on', 'plugin-of'],
  rivals: ['competes-with', 'alternative-to'],
  integrations: ['integrates-with'],
};
const layouts = {};
{
  let ox = 0;
  g.forEachNode((_, a) => { if (!a.orphan) ox = Math.max(ox, Math.abs(a.x), Math.abs(a.y)); });
  for (const [lens, kinds] of Object.entries(LENSES)) {
    const lg = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
    for (const e of edges) {
      if (!kinds.includes(e.kind) || !g.hasNode(e.source) || !g.hasNode(e.target)) continue;
      for (const n of [e.source, e.target]) if (!lg.hasNode(n)) lg.addNode(n, { x: g.getNodeAttribute(n, 'x'), y: g.getNodeAttribute(n, 'y') });
      if (lg.hasEdge(e.source, e.target)) lg.updateEdgeAttribute(e.source, e.target, 'weight', (w) => w + 1);
      else lg.addEdge(e.source, e.target, { weight: 1 });
    }
    forceAtlas2.assign(lg, {
      iterations: 500,
      getEdgeWeight: 'weight',
      settings: { ...forceAtlas2.inferSettings(lg), barnesHutOptimize: true, strongGravityMode: true, gravity: 0.08, scalingRatio: 20, linLogMode: true, outboundAttractionDistribution: lens !== 'ownership', adjustSizes: false },
    });
    let cx = 0, cy = 0;
    lg.forEachNode((_, a) => { cx += a.x; cy += a.y; });
    cx /= lg.order || 1; cy /= lg.order || 1;
    let ex = 0;
    lg.forEachNode((_, a) => { ex = Math.max(ex, Math.abs(a.x - cx), Math.abs(a.y - cy)); });
    const k = ex ? ox / ex : 1;
    layouts[lens] = {};
    lg.forEachNode((id, a) => { layouts[lens][id] = [Math.round((a.x - cx) * k * 10) / 10, Math.round((a.y - cy) * k * 10) / 10]; });
  }
}

// Ownership lens: a nested circle layout instead of a force layout, so the hierarchy is the
// picture. Each owner family is a circle; inside it the parent's own node sits in the middle,
// its products around it, and each subsidiary is a smaller circle of its own, recursively
// (parent > subsidiary > product). A vendor's place is its current owner, by the same rules
// as src/lib/ownership.ts: the `parent` field, else the latest completed or pending deal.
const hulls = {};
const regions = {};
const owner = {};
{
  const dealsFor = (id) => acquisitions.filter((a) => a.target === id && a.status !== 'terminated').sort((a, b) => String(a.completed).localeCompare(String(b.completed)));
  for (const v of vendors) {
    let p = v.parent;
    let pending = false;
    if (!p) {
      const live = [...dealsFor(v.id)].reverse().find((a) => a.status === 'completed' || a.status === 'pending');
      if (live && V.has(live.acquirer)) { p = live.acquirer; pending = live.status === 'pending'; }
    }
    if (p && p !== v.id) owner[v.id] = pending ? [p, 1] : [p];
  }
  // Break any cycle by dropping the link that closes it.
  for (const id of Object.keys(owner)) {
    const seen = new Set([id]);
    let cur = owner[id]?.[0];
    while (cur) { if (seen.has(cur)) { delete owner[id]; break; } seen.add(cur); cur = owner[cur]?.[0]; }
  }
  const kids = new Map();
  for (const [id, [p]] of Object.entries(owner)) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(id); }
  const products = new Map();
  for (const t of tools) { if (!products.has(t.vendor)) products.set(t.vendor, []); products.get(t.vendor).push(t.id); }
  const originOnly = new Set(tools.filter((t) => t.origin && t.origin !== t.vendor).map((t) => t.origin));
  const used = (id) => products.has(id) || kids.has(id) || owner[id] || originOnly.has(id);
  // Products marketed under a brand sit in a brand circle inside the vendor that sells them.
  const brandGroups = (vid, ps) => {
    const out = [], by = new Map();
    for (const tid of ps) {
      const b = brandOf.get(tid);
      if (!b) { out.push({ id: tid, t: 'tool', value: 1 }); continue; }
      if (!by.has(b)) by.set(b, []);
      by.get(b).push({ id: tid, t: 'tool', value: 1 });
    }
    for (const [b, kids] of by) out.push(kids.length > 1 ? { id: `b:${b}:${vid}`, t: 'brand', brand: b, children: kids } : kids[0]);
    return out;
  };
  const sub = (id) => {
    const ks = kids.get(id) ?? [];
    const ps = products.get(id) ?? [];
    if (!ks.length && !ps.length) return { id, t: 'vendor', value: 2 };
    return {
      id: `${id}#`, t: 'group', vendor: id,
      children: [{ id, t: 'vendor', value: ks.length ? 5 : 3 }, ...ks.filter(used).map(sub), ...brandGroups(id, ps)],
    };
  };
  // Owners with subsidiaries are families of their own; every other top-level company goes into
  // one "Independent companies" region, packed last so it sits at the edge, not the centre.
  const tops = vendors.filter((v) => !owner[v.id] && used(v.id));
  const families = tops.filter((v) => kids.has(v.id)).map((v) => sub(v.id));
  const loose = tops.filter((v) => !kids.has(v.id)).map((v) => sub(v.id));
  const root = hierarchy({ id: '#root', t: 'root', children: [...families, { id: '#independent', t: 'region', label: 'Independent companies', children: loose }] })
    .sum((d) => d.value ?? 0)
    // The vendor's own node first, so the pack puts it at the centre of its circle; the
    // independents region last.
    .sort((a, b) => (a.data.t === 'vendor' ? -1 : b.data.t === 'vendor' ? 1 : a.data.t === 'region' ? 1 : b.data.t === 'region' ? -1 : b.value - a.value));
  let ox = 0;
  g.forEachNode((_, a) => { if (!a.orphan) ox = Math.max(ox, Math.abs(a.x), Math.abs(a.y)); });
  const S = ox * 2.2;
  pack().size([S, S]).padding((d) => (d.depth === 0 ? S * 0.012 : S * 0.0042))(root);
  const pos = {};
  const r1 = (n) => Math.round(n * 10) / 10;
  const hl = [];
  // Move the independents region beside the families (never over them), and give it a small
  // collapsed circle at the families' top right; the map opens with it collapsed.
  const regionNode = root.children.find((c) => c.data.t === 'region');
  const famNodes = root.children.filter((c) => c.data.t !== 'region');
  let fx = 0, fy = 0;
  for (const c of famNodes) { fx += c.x; fy += c.y; }
  fx /= famNodes.length || 1; fy /= famNodes.length || 1;
  const RA = Math.max(...famNodes.map((c) => Math.hypot(c.x - fx, c.y - fy) + c.r));
  const gap = S * 0.02;
  if (regionNode) {
    const dx = fx + RA + regionNode.r + gap - regionNode.x, dy = fy - regionNode.y;
    regionNode.each((d) => { d.x += dx; d.y += dy; });
    const cr = RA * 0.17;
    regions.independent = {
      x: r1(regionNode.x - S / 2), y: r1(regionNode.y - S / 2), r: r1(regionNode.r),
      cx: r1(fx + RA * 0.86 - S / 2), cy: r1(fy - RA * 0.86 - S / 2), cr: r1(cr),
      members: regionNode.descendants().filter((d) => d.data.t === 'vendor' || d.data.t === 'tool').map((d) => d.data.id),
    };
  }
  root.each((d) => {
    const x = d.x - S / 2, y = d.y - S / 2;
    if (d.data.t === 'vendor' || d.data.t === 'tool') pos[d.data.id] = [r1(x), r1(y)];
    // [key, x, y, r, depth, tools inside, label?, style?]; depth 1 is an owner family or the
    // independents region; a vendor key takes its name from the node.
    const n = d.leaves().filter((l) => l.data.t === 'tool').length;
    if (d.data.t === 'group') hl.push([d.data.vendor, r1(x), r1(y), r1(d.r), d.depth, n, '', d.parent?.data.t === 'region' ? 'family' : '']);
    if (d.data.t === 'region') hl.push([d.data.id, r1(x), r1(y), r1(d.r), d.depth, n, d.data.label, 'region']);
    // A brand sold through an acquired company is named with that company, so a second
    // Simcenter circle inside Altair reads as "Simcenter, sold by Altair".
    if (d.data.t === 'brand') {
      const b = B.get(d.data.brand), seller = d.data.id.split(':')[2];
      hl.push([d.data.id, r1(x), r1(y), r1(d.r), d.depth, n, b.vendor === seller ? b.name : `${b.name}, sold by ${V.get(seller).name.split(' ')[0]}`, 'brand']);
    }
  });
  layouts.ownership = pos;
  hulls.ownership = hl;
}

// Everything lens: the same nested-circle idea by subject. Domains (one colour each) hold their
// categories, which hold their tools; vendors sit in one region grouped by owner, formats in
// another grouped by kind. Workflow stages ring the outside.
{
  let ox = 0;
  g.forEachNode((_, a) => { if (!a.orphan) ox = Math.max(ox, Math.abs(a.x), Math.abs(a.y)); });
  const S = ox * 2.2;
  const deg = new Map();
  for (const e of edges) { if (e.kind === 'used-in-stage') continue; for (const x of [e.source, e.target]) deg.set(x, (deg.get(x) || 0) + 1); }
  const leaf = (id, t) => ({ id, t, value: 1 + Math.sqrt(deg.get(id) || 0) * 0.35 });
  const domains = taxonomy.domains.map((dm) => ({
    id: `d:${dm.id}`, t: 'domain', label: dm.name, style: `domain:${dm.id}`,
    children: taxonomy.categories.filter((c) => c.domain === dm.id).map((c) => ({
      id: `c:${c.id}`, t: 'category', label: c.name, style: `domain:${dm.id}`,
      children: tools.filter((t) => t.category === c.id).map((t) => leaf(t.id, 'node')),
    })).filter((c) => c.children.length),
  })).filter((d) => d.children.length);
  const byOwner = new Map();
  for (const v of vendors) { if (!(deg.get(v.id) > 0)) continue; const u = ultimate(v.id); if (!byOwner.has(u)) byOwner.set(u, []); byOwner.get(u).push(v.id); }
  const vendorGroups = [...byOwner.entries()].map(([u, ids]) => (ids.length > 1 ? { id: `o:${u}`, t: 'owner', label: V.get(u).name, children: ids.map((x) => leaf(x, 'node')) } : leaf(ids[0], 'node')));
  const kindName = { 'brep-exchange': 'Exact geometry', 'native-cad': 'Native CAD', tessellated: 'Tessellated', mesh: 'Mesh', 'solver-input': 'Solver input', results: 'Results', systems: 'Systems', bim: 'Building', ecad: 'Electronics', ic: 'Chip design', cam: 'Machining', robotics: 'Robotics', scene: 'Scene' };
  const kinds = [...new Set(formats.map((f) => f.kind))];
  const formatGroups = kinds.map((k) => ({ id: `k:${k}`, t: 'kind', label: kindName[k] ?? k, children: formats.filter((f) => f.kind === k && deg.get(f.id) > 0).map((f) => leaf(f.id, 'node')) })).filter((k) => k.children.length);
  const root = hierarchy({ id: '#root', t: 'root', children: [...domains, { id: 'r:vendors', t: 'region', label: 'Vendors', children: vendorGroups }, { id: 'r:formats', t: 'region', label: 'File formats', children: formatGroups }] })
    .sum((d) => d.value ?? 0)
    .sort((a, b) => b.value - a.value);
  pack().size([S, S]).padding((d) => (d.depth === 0 ? S * 0.022 : d.depth === 1 ? S * 0.009 : S * 0.004))(root);
  const pos = {};
  const r1 = (n) => Math.round(n * 10) / 10;
  const hl = [];
  let R = 0;
  root.each((d) => {
    const x = d.x - S / 2, y = d.y - S / 2;
    if (d.data.t === 'node') pos[d.data.id] = [r1(x), r1(y)];
    else if (d.depth > 0) hl.push([d.data.id, r1(x), r1(y), r1(d.r), d.depth, d.leaves().length, d.data.label, d.data.style ?? (d.data.t === 'region' ? 'region' : '')]);
    if (d.depth === 1) R = Math.max(R, Math.hypot(x, y) + d.r);
  });
  taxonomy.stages.forEach((st, i) => {
    const a = -Math.PI / 2 + (i / taxonomy.stages.length) * Math.PI * 2;
    pos[`stage-${st.id}`] = [r1(Math.cos(a) * R * 1.08), r1(Math.sin(a) * R * 1.08)];
  });
  layouts.overview = pos;
  hulls.overview = hl;
}

// Degree for sizing
const degree = new Map();
for (const e of edges) {
  if (e.kind === 'used-in-stage') continue;
  degree.set(e.source, (degree.get(e.source) || 0) + 1);
  degree.set(e.target, (degree.get(e.target) || 0) + 1);
}

// Derived per-node facts for pages
const portfolio = new Map();
for (const t of tools) {
  if (!portfolio.has(t.vendor)) portfolio.set(t.vendor, []);
  portfolio.get(t.vendor).push(t.id);
}
const originated = new Map();
for (const t of tools) {
  if (!t.origin) continue;
  if (!originated.has(t.origin)) originated.set(t.origin, []);
  originated.get(t.origin).push(t.id);
}
const children = new Map();
for (const v of vendors) {
  if (!v.parent) continue;
  if (!children.has(v.parent)) children.set(v.parent, []);
  children.get(v.parent).push(v.id);
}
// tools controlled by each ultimate parent (via vendor chain)
const controlled = new Map();
for (const t of tools) {
  const u = ultimate(t.vendor);
  controlled.set(u, (controlled.get(u) || 0) + 1);
}

const nodesOut = [];
for (const t of tools) {
  const p = g.getNodeAttributes(t.id);
  nodesOut.push({ ...t, nodeType: t.category === 'geometry-kernel' ? 'kernel' : 'tool', domain: toolDomain(t), ownerChain: chain(t.vendor), ultimateOwner: ultimate(t.vendor), x: p.x, y: p.y, degree: degree.get(t.id) || 0 });
}
for (const v of vendors) {
  const p = g.getNodeAttributes(v.id);
  nodesOut.push({ ...v, nodeType: 'vendor', ownerChain: chain(v.id), ultimateOwner: ultimate(v.id), portfolio: portfolio.get(v.id) || [], originated: originated.get(v.id) || [], subsidiaries: children.get(v.id) || [], controlledTools: controlled.get(v.id) || 0, x: p.x, y: p.y, degree: degree.get(v.id) || 0 });
}
for (const f of formats) {
  const p = g.getNodeAttributes(f.id);
  const readers = tools.filter((t) => t.formats?.reads?.includes(f.id)).map((t) => t.id);
  const writers = tools.filter((t) => t.formats?.writes?.includes(f.id)).map((t) => t.id);
  nodesOut.push({ ...f, nodeType: 'format', readers, writers, x: p.x, y: p.y, degree: degree.get(f.id) || 0 });
}
taxonomy.stages.forEach((s, i) => {
  const a = -Math.PI / 2 + (i / taxonomy.stages.length) * Math.PI * 2;
  nodesOut.push({ ...s, id: `stage-${s.id}`, stageId: s.id, type: 'stage', nodeType: 'stage', x: Math.cos(a) * maxR * 1.12, y: Math.sin(a) * maxR * 1.12, degree: tools.filter((t) => t.stages.includes(s.id)).length });
});

const confidenceCounts = { high: 0, medium: 0, low: 0 };
for (const x of [...tools, ...vendors, ...formats, ...acquisitions]) confidenceCounts[x.confidence]++;
const sourceUrls = new Set();
for (const x of [...tools, ...vendors, ...formats, ...acquisitions, ...brands]) for (const s of x.sources) sourceUrls.add(s.url);

const stats = {
  as_of: [...tools, ...vendors, ...formats].reduce((m, x) => (x.as_of > m ? x.as_of : m), '0000'),
  tools: tools.filter((t) => t.category !== 'geometry-kernel').length,
  kernels: tools.filter((t) => t.category === 'geometry-kernel').length,
  // Every count on the site that says "tools" uses this one (kernels included).
  toolsAll: tools.length,
  vendors: vendors.length,
  vendorsActive: vendors.filter((v) => v.status === 'active').length,
  formats: formats.length,
  acquisitions: acquisitions.length,
  openSource: tools.filter((t) => t.open_source).length,
  edges: edges.filter((e) => e.kind !== 'used-in-stage').length,
  edgesByKind: edges.reduce((m, e) => ((m[e.kind] = (m[e.kind] || 0) + 1), m), {}),
  confidence: confidenceCounts,
  sources: sourceUrls.size,
  examples: { hosted: examples.filter((e) => e.file).length, linked: examples.filter((e) => !e.file).length, formats: new Set(examples.map((e) => e.format)).size },
};

const full = { stats, taxonomy, nodes: nodesOut, edges, acquisitions, examples, structure, brands, plain };
fs.mkdirSync(path.join(ROOT, 'src', 'generated'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src', 'generated', 'graph.json'), JSON.stringify(full));

// Compact client graph
const r1 = (n) => Math.round(n * 10) / 10;
const lite = {
  stats,
  domains: taxonomy.domains.map((d) => ({ id: d.id, name: d.name })),
  categories: taxonomy.categories.map((c) => ({ id: c.id, name: c.name, domain: c.domain, p: (plain.categories?.[c.id]?.plain ?? '').replace(/\[\[([^\]]+)\]\]/g, '$1') })),
  stages: taxonomy.stages.map((s) => ({ id: s.id, name: s.name })),
  nodes: nodesOut.map((n) => ({
    id: n.id,
    t: n.nodeType,
    l: n.name,
    x: r1(n.x),
    y: r1(n.y),
    d: n.degree,
    ...(n.domain ? { dm: n.domain } : {}),
    ...(n.category ? { c: n.category } : {}),
    ...(n.vendor ? { v: n.vendor } : {}),
    ...(n.ultimateOwner && n.nodeType !== 'vendor' ? { u: n.ultimateOwner } : {}),
    ...(n.nodeType === 'vendor' && n.ultimateOwner !== n.id ? { f: n.ultimateOwner } : {}),
    ...(n.open_source ? { o: 1 } : {}),
    ...(n.stages ? { s: n.stages } : {}),
    ...(n.status && n.status !== 'active' ? { st: n.status } : {}),
    ...(n.summary ? { sm: n.summary } : {}),
    ...(n.plain ? { pl: n.plain.replace(/\s+/g, ' ').trim() } : {}),
    ...(n.kind ? { k: n.kind } : {}),
    ...(n.aka?.length ? { a: n.aka } : {}),
    ...(n.clarifies?.length ? { cl: n.clarifies.map((c) => c.text.replace(/\s+/g, ' ').trim()) } : {}),
    ...(brandOf.has(n.id) ? { b: brandOf.get(n.id) } : {}),
    // Its own (native) formats: ones it writes that its maker or the maker's owners define.
    // Its own files: from native_files when its documentation names them (nx: extensions),
    // else formats it writes that its maker or the maker's owners define.
    ...(n.files_note ? { fn: n.files_note } : {}),
    ...(n.native_files?.length ? { nx: n.native_files.map((x) => [x.ext, x.what, x.format ?? '']) } : {}),
    ...(!n.native_files?.length && n.formats?.writes?.some((f) => n.formats.reads?.includes(f) && F.get(f)?.steward_vendor && [n.vendor, ...chain(n.vendor)].includes(F.get(f).steward_vendor)) ? { nf: n.formats.writes.filter((f) => n.formats.reads?.includes(f) && F.get(f)?.steward_vendor && [n.vendor, ...chain(n.vendor)].includes(F.get(f).steward_vendor)) } : {}),
  })),
  // [source, target, kind, date?, status?]; date and status only on acquisition edges.
  edges: edges.map((e) => (e.date ? [e.source, e.target, e.kind, String(e.date), ...(e.status !== 'completed' ? [e.status] : [])] : [e.source, e.target, e.kind])),
  // Competitors under one owner: "source|target" -> [common owner, year they came together or 0]
  overlap: Object.fromEntries(edges.filter((e) => e.same).map((e) => [`${e.source}|${e.target}`, [e.same, e.since ?? 0]])),
  lenses: LENSES,
  layouts,
  hulls,
  // ownership: the independents region, its collapsed circle and the nodes inside it
  regions,
  // brand id -> [name, vendor, products]; products carry `b` (their brand) in nodes
  brands: Object.fromEntries(brands.map((b) => [b.id, [b.name, b.vendor, b.products]])),
  // vendor -> [owner] or [owner, 1] when the deal is pending (ownership.ts rules)
  owner,
};
fs.mkdirSync(path.join(ROOT, 'public', 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public', 'data', 'graph.json'), JSON.stringify(lite));

console.log('graph built', JSON.stringify(stats));
