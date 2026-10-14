/**
 * The yard-span rule (docs/policies/local-rules.md: nothing stands between the camera and the stock), on geometry only.
 * Bound: it pins the inner-face test, the bench exemption and the yard-off case on a hand-made span list and on the three-quarter, front and back camera positions of src/viewer/presets.ts; whether the page hides the groups it built is the e2e suite's job (tests/e2e/yard.spec.ts).
 */
import { describe, expect, it } from 'vitest';

import { PRESETS } from './presets';
import type { SpanGeometry } from './yard-spans';
import { cameraOutside, hiddenSpans, outwardNormal } from './yard-spans';

/** Hand-made spans, each with its inner face. */
const SPANS: readonly SpanGeometry[] = [
  { id: 'wall-left', centre: [-4.5, 2, 0.5], normal: [-1, 0, 0], faces: [{ normal: [-1, 0, 0], inner: 4.5 }], cameraHides: true },
  { id: 'wall-right', centre: [4.5, 2, 0.5], normal: [1, 0, 0], faces: [{ normal: [1, 0, 0], inner: 4.5 }], cameraHides: true },
  { id: 'wall-back', centre: [0, 2, -3.5], normal: [0, 0, -1], faces: [{ normal: [0, 0, -1], inner: 3.5 }], cameraHides: true },
  { id: 'scaffold-front', centre: [0, 2.4, 1.67], normal: [0, 0, 1], faces: [{ normal: [0, 0, 1], inner: 1.1 }], cameraHides: true },
  { id: 'scaffold-left', centre: [-2.0, 2.4, -0.1], normal: [-1, 0, 0], faces: [{ normal: [-1, 0, 0], inner: 1.4 }], cameraHides: true },
  { id: 'scaffold-right', centre: [2.0, 2.4, -0.1], normal: [1, 0, 0], faces: [{ normal: [1, 0, 0], inner: 1.4 }], cameraHides: true },
  { id: 'scaffold-back', centre: [0, 2.4, -1.1], normal: [0, 0, -1], faces: [{ normal: [0, 0, -1], inner: 0.85 }], cameraHides: true },
  { id: 'bench', centre: [-2.0, 0.4, 1.3], normal: outwardNormal([-2.0, 0.4, 1.3]), faces: [{ normal: [-1, 0, 0], inner: 1.6 }], cameraHides: false },
];

function presetPosition(id: string): readonly [number, number, number] {
  const preset = PRESETS.find((item) => item.id === id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  return preset.pose.position;
}

describe('cameraOutside', () => {
  it('is whether the camera lies past the inner face along the outward normal', () => {
    const wall = SPANS[1];
    if (wall === undefined) throw new Error('no wall');
    expect(cameraOutside(wall, [7, 4, 8])).toBe(true);
    expect(cameraOutside(wall, [4.5, 4, 8])).toBe(false);
    expect(cameraOutside(wall, [0, 4, 8])).toBe(false);
    expect(cameraOutside(wall, [-7, 4, 8])).toBe(false);
  });

  it('counts a camera on the deck, short of the span centre but past its inner face, as outside', () => {
    const right = SPANS[5];
    if (right === undefined) throw new Error('no right scaffold');
    expect(cameraOutside(right, [1.6, 3.4, 0])).toBe(true);
    expect(cameraOutside(right, [1.3, 3.4, 0])).toBe(false);
  });
});

describe('hiddenSpans', () => {
  it('hides the front and right spans from the three-quarter preset and keeps the back and left', () => {
    expect(hiddenSpans(SPANS, presetPosition('three-quarter'), true)).toEqual(['wall-right', 'scaffold-front', 'scaffold-right']);
  });

  it('hides only the front scaffold from the front preset, and the back wall and back bridges from the back preset', () => {
    expect(hiddenSpans(SPANS, presetPosition('front'), true)).toEqual(['scaffold-front']);
    expect(hiddenSpans(SPANS, presetPosition('back'), true)).toEqual(['wall-back', 'scaffold-back']);
  });

  it('never hides the bench for the camera', () => {
    expect(hiddenSpans(SPANS, [-8, 1, 6], true)).not.toContain('bench');
    expect(hiddenSpans(SPANS, [-8, 1, 6], true)).toEqual(['wall-left', 'scaffold-front', 'scaffold-left']);
  });

  it('hides every span, the bench included, when the yard is off', () => {
    expect(hiddenSpans(SPANS, [0, 3, 10], false)).toEqual(SPANS.map((span) => span.id));
  });
});

describe('outwardNormal', () => {
  it('points from the block centre line toward the centre, horizontally, and +z on the line', () => {
    expect(outwardNormal([3, 2, 4])).toEqual([0.6, 0, 0.8]);
    expect(outwardNormal([0, 5, 0])).toEqual([0, 0, 1]);
    const [x, y, z] = outwardNormal([-2, 1, 1.3]);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    expect(x).toBeLessThan(0);
    expect(z).toBeGreaterThan(0);
  });
});
