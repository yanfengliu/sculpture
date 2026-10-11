/**
 * Capture harness: opens the running dev server in headless Chrome through Playwright, waits for the page's own `window.__shotReady` (docs/design/spec.md, Query contract) and writes one PNG per shot into `.shots/` (ignored).
 * The visual check in AGENTS.md (Gates) runs it and looks at the PNGs; `npm run shots` is this script.
 *
 * Usage: node scripts/capture-shots.mjs            with `npm run dev` running in another terminal
 * env:   SHOT_BASE  origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 *        SHOT_OUT   output directory, default .shots
 *        SHOT_W, SHOT_H  viewport in CSS pixels, default 1400 and 1000, at device scale factor 1
 *        SHOT_LIST  shots separated by `;` or whitespace, each `view[:k=v[:k=v…]]`; commas stay free for `cam=px,py,pz,tx,ty,tz`.
 *                   Each shot loads `/?shot=1&view=<view>&k=v…` and writes `<view>[_<extras>].png`, so `front; top:cam=0,25,0.01,0,0,0` gives `front.png` and `top_cam-0-25-0.01-0-0-0.png`.
 *                   Unset, the standard set of the spec's Verification section is captured: every preset at the finished state (`<preset>.png`), the front and three-quarter presets at each stage boundary (`<preset>_t-<k>_<stage>.png`), the follow view mid-blow for each tool that appears in the plan (`follow_<tool>_t-<t>.png`), and the front at the finished state with the finish codes (`front_finish.png`). The set (scripts/lib/standard-set.mjs) is built from the page's own facts (steps, stages, tools, blow counts), read after one first load has been seeked to `t = N`, where every step is planned; a tool whose steps have no blows is reported and gets no follow shot.
 * A shot whose URL the page partly ignored (`window.__sculpture.queryProblems`, filled by src/viewer/query.ts and src/main.ts) is written but counted as a failure: it is not the shot that was asked for.
 * Exit:  0 every shot was ready and whole, 1 a shot timed out, threw, logged an error or had a parameter ignored, 2 the dev server could not be reached.
 * Bound: it proves each PNG was written from the requested state; what the pixels show is for the author to look at.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { devOrigin } from './harness.mjs';
import { capture, describeResult, loadReady, noServerMessage, openCapturePage, seekReady, serverReachable } from './lib/capture.mjs';
import { standardSet } from './lib/standard-set.mjs';

const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const OUT = resolve(process.env['SHOT_OUT'] ?? '.shots');
const WIDTH = Number(process.env['SHOT_W'] ?? 1400);
const HEIGHT = Number(process.env['SHOT_H'] ?? 1000);
const LIST = (process.env['SHOT_LIST'] ?? '').split(/[\s;]+/).filter((shot) => shot !== '');
/** The seek to t = N that plans every step replays the whole making on the page's thread: about 20 s on the David and the synthetic figure today. */
const PLAN_TIMEOUT_MS = 180_000;

/** `view[:k=v…]` → the page URL and the file name. */
function describeShot(shot) {
  const [view = 'front', ...extras] = shot.split(':');
  const query = ['shot=1', `view=${encodeURIComponent(view)}`, ...extras].join('&');
  const suffix = extras.length > 0 ? `_${extras.join('_').replace(/[^\w.-]+/g, '-')}` : '';
  return { url: `${BASE}/?${query}`, file: resolve(OUT, `${view}${suffix}.png`) };
}

/** A shot of the standard set: an explicit file name and query. */
function standardShot(name, view, params) {
  const query = ['shot=1', `view=${encodeURIComponent(view)}`, ...Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)].join('&');
  return { url: `${BASE}/?${query}`, file: resolve(OUT, `${name}.png`) };
}

/** The facts with every step planned: a first load at t = 0, then the capture seek to t = N (planning is lazy, so the blow counts of later steps are 0 until the page has been there). */
async function plannedFacts(page) {
  const first = await loadReady(page, `${BASE}/?shot=1&t=0`);
  if (first === null || !(first.N > 0)) {
    throw new Error(`capture-shots: the page at ${BASE} published no steps (window.__sculpture.N is ${String(first?.N)}), so the standard set cannot be built; pass SHOT_LIST for explicit shots.`);
  }
  return seekReady(page, first.N, PLAN_TIMEOUT_MS);
}

if (!(await serverReachable(BASE))) {
  console.error(noServerMessage('capture-shots', BASE));
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const capturePage = await openCapturePage({ width: WIDTH, height: HEIGHT });
let failures = 0;

try {
  let shots;
  if (LIST.length > 0) {
    shots = LIST.map(describeShot);
  } else {
    const facts = await plannedFacts(capturePage.page);
    const set = standardSet(facts);
    for (const message of set.skipped) console.log(`capture-shots: ${message}`);
    shots = set.shots.map((shot) => standardShot(shot.name, shot.view, shot.params));
    console.log(`capture-shots: standard set of ${String(shots.length)} shots from ${String(facts.N)} steps, ${String(facts.stages.length)} stages and ${String(new Set(facts.stepTools).size)} tools`);
  }
  for (const { url, file } of shots) {
    const result = await capture(capturePage, url, file);
    if (result.status !== 'ready' || result.errors.length > 0) failures += 1;
    console.log(describeResult(result, file, url));
  }
} finally {
  await capturePage.close();
}

process.exitCode = failures === 0 ? 0 : 1;
