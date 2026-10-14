/**
 * Frame-rate probe (docs/design/spec.md, Budgets: playback at 1× holds 60 frames per second): opens the running dev server in headless Chrome through Playwright, brings the page to a position, then records `requestAnimationFrame` intervals for a while in two scenes and prints the median and the 5th-percentile frame rate of each.
 *   - `play`: the David from the start of the point's roughing (`t=` FPS_PLAY_T, default 2), playing forward at 1× through the real Play button.
 *   - `orbit`: the finished David (`t=` FPS_ORBIT_T, default 21) from the FPS_ORBIT_VIEW preset (default three-quarter; `hands` fills most of the frame with marble, the shader's worst case), the camera dragged round by the mouse for the whole window.
 * Usage: node scripts/capture-fps.mjs            with `npm run dev` running in another terminal
 * env:   SHOT_BASE  origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 *        FPS_SECONDS  the window, default 10; FPS_MODEL  david or synthetic, default david; SHOT_W, SHOT_H  default 1400 × 1000 at device scale 1
 * Exit:  0 measured, 1 a page error or a timeout, 2 the dev server could not be reached.
 * Bound: it measures this machine's GPU and CPU under whatever else runs, with the WebGL renderer the page reports printed beside the numbers; it asserts nothing, so it is a record, not a gate. The 5th percentile is the frame rate 95 % of frames beat.
 */
import { devOrigin } from './harness.mjs';
import { READY_TIMEOUT_MS, noServerMessage, openCapturePage, serverReachable } from './lib/capture.mjs';

const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const SECONDS = Number(process.env['FPS_SECONDS'] ?? 10);
const MODEL = process.env['FPS_MODEL'] ?? 'david';
const WIDTH = Number(process.env['SHOT_W'] ?? 1400);
const HEIGHT = Number(process.env['SHOT_H'] ?? 1000);
const PLAY_T = Number(process.env['FPS_PLAY_T'] ?? 2);
const ORBIT_T = Number(process.env['FPS_ORBIT_T'] ?? 21);
const ORBIT_VIEW = process.env['FPS_ORBIT_VIEW'] ?? 'three-quarter';

/** Collects requestAnimationFrame timestamps in the page for `seconds` and returns the intervals in milliseconds. */
const RECORD = `(seconds) => new Promise((resolve) => {
  const stamps = [];
  const frame = (now) => {
    stamps.push(now);
    if (now - stamps[0] < seconds * 1000) requestAnimationFrame(frame);
    else resolve(stamps.slice(1).map((stamp, i) => stamp - stamps[i]));
  };
  requestAnimationFrame(frame);
})`;

function summary(intervals) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN;
  const median = at(0.5);
  const slow = at(0.95);
  return { frames: intervals.length, medianFps: 1000 / median, p5Fps: 1000 / slow, medianMs: median, p95Ms: slow, worstMs: sorted.at(-1) ?? Number.NaN };
}

function line(name, s, extra) {
  return `${name}: ${String(s.frames)} frames, median ${s.medianFps.toFixed(1)} fps (${s.medianMs.toFixed(1)} ms), 5th percentile ${s.p5Fps.toFixed(1)} fps (${s.p95Ms.toFixed(1)} ms), worst ${s.worstMs.toFixed(1)} ms${extra}`;
}

/** Loads `query` without the shot contract and waits until the making is at `t` with every chunk meshed. */
async function settle(page, query, t) {
  await page.goto(`${BASE}/?${query}`, { waitUntil: 'load', timeout: READY_TIMEOUT_MS });
  // String expressions, evaluated in the page: `window` is the browser's, not this script's.
  await page.waitForFunction(`(() => { const facts = window.__sculpture; return facts !== undefined && Math.abs(facts.t - ${String(t)}) < 1e-9 && facts.dirtyChunks === 0 && !facts.moving; })()`, undefined, { timeout: READY_TIMEOUT_MS, polling: 250 });
  // Let the first remesh and the shader compile settle before the window opens.
  await page.waitForTimeout(1500);
}

if (!(await serverReachable(BASE))) {
  console.error(noServerMessage('capture-fps', BASE));
  process.exit(2);
}

const { page, errors, close } = await openCapturePage({ width: WIDTH, height: HEIGHT });
let failed = false;
try {
  await settle(page, `model=${MODEL}&t=${String(PLAY_T)}&autoplay=0&view=three-quarter`, PLAY_T);
  const renderer = await page.evaluate(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const info = gl?.getExtension('WEBGL_debug_renderer_info'); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
  console.log(`renderer: ${String(renderer)}; ${String(WIDTH)} × ${String(HEIGHT)} at device scale 1; ${String(SECONDS)} s windows; ${MODEL}`);
  await page.getByTestId('play-pause').click();
  const playStart = await page.evaluate('window.__sculpture.t');
  const play = summary(await page.evaluate(`(${RECORD})(${String(SECONDS)})`));
  const playEnd = await page.evaluate('window.__sculpture.t');
  console.log(line(`play at 1× from t = ${String(PLAY_T)}`, play, `; t ran ${playStart.toFixed(3)} to ${playEnd.toFixed(3)}`));

  await settle(page, `model=${MODEL}&t=${String(ORBIT_T)}&autoplay=0&view=${ORBIT_VIEW}`, ORBIT_T);
  const recording = page.evaluate(`(${RECORD})(${String(SECONDS)})`);
  // Drag across the canvas and back for the whole window, as a hand orbits.
  const y = HEIGHT * 0.45;
  await page.mouse.move(WIDTH * 0.3, y);
  await page.mouse.down();
  const until = Date.now() + SECONDS * 1000;
  for (let step = 0; Date.now() < until; step += 1) {
    const phase = (step % 120) / 120;
    await page.mouse.move(WIDTH * (0.3 + 0.4 * Math.abs(2 * phase - 1)), y + 40 * Math.sin(step / 15), { steps: 1 });
  }
  await page.mouse.up();
  const orbit = summary(await recording);
  console.log(line(`orbit at t = ${String(ORBIT_T)} from ${ORBIT_VIEW}`, orbit, ''));
  if (errors.length > 0) {
    failed = true;
    console.error(`page errors: ${errors.join(' | ')}`);
  }
} catch (error) {
  failed = true;
  console.error(`capture-fps: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
