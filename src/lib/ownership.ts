// Ownership tree: parent company > acquired or held subsidiaries > products, built from the
// vendor `parent` fields and the dated acquisition records (docs/decisions/0002-data-model.md).
// A vendor's place in the tree is its current parent. When a vendor has no `parent` but a
// completed or pending deal names an acquirer, the deal places it (pending ones are marked).
// Earlier owners (divested deals) are kept as history on the node.
import { vendors, tools, acquisitions, vendorById } from './data';
import type { Vendor, Tool, Acquisition } from './data';

export type Deal = { id: string; acquirer: string; date: string; announced?: string; status: string; value?: string; until?: string };
export type Product = { tool: Tool; originAt?: string };
export type TreeNode = {
  vendor: Vendor;
  /** How this vendor came under its parent; undefined for a root. */
  via?: { kind: 'acquisition' | 'subsidiary'; deal?: Deal; pending?: boolean };
  children: TreeNode[];
  products: Product[];
  /** Tools first developed here and now sold under another vendor. */
  originated: Tool[];
  /** Earlier owners, from divested deals. */
  history: Deal[];
  /** Tools in this vendor and everything below it. */
  total: number;
  depth: number;
};

const byDate = (a: Acquisition, b: Acquisition) => String(a.completed).localeCompare(String(b.completed));
const dealsFor = (target: string) => acquisitions.filter((a) => a.target === target && a.status !== 'terminated').sort(byDate);
const toDeal = (a: Acquisition, until?: string): Deal => ({ id: a.id, acquirer: a.acquirer, date: String(a.completed), announced: a.announced ? String(a.announced) : undefined, status: a.status, value: a.value, until });

function parentOf(v: Vendor): { parent?: string; deal?: Acquisition; pending?: boolean } {
  const deals = dealsFor(v.id);
  if (v.parent) {
    const deal = [...deals].reverse().find((a) => a.acquirer === v.parent && a.status !== 'divested');
    return { parent: v.parent, deal };
  }
  const live = [...deals].reverse().find((a) => a.status === 'completed' || a.status === 'pending');
  if (live && vendorById.has(live.acquirer)) return { parent: live.acquirer, deal: live, pending: live.status === 'pending' };
  return {};
}

function historyOf(v: Vendor, current?: Acquisition): Deal[] {
  const deals = dealsFor(v.id);
  return deals
    .filter((a) => a !== current && a.status === 'divested')
    .map((a) => {
      const next = deals.find((b) => b !== a && String(b.completed) > String(a.completed));
      return toDeal(a, next ? String(next.completed) : undefined);
    });
}

const childIds = new Map<string, { id: string; deal?: Acquisition; pending?: boolean }[]>();
const hasParent = new Set<string>();
for (const v of vendors) {
  const p = parentOf(v);
  if (!p.parent || p.parent === v.id) continue;
  hasParent.add(v.id);
  if (!childIds.has(p.parent)) childIds.set(p.parent, []);
  childIds.get(p.parent)!.push({ id: v.id, deal: p.deal, pending: p.pending });
}

function build(id: string, depth: number, via: TreeNode['via'], seen: Set<string>): TreeNode {
  const vendor = vendorById.get(id)!;
  seen.add(id);
  const current = via?.deal ? acquisitions.find((a) => a.id === via.deal!.id) : undefined;
  const kids = (childIds.get(id) ?? [])
    .filter((c) => !seen.has(c.id))
    .map((c) => build(c.id, depth + 1, { kind: c.deal ? 'acquisition' : 'subsidiary', deal: c.deal ? toDeal(c.deal) : undefined, pending: c.pending }, seen));
  const products = tools
    .filter((t) => t.vendor === id)
    .map((t) => ({ tool: t, originAt: t.origin && t.origin !== id ? t.origin : undefined }))
    .sort((a, b) => a.tool.name.localeCompare(b.tool.name));
  const originated = tools.filter((t) => t.origin === id && t.vendor !== id).sort((a, b) => a.name.localeCompare(b.name));
  // Children with more tools first, then by deal date.
  kids.sort((a, b) => b.total - a.total || (a.via?.deal?.date ?? '').localeCompare(b.via?.deal?.date ?? '') || a.vendor.name.localeCompare(b.vendor.name));
  const total = products.length + kids.reduce((s, k) => s + k.total, 0);
  return { vendor, via, children: kids, products, originated, history: historyOf(vendor, current), total, depth };
}

const seen = new Set<string>();
const roots = vendors.filter((v) => !hasParent.has(v.id)).map((v) => build(v.id, 0, undefined, seen));
/** Groups: roots with at least one subsidiary, largest first. */
export const groups = roots.filter((r) => r.children.length).sort((a, b) => b.total - a.total || a.vendor.name.localeCompare(b.vendor.name));
/** Independent vendors: no parent and no subsidiaries. */
export const independents = roots.filter((r) => !r.children.length).sort((a, b) => a.vendor.name.localeCompare(b.vendor.name));
export const dealCount = acquisitions.filter((a) => a.status !== 'terminated').length;

/** Ids of a vendor and all its ancestors in the tree, top first. */
export function pathTo(id: string): string[] {
  const out: string[] = [];
  let cur: string | undefined = id;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    out.unshift(cur);
    const v = vendorById.get(cur);
    cur = v ? parentOf(v).parent : undefined;
  }
  return out;
}
