/**
 * Which yard spans a camera looks through (docs/policies/local-rules.md: nothing stands between the camera and the stock).
 * A span is one group of yard structures on one side of the block: a turata wall with its posts and rails, a scaffold side with its posts, ledgers and decks, the bench, the model stand. Each has a centre and an outward normal from the block's centre, horizontal.
 * The camera is on a span's outer side when `dot(camera - centre, normal) > 0`: it would then look through the span at the block, so the span is hidden; the spans on the far side stay as the backdrop. The bench never hides for the camera, because the tools rest on it. The Yard toggle (`yard=0`) hides every span.
 * Pure: no three.js here, so the rule is unit-tested on its own (yard-spans.test.ts) and src/viewer/yard.ts only applies its answer to the groups it built.
 */
import type { Vec3 } from '../contracts/making';

export type YardSpanId = 'wall-left' | 'wall-right' | 'wall-back' | 'scaffold-front' | 'scaffold-left' | 'scaffold-right' | 'bench' | 'model-stand';

/** Every span the yard builds, in the order the facts list them. */
export const YARD_SPAN_IDS: readonly YardSpanId[] = ['wall-left', 'wall-right', 'wall-back', 'scaffold-front', 'scaffold-left', 'scaffold-right', 'bench', 'model-stand'];

export interface SpanGeometry {
  readonly id: YardSpanId;
  /** Centre of the span, world metres. */
  readonly centre: Vec3;
  /** Outward unit normal from the block's centre, horizontal. */
  readonly normal: Vec3;
  /** Whether a camera on the outer side hides it; false for the bench, where the tools rest. */
  readonly cameraHides: boolean;
}

/** True when `camera` lies on the outer side of `span`, so the span stands between the camera and the block. */
export function cameraOutside(span: SpanGeometry, camera: Vec3): boolean {
  const [cx, cy, cz] = span.centre;
  const [nx, ny, nz] = span.normal;
  return (camera[0] - cx) * nx + (camera[1] - cy) * ny + (camera[2] - cz) * nz > 0;
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
