/**
 * The keyboard shortcuts through real key presses (docs/design/spec.md, Page, Keyboard): Space play/pause, Shift+Space play backward, → step forward, ← step back, Home start, End end, each checked against the facts and the label.
 * Bound: positions and labels come from the step list the page publishes (helpers.ts, `stepData`), so the test holds for any making with at least two steps on the synthetic figure; keys are pressed with the body focused, as a viewer who has not clicked a control would press them.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, facts, labelAndScrubber, openPage, stepData, waitUntilStill } from './helpers';

test.use({ viewport: VIEWPORT });

test('Space plays forward and pauses; Shift+Space plays backward', async ({ page }) => {
  await openPage(page, 'autoplay=0&t=1');
  await page.keyboard.press(' ');
  expect((await facts(page)).playing).toBe('forward');
  await expect(page.getByTestId('play-pause')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press(' ');
  const paused = await facts(page);
  expect(paused.playing).toBeNull();
  expect(paused.t).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Shift+ ');
  expect((await facts(page)).playing).toBe('backward');
  await expect(page.getByTestId('play-backward')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction((from) => (window.__sculpture?.t ?? from) < from, paused.t);
  await page.keyboard.press(' ');
  expect((await facts(page)).playing).toBeNull();
});

test('→ steps forward to the next integer and ← steps back', async ({ page }) => {
  await openPage(page, 'autoplay=0');
  const steps = await stepData(page);
  await page.getByTestId('speed').selectOption('4');
  await page.getByTestId('speed').blur();
  await page.keyboard.press('ArrowRight');
  expect((await facts(page)).moving).toBe(true);
  expect((await waitUntilStill(page)).t).toBe(1);
  await expect(page.getByTestId('label')).toHaveText(steps.labelAt(1));
  await page.keyboard.press('ArrowLeft');
  expect((await waitUntilStill(page)).t).toBe(0);
  expect((await labelAndScrubber(page)).scrubber).toBe('0');
});

test('End jumps to the end and Home back to the start', async ({ page }) => {
  // The suite's other full jump to N (see controls.spec.ts): the whole plan replays synchronously.
  test.slow();
  await openPage(page, 'autoplay=0');
  const steps = await stepData(page);
  await page.keyboard.press('End');
  expect((await facts(page)).t).toBe(steps.N);
  expect(await labelAndScrubber(page)).toMatchObject({ scrubber: String(steps.N) });
  await expect(page.getByTestId('label')).toHaveText(steps.labelAt(steps.N));
  await page.keyboard.press('Home');
  expect((await facts(page)).t).toBe(0);
  await expect(page.getByTestId('label')).toHaveText(steps.labelAt(0));
});

test('keys typed into the speed select are left to the select', async ({ page }) => {
  await openPage(page, 'autoplay=0');
  await page.getByTestId('speed').focus();
  await page.keyboard.press('End');
  expect((await facts(page)).t).toBe(0);
});
