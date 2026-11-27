// A headless look at one page, for newcomer tests and reviews: prints the page title, the
// visible text of the main content (and of the map's detail panel), the links on the page,
// and saves a screenshot. Usage:
//   node scripts/look.mjs /tools/abaqus/ [--phone] [--dark] [--shot out.png]
//   node scripts/look.mjs / --search "Abaqus"        (types into the map search, picks the top hit)
//   node scripts/look.mjs /formats/step/ --click "Inside the file"
// Base URL from LOOK_BASE (default http://127.0.0.1:3480). Prints nothing it cannot see.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const path = args[0] || '/';
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const base = process.env.LOOK_BASE || 'http://127.0.0.1:3480';
const phone = args.includes('--phone');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 2 : 1, colorScheme: args.includes('--dark') ? 'dark' : 'light' });
// The site is dark by default; --light picks the light theme as the header switch would.
if (args.includes('--light')) await page.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch (e) {} });
const t0 = Date.now();
await page.goto(base + path, { waitUntil: 'networkidle' });
const isMap = await page.$('#graph');
if (isMap) await page.waitForSelector('#graph[data-ready="1"]', { timeout: 20000 }).catch(() => undefined);
const search = opt('--search');
if (search && isMap) {
  if (phone) await page.click('#controls-toggle');
  await page.fill('#search', search);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}
const click = opt('--click');
if (click) { await page.getByText(click, { exact: false }).first().click(); await page.waitForTimeout(1500); }
await page.waitForTimeout(isMap ? 1200 : 2500);
const out = await page.evaluate(() => {
  const vis = (el) => el && !el.hidden && el.offsetParent !== null;
  const detail = document.querySelector('#detail');
  const main = document.querySelector('main');
  return {
    url: location.href,
    title: document.title,
    detail: vis(detail) ? detail.innerText : '',
    lineage: vis(document.querySelector('#lineage')) ? document.querySelector('#lineage').innerText : '',
    text: detail && vis(detail) ? '' : (main?.innerText ?? ''),
    links: [...(main ?? document).querySelectorAll('a[href]')].filter(vis).slice(0, 80).map((a) => `${a.innerText.trim().slice(0, 60)} -> ${a.getAttribute('href')}`),
  };
});
const shot = opt('--shot') || `${process.env.HOME}/tmp/engmap/look/${(path + (search ?? '')).replace(/[^a-z0-9]+/gi, '_')}${phone ? '-phone' : ''}.png`;
await import('node:fs').then((fs) => fs.mkdirSync(shot.replace(/\/[^/]+$/, ''), { recursive: true }));
await page.screenshot({ path: shot });
console.log(`URL: ${out.url}\nTITLE: ${out.title}\nLOAD+ACTION MS: ${Date.now() - t0}\nSCREENSHOT: ${shot}`);
if (out.lineage) console.log(`\nBREADCRUMB: ${out.lineage}`);
if (out.detail) console.log(`\nDETAIL PANEL:\n${out.detail.slice(0, 4000)}`);
if (out.text) console.log(`\nPAGE TEXT:\n${out.text.replace(/\n{3,}/g, '\n\n').slice(0, 7000)}`);
console.log(`\nLINKS:\n${out.links.join('\n')}`);
await browser.close();
