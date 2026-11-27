// Copy the unmodified occt-import-js build (LGPL-2.1) and its license files to
// public/vendor/occt-import-js/, where the example viewer loads it on demand. Shipping the
// library as separate, unmodified files keeps it replaceable, which is what the LGPL asks of
// a work that uses it (docs/decisions/0005-format-examples.md).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(ROOT, 'node_modules', 'occt-import-js', 'dist');
const dst = path.join(ROOT, 'public', 'vendor', 'occt-import-js');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['occt-import-js.js', 'occt-import-js.wasm', 'license.occt-import-js.txt', 'license.occt.txt']) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'occt-import-js', 'package.json'), 'utf8'));
fs.writeFileSync(path.join(dst, 'README.txt'),
  `occt-import-js ${pkg.version}, unmodified, LGPL-2.1 (see license.occt-import-js.txt).\n` +
  `Open CASCADE Technology inside it: LGPL-2.1 with the OCCT exception (see license.occt.txt).\n` +
  `Source: https://github.com/kovacsv/occt-import-js\n`);
console.log('vendor assets copied:', dst);
