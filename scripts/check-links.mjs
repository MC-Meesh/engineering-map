// Checks every source URL in data/ over HTTP, paced per host. Writes link-report.md (or $LINK_REPORT).
// Dead (404/410) and unreachable URLs are listed for repair; 401/403/429/999 are "unverifiable"
// (bot walls), not dead. Not part of the build: it depends on third-party bot policy.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const urls = new Map();
for (const dir of ['tools', 'vendors', 'formats', 'acquisitions']) {
  const d = path.join(ROOT, 'data', dir);
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.yaml'))) {
    const o = yaml.load(fs.readFileSync(path.join(d, f), 'utf8'));
    const all = [...(o.sources || []).map((s) => s.url), o.website, o.wikipedia].filter(Boolean);
    for (const u of all) {
      if (!urls.has(u)) urls.set(u, []);
      urls.get(u).push(`${dir}/${o.id}`);
    }
  }
}
const byHost = new Map();
for (const u of urls.keys()) {
  const h = new URL(u).hostname;
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(u);
}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function check(u) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(u, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
      clearTimeout(t);
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status === 404)) continue;
      return { status: res.status, final: res.url };
    } catch (e) {
      if (method === 'GET') return { status: 0, error: String(e.cause?.code || e.name) };
    }
  }
}
const results = [];
await Promise.all(
  [...byHost.values()].map(async (list) => {
    for (const u of list) {
      results.push({ u, ...(await check(u)) });
      await sleep(400);
    }
  }),
);
const dead = results.filter((r) => r.status === 404 || r.status === 410);
const unreachable = results.filter((r) => r.status === 0 || r.status >= 500);
const walled = results.filter((r) => [401, 403, 429, 999].includes(r.status));
const ok = results.filter((r) => r.status >= 200 && r.status < 400);
const line = (r) => `- ${r.u} (${r.status || r.error}) used by ${urls.get(r.u).join(', ')}`;
const report = [
  `# Link report`,
  ``,
  `Checked ${results.length} URLs on ${new Date().toISOString().slice(0, 10)}: ${ok.length} ok, ${dead.length} dead, ${unreachable.length} unreachable or 5xx, ${walled.length} behind a bot wall.`,
  ``,
  `## Dead`,
  ...dead.map(line),
  ``,
  `## Unreachable or server error`,
  ...unreachable.map(line),
  ``,
  `## Unverifiable (bot wall)`,
  ...walled.map(line),
  ``,
].join('\n');
fs.writeFileSync(process.env.LINK_REPORT || path.join(ROOT, 'link-report.md'), report);
console.log(report.split('\n')[2]);
