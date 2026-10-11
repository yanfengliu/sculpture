/**
 * Bound: renderView is checked on one or two squares built here: the fitted coverage, a lit front face against a black back face, the z-buffer keeping the nearer surface, and the view bases' handedness (right = forward × up gives +X on the right of the front view). Shading values are checked only as lit versus unlit.
 */
import { describe, expect, it } from 'vitest';

import { VIEWS, renderView } from './raster.mjs';

/** A unit square in the plane z = `z`, wound to face +Z; `flip` winds it to face −Z. */
function square(z: number, half = 0.5, flip = false): number[] {
  const a = [-half, -half, z];
  const b = [half, -half, z];
  const c = [half, half, z];
  const d = [-half, half, z];
  return flip ? [...a, ...c, ...b, ...a, ...d, ...c] : [...a, ...b, ...c, ...a, ...c, ...d];
}

const WIDTH = 200;
const HEIGHT = 300;

describe('renderView', () => {
  it('fits the mesh with a 4 percent margin and lights a face turned to the camera', () => {
    const image = renderView(Float32Array.from(square(0)), VIEWS.front, WIDTH, HEIGHT);
    const side = Math.round(WIDTH * 0.92);
    expect(Math.abs(image.covered - side * side)).toBeLessThan(side * 3);
    expect(image.metresPerPixel).toBeCloseTo(1 / side, 6);
    const centre = image.pixels[Math.floor(HEIGHT / 2) * WIDTH + Math.floor(WIDTH / 2)] ?? 0;
    expect(centre).toBeGreaterThan(128);
    expect(image.pixels[0]).toBe(0);
  });

  it('shades a face turned away to near black, so a hole would show as a dark patch', () => {
    const image = renderView(Float32Array.from(square(0)), VIEWS.back, WIDTH, HEIGHT);
    expect(image.pixels[Math.floor(HEIGHT / 2) * WIDTH + Math.floor(WIDTH / 2)]).toBe(16);
  });

  it('keeps the nearer surface in the z-buffer', () => {
    const positions = Float32Array.from([...square(0), ...square(0.5, 0.2, true)]);
    const image = renderView(positions, VIEWS.front, WIDTH, HEIGHT);
    expect(image.pixels[Math.floor(HEIGHT / 2) * WIDTH + Math.floor(WIDTH / 2)]).toBe(16);
    expect(image.pixels[Math.floor(HEIGHT / 2) * WIDTH + 10]).toBeGreaterThan(128);
  });

  it('puts world +X on the right of the front view and on the left of the back view', () => {
    // A lit square with an unlit marker (wound away from the camera, nearer to it) at world x = +0.4, one set per view.
    const shiftX = (values: number[]) => values.map((v, i) => (i % 3 === 0 ? v + 0.4 : v));
    const front = renderView(Float32Array.from([...square(0), ...shiftX(square(0.1, 0.1, true))]), VIEWS.front, WIDTH, HEIGHT);
    const back = renderView(Float32Array.from([...square(0, 0.5, true), ...shiftX(square(-0.1, 0.1))]), VIEWS.back, WIDTH, HEIGHT);
    const row = Math.floor(HEIGHT / 2) * WIDTH;
    const rightSide = row + Math.round(WIDTH * 0.5 + WIDTH * 0.92 * 0.4);
    const leftSide = row + Math.round(WIDTH * 0.5 - WIDTH * 0.92 * 0.4);
    expect(front.pixels[rightSide]).toBe(16);
    expect(front.pixels[leftSide]).toBeGreaterThan(128);
    expect(back.pixels[leftSide]).toBe(16);
    expect(back.pixels[rightSide]).toBeGreaterThan(128);
  });
});
