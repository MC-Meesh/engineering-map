// In-browser preview of an example file. Loaded on demand by the example panel on format pages.
// Mesh formats use three.js loaders (MIT). STEP and IGES are tessellated in the browser by
// occt-import-js (LGPL-2.1, OCCT compiled to WebAssembly), served unmodified from
// /vendor/occt-import-js/ with its license files (docs/decisions/0005-format-examples.md).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const css = () => getComputedStyle(document.documentElement);
const v = (n: string) => css().getPropertyValue(n).trim();

async function loadOcct(): Promise<any> {
  const w = window as any;
  if (!w.occtimportjs) {
    await new Promise<void>((ok, fail) => {
      const s = document.createElement('script');
      s.src = '/vendor/occt-import-js/occt-import-js.js';
      s.onload = () => ok();
      s.onerror = () => fail(new Error('could not load the OCCT reader'));
      document.head.appendChild(s);
    });
  }
  return w.occtimportjs({ locateFile: (name: string) => `/vendor/occt-import-js/${name}` });
}

async function toObject(url: string): Promise<THREE.Object3D> {
  const ext = url.split('.').pop()!.toLowerCase();
  const mat = new THREE.MeshStandardMaterial({ color: v('--ink-2') || '#8f8f8f', metalness: 0.15, roughness: 0.55, side: THREE.DoubleSide });
  if (ext === 'step' || ext === 'stp' || ext === 'igs' || ext === 'iges') {
    const [occt, buf] = await Promise.all([loadOcct(), fetch(url).then((r) => r.arrayBuffer())]);
    const bytes = new Uint8Array(buf);
    const res = ext.startsWith('st') ? occt.ReadStepFile(bytes, null) : occt.ReadIgesFile(bytes, null);
    if (!res.success) throw new Error('the OCCT reader could not read this file');
    const group = new THREE.Group();
    for (const m of res.meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
      g.setIndex(new THREE.BufferAttribute(Uint32Array.from(m.index.array), 1));
      if (!m.attributes.normal) g.computeVertexNormals();
      group.add(new THREE.Mesh(g, mat));
    }
    return group;
  }
  if (ext === 'stl') {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
    const g = await new STLLoader().loadAsync(url);
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
  if (ext === 'ply') {
    const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
    const g = await new PLYLoader().loadAsync(url);
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
  if (ext === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const o = await new OBJLoader().loadAsync(url);
    o.traverse((c: any) => { if (c.isMesh) c.material = mat; });
    return o;
  }
  if (ext === '3mf') {
    const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
    const o = await new ThreeMFLoader().loadAsync(url);
    o.traverse((c: any) => { if (c.isMesh) c.material = mat; });
    return o;
  }
  if (ext === 'vtu') return vtuObject(url, mat);
  if (ext === '3dxml') return threeDxmlObject(url, mat);
  if (ext === 'glb' || ext === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gl = await new GLTFLoader().loadAsync(url);
    gl.scene.traverse((c: any) => { if (c.isMesh) c.material = mat; });
    return gl.scene;
  }
  throw new Error(`no preview for .${ext}`);
}

// 3D XML: the archive is unzipped in the browser (fflate, as three.js's 3MF loader does), the
// product tree is walked from the root Reference3D, and each part's .3DRep meshes are placed by
// the product of the RelativeMatrix of every instance above it (src/scripts/threedxml.ts).
async function threeDxmlObject(url: string, mat: THREE.Material): Promise<THREE.Object3D> {
  const { read3dxml, matrix4 } = await import('./threedxml');
  const d = read3dxml(new Uint8Array(await (await fetch(url)).arrayBuffer()));
  if (!d.tree) throw new Error('no product structure found in this archive');
  const geoms = new Map<string, THREE.BufferGeometry[]>();
  for (const [name, r] of d.reps) {
    geoms.set(name, r.meshes.map((m) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      if (m.normals) g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
      g.setIndex(new THREE.BufferAttribute(m.index, 1));
      if (!m.normals) g.computeVertexNormals();
      return g;
    }));
  }
  type N = NonNullable<typeof d.tree>;
  const place = (n: N, parent: THREE.Object3D) => {
    const o = new THREE.Group();
    o.name = n.instance ?? n.name;
    if (n.matrix) { o.matrixAutoUpdate = false; o.matrix.fromArray(matrix4(n.matrix)); }
    for (const r of n.reps) for (const g of geoms.get(r) ?? []) o.add(new THREE.Mesh(g, mat));
    for (const c of n.children) place(c, o);
    parent.add(o);
  };
  const root = new THREE.Group();
  place(d.tree, root);
  return root;
}

// VTK XML unstructured grid (.vtu), read here from the published VTK file format document:
// base64 DataArrays, optionally zlib-compressed in blocks with a UInt32 header. The outer
// faces of the volume cells are drawn.
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new (window as any).DecompressionStream('deflate');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
const b64 = (t: string) => Uint8Array.from(atob(t.trim()), (c) => c.charCodeAt(0));
async function dataArray(el: Element, compressed: boolean): Promise<number[]> {
  const type = el.getAttribute('type') ?? 'Float64';
  const fmt = el.getAttribute('format') ?? 'ascii';
  let bytes: Uint8Array;
  if (fmt === 'ascii') return (el.textContent ?? '').trim().split(/\s+/).map(Number);
  const txt = (el.textContent ?? '').trim();
  if (compressed) {
    // Header: number of blocks, block size, last block size, then each compressed size.
    const n0 = b64(txt.slice(0, 16));
    const nb = new DataView(n0.buffer).getUint32(0, true);
    const headLen = Math.ceil(((3 + nb) * 4) / 3) * 4;
    const head = new DataView(b64(txt.slice(0, headLen)).buffer);
    const data = b64(txt.slice(headLen));
    const parts: Uint8Array[] = [];
    let at = 0;
    for (let k = 0; k < nb; k++) { const c = head.getUint32((3 + k) * 4, true); parts.push(await inflate(data.subarray(at, at + c))); at += c; }
    bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
  } else {
    const all = b64(txt);
    bytes = all.subarray(4);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size: Record<string, number> = { Float64: 8, Float32: 4, Int64: 8, UInt64: 8, Int32: 4, UInt32: 4, Int8: 1, UInt8: 1, Int16: 2, UInt16: 2 };
  const w = size[type] ?? 8, out: number[] = [];
  for (let i = 0; i + w <= bytes.length; i += w) {
    out.push(type === 'Float64' ? dv.getFloat64(i, true) : type === 'Float32' ? dv.getFloat32(i, true) : type === 'Int64' || type === 'UInt64' ? Number(dv.getBigInt64(i, true)) : type === 'Int32' ? dv.getInt32(i, true) : type === 'UInt32' ? dv.getUint32(i, true) : type === 'Int16' ? dv.getInt16(i, true) : type === 'UInt16' ? dv.getUint16(i, true) : type === 'Int8' ? dv.getInt8(i) : dv.getUint8(i));
  }
  return out;
}
async function vtuObject(url: string, mat: THREE.Material): Promise<THREE.Object3D> {
  const doc = new DOMParser().parseFromString(await (await fetch(url)).text(), 'application/xml');
  const compressed = !!doc.documentElement.getAttribute('compressor');
  const byName = (n: string) => [...doc.getElementsByTagName('DataArray')].find((e) => e.getAttribute('Name') === n);
  const pts = await dataArray(doc.querySelector('Points > DataArray')!, compressed);
  const conn = await dataArray(byName('connectivity')!, compressed);
  const offs = await dataArray(byName('offsets')!, compressed);
  const types = await dataArray(byName('types')!, compressed);
  // Faces of each cell type, as vertex index lists into the cell.
  const FACES: Record<number, number[][]> = { 10: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]], 12: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], 13: [[0, 2, 1], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]], 14: [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]] };
  const count = new Map<string, number>(), faces = new Map<string, number[]>();
  const tris: number[] = [];
  let start = 0;
  for (let c = 0; c < types.length; c++) {
    const v = conn.slice(start, offs[c]);
    start = offs[c];
    const t = types[c];
    if (t === 5 || t === 9) { tris.push(v[0], v[1], v[2]); if (t === 9) tris.push(v[0], v[2], v[3]); continue; }
    for (const f of FACES[t] ?? []) {
      const ids = f.map((k) => v[k]);
      const key = [...ids].sort((a, b) => a - b).join(',');
      count.set(key, (count.get(key) ?? 0) + 1);
      faces.set(key, ids);
    }
  }
  for (const [key, n] of count) if (n === 1) { const f = faces.get(key)!; for (let k = 1; k + 1 < f.length; k++) tris.push(f[0], f[k], f[k + 1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(tris);
  g.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, mat));
  // Element edges, so it reads as a mesh.
  group.add(new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: v('--paper') || '#ffffff', transparent: true, opacity: 0.35 })));
  return group;
}

// GDSII layout drawn as polygons per layer, from the records the inspector also reads
// (BOUNDARY and PATH elements of every cell, LAYER, XY; units from the UNITS record).
export async function showLayout(box: HTMLElement, url: string) {
  const b = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const dv = new DataView(b.buffer);
  const polys: { layer: number; pts: [number, number][] }[] = [];
  let at = 0, layer = 0, inEl = false;
  while (at + 4 <= b.length) {
    const len = dv.getUint16(at, false);
    if (len < 4) break;
    const rt = b[at + 2];
    if (rt === 8 || rt === 9) inEl = true;
    else if (rt === 17) inEl = false;
    else if (rt === 13 && inEl) layer = dv.getInt16(at + 4, false);
    else if (rt === 16 && inEl) {
      const pts: [number, number][] = [];
      for (let k = at + 4; k + 8 <= at + len; k += 8) pts.push([dv.getInt32(k, false), dv.getInt32(k + 4, false)]);
      polys.push({ layer, pts });
    }
    at += len;
  }
  box.textContent = '';
  if (!polys.length) { box.textContent = 'No shapes in this layout.'; return; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  box.appendChild(canvas);
  const layers = [...new Set(polys.map((p) => p.layer))].sort((a, c) => a - c);
  const palette = ['--d-design', '--d-simulation', '--d-electronics', '--d-manufacturing', '--d-lifecycle', '--d-intelligence', '--d-systems'];
  const draw = () => {
    const w = box.clientWidth, h = box.clientHeight, r = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * r; canvas.height = h * r;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 24, sc = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad - 28) / (y1 - y0 || 1));
    const ox = (w - (x1 - x0) * sc) / 2, oy = pad + ((h - 2 * pad - 28) - (y1 - y0) * sc) / 2;
    for (const p of polys) {
      const c = v(palette[layers.indexOf(p.layer) % palette.length]) || '#2a78d6';
      ctx.beginPath();
      p.pts.forEach(([x, y], k) => { const X = ox + (x - x0) * sc, Y = oy + (y1 - y) * sc; if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.closePath();
      ctx.globalAlpha = 0.45; ctx.fillStyle = c; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.font = `11px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = v('--ink-2') || '#666';
    let lx = pad;
    for (const l of layers) {
      ctx.fillStyle = v(palette[layers.indexOf(l) % palette.length]) || '#2a78d6';
      ctx.fillRect(lx, h - 18, 10, 10);
      ctx.fillStyle = v('--ink-2') || '#666';
      ctx.fillText(`layer ${l}`, lx + 14, h - 9);
      lx += 74;
    }
  };
  new ResizeObserver(draw).observe(box);
  window.addEventListener('themechange', draw);
  draw();
}

// Gerber (RS-274X) drawn as copper: apertures (circle, rectangle), D01 draws with the current
// aperture, D02 moves, D03 flashes; coordinates per the %FS and %MO headers (Ucamco spec).
export async function showGerber(box: HTMLElement, url: string) {
  const src = await (await fetch(url)).text();
  const fs = src.match(/%FSLAX(\d)(\d)Y\d(\d)\*%/);
  const dec = fs ? Number(fs[2]) : 6;
  const ap = new Map<string, { kind: string; w: number; h: number }>();
  for (const m of src.matchAll(/%ADD(\d+)([CR]),([\d.]+)(?:X([\d.]+))?\*%/g)) ap.set(`D${m[1]}`, { kind: m[2], w: Number(m[3]), h: Number(m[4] ?? m[3]) });
  type Op = { t: 'line' | 'flash'; x0: number; y0: number; x: number; y: number; a: { kind: string; w: number; h: number } };
  const ops: Op[] = [];
  let cur = { kind: 'C', w: 0.1, h: 0.1 }, x = 0, y = 0;
  for (const raw of src.split('*')) {
    const s = raw.trim();
    const sel = s.match(/^(?:G54)?(D(\d+))$/);
    if (sel && Number(sel[2]) >= 10) { cur = ap.get(sel[1]) ?? cur; continue; }
    const m = s.match(/^(?:X(-?\d+))?(?:Y(-?\d+))?(D0?[123])$/);
    if (!m) continue;
    const nx = m[1] !== undefined ? Number(m[1]) / 10 ** dec : x, ny = m[2] !== undefined ? Number(m[2]) / 10 ** dec : y;
    const d = m[3].replace('D0', 'D');
    if (d === 'D1') ops.push({ t: 'line', x0: x, y0: y, x: nx, y: ny, a: cur });
    if (d === 'D3') ops.push({ t: 'flash', x0: nx, y0: ny, x: nx, y: ny, a: cur });
    x = nx; y = ny;
  }
  box.textContent = '';
  if (!ops.length) { box.textContent = 'No shapes in this file.'; return; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const o of ops) for (const [px, py] of [[o.x0, o.y0], [o.x, o.y]]) { x0 = Math.min(x0, px - o.a.w); x1 = Math.max(x1, px + o.a.w); y0 = Math.min(y0, py - o.a.h); y1 = Math.max(y1, py + o.a.h); }
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  box.appendChild(canvas);
  const draw = () => {
    const w = box.clientWidth, h = box.clientHeight, r = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * r; canvas.height = h * r;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 24, sc = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad - 20) / (y1 - y0 || 1));
    const ox = (w - (x1 - x0) * sc) / 2, oy = pad + (h - 2 * pad - 20 - (y1 - y0) * sc) / 2;
    const X = (px: number) => ox + (px - x0) * sc, Y = (py: number) => oy + (y1 - py) * sc;
    const c = v('--d-manufacturing') || '#c98500';
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineCap = 'round';
    for (const o of ops) {
      if (o.t === 'line') { ctx.lineWidth = Math.max(1, o.a.w * sc); ctx.beginPath(); ctx.moveTo(X(o.x0), Y(o.y0)); ctx.lineTo(X(o.x), Y(o.y)); ctx.stroke(); }
      else if (o.a.kind === 'C') { ctx.beginPath(); ctx.arc(X(o.x), Y(o.y), (o.a.w * sc) / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(X(o.x) - (o.a.w * sc) / 2, Y(o.y) - (o.a.h * sc) / 2, o.a.w * sc, o.a.h * sc);
    }
    ctx.font = `11px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = v('--ink-2') || '#888';
    ctx.fillText(`${(x1 - x0).toFixed(1)} x ${(y1 - y0).toFixed(1)} (file units); pads flashed, tracks drawn`, pad, h - 8);
  };
  new ResizeObserver(draw).observe(box);
  window.addEventListener('themechange', draw);
  draw();
}

export async function showModel(box: HTMLElement, url: string) {
  if (/\.gds$/i.test(url)) return showLayout(box, url);
  if (/\.gbr$/i.test(url)) return showGerber(box, url);
  let obj: THREE.Object3D;
  try {
    obj = await toObject(url);
  } catch (e: any) {
    box.textContent = `Preview failed: ${e?.message ?? e}`;
    return;
  }
  box.textContent = '';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  box.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x808890, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(sun);
  // Engineering files are Z-up; show them that way.
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1e6);
  camera.up.set(0, 0, 1);
  scene.add(obj);
  const bb = new THREE.Box3().setFromObject(obj);
  const size = bb.getSize(new THREE.Vector3());
  const mid = bb.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) || 1;
  // Fit the whole model in view for the panel's shape (until the reader moves the camera).
  const R = size.length() / 2 || 1;
  const dir = new THREE.Vector3(1.4, 1.7, 1.1).normalize();
  let moved = false;
  const place = (aspect: number) => {
    const fv = (camera.fov * Math.PI) / 180;
    const fh = 2 * Math.atan(Math.tan(fv / 2) * aspect);
    const dist = (R * 1.35) / Math.sin(Math.min(fv, fh) / 2);
    camera.position.copy(mid).addScaledVector(dir, dist);
  };
  place(1);
  camera.near = r / 100;
  camera.far = r * 100;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: v('--rule') || '#c5cdd4' }),
  );
  edges.position.copy(mid);
  scene.add(edges);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(mid);
  controls.enableDamping = true;
  controls.addEventListener('start', () => { moved = true; });
  // The wheel scrolls the page; ctrl or cmd with the wheel (and trackpad pinch, which arrives
  // as ctrl+wheel) zooms the model. Touch pinch is unaffected.
  box.addEventListener('wheel', (e) => { controls.enableZoom = e.ctrlKey || e.metaKey; }, { capture: true, passive: true });
  const caption = document.createElement('p');
  caption.className = 'viewer-cap';
  caption.textContent = `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} (file units); thin lines show its bounding box. Drag to orbit; pinch or ctrl+scroll to zoom.`;
  Object.assign(caption.style, { position: 'absolute', left: '0', right: '0', bottom: '0', margin: '0', padding: '0.35rem 0.6rem', maxWidth: 'none', background: 'var(--paper)', borderTop: '1px solid var(--rule)', pointerEvents: 'none' });
  box.appendChild(caption);
  const fit = () => {
    const w = box.clientWidth, h = box.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (!moved) place(camera.aspect);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(box);
  // Follow the site's light/dark switch.
  window.addEventListener('themechange', () => {
    const c = v('--ink-2');
    obj.traverse((m: any) => { if (m.isMesh && c) m.material.color.set(c); });
    (edges.material as THREE.LineBasicMaterial).color.set(v('--rule') || '#c5cdd4');
  });
  fit();
  const loop = () => {
    if (!box.isConnected) return;
    controls.update();
    sun.position.copy(camera.position);
    if (!box.hidden) renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
}
