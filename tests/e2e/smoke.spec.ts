/**
 * Smoke test of the capture contract (docs/design/spec.md, Query contract): `/?shot=1` loads on the dev server, draws one canvas of 1400×1000 CSS pixels at a 1400×1000 viewport, reports `window.__shotReady`, is not blank, exposes `window.__sculpture`, and logs no console error or uncaught exception.
 * Bound: it proves the toolchain, the WebGL path and the contract's plumbing; "not blank" means the sampled pixels are not all one colour, which says nothing about what was drawn. It does not test the built `dist/`.
 */
import { expect, test } from '@playwright/test';

const VIEWPORT = { width: 1400, height: 1000 } as const;
/** Sample points as fractions of the canvas: the sky at the top corners, the yard at the bottom, the block near the centre. */
const SAMPLE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0.1, 0.1],
  [0.9, 0.1],
  [0.5, 0.5],
  [0.1, 0.9],
  [0.9, 0.9],
  [0.5, 0.97],
];

test.use({ viewport: VIEWPORT });

test('/?shot=1 draws the yard and block to a 1400x1000 canvas, reaches shot-ready and exposes the facts', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    problems.push(`uncaught exception: ${error.message}`);
  });

  const response = await page.goto('/?shot=1');
  expect(response?.status(), 'GET /?shot=1').toBe(200);

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => window.__shotReady === true);

  const box = await canvas.boundingBox();
  if (box === null) throw new Error('the canvas has no bounding box, so it is not laid out');
  expect({ width: Math.round(box.width), height: Math.round(box.height) }, 'canvas size in CSS pixels').toEqual(VIEWPORT);

  // Copy the WebGL canvas into a 2D canvas and read a few pixels; preserveDrawingBuffer keeps the frame readable after it is presented.
  const colours = await page.evaluate((points) => {
    const source = document.querySelector('canvas');
    if (!(source instanceof HTMLCanvasElement)) throw new Error('no canvas on the page');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d');
    if (context === null) throw new Error('no 2d context for the pixel copy');
    context.drawImage(source, 0, 0);
    return points.map(([fx, fy]) => {
      const x = Math.floor(fx * (copy.width - 1));
      const y = Math.floor(fy * (copy.height - 1));
      return Array.from(context.getImageData(x, y, 1, 1).data).join(',');
    });
  }, SAMPLE_POINTS);
  expect(new Set(colours).size, `sampled colours ${colours.join(' | ')}`).toBeGreaterThan(1);
  expect(colours, 'no sampled pixel is transparent black, the colour of an undrawn canvas').not.toContain('0,0,0,0');

  const facts = await page.evaluate(() => window.__sculpture);
  expect(facts).toMatchObject({ stepIds: [], stepTitles: [], stepStages: [], stages: [], N: 0, t: 0, planLength: 0, blowsApplied: 0, dirtyChunks: 0, queryProblems: [] });

  expect(problems, 'problems while loading /?shot=1').toEqual([]);
});
