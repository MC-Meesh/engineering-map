// Lists records whose as_of date is older than STALE_DAYS (default 365), oldest first.
// Writes stale-report.md (or $STALE_REPORT) for the weekly maintenance issue.
// Usage: node scripts/stale.mjs   (reads data/ directly, no build needed)
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = process.cwd();
const DAYS = Number(process.env.STALE_DAYS || 365);
const cutoff = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
const dirs = ['tools', 'vendors', 'formats', 'acquisitions', 'brands'];

const stale = [];
for (const dir of dirs) {
  const d = path.join(ROOT, 'data', dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.yaml')).sort()) {
    const rec = yaml.load(fs.readFileSync(path.join(d, f), 'utf8'));
    const asOf = String(rec?.as_of ?? '');
    if (!asOf || asOf < cutoff) stale.push({ file: `data/${dir}/${f}`, asOf: asOf || 'missing' });
  }
}
stale.sort((a, b) => a.asOf.localeCompare(b.asOf));

const report = [
  `# Stale records`,
  ``,
  `${stale.length} records were last checked before ${cutoff} (older than ${DAYS} days).`,
  `Re-check each against its sources, fix what changed, and bump \`as_of\`.`,
  ``,
  ...stale.map((s) => `- [ ] \`${s.file}\` (as of ${s.asOf})`),
  ``,
].join('\n');
fs.writeFileSync(process.env.STALE_REPORT || path.join(ROOT, 'stale-report.md'), report);
console.log(`${stale.length} stale records (cutoff ${cutoff})`);
