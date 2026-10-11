/**
 * A software rasteriser for the pipeline's check images: orthographic views of the normalised mesh, a z-buffer over every triangle, Lambert shading from the face normal with a headlight and a key light, written as 8-bit grey.
 * Views are named by the side of the figure the camera sees: `front` looks along −Z at the face (world +X on the image's right, as a viewer facing the statue sees its left side on their right), `back` along +Z, `left` from +X at the figure's left flank (its front on the image's left), `right` from −X, `top` from +Y with the figure's front at the bottom of the image.
 * Back faces shade to black, so a hole in the shell shows as a dark patch where the inside of the far wall is seen.
 */
import { faceNormal } from './stl.mjs';

/** Camera bases: `forward` is the viewing direction (depth grows along it), `up` the image's up; right = forward × up. */
export const VIEWS = Object.freeze({
  front: { forward: [0, 0, -1], up: [0, 1, 0] },
  back: { forward: [0, 0, 1], up: [0, 1, 0] },
  left: { forward: [-1, 0, 0], up: [0, 1, 0] },
  right: { forward: [1, 0, 0], up: [0, 1, 0] },
  top: { forward: [0, -1, 0], up: [0, 0, -1] },
});

const MARGIN_FRACTION = 0.04;
const BACKGROUND = 0;
const AMBIENT = 0.12;
const HEADLIGHT = 0.6;
const KEY = 0.28;

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Renders one view of `positions` (9 per triangle, world metres) into a `width × height` grey image, fitting the whole mesh with a margin.
 * @param {Float32Array} positions
 * @param {{ forward: number[], up: number[] }} view
 * @param {number} width
 * @param {number} height
 * @returns {{ pixels: Uint8Array, metresPerPixel: number, covered: number }}
 */
export function renderView(positions, view, width, height) {
  const forward = view.forward;
  const up = view.up;
  const right = cross(forward, up);
  const triangles = positions.length / 9;
  const screen = new Float64Array(triangles * 9);
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const p = [positions[i], positions[i + 1], positions[i + 2]];
    const sx = dot(p, right);
    const sy = dot(p, up);
    screen[i] = sx;
    screen[i + 1] = sy;
    screen[i + 2] = dot(p, forward);
    if (sx < xmin) xmin = sx;
    if (sx > xmax) xmax = sx;
    if (sy < ymin) ymin = sy;
    if (sy > ymax) ymax = sy;
  }
  const scale = Math.min((width * (1 - 2 * MARGIN_FRACTION)) / (xmax - xmin || 1), (height * (1 - 2 * MARGIN_FRACTION)) / (ymax - ymin || 1));
  const offsetX = (width - (xmax - xmin) * scale) / 2;
  const offsetY = (height - (ymax - ymin) * scale) / 2;
  const depth = new Float32Array(width * height).fill(Infinity);
  const shade = new Float32Array(width * height).fill(-1);
  const key = normalise3([-0.5, 0.8, 0.4]);
  const toCamera = [-forward[0], -forward[1], -forward[2]];
  for (let t = 0; t < triangles; t += 1) {
    const b = t * 9;
    const x0 = (screen[b] - xmin) * scale + offsetX;
    const y0 = height - 1 - ((screen[b + 1] - ymin) * scale + offsetY);
    const x1 = (screen[b + 3] - xmin) * scale + offsetX;
    const y1 = height - 1 - ((screen[b + 4] - ymin) * scale + offsetY);
    const x2 = (screen[b + 6] - xmin) * scale + offsetX;
    const y2 = height - 1 - ((screen[b + 7] - ymin) * scale + offsetY);
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) continue;
    const normal = faceNormal(positions, b);
    const facing = dot(normal, toCamera);
    const lit = facing <= 0 ? 0 : AMBIENT + HEADLIGHT * facing + KEY * Math.max(0, dot(normal, key));
    const px0 = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const px1 = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
    const py0 = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const py1 = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
    const sign = area > 0 ? 1 : -1;
    const z0 = screen[b + 2];
    const z1 = screen[b + 5];
    const z2 = screen[b + 8];
    for (let py = py0; py <= py1; py += 1) {
      for (let px = px0; px <= px1; px += 1) {
        const w0 = sign * ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py));
        const w1 = sign * ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py));
        const w2 = sign * ((x0 - px) * (y1 - py) - (x1 - px) * (y0 - py));
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = (w0 * z0 + w1 * z1 + w2 * z2) / (sign * area);
        const index = py * width + px;
        if (z < depth[index]) {
          depth[index] = z;
          shade[index] = lit;
        }
      }
    }
  }
  const pixels = new Uint8Array(width * height).fill(BACKGROUND);
  let covered = 0;
  for (let i = 0; i < pixels.length; i += 1) {
    if (shade[i] < 0) continue;
    covered += 1;
    pixels[i] = 16 + Math.round(239 * Math.min(1, shade[i]));
  }
  return { pixels, metresPerPixel: 1 / scale, covered };
}

function normalise3(v) {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}
