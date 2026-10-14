/**
 * Which yard spans a camera looks through (docs/policies/local-rules.md: nothing stands between the camera and the stock).
 * A span is one group of yard structures on one side of the block: a turata wall with its posts and rails, a scaffold side with its posts, ledgers and decks, the bench, the model stand. Each has a centre and an outward normal from the block's centre, horizontal.
 * A span's inner faces are the planes that separate its pieces from the block: for each face of the block (its sides, its back and front, its top) that some of the span's pieces lie beyond, the plane through the innermost of those pieces. The camera is outside a span when it is past any of its inner faces: the span can then stand between the camera and the block, so it is hidden. Short of every inner face, a sight line to the block cannot reach a piece (the camera and the block lie on one side of each plane, the pieces beyond it), so the span stays as the backdrop. Not the span centre's plane: a camera on a deck or between the scaffold and the block is short of the centre and still looks through the timbers, and the head bridge's plank ends stick out past the block's sides (the sight-line gate, yard-sightlines.test.ts, 2026-10-14). The bench never hides for the camera, because the tools rest on it. The Yard toggle (`yard=0`) hides every span.
 * Pure: no three.js here, so the rule is unit-tested on its own (yard-spans.test.ts) and src/viewer/yard.ts only applies its answer to the groups it built.
 */
import type { Vec3 } from '../contracts/making';

export type YardSpanId = 'wall-left' | 'wall-right' | 'wall-back' | 'scaffold-front' | 'scaffold-left' | 'scaffold-right' | 'scaffold-back' | 'bench' | 'model-stand';

/** Every span the yard builds, in the order the facts list them: the three turata walls, the scaffold's front, sides and back (the bridges behind the block), the bench and the model stand. */
export const YARD_SPAN_IDS: readonly YardSpanId[] = ['wall-left', 'wall-right', 'wall-back', 'scaffold-front', 'scaffold-left', 'scaffold-right', 'scaffold-back', 'bench', 'model-stand'];

export interface SpanGeometry {
  readonly id: YardSpanId;
  /** Centre of the span, world metres. */
  readonly centre: Vec3;
  /** Outward unit normal from the block's centre, horizontal. */
  readonly normal: Vec3;
  /** The planes separating the span's pieces from the block, each as a unit normal pointing away from the block and the offset along it of the innermost piece beyond that face of the block: past one, the camera may look through the span. */
  readonly faces: readonly SpanFace[];
  /** Whether a camera on the outer side hides it; false for the bench, where the tools rest. */
  readonly cameraHides: boolean;
}

export interface SpanFace {
  readonly normal: Vec3;
  readonly inner: number;
}

/** True when `camera` lies past one of the inner faces of `span`, so the span may stand between the camera and the block. */
export function cameraOutside(span: SpanGeometry, camera: Vec3): boolean {
  return span.faces.some(({ normal: [nx, ny, nz], inner }) => camera[0] * nx + camera[1] * ny + camera[2] * nz > inner);
}

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** The block's faces a piece can lie beyond: the sides, the back and front, the top. */
const BLOCK_FACES: readonly { readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 }[] = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 },
  { axis: 1, sign: 1 },
];

/** The inner faces of a span whose pieces are `pieces` (world boxes) around `block`: each piece is cut at the block's faces, the span's own side (`normal`'s largest component) first, and every part beyond a face moves that face's plane to its innermost point. A part inside the block's box is behind the stone and sets no plane. */
export function innerFaces(pieces: readonly Box[], block: Box, normal: Vec3): SpanFace[] {
  const own = [0, 1, 2].reduce((best, axis) => (Math.abs(normal[axis] ?? 0) > Math.abs(normal[best] ?? 0) ? axis : best), 0);
  const ownSign = (normal[own] ?? 0) >= 0 ? 1 : -1;
  const isOwn = (face: { readonly axis: number; readonly sign: number }): number => Number(face.axis === own && face.sign === ownSign);
  const order = [...BLOCK_FACES].sort((a, b) => isOwn(b) - isOwn(a));
  const inner = new Map<string, SpanFace>();
  for (const piece of pieces) {
    const min = [...piece.min];
    const max = [...piece.max];
    for (const { axis, sign } of order) {
      const face = sign > 0 ? block.max[axis] : -block.min[axis];
      const far = sign > 0 ? (max[axis] ?? 0) : -(min[axis] ?? 0);
      if (far <= face) continue;
      const near = Math.max(face, sign > 0 ? (min[axis] ?? 0) : -(max[axis] ?? 0));
      const key = `${String(axis)}${String(sign)}`;
      const unit: [number, number, number] = [0, 0, 0];
      unit[axis] = sign;
      inner.set(key, { normal: unit, inner: Math.min(inner.get(key)?.inner ?? Number.POSITIVE_INFINITY, near) });
      // What is left of the piece lies on the block's side of this face.
      if (sign > 0) max[axis] = face;
      else min[axis] = -face;
      if ((max[axis] ?? 0) <= (min[axis] ?? 0)) break;
    }
  }
  return [...inner.values()];
}

/** Ids of the spans to hide for a camera at `camera`: every span when the yard is off, else the ones the camera is outside of that hide for the camera. In `spans` order. */
export function hiddenSpans(spans: readonly SpanGeometry[], camera: Vec3, yardShown: boolean): YardSpanId[] {
  if (!yardShown) return spans.map((span) => span.id);
  return spans.filter((span) => span.cameraHides && cameraOutside(span, camera)).map((span) => span.id);
}

/** The horizontal outward unit normal from the block's centre line (x = 0, z = 0) toward `centre`; +z when the centre is on the line. */
export function outwardNormal(centre: Vec3): Vec3 {
  const [x, , z] = centre;
  const length = Math.hypot(x, z);
  if (length < 1e-9) return [0, 0, 1];
  return [x / length, 0, z / length];
}
