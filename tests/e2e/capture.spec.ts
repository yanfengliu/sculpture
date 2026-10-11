/**
 * The capture contract against the controls (docs/design/spec.md, Query contract; Blows, strokes and steps): reaching a `t` through the real controls and loading `?shot=1&t=` directly give the same label and the same canvas (block means within 2 levels, see helpers.ts), so a shot is the state a viewer would see.
 * Bound: on the synthetic figure at the front preset, at integer positions reached by step presses (t = 2) and by the stage menu (a stage from the published list); the driven page is read only once every dirty chunk is meshed. It proves the two paths agree, not that either shows the right carving.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, canvasBlocks, expectSameCanvas, facts, openPage, stepData, waitFrames, waitUntilStill } from './helpers';

test.use({ viewport: VIEWPORT });

async function shotOf(page: Parameters<typeof openPage>[0], t: number): Promise<{ label: string; blocks: number[] }> {
  await openPage(page, `shot=1&t=${String(t)}&view=front`);
  await page.waitForFunction(() => window.__shotReady === true);
  const shot = await facts(page);
  expect(shot).toMatchObject({ t, dirtyChunks: 0, queryProblems: [] });
  return { label: (await page.getByTestId('label').textContent()) ?? '', blocks: await canvasBlocks(page) };
}

async function driven(page: Parameters<typeof openPage>[0]): Promise<{ label: string; blocks: number[] }> {
  await waitUntilStill(page);
  await waitFrames(page, 3);
  return { label: (await page.getByTestId('label').textContent()) ?? '', blocks: await canvasBlocks(page) };
}

test('two step presses reach t = 2 with the label and pixels of ?shot=1&t=2', async ({ page }) => {
  test.slow();
  await openPage(page, 'autoplay=0&view=front');
  await page.getByTestId('speed').selectOption('4');
  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  expect((await waitUntilStill(page)).t).toBe(2);
  const reached = await driven(page);
  const shot = await shotOf(page, 2);
  expect(shot.label).toBe(reached.label);
  expectSameCanvas(reached.blocks, shot.blocks);
});

test('the stage menu reaches a stage start with the label and pixels of ?shot=1&t= there', async ({ page }) => {
  test.slow();
  await openPage(page, 'autoplay=0&view=front');
  const steps = await stepData(page);
  // The fourth stage: every blow before it replays on both pages, seconds per stage with the engine.
  const stage = steps.stages[3];
  if (stage === undefined) throw new Error('this test needs a fourth stage');
  const start = steps.stageStart(stage);
  await page.getByTestId('stage-menu').selectOption(stage);
  expect((await facts(page)).t).toBe(start);
  const reached = await driven(page);
  const shot = await shotOf(page, start);
  expect(shot.label).toBe(reached.label);
  expectSameCanvas(reached.blocks, shot.blocks);
});
