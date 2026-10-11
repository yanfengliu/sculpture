/**
 * Capture harness: opens the running dev server in headless Chrome through Playwright, waits for the page's own `window.__shotReady` (docs/design/spec.md, Query contract) and writes one PNG per shot into `.shots/` (ignored).
 * The base the page owner extends with the standard set; the visual check in AGENTS.md (Gates) runs it and looks at the PNGs.
 *
 * Usage: node scripts/capture-shots.mjs            with `npm run dev` running in another terminal
 * env:   SHOT_BASE  origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 *        SHOT_OUT   output directory, default .shots
 *        SHOT_W, SHOT_H  viewport in CSS pixels, default 1400 and 1000, at device scale factor 1
 *        SHOT_LIST  shots separated by `;` or whitespace, each `view[:k=v[:k=v…]]`, default `front`; commas stay free for `cam=px,py,pz,tx,ty,tz`.
 *                   Each shot loads `/?shot=1&view=<view>&k=v…` and writes `<view>[_<extras>].png`, so `front; top:cam=0,25,0.01,0,0,0` gives `front.png` and `top_cam-0-25-0.01-0-0-0.png`.
 * A shot whose URL the page partly ignored (`window.__sculpture.queryProblems`, filled by src/viewer/query.ts) is written but counted as a failure: it is not the shot that was asked for.
 * Exit:  0 every shot was ready and whole, 1 a shot timed out, threw, logged an error or had a parameter ignored, 2 the dev server could not be reached.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

import { BROWSER_ARGS, BROWSER_CHANNEL, devOrigin } from './harness.mjs';

const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const OUT = resolve(process.env['SHOT_OUT'] ?? '.shots');
const WIDTH = Number(process.env['SHOT_W'] ?? 1400);
const HEIGHT = Number(process.env['SHOT_H'] ?? 1000);
const SHOTS = (process.env['SHOT_LIST'] ?? 'front').split(/[\s;]+/).filter((shot) => shot !== '');
const READY_TIMEOUT_MS = 30_000;

/** `view[:k=v…]` → the page URL and the file name. */
function describeShot(shot) {
  const [view = 'front', ...extras] = shot.split(':');
  const query = ['shot=1', `view=${encodeURIComponent(view)}`, ...extras].join('&');
  const suffix = extras.length > 0 ? `_${extras.join('_').replace(/[^\w.-]+/g, '-')}` : '';
  return { url: `${BASE}/?${query}`, file: resolve(OUT, `${view}${suffix}.png`) };
}

async function serverReachable() {
  try {
    const response = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

if (!(await serverReachable())) {
  console.error(`capture-shots: no dev server answers at ${BASE}/. Start one with \`npm run dev\` (port 5181 unless SCULPTURE_PORT is set), or point SHOT_BASE at the one to capture.`);
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true, args: [...BROWSER_ARGS] });
let failures = 0;

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const errors = [];
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    else if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  for (const shot of SHOTS) {
    const { url, file } = describeShot(shot);
    errors.length = 0;
    warnings.length = 0;
    let status = 'ready  ';
    try {
      await page.goto(url, { waitUntil: 'load', timeout: READY_TIMEOUT_MS });
      // String expressions, evaluated in the page: `window` is the browser's, not this script's.
      await page.waitForFunction('window.__shotReady === true', undefined, { timeout: READY_TIMEOUT_MS });
      const ignored = await page.evaluate('window.__sculpture?.queryProblems ?? []');
      if (ignored.length > 0) {
        status = 'IGNORED';
        errors.push(...ignored);
      }
    } catch (error) {
      status = 'TIMEOUT';
      errors.push(error instanceof Error ? error.message : String(error));
    }
    await page.screenshot({ path: file, type: 'png' });
    if (status !== 'ready  ' || errors.length > 0) failures += 1;
    // The page also warns about each ignored parameter on the console; print that once, as the error it is.
    const otherWarnings = warnings.filter((warning) => !errors.includes(warning));
    const notes = [errors.length > 0 ? `ERRORS: ${errors.join(' | ')}` : '', otherWarnings.length > 0 ? `warnings: ${otherWarnings.join(' | ')}` : ''].filter((note) => note !== '');
    console.log(`${status} ${file}  <- ${url}${notes.length > 0 ? `  ${notes.join('  ')}` : ''}`);
  }
} finally {
  await browser.close();
}

process.exitCode = failures === 0 ? 0 : 1;
