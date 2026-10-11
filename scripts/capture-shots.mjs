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
 *                   Unset, the standard set of the spec's Verification section is captured: every preset at the finished state (`<preset>.png`), the front and three-quarter presets at each stage boundary (`<preset>_t-<k>_<stage>.png`), the follow view mid-blow for each tool that appears in the plan (`follow_<tool>_t-<t>.png`), and the front at the finished state with the finish codes (`front_finish.png`). The set is built from the page's own facts (steps, stages, tools, blow counts), read from one first load.
 * A shot whose URL the page partly ignored (`window.__sculpture.queryProblems`, filled by src/viewer/query.ts and src/main.ts) is written but counted as a failure: it is not the shot that was asked for.
 * Exit:  0 every shot was ready and whole, 1 a shot timed out, threw, logged an error or had a parameter ignored, 2 the dev server could not be reached.
 * Bound: it proves each PNG was written from the requested state; what the pixels show is for the author to look at.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { devOrigin } from './harness.mjs';
import { capture, describeResult, loadReady, noServerMessage, openCapturePage, serverReachable } from './lib/capture.mjs';

const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const OUT = resolve(process.env['SHOT_OUT'] ?? '.shots');
const WIDTH = Number(process.env['SHOT_W'] ?? 1400);
const HEIGHT = Number(process.env['SHOT_H'] ?? 1000);
const LIST = (process.env['SHOT_LIST'] ?? '').split(/[\s;]+/).filter((shot) => shot !== '');
const PRESETS = ['front', 'back', 'left', 'right', 'three-quarter', 'head', 'hands', 'sling-and-stump', 'free'];

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

/** The spec's standard set from the page's facts. */
function standardSet(facts) {
  const N = facts.N;
  const shots = PRESETS.map((preset) => standardShot(preset, preset, { t: N }));
  shots.push(standardShot('front_finish', 'front', { t: N, finish: 1 }));
  for (const stage of facts.stages) {
    const first = facts.stepStages.indexOf(stage);
    if (first < 0) continue;
    for (const preset of ['front', 'three-quarter']) shots.push(standardShot(`${preset}_t-${String(first)}_${stage}`, preset, { t: first }));
  }
  const seenTools = new Set();
  facts.stepTools.forEach((tool, index) => {
    if (seenTools.has(tool)) return;
    seenTools.add(tool);
    const count = facts.stepBlowCounts[index] ?? 1;
    // Mid-cycle of the middle blow of the first step that uses the tool.
    const t = index + (Math.floor(count / 2) + 0.5) / count;
    shots.push(standardShot(`follow_${tool}_t-${t.toFixed(4)}`, 'follow', { t: t.toFixed(4) }));
  });
  return shots;
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
    const facts = await loadReady(capturePage.page, `${BASE}/?shot=1&t=0`);
    if (facts === null || !(facts.N > 0)) {
      throw new Error(`capture-shots: the page at ${BASE} published no steps (window.__sculpture.N is ${String(facts?.N)}), so the standard set cannot be built; pass SHOT_LIST for explicit shots.`);
    }
    shots = standardSet(facts);
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
