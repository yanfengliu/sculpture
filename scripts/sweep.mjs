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
 * Poses, from a seeded mulberry32 generator: every third pose (the 3rd, 6th, 9th, …) is "close", the others "whole".
 *   whole: target the block's centre (0, 2.75, 0); yaw anywhere; pitch 5° to 50° above the horizon; 6 to 14 m away.
 *   close: target a random point on the block (x -1 to 1, y 0.5 to 5.2, z -0.7 to 0.7); yaw anywhere; pitch -10° to 40°; 1.5 to 4 m away; a camera that lands inside the block's box is redrawn, up to 20 times.
 *   The camera never goes below 0.3 m. Each pose becomes `cam=px,py,pz,tx,ty,tz` (metres, 3 decimals) in `/?shot=1&t=<t>&cam=…[&finish=1][&noui=1]`, captured at 1400 × 1000 CSS pixels, device scale 1.
 * Output: <out>/sweep-NN.png per pose (written whatever the status, so a failed shot can still be looked at), one console line per shot, and <out>/sweep.json with every pose, its URL, its file and its status.
 * Exit: 0 every shot ready; 1 a shot timed out, logged an error, had a parameter ignored (not the shot that was asked for) or rendered another t; 2 no dev server answers.
 * Bound: a green run proves each URL rendered to readiness at the requested t with no ignored parameter and no console error. It says nothing about what the pixels show: look at each PNG at native resolution.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { devOrigin } from './harness.mjs';
import { capture, describeResult, loadReady, noServerMessage, openCapturePage, serverReachable } from './lib/capture.mjs';

const NAME = 'sweep';
const USAGE = 'usage: node scripts/sweep.mjs [--t <number>] [--count <n>] [--seed <n>] [--out <dir>] [--finish] [--noui]';
const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const WIDTH = 1400;
const HEIGHT = 1000;
const MAX_COUNT = 999;
const MAX_SEED = 4294967295;
const MIN_CAMERA_Y = 0.3;
const REDRAWS = 20;
/** The block stands on the origin: 2.1 m wide (x), 5.5 m tall (y), 1.4 m deep (z); the figure faces +z. */
const BLOCK_HALF_X = 1.05;
const BLOCK_HEIGHT = 5.5;
const BLOCK_HALF_Z = 0.7;
const BLOCK_CENTRE = Object.freeze([0, 2.75, 0]);
const WHOLE = { pitch: [5, 50], distance: [6, 14] };
const CLOSE = { pitch: [-10, 40], distance: [1.5, 4], target: { x: [-1, 1], y: [0.5, 5.2], z: [-0.7, 0.7] } };

/** Prints `message` as this script's failure and exits 1. */
function fail(message) {
  console.error(`${NAME}: ${message}`);
  process.exit(1);
}

/** The value of a numeric option, or exit 1 naming the option, the value and what is accepted. */
function numberOption(name, text, accepted, accepts) {
  const value = text.trim() === '' ? Number.NaN : Number(text);
  if (!Number.isFinite(value) || !accepts(value)) fail(`--${name} ${JSON.stringify(text)} is not accepted: it takes ${accepted}.`);
  return value;
}

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
    process.exit(0);
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

/** mulberry32: a small seeded generator, uniform in [0, 1), the same sequence for the same seed on every platform. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const uniform = (random, [low, high]) => low + random() * (high - low);
const radians = (degrees) => (degrees * Math.PI) / 180;

/** The camera `distance` metres from `target`, turned `yaw` degrees around +y (0 looks from +z, the front) and raised `pitch` degrees above the horizon, never below 0.3 m. */
function placeCamera(target, yaw, pitch, distance) {
  const [tx, ty, tz] = target;
  const flat = distance * Math.cos(radians(pitch));
  return [tx + flat * Math.sin(radians(yaw)), Math.max(MIN_CAMERA_Y, ty + distance * Math.sin(radians(pitch))), tz + flat * Math.cos(radians(yaw))];
}

function insideBlock([x, y, z]) {
  return Math.abs(x) <= BLOCK_HALF_X && y >= 0 && y <= BLOCK_HEIGHT && Math.abs(z) <= BLOCK_HALF_Z;
}

/** Pose `index` of the sweep (0-based): every third is close, the rest whole. A close camera inside the block is redrawn, so the sequence stays deterministic per seed. */
function drawPose(random, index) {
  const kind = index % 3 === 2 ? 'close' : 'whole';
  const range = kind === 'close' ? CLOSE : WHOLE;
  let pose = null;
  for (let attempt = 0; attempt <= REDRAWS; attempt += 1) {
    const target = kind === 'close' ? [uniform(random, CLOSE.target.x), uniform(random, CLOSE.target.y), uniform(random, CLOSE.target.z)] : [...BLOCK_CENTRE];
    const yaw = random() * 360;
    const pitch = uniform(random, range.pitch);
    const distance = uniform(random, range.distance);
    pose = { kind, yawDeg: yaw, pitchDeg: pitch, distance, target, position: placeCamera(target, yaw, pitch, distance) };
    if (!insideBlock(pose.position)) break;
  }
  return pose;
}

/** Metres to 3 decimals, without a negative zero. */
function metres(value) {
  return Math.abs(value) < 0.0005 ? '0.000' : value.toFixed(3);
}

function shotUrl(t, pose, options) {
  const cam = [...pose.position, ...pose.target].map(metres).join(',');
  return `${BASE}/?shot=1&t=${String(t)}&cam=${cam}${options.finish ? '&finish=1' : ''}${options.noui ? '&noui=1' : ''}`;
}

/** The facts of a first load at t=0, for N; exits 1 when the page does not become ready or publishes no N, quoting what the page logged. */
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

const options = parseOptions(process.argv.slice(2));

if (!(await serverReachable(BASE))) {
  console.error(noServerMessage(NAME, BASE));
  process.exit(2);
}

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

process.exitCode = failures === 0 ? 0 : 1;
