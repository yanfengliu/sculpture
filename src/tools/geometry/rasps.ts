/**
 * Rasps and files (docs/research/tools.md, Raspe e lime): a straight iron rasp with raised teeth on a tanged bar and a wooden handle, a curved riffler with teeth along its bent ends, and a slender file with fine cuts.
 * Local frame: origin at the working tip (the far end of the bar), the bar along +Y, the handle at +Y, the toothed face at -Z.
 */
import { ConeGeometry, Group, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BufferGeometry } from 'three';

import { dimension } from '../catalog';
import { bentStick, box, part, raisedTeeth, shank, struckHead } from './parts';

const TANG_LENGTH = 0.03;
const RASP_HANDLE = 0.05;
const FILE_HANDLE = 0.06;

export function buildRasp(): Group {
  const length = dimension('rasp', 'length');
  const width = dimension('rasp', 'width');
  const thickness = dimension('rasp', 'thickness');
  const pitch = dimension('rasp', 'toothPitch');
  const bar = length - RASP_HANDLE - TANG_LENGTH;
  const group = new Group();
  group.add(
    part(box(width, bar, thickness, new Vector3(0, bar / 2, 0)), 'iron', 'bar'),
    part(raisedTeeth(pitch, bar - pitch, width - pitch, pitch, pitch * 0.4, -thickness / 2), 'steel', 'teeth'),
    part(shank(bar, bar + TANG_LENGTH, 0.003, 0.005, 8), 'iron', 'tang'),
    part(struckHead(bar + TANG_LENGTH, length, width / 2 - 0.0005), 'wood', 'handle'),
  );
  return group;
}

export function buildFile(): Group {
  const length = dimension('file', 'length');
  const width = dimension('file', 'width');
  const thickness = dimension('file', 'thickness');
  const pitch = dimension('file', 'toothPitch');
  const bar = length - FILE_HANDLE - TANG_LENGTH;
  const group = new Group();
  group.add(
    part(box(width, bar, thickness, new Vector3(0, bar / 2, 0)), 'iron', 'bar'),
    part(raisedTeeth(pitch, bar - pitch, width - pitch, pitch, pitch * 0.35, -thickness / 2), 'steel', 'cuts'),
    part(shank(bar, bar + TANG_LENGTH, 0.0025, 0.004, 8), 'iron', 'tang'),
    part(struckHead(bar + TANG_LENGTH, length, width / 2 - 0.0005), 'wood', 'handle'),
  );
  return group;
}

/** The curved riffler: a straight grip between two bent toothed ends; the catalog has it under the rasp (src/tools/props.ts lists it). Overall length 0.24 m, inferred within the stated 12 to 40 cm. */
export const CURVED_RASP_LENGTH = 0.24;
const RIFFLER_RADIUS = 0.005;

export function buildCurvedRasp(): Group {
  const group = new Group();
  const endPath = (sign: number): Vector3[] => {
    const start = sign > 0 ? CURVED_RASP_LENGTH : 0;
    const toward = sign > 0 ? -1 : 1;
    return [new Vector3(0, start, 0), new Vector3(0, start + toward * 0.03, 0.012), new Vector3(0, start + toward * 0.06, 0.012), new Vector3(0, start + toward * 0.085, 0)];
  };
  const lower = endPath(-1);
  const upper = endPath(1);
  group.add(
    part(bentStick(lower, RIFFLER_RADIUS, 16), 'iron', 'lower-end'),
    part(bentStick(upper, RIFFLER_RADIUS, 16), 'iron', 'upper-end'),
    part(box(0.012, CURVED_RASP_LENGTH - 0.16, 0.012, new Vector3(0, CURVED_RASP_LENGTH / 2, 0)), 'iron', 'grip'),
    part(teethAlong(lower), 'steel', 'lower-teeth'),
    part(teethAlong(upper), 'steel', 'upper-teeth'),
  );
  return group;
}

/** Small pyramids along a bent end, pointing -Z off its working side. */
function teethAlong(path: readonly Vector3[]): BufferGeometry {
  const teeth: BufferGeometry[] = [];
  const count = 14;
  for (let i = 1; i < count; i += 1) {
    const u = i / count;
    const point = sampleCatmull(path, u);
    for (const dx of [-0.0025, 0, 0.0025]) {
      const tooth = new ConeGeometry(0.0012, 0.0018, 4);
      tooth.rotateX(-Math.PI / 2);
      tooth.translate(point.x + dx, point.y, point.z - RIFFLER_RADIUS);
      teeth.push(tooth);
    }
  }
  return mergeGeometries(teeth, false);
}

/** Linear sample along the polyline, close enough to the Catmull-Rom stick for a tooth to sit on it. */
function sampleCatmull(path: readonly Vector3[], u: number): Vector3 {
  const segments = path.length - 1;
  const scaled = u * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const a = path[index] ?? new Vector3();
  const b = path[index + 1] ?? a;
  return a.clone().lerp(b, scaled - index);
}
