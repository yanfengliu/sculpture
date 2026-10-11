/**
 * Shared helpers of the e2e suite: open the page, read the facts, wait for frames or for the player to stand still, hash the canvas and sample its pixels.
 * Everything here reads the page or drives it through the browser; nothing writes page state.
 */
import type { Page } from '@playwright/test';

import type { SculptureFacts } from '../../src/viewer/facts';

export const VIEWPORT = { width: 1400, height: 1000 } as const;

/** Problems a test collects while a page runs: console errors and uncaught exceptions. */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    problems.push(`uncaught exception: ${error.message}`);
  });
  return problems;
}

/** Loads `/?<query>` on the synthetic figure (docs/design/spec.md, Query contract: tests pass `model=synthetic`; a spec that wants the David grid names `model=` itself) and waits for the first published facts and two rendered frames. */
export async function openPage(page: Page, query: string): Promise<void> {
  const full = /(^|&)model=/.test(query) ? query : `model=synthetic${query === '' ? '' : `&${query}`}`;
  const response = await page.goto(`/?${full}`);
  if (response === null || response.status() !== 200) throw new Error(`GET /?${full} answered ${String(response?.status())}, not 200`);
  await page.waitForFunction(() => window.__sculpture !== undefined);
  // The engine meshes the stock in workers after the first facts; a canvas read before every chunk is in would show a partly meshed block.
  await page.waitForFunction(() => window.__sculpture?.dirtyChunks === 0, undefined, { timeout: 60_000 });
  await waitFrames(page, 2);
}

/** The facts after the next frame, so a read that follows an action sees the action's result. */
export async function facts(page: Page): Promise<SculptureFacts> {
  await waitFrames(page, 1);
  const published = await page.evaluate(() => window.__sculpture);
  if (published === undefined) throw new Error('window.__sculpture is not published');
  return published;
}

/** Resolves after `count` animation frames. */
export async function waitFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen += 1;
          if (seen >= frames) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count,
  );
}

/** Waits until neither playback nor a step animation moves `t` and every dirty chunk is meshed, then for two frames so the canvas shows the rest state. */
export async function waitUntilStill(page: Page, timeout = 15_000): Promise<SculptureFacts> {
  await page.waitForFunction(() => window.__sculpture?.moving === false && window.__sculpture.dirtyChunks === 0, undefined, { timeout });
  await waitFrames(page, 2);
  return facts(page);
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The step list the page published, so a spec derives every expected position and label from the making it runs against instead of naming steps (the list changes when the David steps replace the dev steps).
 * `stageStart` is the timeline position of a stage's first step, the stage menu's target; `labelAt` matches the label at `t`: step `floor(t)` (the last step at `t = N`), any day, date and stage title.
 */
export interface StepData {
  readonly N: number;
  readonly stepIds: readonly string[];
  readonly stepTitles: readonly string[];
  readonly stepStages: readonly string[];
  readonly stepWeights: readonly number[];
  readonly stages: readonly string[];
  stageStart(stage: string): number;
  stepIndexAt(t: number): number;
  labelAt(t: number): RegExp;
}

export async function stepData(page: Page): Promise<StepData> {
  const published = await facts(page);
  const { N, stepIds, stepTitles, stepStages, stepWeights, stages } = published;
  if (N < 1 || stepIds.length !== N || stepTitles.length !== N || stepStages.length !== N) throw new Error(`the page published ${String(N)} steps with ${String(stepIds.length)} ids and ${String(stepTitles.length)} titles; a making with matching lists is needed`);
  const stepIndexAt = (t: number): number => Math.max(0, Math.min(N - 1, Math.floor(t)));
  return {
    N,
    stepIds,
    stepTitles,
    stepStages,
    stepWeights,
    stages,
    stageStart(stage) {
      const first = stepStages.indexOf(stage);
      if (first < 0) throw new Error(`no step belongs to stage ${JSON.stringify(stage)}; the stages with steps are ${[...new Set(stepStages)].join(', ')}`);
      return first;
    },
    stepIndexAt,
    labelAt(t) {
      const title = stepTitles[stepIndexAt(t)] ?? '';
      return new RegExp(`^Day \\d+ · \\d{1,2} [A-Z][a-z]+ 150\\d · .+ — ${escapeRegex(title)}$`);
    },
  };
}

/** Side of the blocks `canvasBlocks` averages over, CSS pixels. */
const BLOCK = 10;

/**
 * The canvas as block means: for every BLOCK x BLOCK tile, the mean red, green and blue, 0 to 255 (preserveDrawingBuffer keeps the frame readable through a 2D copy).
 * Two loads of one pose are not byte-identical in headless Chrome (sub-pixel rasterisation noise, measured 2026-10-11: differing SHA-256, block means equal to the byte), so pixel checks compare these means with `compareBlocks`, never raw hashes.
 */
export async function canvasBlocks(page: Page): Promise<number[]> {
  return page.evaluate((block) => {
    const source = document.querySelector('canvas');
    if (!(source instanceof HTMLCanvasElement)) throw new Error('no canvas on the page');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d');
    if (context === null) throw new Error('no 2d context for the pixel copy');
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    const columns = Math.floor(copy.width / block);
    const rows = Math.floor(copy.height / block);
    const means: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let y = 0; y < block; y += 1) {
          for (let x = 0; x < block; x += 1) {
            const index = ((row * block + y) * copy.width + column * block + x) * 4;
            r += pixels[index] ?? 0;
            g += pixels[index + 1] ?? 0;
            b += pixels[index + 2] ?? 0;
          }
        }
        means.push(r / (block * block), g / (block * block), b / (block * block));
      }
    }
    return means;
  }, BLOCK);
}

/** How two block-mean canvases differ: the largest channel difference and the number of blocks whose largest channel difference is over 8 levels. */
export function compareBlocks(a: readonly number[], b: readonly number[]): { maxDiff: number; changedBlocks: number } {
  if (a.length !== b.length) throw new Error(`block arrays differ in length (${String(a.length)} and ${String(b.length)}), so the canvases differ in size`);
  let maxDiff = 0;
  let changedBlocks = 0;
  for (let index = 0; index < a.length; index += 3) {
    const diff = Math.max(Math.abs((a[index] ?? 0) - (b[index] ?? 0)), Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0)), Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0)));
    if (diff > maxDiff) maxDiff = diff;
    if (diff > 8) changedBlocks += 1;
  }
  return { maxDiff, changedBlocks };
}

/** Asserts two canvases show the same picture: no block mean moves by more than 2 levels. */
export function expectSameCanvas(a: readonly number[], b: readonly number[]): void {
  const { maxDiff, changedBlocks } = compareBlocks(a, b);
  if (maxDiff > 2) throw new Error(`the canvases differ: the largest block-mean difference is ${String(maxDiff)} levels and ${String(changedBlocks)} blocks moved by more than 8`);
}

/** Asserts two canvases show different pictures: at least `blocks` block means move by more than 8 levels. */
export function expectDifferentCanvas(a: readonly number[], b: readonly number[], blocks = 40): void {
  const { changedBlocks } = compareBlocks(a, b);
  if (changedBlocks < blocks) throw new Error(`the canvases look the same: only ${String(changedBlocks)} blocks moved by more than 8 levels, fewer than the ${String(blocks)} expected`);
}

/** The RGBA of the canvas at fractions of its size, as `r,g,b,a` strings. */
export async function samplePixels(page: Page, points: ReadonlyArray<readonly [number, number]>): Promise<string[]> {
  return page.evaluate((samples) => {
    const source = document.querySelector('canvas');
    if (!(source instanceof HTMLCanvasElement)) throw new Error('no canvas on the page');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d');
    if (context === null) throw new Error('no 2d context for the pixel copy');
    context.drawImage(source, 0, 0);
    return samples.map(([fx, fy]) => {
      const x = Math.floor(fx * (copy.width - 1));
      const y = Math.floor(fy * (copy.height - 1));
      return Array.from(context.getImageData(x, y, 1, 1).data).join(',');
    });
  }, points);
}

/** The timeline label and the scrubber's value. */
export async function labelAndScrubber(page: Page): Promise<{ label: string; scrubber: string }> {
  const label = (await page.getByTestId('label').textContent()) ?? '';
  const scrubber = await page.getByTestId('scrubber').inputValue();
  return { label, scrubber };
}
