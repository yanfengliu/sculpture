/**
 * Sweep: random camera poses around the block at one timeline position, each captured through the `?shot=1` contract (docs/design/spec.md, Query contract) into a PNG, plus a JSON manifest. The randomized angles of the visual check in AGENTS.md (Gates): exploration, where the fixed presets of scripts/capture-shots.mjs are comparison.
 *
 * Usage: node scripts/sweep.mjs [--t <number>] [--count <n>] [--seed <n>] [--out <dir>] [--finish] [--noui]   with a dev server running
 *   --t <number>   timeline position, 0 to N; default N, the finished state (N is read from the page's facts)
 *   --count <n>    poses, a whole number from 1 to 999; default 12
 *   --seed <n>     seed of the pose generator, a whole number from 0 to 4294967295; default 1. The same seed and count give the same poses.
 *   --out <dir>    output directory; default .shots/sweep (ignored by Git)
 *   --finish       add finish=1: the finish grid as flat colours
 *   --noui         add noui=1: no page chrome
 * env:  SHOT_BASE  origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 *
 * Poses come from scripts/lib/sweep-poses.mjs: every third pose (the 3rd, 6th, 9th, …) is "close", the others "whole"; the block's size is the frame's (src/david/frame.ts) and every pose lies inside the orbit's limits (src/viewer/orbit-limits.ts), so the page keeps it exactly. Each pose becomes `cam=px,py,pz,tx,ty,tz` (metres, 3 decimals) in `/?shot=1&t=<t>&cam=…[&finish=1][&noui=1]`, captured at 1400 × 1000 CSS pixels, device scale 1.
 * Output: <out>/sweep-NN.png per pose (written whatever the status, so a failed shot can still be looked at), one console line per shot, and <out>/sweep.json with every pose, its URL, its file and its status.
 * Exit: 0 every shot ready; 1 a shot timed out, logged an error, had a parameter ignored (not the shot that was asked for) or rendered another t, or an option or the first load was bad (the message names it); 2 no dev server answers. Every exit after the browser opened goes through its close.
 * Bound: a green run proves each URL rendered to readiness at the requested t with no ignored parameter and no console error. It says nothing about what the pixels show: look at each PNG at native resolution.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { devOrigin } from './harness.mjs';
import { capture, describeResult, loadReady, noServerMessage, openCapturePage, serverReachable } from './lib/capture.mjs';
import { cameraParam, drawPose, mulberry32 } from './lib/sweep-poses.mjs';

const NAME = 'sweep';
const USAGE = 'usage: node scripts/sweep.mjs [--t <number>] [--count <n>] [--seed <n>] [--out <dir>] [--finish] [--noui]';
const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const WIDTH = 1400;
const HEIGHT = 1000;
const MAX_COUNT = 999;
const MAX_SEED = 4294967295;

/** A failure this script reports by name, with the exit code it ends with; thrown, so the browser's `finally` runs before the code is set. */
class SweepError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

function fail(message, code = 1) {
  throw new SweepError(message, code);
}

/** The value of a numeric option, or a failure naming the option, the value and what is accepted. */
function numberOption(name, text, accepted, accepts) {
  const value = text.trim() === '' ? Number.NaN : Number(text);
  if (!Number.isFinite(value) || !accepts(value)) fail(`--${name} ${JSON.stringify(text)} is not accepted: it takes ${accepted}.`);
  return value;
}

/** The options, or null after printing the usage for --help. */
function parseOptions(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        t: { type: 'string' },
        count: { type: 'string', default: '12' },
        seed: { type: 'string', default: '1' },
        out: { type: 'string', default: '.shots/sweep' },
        finish: { type: 'boolean', default: false },
        noui: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
  }
  if (values.help) {
    console.log(USAGE);
    return null;
  }
  return {
    t: values.t === undefined ? null : numberOption('t', values.t, 'a number from 0 to N, the end of the timeline', (n) => n >= 0),
    count: numberOption('count', values.count, `a whole number from 1 to ${String(MAX_COUNT)}`, (n) => Number.isInteger(n) && n >= 1 && n <= MAX_COUNT),
    seed: numberOption('seed', values.seed, `a whole number from 0 to ${String(MAX_SEED)}`, (n) => Number.isInteger(n) && n >= 0 && n <= MAX_SEED),
    out: resolve(values.out),
    finish: values.finish,
    noui: values.noui,
  };
}

function shotUrl(t, pose, options) {
  return `${BASE}/?shot=1&t=${String(t)}&cam=${cameraParam(pose)}${options.finish ? '&finish=1' : ''}${options.noui ? '&noui=1' : ''}`;
}

/** The facts of a first load at t=0, for N; fails when the page does not become ready or publishes no N, quoting what the page logged. */
async function readFacts(capturePage) {
  const url = `${BASE}/?shot=1&t=0`;
  let facts = null;
  try {
    facts = await loadReady(capturePage.page, url);
  } catch (error) {
    const logged = capturePage.errors.length > 0 ? `; the page logged: ${capturePage.errors.join(' | ')}` : '';
    fail(`the first load of ${url} did not become ready (${error instanceof Error ? error.message : String(error)})${logged}; the sweep needs the page's N from window.__sculpture.`);
  }
  if (!Number.isInteger(facts?.N) || facts.N <= 0) {
    fail(`the page at ${url} published no usable N (window.__sculpture.N must be a whole number above 0; got ${JSON.stringify(facts?.N)}), so --t has no range.`);
  }
  return facts;
}

/** Captures every pose; returns the number of shots that were not ready and whole. The browser is closed on every way out. */
async function sweep(options) {
  const capturePage = await openCapturePage({ width: WIDTH, height: HEIGHT });
  let failures = 0;
  try {
    const { N } = await readFacts(capturePage);
    const t = options.t ?? N;
    if (t > N) fail(`--t ${String(t)} is above N=${String(N)}, the end of the timeline: it takes a number from 0 to ${String(N)}.`);
    mkdirSync(options.out, { recursive: true });
    const random = mulberry32(options.seed);
    const shots = [];
    for (let index = 0; index < options.count; index += 1) {
      const pose = drawPose(random, index);
      const url = shotUrl(t, pose, options);
      const file = resolve(options.out, `sweep-${String(index + 1).padStart(2, '0')}.png`);
      const result = await capture(capturePage, url, file);
      if (result.status === 'ready' && result.facts?.t !== t) {
        result.errors.push(`the page rendered t=${JSON.stringify(result.facts?.t)}, not the requested t=${String(t)}`);
      }
      const ok = result.status === 'ready' && result.errors.length === 0;
      if (!ok) failures += 1;
      console.log(describeResult(result, file, url));
      shots.push({ index: index + 1, ...pose, url, file, status: result.status, ok, errors: result.errors, warnings: result.warnings });
    }
    const manifest = resolve(options.out, 'sweep.json');
    writeFileSync(manifest, `${JSON.stringify({ base: BASE, t, N, seed: options.seed, count: options.count, finish: options.finish, noui: options.noui, viewport: { width: WIDTH, height: HEIGHT }, shots }, null, 2)}\n`);
    console.log(`${NAME}: ${String(options.count - failures)} of ${String(options.count)} shots ready at t=${String(t)}; poses and statuses in ${manifest}`);
  } finally {
    await capturePage.close();
  }
  return failures;
}

/** Runs the sweep and returns the exit code. */
async function main(argv) {
  const options = parseOptions(argv);
  if (options === null) return 0;
  if (!(await serverReachable(BASE))) {
    console.error(noServerMessage(NAME, BASE));
    return 2;
  }
  return (await sweep(options)) === 0 ? 0 : 1;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof SweepError)) throw error;
  console.error(`${NAME}: ${error.message}`);
  process.exitCode = error.code;
}
