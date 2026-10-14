/**
 * The timeline bar and the menus through real input (docs/design/spec.md, Page; Verification): every button, the scrubber by mouse and keyboard, the speed control, the stage menu, the view menu, the follow toggle (and its switch-off on a drag) and the finish toggle, each checked against the label, the scrubber and `window.__sculpture`.
 * Bound: every expected position and label is derived from the step list the page publishes (helpers.ts, `stepData`), so the test holds for any making with at least four steps and six stages on the synthetic figure; it proves the controls drive the player and the facts, not what the canvas shows beyond "it changed" or "it did not".
 * Timing: step presses wait at 4× for steps whose weights the facts give; the suite's 15 s wait bounds the first three steps' weights to about 4 in total.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, canvasBlocks, expectDifferentCanvas, facts, labelAndScrubber, openPage, stepData, waitFrames, waitUntilStill } from './helpers';

test.use({ viewport: VIEWPORT });

test.beforeEach(async ({ page }) => {
  await openPage(page, 'autoplay=0');
});

test('end and start move t to N and 0 with the label and the scrubber following', async ({ page }) => {
  // A jump to the end replays the whole plan synchronously (about 18 s on the synthetic figure at 8 mm); one of the suite's two full jumps.
  test.slow();
  const steps = await stepData(page);
  await expect(page.getByTestId('label')).toHaveText(steps.labelAt(0));
  await page.getByRole('button', { name: 'Go to end' }).click();
  expect((await facts(page)).t).toBe(steps.N);
  const atEnd = await labelAndScrubber(page);
  expect(atEnd.label).toMatch(steps.labelAt(steps.N));
  expect(atEnd.scrubber).toBe(String(steps.N));
  await page.getByRole('button', { name: 'Go to start' }).click();
  expect((await facts(page)).t).toBe(0);
  const atStart = await labelAndScrubber(page);
  expect(atStart.label).toMatch(steps.labelAt(0));
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
  const steps = await stepData(page);
  await page.getByTestId('speed').selectOption('4');
  await page.getByRole('button', { name: 'Step forward' }).click();
  expect((await facts(page)).moving).toBe(true);
  expect((await waitUntilStill(page)).t).toBe(1);
  await expect(page.getByTestId('label')).toHaveText(steps.labelAt(1));
  await page.getByRole('button', { name: 'Step forward' }).click();
  await page.getByRole('button', { name: 'Step forward' }).click();
  expect((await waitUntilStill(page)).t).toBe(3);
  await page.getByRole('button', { name: 'Step back' }).click();
  expect((await waitUntilStill(page)).t).toBe(2);
  expect((await labelAndScrubber(page)).scrubber).toBe('2');
});

test('the scrubber seeks by mouse and by keyboard and pauses playback', async ({ page }) => {
  const steps = await stepData(page);
  const scrubber = page.getByTestId('scrubber');
  await page.getByTestId('play-pause').click();
  const box = await scrubber.boundingBox();
  if (box === null) throw new Error('the scrubber has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const mid = await facts(page);
  expect(mid.playing).toBeNull();
  // The thumb's width shifts the click's value by under one percent of the range.
  expect(Math.abs(mid.t - steps.N / 2)).toBeLessThan(0.02 * steps.N + 0.05);
  await expect(page.getByTestId('label')).toHaveText(steps.labelAt(mid.t));
  // Home and an arrow on the focused range input; End is covered by the keyboard spec (a full jump costs seconds with the engine).
  await scrubber.focus();
  await page.keyboard.press('Home');
  expect((await facts(page)).t).toBe(0);
  await page.keyboard.press('ArrowRight');
  expect((await facts(page)).t).toBeCloseTo(0.001, 6);
  expect((await labelAndScrubber(page)).scrubber).toBe('0.001');
});

test('the speed control sets the player speed and playback runs faster than 1×', async ({ page }) => {
  const steps = await stepData(page);
  const weight = steps.stepWeights[0] ?? 1;
  const speed = page.getByTestId('speed');
  await expect(speed).toHaveValue('1');
  await speed.selectOption('4');
  expect((await facts(page)).speed).toBe(4);
  await page.getByTestId('play-pause').click();
  // Past the first blow's approach (which the page stretches to the carry time), inside step 0.
  await page.waitForFunction(() => (window.__sculpture?.t ?? 0) >= 0.2, undefined, { timeout: 10_000 });
  // Step 0 lasts weight × 3 s at 4×; sample a fifth of it and compare with the 1× rate of 1 / (12 × weight) per second.
  const rate = await page.evaluate(async (windowMs) => {
    const t0 = window.__sculpture?.t ?? 0;
    const start = performance.now();
    await new Promise((resolve) => setTimeout(resolve, windowMs));
    return ((window.__sculpture?.t ?? 0) - t0) / ((performance.now() - start) / 1000);
  }, weight * 3 * 1000 * 0.2);
  expect(rate).toBeGreaterThan(2 / (12 * weight));
  await speed.selectOption('0.5');
  expect((await facts(page)).speed).toBe(0.5);
});

test('the stage menu moves to the start of the chosen stage', async ({ page }) => {
  const steps = await stepData(page);
  const stageMenu = page.getByTestId('stage-menu');
  await expect(stageMenu).toHaveValue(steps.stepStages[0] ?? '');
  // The fourth stage, not a late one: a jump replays every blow before it, seconds per stage with the engine.
  const later = steps.stages[3];
  const earlier = steps.stages[2];
  if (later === undefined || earlier === undefined) throw new Error(`the page lists ${String(steps.stages.length)} stages; this test picks the third and the fourth`);
  await stageMenu.selectOption(later);
  const laterStart = steps.stageStart(later);
  expect((await facts(page)).t).toBe(laterStart);
  await expect(page.getByTestId('label')).toHaveText(steps.labelAt(laterStart));
  expect((await labelAndScrubber(page)).scrubber).toBe(String(laterStart));
  await stageMenu.selectOption(earlier);
  expect((await facts(page)).t).toBe(steps.stageStart(earlier));
  await expect(stageMenu).toHaveValue(earlier);
});

test('the view menu applies presets and the canvas changes with each', async ({ page }) => {
  const viewMenu = page.getByTestId('view-menu');
  await expect(viewMenu).toHaveValue('three-quarter');
  const threeQuarter = await canvasBlocks(page);
  await viewMenu.selectOption('front');
  await waitFrames(page, 2);
  expect((await facts(page)).view).toBe('front');
  const front = await canvasBlocks(page);
  expectDifferentCanvas(front, threeQuarter);
  await viewMenu.selectOption('head');
  await waitFrames(page, 2);
  expect((await facts(page)).view).toBe('head');
  expectDifferentCanvas(await canvasBlocks(page), front);
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
  const marble = await canvasBlocks(page);
  await finish.click();
  await expect(finish).toHaveAttribute('aria-pressed', 'true');
  await expect(legend).toBeVisible();
  await expect(legend.getByTestId('finish-polish')).toHaveText('12 polish');
  await waitFrames(page, 2);
  expect((await facts(page)).finish).toBe(true);
  expectDifferentCanvas(await canvasBlocks(page), marble, 10);
  await finish.click();
  await expect(finish).toHaveAttribute('aria-pressed', 'false');
  await expect(legend).toBeHidden();
  expect((await facts(page)).finish).toBe(false);
});

test('Play backward at the start and Play at the end do nothing; Play backward from the end runs', async ({ page }) => {
  // The end button replays the whole plan: one of the suite's full jumps.
  test.slow();
  const backward = page.getByTestId('play-backward');
  const playPause = page.getByTestId('play-pause');
  await backward.click();
  await expect(backward).toHaveAttribute('aria-pressed', 'false');
  await waitFrames(page, 10);
  expect(await facts(page)).toMatchObject({ playing: null, moving: false, t: 0 });
  await page.getByRole('button', { name: 'Go to end' }).click();
  const end = await waitUntilStill(page, 60_000);
  expect(end.t).toBe(end.N);
  await playPause.click();
  await expect(playPause).toHaveAttribute('aria-label', 'Play');
  await waitFrames(page, 10);
  expect(await facts(page)).toMatchObject({ playing: null, moving: false, t: end.N });
  await backward.click();
  expect((await facts(page)).playing).toBe('backward');
});
