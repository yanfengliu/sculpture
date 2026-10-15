/**
 * First-visit load probe (docs/design/spec.md, Budgets: the first frame under 5 s, the page responsive): loads the running dev server under `shot=1` in a new headless Chrome per run, so every run starts, as a first visit does, with an empty shader cache, and prints when the first frame began and was drawn, when the full marble program was in use, when the page was ready, and the longest main-thread task of the load.
 * Each run is a `chromium.launch()` of its own: Playwright gives every launch a new temporary profile, and Chrome keeps its compiled-program cache (in memory and on disk) per browser and profile, so nothing compiled in one run reaches the next. One warm-up load in a browser of its own comes first and is not counted, so the measured runs do not pay Vite's first transforms. The GPU driver's own cache of machine code (outside the profile) is not cleared; the slow step this probe watches, the HLSL compile inside Chrome's GPU process, is not in it.
 * Usage: npm run load (node scripts/capture-load.mjs)   with `npm run dev` running in another terminal
 * env:   SHOT_BASE  origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 *        LOAD_RUNS  measured runs, default 3; LOAD_T  the position, default 0; LOAD_MODEL  david or synthetic, default david; LOAD_VIEW  the preset, default three-quarter
 * Exit:  0 measured, 1 a timeout or a page error, 2 the dev server could not be reached.
 * Bound: it measures this machine's GPU and CPU under whatever else runs and asserts nothing, so it is a logged measurement, not a gate. Long tasks are the browser's own (the Long Tasks API: tasks of 50 ms or more on the page's main thread); the shader compile that blocks a draw shows there, a compile in the GPU process that the page does not wait for does not.
 */
import { chromium } from '@playwright/test';

import { BROWSER_ARGS, BROWSER_CHANNEL, devOrigin } from './harness.mjs';
import { noServerMessage, serverReachable } from './lib/capture.mjs';

const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const RUNS = Number(process.env['LOAD_RUNS'] ?? 3);
const T = Number(process.env['LOAD_T'] ?? 0);
const MODEL = process.env['LOAD_MODEL'] ?? 'david';
const VIEW = process.env['LOAD_VIEW'] ?? 'three-quarter';
const TIMEOUT_MS = 120_000;

/** In the page, before its scripts: when the facts are first published (the first frame begins), the animation frame after it (that frame drawn, so a compile on first use is inside it), when the facts first report the full marble, when the ready flag first turns true, and every long task. */
const INSTRUMENT = `(() => {
  let facts; let ready = false;
  const marks = { firstFacts: null, firstDrawn: null, marbleAt: null, readyAt: null, longTasks: [] };
  window.__loadMarks = marks;
  try {
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) marks.longTasks.push([entry.startTime, entry.duration]); }).observe({ type: 'longtask', buffered: true });
  } catch { marks.longTasks = null; }
  Object.defineProperty(window, '__sculpture', { configurable: true, get() { return facts; }, set(v) {
    if (facts === undefined) { marks.firstFacts = performance.now(); requestAnimationFrame(() => { marks.firstDrawn = performance.now(); }); }
    if (marks.marbleAt === null && v && v.marble === 'full') marks.marbleAt = performance.now();
    facts = v;
  } });
  Object.defineProperty(window, '__shotReady', { configurable: true, get() { return ready; }, set(v) { if (v === true && marks.readyAt === null) marks.readyAt = performance.now(); ready = v; } });
})();`;

const RENDERER = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown', parallel: gl?.getExtension('KHR_parallel_shader_compile') !== null };
})()`;

const seconds = (ms) => (ms === null || ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(2)} s`);

/** One load in a new browser: the marks, the renderer and the page errors. */
async function load() {
  const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true, args: [...BROWSER_ARGS] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(INSTRUMENT);
    await page.goto(`${BASE}/?shot=1&model=${MODEL}&t=${String(T)}&view=${VIEW}`, { waitUntil: 'load', timeout: TIMEOUT_MS });
    await page.waitForFunction('window.__shotReady === true', undefined, { timeout: TIMEOUT_MS, polling: 50 });
    const marks = await page.evaluate('window.__loadMarks');
    const gpu = await page.evaluate(RENDERER);
    const facts = await page.evaluate('({ planSource: window.__sculpture.planSource, marble: window.__sculpture.marble ?? null })');
    return { marks, gpu, facts, errors };
  } finally {
    await browser.close();
  }
}

/** The long tasks up to the ready flag: the longest, its start, and the total time past 50 ms (the blocking time). */
function longest(marks) {
  if (marks.longTasks === null) return { text: 'long tasks unavailable', ms: Number.NaN };
  const tasks = marks.longTasks.filter(([start]) => marks.readyAt === null || start <= marks.readyAt);
  const top = tasks.reduce((best, task) => (task[1] > best[1] ? task : best), [0, 0]);
  const blocking = tasks.reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0);
  return { text: `longest task ${top[1].toFixed(0)} ms at ${seconds(top[0])}, ${String(tasks.length)} long tasks, blocking ${blocking.toFixed(0)} ms`, ms: top[1] };
}

if (!(await serverReachable(BASE))) {
  console.error(noServerMessage('capture-load', BASE));
  process.exit(2);
}

let failed = false;
try {
  await load();
  const results = [];
  for (let run = 1; run <= RUNS; run += 1) {
    const { marks, gpu, facts, errors } = await load();
    const top = longest(marks);
    if (run === 1) console.log(`capture-load: ${String(gpu.renderer)}, KHR_parallel_shader_compile ${gpu.parallel ? 'present' : 'absent'}; ${MODEL} at t = ${String(T)} from ${VIEW}, plan from the ${String(facts.planSource)}, a new browser and profile per run`);
    console.log(`capture-load: run ${String(run)}: first frame begun ${seconds(marks.firstFacts)}, drawn ${seconds(marks.firstDrawn)}, full marble ${seconds(marks.marbleAt)}, ready ${seconds(marks.readyAt)}; ${top.text}`);
    if (errors.length > 0) {
      failed = true;
      console.error(`capture-load: run ${String(run)} page errors: ${errors.join(' | ')}`);
    }
    results.push({ drawn: marks.firstDrawn, ready: marks.readyAt, task: top.ms });
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN;
  console.log(`capture-load: median of ${String(RUNS)}: first frame drawn ${seconds(median(results.map((r) => r.drawn)))}, ready ${seconds(median(results.map((r) => r.ready)))}, longest task ${median(results.map((r) => r.task)).toFixed(0)} ms`);
} catch (error) {
  failed = true;
  console.error(`capture-load: the measurement did not finish: ${error instanceof Error ? error.message : String(error)}`);
}
process.exit(failed ? 1 : 0);
