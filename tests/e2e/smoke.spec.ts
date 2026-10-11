/**
 * Smoke test of the capture contract (docs/design/spec.md, Query contract): `/?shot=1` loads on the dev server, draws one canvas of 1400×1000 CSS pixels at a 1400×1000 viewport, reports `window.__shotReady`, is not blank, exposes `window.__sculpture` with a making in it, labels the first step as Day 1 of 9 September 1501 (the first chisel blows, src/ui/label.ts), and logs no console error or uncaught exception.
 * Bound: it proves the toolchain, the WebGL path and the contract's plumbing on the synthetic figure; "not blank" means the sampled pixels are not all one colour, which says nothing about what was drawn. It does not test the built `dist/`. The making is whatever src/main.ts boots; the test asks only that it has steps whose first one starts on the day origin.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, collectProblems, samplePixels } from './helpers';

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
  const problems = collectProblems(page);

  const response = await page.goto('/?shot=1&model=synthetic');
  expect(response?.status(), 'GET /?shot=1&model=synthetic').toBe(200);

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => window.__shotReady === true);

  const box = await canvas.boundingBox();
  if (box === null) throw new Error('the canvas has no bounding box, so it is not laid out');
  expect({ width: Math.round(box.width), height: Math.round(box.height) }, 'canvas size in CSS pixels').toEqual(VIEWPORT);

  const colours = await samplePixels(page, SAMPLE_POINTS);
  expect(new Set(colours).size, `sampled colours ${colours.join(' | ')}`).toBeGreaterThan(1);
  expect(colours, 'no sampled pixel is transparent black, the colour of an undrawn canvas').not.toContain('0,0,0,0');

  const facts = await page.evaluate(() => window.__sculpture);
  expect(facts).toMatchObject({ t: 0, blowsApplied: 0, dirtyChunks: 0, playing: null, queryProblems: [] });
  expect(facts?.N).toBeGreaterThan(0);
  expect(facts?.stepIds).toHaveLength(facts?.N ?? -1);
  expect(facts?.stepTitles).toHaveLength(facts?.N ?? -1);
  expect(facts?.stepStages).toHaveLength(facts?.N ?? -1);
  expect(facts?.stages.length).toBeGreaterThan(0);
  expect(facts?.planLength).toBeGreaterThan(0);
  expect(facts?.planDigest).toMatch(/^[0-9a-f]{8,}$/);
  await expect(page.getByTestId('label')).toHaveText(new RegExp(`^Day 1 · 9 September 1501 · .+ — ${(facts?.stepTitles[0] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.getByTestId('attribution')).toBeVisible();
  await expect(page.getByTestId('time-lapse')).toContainText('Time-lapse');

  expect(problems, 'problems while loading /?shot=1').toEqual([]);
});
