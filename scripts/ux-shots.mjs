// Screenshots the map in every lens, a focused node, and the vendor, tree, format and inside
// pages at desktop and phone widths. Usage: node scripts/ux-shots.mjs [baseUrl] [outDir]
// (DARK=1 for dark mode, ONLY=name,name to limit)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:3480';
const out = process.argv[3] || `${process.env.HOME}/tmp/engmap/ux`;
fs.mkdirSync(out, { recursive: true });
const pages = [
  ['map', '/'],
  ['lens-ownership', '/#lens=ownership'],
  ['lens-formats', '/#lens=interop'],
  ['lens-builton', '/#lens=built-on'],
  ['lens-competition', '/#lens=rivals'],
  ['lens-integrations', '/#lens=integrations'],
  ['focus-hypermesh', '/#lens=ownership&n=hypermesh'],
  ['focus-step', '/#lens=interop&n=step'],
  ['focus-openfoam', '/#lens=rivals&n=openfoam-org'],
  ['lens-everything', '/#lens=overview'],
  ['focus-altair', '/#n=altair'],
  ['vendor', '/vendors/altair/'],
  ['tree', '/vendors/tree/'],
  ['format-step', '/formats/step/'],
  ['format-stl', '/formats/stl/'],
  ['format-gcode', '/formats/gcode/'],
  ['inside', '/formats/stl/inside/'],
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const dark = !!process.env.DARK;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
  if (process.env.TAG && process.env.TAG !== tag) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: tag === 'phone' ? 2 : 1, colorScheme: dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  // Dark is the default theme; light screenshots set the stored choice first.
  if (!dark) await page.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch (e) {} });
  for (const [name, p] of pages) {
    if (only && !only.includes(name)) continue;
    const errors = [];
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('about:blank');
    await page.goto(base + p, { waitUntil: 'networkidle' });
    const isMap = p.startsWith('/#') || p === '/';
    if (isMap) {
      await page.waitForSelector('#graph[data-ready="1"]', { timeout: 20000 }).catch(() => errors.push('graph not ready'));
      await page.waitForTimeout(1800);
    } else {
      await page.waitForTimeout(2500);
    }
    const file = `${out}/${name}-${tag}${dark ? '-dark' : ''}.png`;
    await page.screenshot({ path: file, fullPage: !isMap && name !== 'tree' });
    if (!isMap && tag === 'phone') await page.screenshot({ path: file.replace('.png', '-top.png'), fullPage: true, clip: { x: 0, y: 0, width: w, height: 1700 } });
    if (name === 'tree') await page.screenshot({ path: file.replace('.png', '-full.png'), fullPage: true, clip: { x: 0, y: 0, width: w, height: 3000 } });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log('shot', name, tag, sw > w ? `HSCROLL ${sw}` : '', errors.length ? `ERRORS ${[...new Set(errors)].join(' | ')}` : '');
  }
  await ctx.close();
}
await browser.close();
