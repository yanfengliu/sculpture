/**
 * The yard spans through the real controls (docs/design/spec.md, Page, Yard spans; docs/policies/local-rules.md: nothing stands between the camera and the stock): the spans between the camera and the block are hidden per preset, the Yard toggle and `yard=0` hide every span, and the facts name what is hidden.
 * Bound: on the synthetic figure at `t = 0`, from the three-quarter, back and front presets of src/viewer/presets.ts and the span ids of src/viewer/yard-spans.ts; it proves the page hides and shows the groups the rule names and that the canvas changes, not that no pixel of a far span crosses the figure.
 */
import { expect, test } from '@playwright/test';

import { YARD_SPAN_IDS } from '../../src/viewer/yard-spans';
import { VIEWPORT, canvasBlocks, expectDifferentCanvas, facts, openPage, waitFrames } from './helpers';

test.use({ viewport: VIEWPORT });

test('from the three-quarter preset the front and right spans are hidden and the back and left shown; the back preset flips them', async ({ page }) => {
  await openPage(page, 'autoplay=0');
  const threeQuarter = await facts(page);
  expect(threeQuarter.view).toBe('three-quarter');
  expect(threeQuarter.yard).toBe(true);
  expect(threeQuarter.hiddenSpans).toEqual(['wall-right', 'scaffold-front', 'scaffold-right']);

  await page.getByTestId('view-menu').selectOption('back');
  expect((await facts(page)).hiddenSpans).toEqual(['wall-back']);
  await page.getByTestId('view-menu').selectOption('front');
  expect((await facts(page)).hiddenSpans).toEqual(['scaffold-front']);
});

test('the Yard toggle hides every span, the bench included, and shows the far ones again', async ({ page }) => {
  await openPage(page, 'autoplay=0&view=front');
  const yard = page.getByTestId('yard-toggle');
  await expect(yard).toHaveAttribute('aria-pressed', 'true');
  await waitFrames(page, 2);
  const withYard = await canvasBlocks(page);

  await yard.click();
  await expect(yard).toHaveAttribute('aria-pressed', 'false');
  const hidden = await facts(page);
  expect(hidden.yard).toBe(false);
  expect(hidden.hiddenSpans).toEqual([...YARD_SPAN_IDS]);
  await waitFrames(page, 2);
  expectDifferentCanvas(await canvasBlocks(page), withYard);

  await yard.click();
  await expect(yard).toHaveAttribute('aria-pressed', 'true');
  const shown = await facts(page);
  expect(shown.yard).toBe(true);
  expect(shown.hiddenSpans).toEqual(['scaffold-front']);
});

test('yard=0 loads with every span hidden and the toggle released', async ({ page }) => {
  await openPage(page, 'autoplay=0&yard=0');
  const loaded = await facts(page);
  expect(loaded.yard).toBe(false);
  expect(loaded.hiddenSpans).toEqual([...YARD_SPAN_IDS]);
  expect(loaded.queryProblems).toEqual([]);
  await expect(page.getByTestId('yard-toggle')).toHaveAttribute('aria-pressed', 'false');
});
