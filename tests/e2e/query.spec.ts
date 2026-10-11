/**
 * The query contract as the page honours it (docs/design/spec.md, Query contract): `noui=1`, `autoplay=0` and the default autoplay, `t=`, `step=` by index and by id, `view=`, `cam=` over `view=`, `finish=1`, `shot=1`, and the problems the page reports for values it cannot honour.
 * Bound: against the development stub (N = 9, step ids of src/viewer/stub-making.ts); the parser itself is pinned by src/viewer/query.test.ts.
 */
import { expect, test } from '@playwright/test';

import { VIEWPORT, canvasHash, facts, labelAndScrubber, openPage, waitFrames } from './helpers';

test.use({ viewport: VIEWPORT });

test('noui=1 builds no chrome but keeps the canvas and the keyboard', async ({ page }) => {
  await openPage(page, 'noui=1&autoplay=0');
  await expect(page.getByTestId('chrome')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.keyboard.press(' ');
  expect((await facts(page)).playing).toBe('forward');
});

test('the first load plays forward from t = 0; autoplay=0 keeps it still', async ({ page }) => {
  await openPage(page, '');
  expect((await facts(page)).playing).toBe('forward');
  await page.waitForFunction(() => (window.__sculpture?.t ?? 0) > 0);
  await openPage(page, 'autoplay=0');
  const still = await facts(page);
  expect(still).toMatchObject({ playing: null, t: 0, moving: false });
  await waitFrames(page, 20);
  expect((await facts(page)).t).toBe(0);
});

test('t= sets the position; step= by index or id wins over it; a step the making lacks is reported', async ({ page }) => {
  await openPage(page, 'autoplay=0&t=3.5');
  expect((await facts(page)).t).toBe(3.5);
  expect(await labelAndScrubber(page)).toMatchObject({ scrubber: '3.5' });
  await expect(page.getByTestId('label')).toHaveText(/Coarse claw — Combing the masses with the claw$/);

  await openPage(page, 'autoplay=0&step=3&t=1');
  expect((await facts(page)).t).toBe(3);
  await openPage(page, 'autoplay=0&step=drill-hair');
  expect((await facts(page)).t).toBe(6);
  // The end of the drilling step is the rest position before rasping, so the label names the step about to start.
  await expect(page.getByTestId('label')).toHaveText(/Rasping — Rasps and files over the flesh$/);

  await openPage(page, 'autoplay=0&step=no-such-step&t=2');
  const missing = await facts(page);
  expect(missing.t).toBe(2);
  expect(missing.queryProblems).toEqual([expect.stringContaining('query parameter step="no-such-step" was ignored')]);
  await openPage(page, 'autoplay=0&step=99');
  expect((await facts(page)).queryProblems).toEqual(['query parameter step="99" was ignored: it takes a step id or a 1-based index from 1 to 9.']);
  await openPage(page, 'autoplay=0&t=99');
  expect((await facts(page)).t).toBe(9);
});

test('view= picks a preset, cam= wins over it, and an unknown view is reported', async ({ page }) => {
  await openPage(page, 'autoplay=0&view=front');
  expect((await facts(page)).view).toBe('front');
  await expect(page.getByTestId('view-menu')).toHaveValue('front');
  await waitFrames(page, 3);
  const front = await canvasHash(page);

  await openPage(page, 'autoplay=0&view=head');
  await waitFrames(page, 3);
  const head = await canvasHash(page);
  expect(head).not.toBe(front);

  // The front preset's pose as an explicit camera: cam wins, so the canvas matches the front view, not the head view.
  await openPage(page, 'autoplay=0&view=head&cam=0,3.2,10.5,0,2.75,0');
  const explicit = await facts(page);
  expect(explicit.view).toBe('free');
  expect(explicit.queryProblems).toEqual([]);
  await waitFrames(page, 3);
  expect(await canvasHash(page)).toBe(front);

  await openPage(page, 'autoplay=0&view=sideways');
  const unknown = await facts(page);
  expect(unknown.view).toBe('three-quarter');
  expect(unknown.queryProblems).toEqual(['query parameter view="sideways" was ignored: it takes one of front, back, left, right, three-quarter, head, hands, sling-and-stump, free or follow.']);
});

test('finish=1 starts in the finish-code view with the toggle pressed', async ({ page }) => {
  await openPage(page, 'autoplay=0&finish=1');
  expect((await facts(page)).finish).toBe(true);
  await expect(page.getByTestId('finish-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('finish-legend')).toBeVisible();
});

test('shot=1 never plays, reports ready and frames the working tip for view=follow', async ({ page }) => {
  await openPage(page, 'shot=1&t=2.5&view=follow');
  await page.waitForFunction(() => window.__shotReady === true);
  const shot = await facts(page);
  expect(shot).toMatchObject({ playing: null, moving: false, t: 2.5, view: 'follow', queryProblems: [] });
  await openPage(page, 'shot=1&t=2&view=follow');
  await page.waitForFunction(() => window.__shotReady === true);
  expect((await facts(page)).queryProblems).toEqual(['query parameter view="follow" was ignored: no blow is in progress at t=2; it takes a t inside a step.']);
});
