// Format inspector entry point: fetch one hosted example, pick the parser for its format and
// render it. Loaded on demand from /formats/<id>/inside/.
import type { Doc } from './types';
import { render } from './view';
import * as T from './text';
import { xml } from './xml';
import * as B from './bin';
import { threeDxml } from './dxml';

async function parse(format: string, url: string): Promise<Doc> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const ext = url.split('.').pop()!.toLowerCase();
  const str = () => new TextDecoder().decode(buf);
  switch (ext) {
    case 'stl': return B.stl(buf);
    case 'glb': return B.glb(buf);
    case 'ply': return B.ply(buf);
    case '3mf': return B.zip(buf, 'A 3MF file');
    case '3dxml': return threeDxml(buf);
    case 'gds': return B.gds(buf);
    case 'oas': return B.oasis(buf);
    case 'h5': return B.hdf5(buf, 'The XDMF heavy data');
    case 'cgns': return B.hdf5(buf, 'CGNS (version 3 and later)');
    case 'med': return B.hdf5(buf, 'MED (Salome and code_aster)');
    case 'exo': return B.hdf5(buf, 'This Exodus II file (netCDF-4)');
    case 'op2': return B.op2(buf);
    case '3dm': return B.rhino(buf);
    case 'cas': return B.fluent(buf);
    case 'step': case 'stp': return T.p21(str(), 'step');
    case 'ifc': return T.p21(str(), 'ifc');
    case 'igs': case 'iges': return T.iges(str());
    case 'obj': return T.obj(str());
    case 'dxf': return T.dxf(str());
    case 'nc': case 'gcode': return T.gcode(str());
    case 'gbr': return T.gerber(str());
    case 'drl': return T.excellon(str());
    case 'inp': return T.abaqus(str());
    case 'k': return T.lsdyna(str());
    case 'bdf': return T.nastran(str());
    case 'cdb': return T.cdb(str());
    case 'msh': return T.msh(str());
    case 'vtk': return T.vtk(str());
    case 'dat': return T.tecplot(str());
    case 'sat': return T.sat(str());
    case 'x_t': return T.xt(str());
    case 'usda': return T.usda(str());
    case 'def': return T.def(str());
    case 'kicad_pcb': return T.kicadPcb(str());
    case 'scad': return T.scad(str());
    case 'v': return T.lang(str(), 'verilog');
    case 'cir': return T.lang(str(), 'spice');
    case 'mo': return T.lang(str(), 'modelica');
    case 'sysml': return T.lang(str(), 'sysml');
    case 'qif': return xml(str(), 'qif');
    case 'reqif': return xml(str(), 'reqif');
    case 'amf': return xml(str(), 'amf');
    case 'urdf': return xml(str(), 'urdf');
    case 'sdf': return xml(str(), 'sdformat');
    case 'vtu': return xml(str(), 'vtu');
    case 'xdmf': return xml(str(), 'xdmf');
    case 'xml': return xml(str(), format === 'mjcf' ? 'mjcf' : format);
  }
  throw new Error(`no inspector for .${ext}`);
}

export async function inspect(root: HTMLElement, format: string, url: string) {
  root.innerHTML = '<p class="muted">Reading the file...</p>';
  try {
    render(root, await parse(format, url));
  } catch (e: any) {
    root.innerHTML = `<p>Could not inspect this file (${String(e?.message ?? e).replace(/</g, '&lt;')}). It can still be downloaded above.</p>`;
  }
}
