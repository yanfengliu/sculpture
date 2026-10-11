/**
 * What the capture scripts share (scripts/capture-shots.mjs, scripts/sweep.mjs, scripts/export-video.mjs): a headless page on the installed Chrome, the `?shot=1` contract of docs/design/spec.md (wait for `window.__shotReady`, read `window.__sculpture`), and one function that captures one URL to one PNG.
 * Node only; nothing here runs in the page.
 */
import { chromium } from '@playwright/test';

import { BROWSER_ARGS, BROWSER_CHANNEL } from '../harness.mjs';

export const READY_TIMEOUT_MS = 30_000;

/** True when the dev server answers at `base`. */
export async function serverReachable(base) {
  try {
    const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** The message a script prints when no server answers; `port` is what SCULPTURE_PORT selects. */
export function noServerMessage(name, base) {
  return `${name}: no dev server answers at ${base}/. Start one with \`npm run dev\` (port 5181 unless SCULPTURE_PORT is set), or point SHOT_BASE at the one to capture.`;
}

/**
 * Opens a headless page of `width` × `height` CSS pixels at device scale 1 and collects its console errors and warnings.
 * Returns `{ browser, page, errors, warnings, close }`; `errors` and `warnings` are reset by `capture` per shot.
 */
export async function openCapturePage({ width, height }) {
  const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true, args: [...BROWSER_ARGS] });
  let page;
  try {
    page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  } catch (error) {
    // A browser without a page would outlive the script; close it before reporting why the page could not open.
    await browser.close();
    throw error;
  }
  const errors = [];
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    else if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return {
    browser,
    page,
    errors,
    warnings,
    async close() {
      await browser.close();
    },
  };
}

/** Loads `url`, waits for the page's own ready flag and returns the facts; throws on a timeout. */
export async function loadReady(page, url, timeout = READY_TIMEOUT_MS) {
  await page.goto(url, { waitUntil: 'load', timeout });
  // String expressions, evaluated in the page: `window` is the browser's, not this script's.
  await page.waitForFunction('window.__shotReady === true', undefined, { timeout });
  return page.evaluate('window.__sculpture ?? null');
}

/** Seeks an already loaded `?shot=1` page to `t` through its capture seek and waits for the new state to render. */
export async function seekReady(page, t, timeout = READY_TIMEOUT_MS) {
  await page.evaluate(`window.__shotSeek(${JSON.stringify(t)})`);
  await page.waitForFunction('window.__shotReady === true', undefined, { timeout });
  return page.evaluate('window.__sculpture ?? null');
}

/** The timeline position `url` asks for with `t=`, or null when it asks for none or names a `step=` (which wins over `t=`). */
export function requestedT(url) {
  const params = new URL(url).searchParams;
  if (params.has('step')) return null;
  const text = params.get('t');
  if (text === null || text.trim() === '') return null;
  const t = Number(text);
  return Number.isFinite(t) ? t : null;
}

/** Positions within this much of each other count as the same `t`: the page publishes the player's double, the URL a decimal string. */
export const T_TOLERANCE = 1e-6;

/**
 * Captures `url` to `file`. Returns `{ status, errors, warnings, facts }` with `status` one of `ready`, `IGNORED` (the page ignored a parameter, so this is not the shot that was asked for), `WRONG-T` (the page rendered another position than `t=` asked for) or `TIMEOUT`.
 * The PNG is written whatever the status, so a failed shot can still be looked at.
 */
export async function capture(capturePage, url, file) {
  const { page, errors, warnings } = capturePage;
  errors.length = 0;
  warnings.length = 0;
  let status = 'ready';
  let facts = null;
  try {
    facts = await loadReady(page, url);
    const ignored = facts?.queryProblems ?? [];
    if (ignored.length > 0) {
      status = 'IGNORED';
      errors.push(...ignored);
    }
    const asked = requestedT(url);
    if (asked !== null && status === 'ready' && Math.abs((facts?.t ?? Number.NaN) - asked) > T_TOLERANCE) {
      status = 'WRONG-T';
      errors.push(`the page rendered t=${JSON.stringify(facts?.t)}, not the requested t=${String(asked)}`);
    }
  } catch (error) {
    status = 'TIMEOUT';
    errors.push(error instanceof Error ? error.message : String(error));
  }
  await page.screenshot({ path: file, type: 'png' });
  return { status, errors: [...errors], warnings: warnings.filter((warning) => !errors.includes(warning)), facts };
}

/** One console line per shot, in the form the capture gate's reader expects. */
export function describeResult(result, file, url) {
  const notes = [result.errors.length > 0 ? `ERRORS: ${result.errors.join(' | ')}` : '', result.warnings.length > 0 ? `warnings: ${result.warnings.join(' | ')}` : ''].filter((note) => note !== '');
  return `${result.status.padEnd(7)} ${file}  <- ${url}${notes.length > 0 ? `  ${notes.join('  ')}` : ''}`;
}
