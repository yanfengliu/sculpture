/**
 * Video export: the making as a VP8 WebM, frame by frame through the `?shot=1` contract (docs/design/spec.md, Query contract), encoded by Playwright's bundled ffmpeg (docs/research/engine-options.md, 7). Frame-exact and deterministic: the clip follows the player's wall time, it is not a real-time recording.
 *
 * Usage: node scripts/export-video.mjs [--from <t>] [--to <t>] [--fps <n>] [--speed <0.5|1|2|4>] [--view <preset>] [--width <px>] [--height <px>] [--out <file>] [--seconds <n>] [--quick] [--reload] [--keep-frames]   with a dev server running
 *   --from <t>, --to <t>  the clip's timeline range, 0 ≤ from < to ≤ N; defaults 0 and N, the whole making (N is read from the page's facts)
 *   --fps <n>             frames per second, a whole number from 1 to 120; default 30
 *   --speed <n>           playback speed, 0.5, 1, 2 or 4 (the player's speeds); default 1
 *   --view <preset>       camera preset: front, back, left, right, three-quarter, head, hands, sling-and-stump, free or follow; default three-quarter. The page checks it: an unknown preset lands in queryProblems and fails the export before any frame is written.
 *   --width, --height     frame size in pixels, even whole numbers from 16 to 7680; default 1920 × 1080
 *   --out <file>          the WebM, a path ending in .webm; default output/making-of.webm (output/ is ignored by Git and created as needed)
 *   --seconds <n>         keep only the first n seconds of output from --from, for checking; --quick is --seconds 3 (90 frames at 30 fps)
 *   --reload              load each frame's URL afresh (the pure query contract, about 1 s per frame) instead of seeking the loaded page through window.__shotSeek (about 60 ms per frame)
 *   --keep-frames         keep output/video/frames/ after encoding
 * env:  SHOT_BASE          origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 *       PLAYWRIGHT_FFMPEG  an ffmpeg binary to use before Playwright's registry
 *
 * Time: step i plays for stepWeights[i] × baseSeconds / speed wall seconds (both from the page's facts), so frame k at wall time k/fps maps to a t by walking the steps (t = i + elapsed in step i / its seconds). The clip runs from the wall time of --from to that of --to, has round(seconds × fps) frames (at least 2) and its last frame lands exactly on --to.
 * Capture: one page of width × height CSS pixels at device scale 1 loads /?shot=1&noui=1&view=<view>&t=<from>; each frame seeks through window.__shotSeek (or reloads the URL with --reload), waits for window.__shotReady, checks that queryProblems is empty, that the rendered t is the asked one and that nothing logged an error, and is written to output/video/frames/00001.jpg… (JPEG at quality 95; the directory is cleared first and deleted after a successful encode unless --keep-frames). Under ?shot=1 `view=follow` frames the blow at the loaded t only, so it re-frames per frame with --reload alone.
 * Encode: the frames are streamed in order into `ffmpeg -f image2pipe -c:v mjpeg -framerate <fps> -i pipe:0 -c:v libvpx -b:v 6M -pix_fmt yuv420p -auto-alt-ref 0 <out>`. The bundled ffmpeg (n7.0.1-playwright-build) decodes only MJPEG through image2pipe and has no PNG decoder, no image2 demuxer and no VP9, H.264 or AV1 encoder: that is why the frames are JPEG and the pipe replaces the research's `-i %05d.png`.
 * ffmpeg discovery, `findFfmpeg()`: $PLAYWRIGHT_FFMPEG; else Playwright's registry ($PLAYWRIGHT_BROWSERS_PATH, or per OS %LOCALAPPDATA%\ms-playwright, ~/Library/Caches/ms-playwright, ~/.cache/ms-playwright), first ffmpeg-<revision> from playwright-core's browsers.json, then any ffmpeg-* directory, highest revision first; the binary is ffmpeg-win64.exe, ffmpeg-mac / ffmpeg-mac-arm64 or ffmpeg-linux. A miss names every path looked at and the fix, `npx playwright install ffmpeg`.
 * After encoding: the file exists and is not empty, its first 4 bytes are the EBML magic 1A 45 DF A3, `ffmpeg -i` is run and its Duration: and Stream lines are printed, the reported duration is within a frame of frames / fps, then one summary line: frames, fps, seconds of output, bytes, path.
 * Exit: 0 success; 1 any failure (an argument, the page, a frame, ffmpeg or the output); 2 no dev server answers.
 * Bound: a green run proves every frame rendered to readiness at its t with no ignored parameter and no console error, and that ffmpeg wrote a non-empty WebM whose header and reported duration match the frame count. It says nothing about what the frames show: watch the file.
 */
import { execFile, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

import { devOrigin } from './harness.mjs';
import { loadReady, noServerMessage, openCapturePage, seekReady, serverReachable } from './lib/capture.mjs';

const NAME = 'export-video';
const USAGE = 'usage: node scripts/export-video.mjs [--from <t>] [--to <t>] [--fps <n>] [--speed <0.5|1|2|4>] [--view <preset>] [--width <px>] [--height <px>] [--out <file>] [--seconds <n>] [--quick] [--reload] [--keep-frames]';
const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const FRAMES_DIR = resolve('output/video/frames');
const SPEEDS = [0.5, 1, 2, 4];
const MAX_FPS = 120;
const MIN_SIZE = 16;
const MAX_SIZE = 7680;
const QUICK_SECONDS = 3;
const JPEG_QUALITY = 95;
const PROGRESS_EVERY = 30;
const T_TOLERANCE = 1e-9;
const EBML_MAGIC = Object.freeze([0x1a, 0x45, 0xdf, 0xa3]);
const INSTALL_FIX = 'npx playwright install ffmpeg';
const MAC_BINARIES = process.arch === 'arm64' ? ['ffmpeg-mac-arm64', 'ffmpeg-mac'] : ['ffmpeg-mac', 'ffmpeg-mac-arm64'];
const FFMPEG_BINARIES = { win32: ['ffmpeg-win64.exe'], darwin: MAC_BINARIES, linux: ['ffmpeg-linux'] };

/** A failure of this script: its message is printed as `export-video: <message>` and the exit code is 1. */
class ExportError extends Error {}

/** True once this run has cleared and owns FRAMES_DIR, so a failure can say whether frames were left there. */
let framesDirectoryOwned = false;

const describe = (error) => (error instanceof Error ? error.message : String(error));
/** What the page logged while a frame failed, for the failure message; empty when nothing was logged. */
const logged = (errors) => (errors.length > 0 ? `; the page logged: ${errors.join(' | ')}` : '');

/** The value of a numeric option, or an ExportError naming the option, the value and what is accepted. */
function numberOption(name, text, accepted, accepts) {
  const value = text.trim() === '' ? Number.NaN : Number(text);
  if (!Number.isFinite(value) || !accepts(value)) throw new ExportError(`--${name} ${JSON.stringify(text)} is not accepted: it takes ${accepted}.`);
  return value;
}

function parseOptions(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        from: { type: 'string', default: '0' },
        to: { type: 'string' },
        fps: { type: 'string', default: '30' },
        speed: { type: 'string', default: '1' },
        view: { type: 'string', default: 'three-quarter' },
        width: { type: 'string', default: '1920' },
        height: { type: 'string', default: '1080' },
        out: { type: 'string', default: 'output/making-of.webm' },
        seconds: { type: 'string' },
        quick: { type: 'boolean', default: false },
        reload: { type: 'boolean', default: false },
        'keep-frames': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new ExportError(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
  }
  if (values.help) return null;
  const size = (name, text) => numberOption(name, text, `an even whole number from ${String(MIN_SIZE)} to ${String(MAX_SIZE)}`, (n) => Number.isInteger(n) && n % 2 === 0 && n >= MIN_SIZE && n <= MAX_SIZE);
  const from = numberOption('from', values.from, 'a number from 0 to N, the end of the timeline', (n) => n >= 0);
  const to = values.to === undefined ? null : numberOption('to', values.to, 'a number above --from and at most N', (n) => n > from);
  let seconds = values.seconds === undefined ? null : numberOption('seconds', values.seconds, 'a number above 0', (n) => n > 0);
  if (values.quick && seconds !== null) throw new ExportError(`--quick and --seconds ${values.seconds} were both given: --quick means --seconds ${String(QUICK_SECONDS)}, so give one of them.`);
  if (values.quick) seconds = QUICK_SECONDS;
  const out = resolve(values.out);
  if (!/\.webm$/i.test(out)) throw new ExportError(`--out ${JSON.stringify(values.out)} is not accepted: it takes a path ending in .webm, the only container the bundled ffmpeg writes.`);
  const view = values.view.trim();
  if (view === '') throw new ExportError('--view "" is not accepted: it takes a camera preset id such as three-quarter, or follow.');
  return {
    from,
    to,
    fps: numberOption('fps', values.fps, `a whole number from 1 to ${String(MAX_FPS)}`, (n) => Number.isInteger(n) && n >= 1 && n <= MAX_FPS),
    speed: numberOption('speed', values.speed, SPEEDS.join(', ').replace(/, (\S+)$/, ' or $1'), (n) => SPEEDS.includes(n)),
    view,
    width: size('width', values.width),
    height: size('height', values.height),
    out,
    seconds,
    reload: values.reload,
    keepFrames: values['keep-frames'],
  };
}

/** Playwright's browser registry: PLAYWRIGHT_BROWSERS_PATH, or the per-OS default. */
function registryDirectory(env, platform) {
  const configured = env['PLAYWRIGHT_BROWSERS_PATH'];
  if (configured !== undefined && configured.trim() !== '') return resolve(configured);
  if (platform === 'win32') return join(env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ms-playwright');
  return join(homedir(), '.cache', 'ms-playwright');
}

/** The ffmpeg revision playwright-core asks for, from the browsers.json next to its package.json; null when neither can be read. */
function requestedRevision() {
  try {
    const packageFile = createRequire(import.meta.url).resolve('playwright-core/package.json');
    const registry = JSON.parse(readFileSync(join(dirname(packageFile), 'browsers.json'), 'utf8'));
    const entry = registry.browsers.find((browser) => browser.name === 'ffmpeg');
    return typeof entry?.revision === 'string' ? entry.revision : null;
  } catch {
    return null;
  }
}

/**
 * Finds an ffmpeg binary (header, discovery). Returns `{ path, rule, registry, lookedAt }`: `path` and `rule` are null when none of `lookedAt` exists.
 * `rule` names what found it: `PLAYWRIGHT_FFMPEG`, `browsers.json revision` or `highest ffmpeg-* directory`.
 */
export function findFfmpeg(env = process.env, platform = process.platform) {
  const lookedAt = [];
  const exists = (candidate) => {
    lookedAt.push(candidate);
    return existsSync(candidate);
  };
  const registry = registryDirectory(env, platform);
  const configured = env['PLAYWRIGHT_FFMPEG'];
  if (configured !== undefined && configured.trim() !== '' && exists(resolve(configured))) return { path: resolve(configured), rule: 'PLAYWRIGHT_FFMPEG', registry, lookedAt };
  const binaries = FFMPEG_BINARIES[platform] ?? FFMPEG_BINARIES.linux;
  const revision = requestedRevision();
  const candidates = revision === null ? [] : [{ directory: `ffmpeg-${revision}`, rule: 'browsers.json revision' }];
  if (existsSync(registry)) {
    const others = readdirSync(registry)
      .filter((name) => /^ffmpeg-\d+$/.test(name) && name !== `ffmpeg-${revision ?? ''}`)
      .sort((a, b) => Number(b.slice('ffmpeg-'.length)) - Number(a.slice('ffmpeg-'.length)));
    candidates.push(...others.map((directory) => ({ directory, rule: 'highest ffmpeg-* directory' })));
  }
  for (const { directory, rule } of candidates) {
    for (const binary of binaries) {
      const candidate = join(registry, directory, binary);
      if (exists(candidate)) return { path: candidate, rule, registry, lookedAt };
    }
  }
  return { path: null, rule: null, registry, lookedAt };
}

function describeMissingFfmpeg({ registry, lookedAt }) {
  const looked = lookedAt.length === 0 ? 'nothing to look at' : lookedAt.join(', ');
  return `no ffmpeg found. Looked at: ${looked}; Playwright registry ${registry}${existsSync(registry) ? '' : ' (missing)'}. Run \`${INSTALL_FIX}\`, or point PLAYWRIGHT_FFMPEG at an ffmpeg binary.`;
}

/** Wall seconds per step at `speed`: stepWeights[i] × baseSeconds / speed. */
function stepSeconds(facts, speed) {
  return facts.stepWeights.map((weight) => (weight * facts.baseSeconds) / speed);
}

/** Wall time of timeline position `t`: the full steps before it plus the fraction of the step it is in. */
function wallTimeOf(t, seconds) {
  const whole = Math.min(seconds.length, Math.floor(t));
  let wall = 0;
  for (let i = 0; i < whole; i += 1) wall += seconds[i];
  if (whole < seconds.length) wall += (t - whole) * seconds[whole];
  return wall;
}

/** Timeline position at wall time `wall`, walking the steps; at or past the end it is N. */
function timeAtWall(wall, seconds) {
  let start = 0;
  for (let i = 0; i < seconds.length; i += 1) {
    if (wall < start + seconds[i]) return i + (wall - start) / seconds[i];
    start += seconds[i];
  }
  return seconds.length;
}

/** The t of every frame (header, Time): wall time from --from, round(seconds × fps) frames, the last exactly on the clip's end. */
function planFrames(options, seconds) {
  const wallFrom = wallTimeOf(options.from, seconds);
  const wallEnd = wallTimeOf(options.to, seconds);
  const limited = options.seconds !== null && wallFrom + options.seconds < wallEnd;
  const wallTo = limited ? wallFrom + options.seconds : wallEnd;
  const clipTo = limited ? timeAtWall(wallTo, seconds) : options.to;
  const count = Math.max(2, Math.round((wallTo - wallFrom) * options.fps));
  const frames = [];
  for (let k = 0; k < count; k += 1) {
    frames.push(k === count - 1 ? clipTo : Math.min(clipTo, Math.max(options.from, timeAtWall(wallFrom + k / options.fps, seconds))));
  }
  return { frames, wallFrom, wallTo, clipTo, wallTotal: wallTimeOf(seconds.length, seconds) };
}

/** The clip's range checked against the page's N; exits with the problem when it is outside. */
function checkRange(options, facts) {
  const { N } = facts;
  if (!Number.isInteger(N) || N <= 0) throw new ExportError(`the page published no usable N (window.__sculpture.N must be a whole number above 0; got ${JSON.stringify(N)}), so --from and --to have no range.`);
  if (facts.stepWeights.length !== N || !Number.isFinite(facts.baseSeconds) || facts.baseSeconds <= 0) throw new ExportError(`the page published ${String(facts.stepWeights.length)} step weights for N=${String(N)} and baseSeconds=${JSON.stringify(facts.baseSeconds)}; the time mapping needs one weight per step and a positive baseSeconds.`);
  const to = options.to ?? N;
  if (options.from >= N) throw new ExportError(`--from ${String(options.from)} is at or past N=${String(N)}, the end of the timeline: it takes a number from 0 below --to.`);
  if (to > N) throw new ExportError(`--to ${String(to)} is above N=${String(N)}, the end of the timeline: it takes a number above --from and at most ${String(N)}.`);
  return { ...options, to };
}

function frameUrl(options, t) {
  return `${BASE}/?shot=1&noui=1&view=${encodeURIComponent(options.view)}&t=${String(t)}`;
}

/** What a rendered frame must satisfy before it is written: facts, no ignored parameter, the asked t, no console error. */
function checkFrame(index, t, url, facts, errors) {
  const label = `frame ${String(index + 1)} at t=${String(t)}`;
  if (facts === null) throw new ExportError(`${label}: the page published no facts (window.__sculpture), which the ?shot=1 contract requires.`);
  if (facts.queryProblems.length > 0) throw new ExportError(`${label}: the page ignored a parameter of ${url}: ${facts.queryProblems.join(' | ')}`);
  if (Math.abs(facts.t - t) > T_TOLERANCE) throw new ExportError(`${label}: the page rendered t=${String(facts.t)}, not the requested t; the seek or the URL did not land.`);
  if (errors.length > 0) throw new ExportError(`${label}: the page logged an error: ${errors.join(' | ')}`);
}

/** Renders every frame to FRAMES_DIR; returns the files in order. */
async function captureFrames(capturePage, options, frames) {
  const { page, errors, warnings } = capturePage;
  const files = [];
  const started = performance.now();
  for (let k = 0; k < frames.length; k += 1) {
    const t = frames[k];
    const url = frameUrl(options, t);
    errors.length = 0;
    warnings.length = 0;
    let facts;
    try {
      facts = options.reload || k === 0 ? await loadReady(page, url) : await seekReady(page, t);
    } catch (error) {
      throw new ExportError(`frame ${String(k + 1)} at t=${String(t)} did not become ready (${describe(error)})${logged(errors)}; the page must set window.__shotReady after ${options.reload || k === 0 ? url : 'window.__shotSeek'}.`);
    }
    checkFrame(k, t, url, facts, errors);
    const file = join(FRAMES_DIR, `${String(k + 1).padStart(5, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: JPEG_QUALITY });
    files.push(file);
    if ((k + 1) % PROGRESS_EVERY === 0 || k === frames.length - 1) {
      const elapsed = (performance.now() - started) / 1000;
      const remaining = (elapsed / (k + 1)) * (frames.length - k - 1);
      console.log(`${NAME}: frame ${String(k + 1)}/${String(frames.length)}  t=${t.toFixed(3)}  ${elapsed.toFixed(1)} s elapsed, about ${remaining.toFixed(1)} s left`);
    }
  }
  return files;
}

async function* frameBytes(files) {
  for (const file of files) yield await readFile(file);
}

/** Streams the frames into ffmpeg (header, Encode); resolves with ffmpeg's stderr, rejects with its exit code and last lines. */
async function encode(ffmpeg, files, fps, out) {
  const args = ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'libvpx', '-b:v', '6M', '-pix_fmt', 'yuv420p', '-auto-alt-ref', '0', out];
  const child = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => void (stderr += String(chunk)));
  const exit = new Promise((resolveExit, reject) => {
    child.on('error', (error) => reject(new ExportError(`ffmpeg could not start (${ffmpeg}): ${describe(error)}`)));
    child.on('close', (code) => resolveExit(code));
  });
  // A pipe error (EPIPE when ffmpeg stops reading) is explained by the exit code below, so it is not reported on its own.
  await pipeline(Readable.from(frameBytes(files)), child.stdin).catch(() => undefined);
  const code = await exit;
  if (code !== 0) {
    const tail = stderr.trim().split(/\r?\n|\r/).slice(-8).join('\n  ');
    throw new ExportError(`ffmpeg exited with code ${String(code)} encoding ${String(files.length)} frames into ${out}; its last lines:\n  ${tail}`);
  }
  return stderr;
}

function readMagic(file) {
  const bytes = Buffer.alloc(EBML_MAGIC.length);
  const fd = openSync(file, 'r');
  try {
    return bytes.subarray(0, readSync(fd, bytes, 0, bytes.length, 0));
  } finally {
    closeSync(fd);
  }
}

/** `ffmpeg -i <out>`: ffmpeg exits 1 without an output file, so the report is read from the rejection's stderr. */
function probe(ffmpeg, out) {
  return promisify(execFile)(ffmpeg, ['-hide_banner', '-i', out]).then(
    (result) => result.stderr,
    (error) => (typeof error?.stderr === 'string' ? error.stderr : ''),
  );
}

/** The output checks of the header: exists and not empty, EBML magic, ffmpeg's report, duration within a frame of frames / fps. */
async function checkOutput(ffmpeg, out, frameCount, fps) {
  if (!existsSync(out)) throw new ExportError(`ffmpeg exited 0 but wrote no file at ${out}.`);
  const { size } = statSync(out);
  if (size === 0) throw new ExportError(`ffmpeg exited 0 but ${out} is empty (0 bytes).`);
  const magic = readMagic(out);
  if (magic.length !== EBML_MAGIC.length || EBML_MAGIC.some((byte, i) => magic[i] !== byte)) {
    const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    throw new ExportError(`${out} starts with ${hex(magic)}, not the EBML magic ${hex(EBML_MAGIC)} of a WebM file.`);
  }
  const report = (await probe(ffmpeg, out)).split(/\r?\n/).filter((line) => /Duration:|Stream #/.test(line));
  if (report.length === 0) throw new ExportError(`ffmpeg -i ${out} reported no Duration: or Stream line, so the file is not a readable WebM.`);
  for (const line of report) console.log(`${NAME}: ${line.trim()}`);
  const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report.join('\n'));
  if (match === null) throw new ExportError(`ffmpeg -i ${out} reported no duration; expected ${(frameCount / fps).toFixed(2)} s for ${String(frameCount)} frames at ${String(fps)} fps.`);
  const reported = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  const expected = frameCount / fps;
  if (Math.abs(reported - expected) > 1 / fps + 0.02) throw new ExportError(`${out} reports a duration of ${reported.toFixed(2)} s, but ${String(frameCount)} frames at ${String(fps)} fps are ${expected.toFixed(2)} s: frames were dropped or doubled in the encode.`);
  return size;
}

async function main() {
  const parsed = parseOptions(process.argv.slice(2));
  if (parsed === null) {
    console.log(USAGE);
    return 0;
  }
  const ffmpeg = findFfmpeg();
  if (ffmpeg.path === null) throw new ExportError(describeMissingFfmpeg(ffmpeg));
  if (!(await serverReachable(BASE))) {
    console.error(noServerMessage(NAME, BASE));
    return 2;
  }
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });
  framesDirectoryOwned = true;
  mkdirSync(dirname(parsed.out), { recursive: true });
  const capturePage = await openCapturePage({ width: parsed.width, height: parsed.height });
  let files, options, plan;
  try {
    const firstUrl = frameUrl(parsed, parsed.from);
    let facts;
    try {
      facts = await loadReady(capturePage.page, firstUrl);
    } catch (error) {
      throw new ExportError(`the first load of ${firstUrl} did not become ready (${describe(error)})${logged(capturePage.errors)}; the export needs the page's facts from window.__sculpture.`);
    }
    checkFrame(0, parsed.from, firstUrl, facts, capturePage.errors);
    options = checkRange(parsed, facts);
    plan = planFrames(options, stepSeconds(facts, options.speed));
    console.log(`${NAME}: ${String(plan.frames.length)} frames at ${String(options.fps)} fps (${(plan.frames.length / options.fps).toFixed(2)} s) from t=${String(options.from)} to t=${String(plan.clipTo)}, wall ${plan.wallFrom.toFixed(1)} to ${plan.wallTo.toFixed(1)} s at speed ${String(options.speed)} (the whole making is ${plan.wallTotal.toFixed(1)} s), view ${options.view}, ${String(options.width)}×${String(options.height)}, ${options.reload ? 'reload' : 'seek'} path`);
    files = await captureFrames(capturePage, options, plan.frames);
  } finally {
    await capturePage.close();
  }
  console.log(`${NAME}: encoding with ${ffmpeg.path} (found by ${ffmpeg.rule})`);
  await encode(ffmpeg.path, files, options.fps, options.out);
  const size = await checkOutput(ffmpeg.path, options.out, files.length, options.fps);
  if (options.keepFrames) console.log(`${NAME}: ${String(files.length)} frames kept in ${FRAMES_DIR}`);
  else rmSync(FRAMES_DIR, { recursive: true, force: true });
  console.log(`${NAME}: ${String(files.length)} frames at ${String(options.fps)} fps = ${(files.length / options.fps).toFixed(2)} s of output, ${String(size)} bytes, ${options.out}`);
  return 0;
}

function isMain() {
  const script = process.argv[1];
  if (script === undefined) return false;
  const [a, b] = [resolve(script), fileURLToPath(import.meta.url)];
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isMain()) {
  try {
    process.exitCode = await main();
  } catch (error) {
    if (!(error instanceof ExportError)) throw error;
    console.error(`${NAME}: ${error.message}`);
    const written = framesDirectoryOwned && existsSync(FRAMES_DIR) ? readdirSync(FRAMES_DIR).length : 0;
    if (written > 0) console.error(`${NAME}: the ${String(written)} frames written so far stay in ${FRAMES_DIR} for inspection.`);
    else if (framesDirectoryOwned) rmSync(FRAMES_DIR, { recursive: true, force: true });
    process.exitCode = 1;
  }
}
