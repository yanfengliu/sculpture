/**
 * Jump timings (docs/design/spec.md, Budgets: a scrub jump across the whole making remeshes in under 3 s, the first frame under 5 s): opens the running dev server in headless Chrome through Playwright and, under `shot=1`, times through the page's own `__shotSeek` and `__shotReady`: a fresh load at t = 0, a jump from 0 to N, one from N to 0, ten seeded random jumps, and a fresh load at t = N in a second browser. A load reports when the facts are first published (the start of the first frame), when that frame has been drawn (the animation frame after it, so the shaders' compile on first use is inside it) and when the page is ready; each browser starts with an empty shader cache, as a first visit does. A jump counts from the seek to the moment `__shotReady` turns true, so it includes the snapshot load, the replay, the remesh and the five frames the ready flag waits for.
 * Usage: node scripts/measure-jumps.mjs          with `npm run dev` running in another terminal
 * env:   SHOT_BASE  origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 *        JUMP_MODEL  david or synthetic, default david; JUMP_SEED  the random jumps' seed, default 2026
 * Exit:  0 measured, 1 a timeout or a page error, 2 the dev server could not be reached.
 * Bound: this machine under whatever else runs; it asserts nothing, so it is a record, not a gate. The first load after the dev server starts also pays Vite's transforms.
 */
import { chromium } from '@playwright/test';

import { BROWSER_ARGS, BROWSER_CHANNEL, devOrigin } from './harness.mjs';
import { noServerMessage, serverReachable } from './lib/capture.mjs';

const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const MODEL = process.env['JUMP_MODEL'] ?? 'david';
const SEED = Number(process.env['JUMP_SEED'] ?? 2026);
const TIMEOUT_MS = 240_000;

/** Records, in the page, when the facts are first published (the first frame) and every time the ready flag turns true. */
const INSTRUMENT = `(() => {
  let facts; let ready = false;
  window.__marks = { firstFacts: null, firstDrawn: null, readyAt: [] };
  Object.defineProperty(window, '__sculpture', { configurable: true, get() { return facts; }, set(v) { if (facts === undefined) { window.__marks.firstFacts = performance.now(); requestAnimationFrame(() => { window.__marks.firstDrawn = performance.now(); }); } facts = v; } });
  Object.defineProperty(window, '__shotReady', { configurable: true, get() { return ready; }, set(v) { if (v === true && ready !== true) window.__marks.readyAt.push(performance.now()); ready = v; } });
})();`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function freshLoad(t) {
  const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true, args: [...BROWSER_ARGS] });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.error(`measure-jumps: page error: ${error.message}`));
  await page.addInitScript(INSTRUMENT);
  await page.goto(`${BASE}/?shot=1&model=${MODEL}&t=${String(t)}`, { waitUntil: 'load', timeout: TIMEOUT_MS });
  await page.waitForFunction('window.__shotReady === true', undefined, { timeout: TIMEOUT_MS, polling: 50 });
  const marks = await page.evaluate('({ first: window.__marks.firstFacts, drawn: window.__marks.firstDrawn, ready: window.__marks.readyAt[0], N: window.__sculpture.N, planSource: window.__sculpture.planSource, blows: window.__sculpture.blowsApplied })');
  return { page, ...marks };
}

async function seek(page, t) {
  const before = await page.evaluate('window.__marks.readyAt.length');
  const start = await page.evaluate(`(() => { const s = performance.now(); window.__shotSeek(${JSON.stringify(t)}); return s; })()`);
  await page.waitForFunction(`window.__shotReady === true && window.__marks.readyAt.length > ${String(before)}`, undefined, { timeout: TIMEOUT_MS, polling: 50 });
  const end = await page.evaluate(`window.__marks.readyAt[${String(before)}]`);
  return (end - start) / 1000;
}

if (!(await serverReachable(BASE))) {
  console.error(noServerMessage('measure-jumps', BASE));
  process.exit(2);
}

const browsers = [];
let failed = false;
try {
  const start = await freshLoad(0);
  console.log(`measure-jumps: ${MODEL}, plan from the ${String(start.planSource)}: fresh load at t = 0, first frame begun ${(start.first / 1000).toFixed(2)} s and drawn ${(start.drawn / 1000).toFixed(2)} s, ready ${(start.ready / 1000).toFixed(2)} s`);
  const N = start.N;
  console.log(`measure-jumps: jump 0 -> ${String(N)}: ${(await seek(start.page, N)).toFixed(2)} s`);
  console.log(`measure-jumps: jump ${String(N)} -> 0: ${(await seek(start.page, 0)).toFixed(2)} s`);
  const random = mulberry32(SEED);
  const times = [];
  let from = 0;
  for (let n = 0; n < 10; n += 1) {
    const t = Math.round(random() * N * 1000) / 1000;
    const seconds = await seek(start.page, t);
    times.push(seconds);
    console.log(`measure-jumps: random jump ${String(n + 1)}, ${String(from)} -> ${String(t)}: ${seconds.toFixed(2)} s`);
    from = t;
  }
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`measure-jumps: random jumps: median ${(((sorted[4] ?? 0) + (sorted[5] ?? 0)) / 2).toFixed(2)} s, slowest ${(sorted[9] ?? 0).toFixed(2)} s`);
  await start.page.close();
  const end = await freshLoad(N);
  console.log(`measure-jumps: fresh load at t = ${String(N)} in a new browser: first frame begun ${(end.first / 1000).toFixed(2)} s and drawn ${(end.drawn / 1000).toFixed(2)} s, ready ${(end.ready / 1000).toFixed(2)} s (${String(end.blows)} blows applied)`);
} catch (error) {
  failed = true;
  console.error(`measure-jumps: the measurement did not finish: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const browser of browsers) await browser.close();
}
process.exit(failed ? 1 : 0);
