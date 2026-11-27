// End-to-end check: a selected node survives every lens switch. Selects a node, clicks through
// all six lenses and asserts the selection, detail panel, breadcrumb and URL hash each time,
// then steps back through history. Usage: node scripts/e2e-lens-focus.mjs [baseUrl]
// (needs the preview running). Exits non-zero on the first failure.
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://127.0.0.1:3480';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

for (const [node, name, lineage] of [['hypermesh', 'Simcenter Hypermesh', 'Altair Engineering'], ['openfoam-org', 'OpenFOAM (openfoam.org)', 'OpenFOAM Foundation']]) {
  await page.goto(`${base}/#n=${node}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#graph[data-ready="1"]', { timeout: 20000 });
  await page.waitForTimeout(900);
  const lenses = await page.$$eval('.lens-buttons [data-lens]', (bs) => bs.map((b) => b.dataset.lens));
  check(lenses.length === 6, `six lenses (${lenses.join(', ')})`);
  const order = [...lenses.slice(1), lenses[0]];
  for (const lens of order) {
    await page.click(`.lens-buttons [data-lens="${lens}"]`);
    await page.waitForTimeout(1100);
    const s = await page.evaluate(() => ({
      hash: location.hash,
      panel: !document.querySelector('#detail')?.hidden,
      title: document.querySelector('#detail-title')?.textContent ?? '',
      crumb: document.querySelector('#lineage')?.textContent ?? '',
      crumbShown: !document.querySelector('#lineage')?.hidden,
      pressed: document.querySelector('.lens-buttons [aria-pressed="true"]')?.getAttribute('data-lens'),
      note: document.querySelector('.detail-none')?.textContent ?? '',
    }));
    const hashOk = s.hash.includes(`n=${node}`) && (lens === 'ownership' ? !s.hash.includes('lens=') : s.hash.includes(`lens=${lens}`));
    check(s.panel && s.title.includes(name) && s.crumbShown && s.crumb.includes(lineage) && hashOk && s.pressed === lens,
      `${node} in ${lens}: panel ${s.panel}, title "${s.title}", breadcrumb ${s.crumbShown ? 'shown' : 'hidden'}, hash ${s.hash}${s.note ? `, note "${s.note}"` : ''}`);
  }
  // Back steps through the lens changes, still on the same node.
  await page.goBack();
  await page.waitForTimeout(1100);
  const back = await page.evaluate(() => ({ hash: location.hash, pressed: document.querySelector('.lens-buttons [aria-pressed="true"]')?.getAttribute('data-lens'), title: document.querySelector('#detail-title')?.textContent ?? '' }));
  check(back.hash.includes(`lens=${order[order.length - 2]}`) && back.pressed === order[order.length - 2] && back.title.includes(name), `back to ${order[order.length - 2]} (${back.hash})`);
}
check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
