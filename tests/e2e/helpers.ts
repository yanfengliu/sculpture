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

/** Loads `/?<query>` and waits for the first published facts and two rendered frames. */
export async function openPage(page: Page, query: string): Promise<void> {
  const response = await page.goto(`/?${query}`);
  if (response === null || response.status() !== 200) throw new Error(`GET /?${query} answered ${String(response?.status())}, not 200`);
  await page.waitForFunction(() => window.__sculpture !== undefined);
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

/** Waits until neither playback nor a step animation moves `t`, then for two frames so the canvas shows the rest state. */
export async function waitUntilStill(page: Page, timeout = 15_000): Promise<SculptureFacts> {
  await page.waitForFunction(() => window.__sculpture?.moving === false, undefined, { timeout });
  await waitFrames(page, 2);
  return facts(page);
}

/** SHA-256 of the WebGL canvas pixels, copied through a 2D canvas (preserveDrawingBuffer keeps the frame readable). */
export async function canvasHash(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const source = document.querySelector('canvas');
    if (!(source instanceof HTMLCanvasElement)) throw new Error('no canvas on the page');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d');
    if (context === null) throw new Error('no 2d context for the pixel copy');
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
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
