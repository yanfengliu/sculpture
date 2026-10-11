/**
 * The timeline bar and the menus through real input (docs/design/spec.md, Page; Verification): every button, the scrubber by mouse and keyboard, the speed control, the stage menu, the view menu, the follow toggle (and its switch-off on a drag) and the finish toggle, each checked against the label, the scrubber and `window.__sculpture`.
 * Bound: the page runs against the development stub (src/viewer/stub-making.ts), so the step titles, ids and N below are the stub's and change at integration; the test proves the controls drive the player and the facts, not what the canvas shows beyond "it changed".
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, canvasHash, facts, labelAndScrubber, openPage, waitFrames, waitUntilStill } from './helpers';

const N = 9;
const FIRST_LABEL = /^Day 1 · 13 September 1501 · Setup — The block upright, the shed and the scaffold$/;
const LAST_LABEL = /^Day 1092 · 8 September 1504 · On site — Gilding the sling and the stump$/;

test.use({ viewport: VIEWPORT });

test.beforeEach(async ({ page }) => {
  await openPage(page, 'autoplay=0');
});

test('end and start move t to N and 0 with the label and the scrubber following', async ({ page }) => {
  await expect(page.getByTestId('label')).toHaveText(FIRST_LABEL);
  await page.getByRole('button', { name: 'Go to end' }).click();
  expect((await facts(page)).t).toBe(N);
  const atEnd = await labelAndScrubber(page);
  expect(atEnd.label).toMatch(LAST_LABEL);
  expect(atEnd.scrubber).toBe(String(N));
  await page.getByRole('button', { name: 'Go to start' }).click();
  expect((await facts(page)).t).toBe(0);
  const atStart = await labelAndScrubber(page);
  expect(atStart.label).toMatch(FIRST_LABEL);
  expect(atStart.scrubber).toBe('0');
});

test('play/pause starts forward playback, shows Pause and pauses on the second press', async ({ page }) => {
  const playPause = page.getByTestId('play-pause');
  await expect(playPause).toHaveAttribute('aria-label', 'Play');
  await playPause.click();
  await expect(playPause).toHaveAttribute('aria-label', 'Pause');
  expect((await facts(page)).playing).toBe('forward');
  await page.waitForFunction(() => (window.__sculpture?.t ?? 0) > 0.05);
  await playPause.click();
  await expect(playPause).toHaveAttribute('aria-label', 'Play');
  const paused = await facts(page);
  expect(paused.playing).toBeNull();
  await waitFrames(page, 20);
  expect((await facts(page)).t).toBe(paused.t);
  expect((await labelAndScrubber(page)).scrubber).toBe(String(Math.round(paused.t * 1000) / 1000));
});

test('play backward runs t down from a later position and pauses on the second press', async ({ page }) => {
  await openPage(page, 'autoplay=0&t=2');
  const backward = page.getByTestId('play-backward');
  await expect(backward).toHaveAttribute('aria-pressed', 'false');
  await backward.click();
  await expect(backward).toHaveAttribute('aria-pressed', 'true');
  expect((await facts(page)).playing).toBe('backward');
  await page.waitForFunction(() => (window.__sculpture?.t ?? 2) < 1.95);
  await backward.click();
  await expect(backward).toHaveAttribute('aria-pressed', 'false');
  expect((await facts(page)).playing).toBeNull();
});

test('step forward animates to the next integer, a second press retargets, step back returns', async ({ page }) => {
  await page.getByTestId('speed').selectOption('4');
  await page.getByRole('button', { name: 'Step forward' }).click();
  expect((await facts(page)).moving).toBe(true);
  expect((await waitUntilStill(page)).t).toBe(1);
  await expect(page.getByTestId('label')).toHaveText(/Layout — Drawing the principal view on the front$/);
  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  expect((await waitUntilStill(page)).t).toBe(3);
  await page.getByRole('button', { name: 'Step back' }).click();
  expect((await waitUntilStill(page)).t).toBe(2);
  expect((await labelAndScrubber(page)).scrubber).toBe('2');
});

test('the scrubber seeks by mouse and by keyboard and pauses playback', async ({ page }) => {
  const scrubber = page.getByTestId('scrubber');
  await page.getByTestId('play-pause').click();
  const box = await scrubber.boundingBox();
  if (box === null) throw new Error('the scrubber has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const mid = await facts(page);
  expect(mid.playing).toBeNull();
  expect(mid.t).toBeGreaterThan(N / 2 - 0.2);
  expect(mid.t).toBeLessThan(N / 2 + 0.2);
  await expect(page.getByTestId('label')).toHaveText(/Fine claw — The fine claw over the whole figure$/);
  await scrubber.focus();
  await page.keyboard.press('End');
  expect((await facts(page)).t).toBe(N);
  await page.keyboard.press('Home');
  expect((await facts(page)).t).toBe(0);
  await page.keyboard.press('ArrowRight');
  expect((await facts(page)).t).toBeCloseTo(0.001, 6);
  expect((await labelAndScrubber(page)).scrubber).toBe('0.001');
});

test('the speed control sets the player speed and playback follows it', async ({ page }) => {
  const speed = page.getByTestId('speed');
  await expect(speed).toHaveValue('1');
  await speed.selectOption('4');
  expect((await facts(page)).speed).toBe(4);
  await page.getByTestId('play-pause').click();
  // Step 0 has weight 0.5: at 4× it lasts 1.5 s, at 1× six seconds, so passing t = 1 within 3 s proves the faster rate.
  await page.waitForFunction(() => (window.__sculpture?.t ?? 0) > 1, undefined, { timeout: 3_000 });
  await speed.selectOption('0.5');
  expect((await facts(page)).speed).toBe(0.5);
});

test('the stage menu moves to the start of the chosen stage', async ({ page }) => {
  const stageMenu = page.getByTestId('stage-menu');
  await expect(stageMenu).toHaveValue('setup');
  await stageMenu.selectOption('drilling');
  expect((await facts(page)).t).toBe(5);
  await expect(page.getByTestId('label')).toHaveText(/^Day \d+ · \d{1,2} \w+ 150\d · Drilling — Drilling the hair and the pupils$/);
  expect((await labelAndScrubber(page)).scrubber).toBe('5');
  await stageMenu.selectOption('roughing');
  expect((await facts(page)).t).toBe(2);
  await expect(stageMenu).toHaveValue('roughing');
});

test('the view menu applies presets and the canvas changes with each', async ({ page }) => {
  const viewMenu = page.getByTestId('view-menu');
  await expect(viewMenu).toHaveValue('three-quarter');
  const threeQuarter = await canvasHash(page);
  await viewMenu.selectOption('front');
  await waitFrames(page, 2);
  expect((await facts(page)).view).toBe('front');
  const front = await canvasHash(page);
  expect(front).not.toBe(threeQuarter);
  await viewMenu.selectOption('head');
  await waitFrames(page, 2);
  expect((await facts(page)).view).toBe('head');
  expect(await canvasHash(page)).not.toBe(front);
  await viewMenu.selectOption('free');
  expect((await facts(page)).view).toBe('free');
});

test('the follow toggle switches on, is reflected in the facts and switches off when the user drags', async ({ page }) => {
  const follow = page.getByTestId('follow-toggle');
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  expect((await facts(page)).follow).toBe(true);
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(760, 470, { steps: 5 });
  await page.mouse.up();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  const after = await facts(page);
  expect(after.follow).toBe(false);
  expect(after.view).toBe('free');
});

test('the finish toggle shows the finish codes with the legend and changes the canvas', async ({ page }) => {
  const finish = page.getByTestId('finish-toggle');
  const legend = page.getByTestId('finish-legend');
  await expect(legend).toBeHidden();
  const marble = await canvasHash(page);
  await finish.click();
  await expect(finish).toHaveAttribute('aria-pressed', 'true');
  await expect(legend).toBeVisible();
  await expect(legend.getByTestId('finish-polish')).toHaveText('12 polish');
  await waitFrames(page, 2);
  expect((await facts(page)).finish).toBe(true);
  expect(await canvasHash(page)).not.toBe(marble);
  await finish.click();
  await expect(finish).toHaveAttribute('aria-pressed', 'false');
  await expect(legend).toBeHidden();
  expect((await facts(page)).finish).toBe(false);
});
