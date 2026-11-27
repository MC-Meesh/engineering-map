// Renders public/og.png (1200x630 social preview) from the running preview.
// Usage: node scripts/og.mjs [baseUrl]   (needs `npx astro preview` running)
// Step 1 shoots the map (ownership circles, dark theme) at the card's map size; step 2 lays
// it into a card in the site's type and colours and shoots that.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:3480';
const graph = JSON.parse(fs.readFileSync('src/generated/graph.json', 'utf8'));
const s = graph.stats;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const shot = await browser.newPage({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await shot.goto(base + '/', { waitUntil: 'networkidle' });
await shot.waitForSelector('#graph[data-ready="1"]', { timeout: 20000 });
await shot.addStyleTag({ content: '.zoom,.key,.titleblock,.lensbar,.controls-toggle{display:none!important}' });
await shot.waitForTimeout(1500);
const mapPng = (await shot.locator('#graph').screenshot()).toString('base64');

const bold = fs.readFileSync('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2').toString('base64');
const body = fs.readFileSync('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2').toString('base64');
const html = `<!doctype html><html><head><style>
@font-face{font-family:P;font-weight:700;src:url(data:font/woff2;base64,${bold})}
@font-face{font-family:P;font-weight:400;src:url(data:font/woff2;base64,${body})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#000;color:#fff;font-family:P;display:grid;grid-template-columns:500px 1fr;overflow:hidden}
.t{padding:64px 0 0 56px;display:flex;flex-direction:column}
h1{font-size:50px;font-weight:700;line-height:1.08;letter-spacing:-.02em}
h1::after{content:'';display:block;width:80px;height:5px;background:#fff;margin-top:22px}
p{font-size:21px;line-height:1.5;color:#8f8f8f;margin-top:24px;max-width:420px}
.m{background:url(data:image/png;base64,${mapPng}) center/cover no-repeat}
.tb{position:absolute;left:56px;bottom:52px;display:flex;border:1px solid #2e2e2e;font-size:18px}
.tb div{padding:10px 18px;border-right:1px solid #2e2e2e}.tb div:last-child{border-right:0}
.tb span{display:block;font-size:12px;color:#8f8f8f;text-transform:uppercase;letter-spacing:.06em}</style></head><body><div class="t">
<h1>The engineering map</h1>
<p>Who owns what in engineering software, what it is built on, and what it reads and writes.</p>
</div><div class="m"></div>
<div class="tb"><div><span>Tools</span>${s.tools + s.kernels}</div><div><span>Vendors</span>${s.vendors}</div><div><span>Formats</span>${s.formats}</div></div>
</body></html>`;
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(html, { waitUntil: 'load' });
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: 'public/og.png' });
console.log('wrote public/og.png');
await browser.close();
