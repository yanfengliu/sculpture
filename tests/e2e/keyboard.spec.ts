/**
 * The keyboard shortcuts through real key presses (docs/design/spec.md, Page, Keyboard): Space play/pause, Shift+Space play backward, → step forward, ← step back, Home start, End end, each checked against the facts and the label.
 * Bound: positions and labels come from the step list the page publishes (helpers.ts, `stepData`), so the test holds for any making with at least two steps on the synthetic figure; keys are pressed with the body focused, as a viewer who has not clicked a control would press them, and after a mouse scrub and on the scrubber focused from the keyboard, where Space still plays. The step status line is checked for its text, not for what a screen reader says.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, escapeRegex, facts, labelAndScrubber, openPage, stepData, waitUntilStill } from './helpers';

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

test('after a mouse scrub, → steps and Space plays instead of the scrubber taking them', async ({ page }) => {
  await openPage(page, 'autoplay=0');
  const scrubber = page.getByTestId('scrubber');
  const box = await scrubber.boundingBox();
  if (box === null) throw new Error('the scrubber has no bounding box');
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  const scrubbed = await facts(page);
  expect(scrubbed.t).toBeGreaterThan(0);
  await expect(scrubber).not.toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect((await waitUntilStill(page)).t).toBe(Math.ceil(scrubbed.t));
  await page.keyboard.press(' ');
  expect((await facts(page)).playing).toBe('forward');
  await page.keyboard.press(' ');
  expect((await facts(page)).playing).toBeNull();
});

test('Space on the scrubber focused from the keyboard plays, and its arrows stay its own', async ({ page }) => {
  await openPage(page, 'autoplay=0&t=1');
  await page.getByTestId('scrubber').focus();
  await page.keyboard.press('ArrowRight');
  expect((await facts(page)).t).toBeCloseTo(1.001, 6);
  await page.keyboard.press(' ');
  expect((await facts(page)).playing).toBe('forward');
  await page.keyboard.press(' ');
  expect((await facts(page)).playing).toBeNull();
});

test('the label is not a live region; the step status is, and names only the step', async ({ page }) => {
  await openPage(page, 'autoplay=0&t=1.5');
  const steps = await stepData(page);
  await expect(page.getByTestId('label')).not.toHaveAttribute('aria-live');
  const title = steps.stepTitles[steps.stepIndexAt(1.5)] ?? '';
  await expect(page.getByRole('status')).toHaveText(new RegExp(`^[^·]+ — ${escapeRegex(title)}$`));
});

test('keys typed into the speed select are left to the select', async ({ page }) => {
  await openPage(page, 'autoplay=0');
  await page.getByTestId('speed').focus();
  await page.keyboard.press('End');
  expect((await facts(page)).t).toBe(0);
});
