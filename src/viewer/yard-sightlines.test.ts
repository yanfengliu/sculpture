/**
 * The class gate for the owner's fences defect (docs/learning/defect-register.md, "The fences are blocking the view"; docs/policies/local-rules.md: nothing stands between the camera and the stock), on the yard's built geometry.
 * Claim: from every camera preset of src/viewer/presets.ts and from some 400 seeded orbit positions, no span the yard leaves shown has a piece whose box crosses a sight line from the camera to the block's eight corners or its centre.
 * Bound:
 *   - Cameras: the presets' positions, and for each of the five distinct preset targets 100 positions on shells at 11 radii from 0.5 m to the orbit's MAX_DISTANCE, above the target's horizon by the orbit's MAX_POLAR_ANGLE (src/viewer/orbit-limits.ts), from a fixed seed. Positions inside the block or under the floor are skipped: the orbit never shows the stock from there. Radii under 0.5 m are not drawn.
 *   - Geometry: every mesh and instance of each span group of `buildYard` (src/viewer/yard.ts), as its world-space box, which is exact for the timbers, decks and planks and holds the props' true shapes inside it; a piece holding the camera is skipped, since its faces are culled from inside. A sight line ends where it first meets the block's box (src/david/frame.ts), not at the carved stock, so a piece behind the block's face, like the head bridge's near edge, does not count.
 *   - The bench is exempt: the spec keeps it for the camera, because the tools rest on it (docs/design/spec.md, Page, Yard spans). The floor is not a span.
 *   - Bridges: checked with every bridge laid and with none, the two ends of src/viewer/bridges.ts's choice; a bridge's planks count only while it is laid.
 *   - It checks nine sight lines, not every pixel of the block: a piece that hides part of a face between them passes.
 * The mutation case shows the check fails when a span that crosses the block's sight lines stays shown.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { MAX_DISTANCE, MAX_POLAR_ANGLE } from './orbit-limits';
import { BRIDGES } from '../tools/scaffold';
import { PRESETS } from './presets';
import type { Yard } from './yard';
import { buildYard } from './yard';
import type { YardSpanId } from './yard-spans';

const SEED = 20261014;
const POSITIONS_PER_TARGET = 100;
const RADII: readonly number[] = [0.5, 0.8, 1.2, 1.8, 2.6, 4, 6, 10, 18, 35, MAX_DISTANCE];
const EXEMPT: ReadonlySet<YardSpanId> = new Set(['bench']);
const HALF = { x: BLOCK_M.width / 2, z: BLOCK_M.depth / 2 } as const;

/** The block's eight corners and its centre: the ends of the sight lines. */
const SIGHT_ENDS: readonly Vec3[] = [
  ...[-HALF.x, HALF.x].flatMap((x) => [0, BLOCK_M.height].flatMap((y) => [-HALF.z, HALF.z].map((z): Vec3 => [x, y, z]))),
  [0, BLOCK_M.height / 2, 0],
];

function plainMaterials(): Parameters<typeof buildYard>[0] {
  const material = new THREE.MeshBasicMaterial();
  return { timber: material, deck: material, wall: material, floor: material };
}

interface Piece {
  readonly span: YardSpanId;
  readonly name: string;
  readonly box: THREE.Box3;
  /** The bridge the piece belongs to, or null: a bridge's planks stand only while it is laid. */
  readonly bridge: string | null;
}

function bridgeOf(object: THREE.Object3D): string | null {
  const bridge: unknown = object.userData['bridge'];
  return typeof bridge === 'string' ? bridge : null;
}

/** Every mesh and instance of every span as a world-space box. */
function piecesOf(yard: Yard): Piece[] {
  yard.group.updateMatrixWorld(true);
  const pieces: Piece[] = [];
  const instance = new THREE.Matrix4();
  for (const span of yard.spans) {
    span.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      geometry.computeBoundingBox();
      const local = geometry.boundingBox;
      if (local === null) return;
      if (object instanceof THREE.InstancedMesh) {
        for (let i = 0; i < object.count; i += 1) {
          object.getMatrixAt(i, instance);
          pieces.push({ span: span.id, name: `${object.name}[${String(i)}]`, box: local.clone().applyMatrix4(instance.premultiply(object.matrixWorld)), bridge: bridgeOf(object) });
        }
      } else {
        pieces.push({ span: span.id, name: object.name || object.parent?.name || 'mesh', box: local.clone().applyMatrix4(object.matrixWorld), bridge: bridgeOf(object) });
      }
    });
  }
  return pieces;
}

/** Whether the segment from `a` to `b` passes through `box` (slab test). */
function segmentCrosses(a: Vec3, b: Vec3, box: THREE.Box3): boolean {
  let enter = 0;
  let exit = 1;
  const min = [box.min.x, box.min.y, box.min.z];
  const max = [box.max.x, box.max.y, box.max.z];
  for (let axis = 0; axis < 3; axis += 1) {
    const start = a[axis] ?? 0;
    const delta = (b[axis] ?? 0) - start;
    const low = min[axis] ?? 0;
    const high = max[axis] ?? 0;
    if (Math.abs(delta) < 1e-12) {
      if (start < low || start > high) return false;
      continue;
    }
    let t0 = (low - start) / delta;
    let t1 = (high - start) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter > exit) return false;
  }
  return true;
}

function insideBlock([x, y, z]: Vec3): boolean {
  return Math.abs(x) <= HALF.x && y >= 0 && y <= BLOCK_M.height && Math.abs(z) <= HALF.z;
}

/** Mulberry32: a small seeded generator, so the positions are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Camera {
  readonly label: string;
  readonly position: Vec3;
}

/** The presets' positions and the seeded orbit positions around each distinct preset target. */
function cameras(): Camera[] {
  const list: Camera[] = PRESETS.map((preset) => ({ label: `preset ${preset.id}`, position: preset.pose.position }));
  const targets = [...new Map(PRESETS.map((preset) => [preset.pose.target.join(','), preset.pose.target])).values()];
  const random = seeded(SEED);
  const minCos = Math.cos(MAX_POLAR_ANGLE);
  for (const target of targets) {
    for (let i = 0; i < POSITIONS_PER_TARGET; i += 1) {
      const radius = RADII[i % RADII.length] ?? MAX_DISTANCE;
      // Uniform on the cap above the target's horizon: cos(polar) uniform in [cos(MAX_POLAR_ANGLE), 1].
      const cosPolar = minCos + (1 - minCos) * random();
      const sinPolar = Math.sqrt(1 - cosPolar * cosPolar);
      const azimuth = 2 * Math.PI * random();
      const position: Vec3 = [target[0] + radius * sinPolar * Math.cos(azimuth), target[1] + radius * cosPolar, target[2] + radius * sinPolar * Math.sin(azimuth)];
      if (insideBlock(position) || position[1] < 0) continue;
      list.push({ label: `orbit ${position.map((v) => v.toFixed(2)).join(',')} around ${target.join(',')}`, position });
    }
  }
  return list;
}

/** The spans the yard shows for `camera`, by its own rule, less the exempt bench. */
function shownSpans(yard: Yard, camera: Camera): Set<YardSpanId> {
  yard.update({ x: camera.position[0], y: camera.position[1], z: camera.position[2] });
  return new Set(yard.spans.filter((span) => span.group.visible && !EXEMPT.has(span.id)).map((span) => span.id));
}

const BLOCK_BOX = new THREE.Box3(new THREE.Vector3(-HALF.x, 0, -HALF.z), new THREE.Vector3(HALF.x, BLOCK_M.height, HALF.z));

/** Where the sight line from `camera` to `end` first meets the block: what lies beyond that point is behind the stone. */
function blockEntry(camera: Vec3, end: Vec3): Vec3 {
  const ray = new THREE.Ray(new THREE.Vector3(...camera), new THREE.Vector3(end[0] - camera[0], end[1] - camera[1], end[2] - camera[2]).normalize());
  const hit = ray.intersectBox(BLOCK_BOX, new THREE.Vector3());
  return hit === null ? end : [hit.x, hit.y, hit.z];
}

/** The pieces of the `shown` spans that cross a sight line from `camera` before it reaches the block, as readable lines; a bridge counts only when `laid` names it. A piece holding the camera is skipped: its faces are culled from inside. */
function crossings(shown: ReadonlySet<YardSpanId>, pieces: readonly Piece[], camera: Camera, laid: ReadonlySet<string>): string[] {
  const found: string[] = [];
  const at = new THREE.Vector3(...camera.position);
  const lines = SIGHT_ENDS.map((end) => ({ end, entry: blockEntry(camera.position, end) }));
  for (const piece of pieces) {
    if (!shown.has(piece.span) || piece.box.containsPoint(at) || (piece.bridge !== null && !laid.has(piece.bridge))) continue;
    const line = lines.find(({ entry }) => segmentCrosses(camera.position, entry, piece.box));
    if (line !== undefined) found.push(`${camera.label}: ${piece.span} ${piece.name} crosses the sight line to [${line.end.join(', ')}]`);
  }
  return found;
}

describe('yard sight lines', () => {
  const yard = buildYard(plainMaterials());
  const pieces = piecesOf(yard);
  const all = cameras();

  it('builds pieces for every span and draws cameras on every shell', () => {
    expect(new Set(pieces.map((piece) => piece.span)).size).toBe(yard.spans.length);
    expect(all.length).toBeGreaterThan(PRESETS.length + 350);
  });

  it.each([
    ['every bridge laid', BRIDGES.map((bridge) => bridge.id)],
    ['no bridge laid', []],
  ])('leaves no shown span across a sight line from any preset or seeded orbit position to the block, %s', (_name, ids) => {
    yard.setBridges(ids);
    const laid = new Set(ids);
    const found = all.flatMap((camera) => crossings(shownSpans(yard, camera), pieces, camera, laid));
    expect(found.slice(0, 20), `${String(found.length)} crossings`).toEqual([]);
  });

  it('reports a span the rule hides when it is kept shown (mutation: every span shown from every camera)', () => {
    const every = new Set(yard.spans.map((span) => span.id).filter((id) => !EXEMPT.has(id)));
    const laid = new Set(BRIDGES.map((bridge) => bridge.id));
    yard.setBridges([...laid]);
    const found = all.flatMap((camera) => crossings(every, pieces, camera, laid));
    const spans = new Set(found.map((line) => /: (\S+) /.exec(line)?.[1]));
    expect(found.length).toBeGreaterThan(0);
    expect([...spans].sort()).toEqual(expect.arrayContaining(['head-bridge', 'scaffold-front', 'scaffold-left', 'scaffold-right']));
  });
});
