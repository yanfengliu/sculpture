/**
 * The keyboard shortcuts through real key presses (docs/design/spec.md, Page, Keyboard): Space play/pause, Shift+Space play backward, → step forward, ← step back, Home start, End end, each checked against the facts and the label.
 * Bound: against the development stub (N = 9, step 0 of weight 0.5); keys are pressed with the body focused, as a viewer who has not clicked a control would press them.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, facts, labelAndScrubber, openPage, waitUntilStill } from './helpers';

const N = 9;

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
  await page.getByTestId('speed').selectOption('4');
  await page.getByTestId('speed').blur();
  await page.keyboard.press('ArrowRight');
  expect((await facts(page)).moving).toBe(true);
  expect((await waitUntilStill(page)).t).toBe(1);
  await expect(page.getByTestId('label')).toHaveText(/Laying the figure out — Drawing the principal view on the front$/);
  await page.keyboard.press('ArrowLeft');
  expect((await waitUntilStill(page)).t).toBe(0);
  expect((await labelAndScrubber(page)).scrubber).toBe('0');
});

test('End jumps to the end and Home back to the start', async ({ page }) => {
  await openPage(page, 'autoplay=0');
  await page.keyboard.press('End');
  expect((await facts(page)).t).toBe(N);
  expect(await labelAndScrubber(page)).toMatchObject({ scrubber: String(N) });
  await expect(page.getByTestId('label')).toHaveText(/On site in the Piazza — Gilding the sling and the stump$/);
  await page.keyboard.press('Home');
  expect((await facts(page)).t).toBe(0);
  await expect(page.getByTestId('label')).toHaveText(/^Day 1 · 13 September 1501 · The Giant in the yard/);
});

test('keys typed into the speed select are left to the select', async ({ page }) => {
  await openPage(page, 'autoplay=0');
  await page.getByTestId('speed').focus();
  await page.keyboard.press('End');
  expect((await facts(page)).t).toBe(0);
});
