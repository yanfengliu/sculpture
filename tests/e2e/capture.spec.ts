/**
 * The capture contract against the controls (docs/design/spec.md, Query contract; Blows, strokes and steps): reaching a `t` through the real controls and loading `?shot=1&t=` directly give the same label and the same canvas (block means within 2 levels, see helpers.ts), so a shot is the state a viewer would see.
 * Bound: against the development stub, at the front preset, at integer positions reached by step presses and by the stage menu; it proves the two paths agree, not that either shows the right carving.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, canvasBlocks, expectSameCanvas, facts, openPage, waitFrames, waitUntilStill } from './helpers';

test.use({ viewport: VIEWPORT });

async function shotOf(page: Parameters<typeof openPage>[0], t: number): Promise<{ label: string; blocks: number[] }> {
  await openPage(page, `shot=1&t=${String(t)}&view=front`);
  await page.waitForFunction(() => window.__shotReady === true);
  const shot = await facts(page);
  expect(shot).toMatchObject({ t, queryProblems: [] });
  return { label: (await page.getByTestId('label').textContent()) ?? '', blocks: await canvasBlocks(page) };
}

test('two step presses reach t = 2 with the label and pixels of ?shot=1&t=2', async ({ page }) => {
  await openPage(page, 'autoplay=0&view=front');
  await page.getByTestId('speed').selectOption('4');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  expect((await waitUntilStill(page)).t).toBe(2);
  await waitFrames(page, 3);
  const driven = { label: (await page.getByTestId('label').textContent()) ?? '', blocks: await canvasBlocks(page) };
  const shot = await shotOf(page, 2);
  expect(shot.label).toBe(driven.label);
  expectSameCanvas(driven.blocks, shot.blocks);
});

test('the stage menu reaches t = 5 with the label and pixels of ?shot=1&t=5', async ({ page }) => {
  await openPage(page, 'autoplay=0&view=front');
  await page.getByTestId('stage-menu').selectOption('drilling');
  expect((await facts(page)).t).toBe(5);
  await waitFrames(page, 3);
  const driven = { label: (await page.getByTestId('label').textContent()) ?? '', blocks: await canvasBlocks(page) };
  const shot = await shotOf(page, 5);
  expect(shot.label).toBe(driven.label);
  expectSameCanvas(driven.blocks, shot.blocks);
});
