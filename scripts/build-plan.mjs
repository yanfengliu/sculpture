/**
 * Builds the David's plan file and snapshots (docs/design/spec.md, Undo and replay; src/timeline/plan-file.ts) from the grid scripts/build-grid.mjs wrote: plans every step in Node as the page would, replays the plan once and writes, into `public/model/` (ignored):
 *   david.plan.bin   every step's blows and the cells its end sweep took off;
 *   david.plan.json  the header: format, PLAN_VERSION, the grid's SHA-256, the step ids, the plan's length and digests, and the snapshot table;
 *   david.snap.<i>.bin.gz  the stock and finish at blow 0, at every step's end and inside the steps whose replay would take the page's pool longer than about a second (src/timeline/replay-cost.ts).
 * The header, the data and the snapshots of an earlier build are deleted first and the header is written last, so an interrupted build leaves no header and the page plans for itself rather than trusting a table whose files are gone. The engine's TypeScript is loaded through Vite's module runner (`runnerImport`), which resolves and transpiles it as the page's bundle does.
 *
 * Usage: node scripts/build-plan.mjs        (after npm run model:grid; npm run model runs both)
 * Exit:  0 the files are written; 1 the grid is missing or does not match its header, or the build failed, with the reason.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzipSync, gzip } from 'node:zlib';

import { runnerImport } from 'vite';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_DIR = join(REPO_ROOT, 'public', 'model');
const GRID_HEADER = join(MODEL_DIR, 'david.json');
const GRID_DATA = join(MODEL_DIR, 'david.bin.gz');
const SNAPSHOT_FILE = /^david\.snap\.\d+\.bin\.gz$/;
const gzipAsync = promisify(gzip);

function log(message) {
  console.log(`build-plan: ${message}`);
}

function fail(message) {
  console.error(`build-plan: ${message}`);
  process.exit(1);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

async function main() {
  const started = performance.now();
  if (!existsSync(GRID_HEADER) || !existsSync(GRID_DATA)) fail(`no grid at ${GRID_HEADER} and ${GRID_DATA}; run \`npm run model:grid\` (or \`npm run model\`) first.`);
  const header = JSON.parse(readFileSync(GRID_HEADER, 'utf8'));
  const raw = gunzipSync(readFileSync(GRID_DATA));
  const digest = sha256(raw);
  if (digest !== String(header.sha256).toLowerCase()) fail(`${GRID_DATA} inflates to bytes with SHA-256 ${digest}, and ${GRID_HEADER} says ${String(header.sha256)}; rebuild the grid with \`npm run model:grid\`.`);
  const cells = header.size[0] * header.size[1] * header.size[2];
  if (raw.byteLength !== cells * 2) fail(`${GRID_DATA} holds ${String(raw.byteLength)} bytes and the header's ${header.size.join('×')} Int16 cells need ${String(cells * 2)}.`);
  const values = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  log(`grid ${header.size.join('×')} at ${String(header.cell)} m, SHA-256 ${digest.slice(0, 16)}…`);

  mkdirSync(MODEL_DIR, { recursive: true });
  const stale = readdirSync(MODEL_DIR).filter((name) => SNAPSHOT_FILE.test(name) || name === 'david.plan.json' || name === 'david.plan.bin');
  for (const name of stale) unlinkSync(join(MODEL_DIR, name));
  if (stale.length > 0) log(`deleted ${String(stale.length)} files of an earlier build`);

  const { module } = await runnerImport(join(REPO_ROOT, 'scripts', 'lib', 'plan', 'david-plan.ts'), { root: REPO_ROOT, configFile: false, logLevel: 'error' });
  // Each snapshot is gzipped on libuv's threads while the replay goes on; the sizes go into the table once all are written.
  const writes = [];
  const gzipped = new Map();
  let rawTotal = 0;
  const built = module.buildDavidPlan({
    header,
    values,
    log: (line) => log(line),
    sha256,
    store: (file, bytes) => {
      rawTotal += bytes.byteLength;
      const copy = bytes.slice();
      writes.push(
        gzipAsync(copy, { level: 6 }).then((compressed) => {
          writeFileSync(join(MODEL_DIR, file), compressed);
          gzipped.set(file, compressed.byteLength);
        }),
      );
      return { gzipBytes: 0, sha256: sha256(copy) };
    },
  });
  await Promise.all(writes);
  const snapshots = built.header.snapshots.map((entry) => ({ ...entry, gzipBytes: gzipped.get(entry.file) ?? 0 }));
  const planHeader = { ...built.header, snapshots };
  writeFileSync(join(MODEL_DIR, 'david.plan.bin'), built.bytes);
  writeFileSync(join(MODEL_DIR, 'david.plan.json'), `${JSON.stringify(planHeader, null, 1)}\n`);
  const gzTotal = snapshots.reduce((sum, entry) => sum + entry.gzipBytes, 0);
  const largest = snapshots.reduce((best, entry) => (entry.gzipBytes > best.gzipBytes ? entry : best), snapshots[0]);
  const longest = snapshots.reduce((best, entry) => (entry.replaySeconds > best.replaySeconds ? entry : best), snapshots[0]);
  log(`plan: ${String(planHeader.planLength)} blows over ${String(planHeader.steps.length)} steps, digest ${planHeader.planDigest}, ${String(planHeader.sweptCells.reduce((a, b) => a + b, 0))} swept cells; david.plan.bin ${mb(built.bytes.byteLength)}`);
  log(`snapshot table (blow, step, inflated, gzipped, estimated replay to the next): ${snapshots.map((entry) => `${String(entry.blow)} s${String(entry.step)} ${(entry.bytes / 1e6).toFixed(1)}/${(entry.gzipBytes / 1e6).toFixed(2)} MB ${entry.replaySeconds.toFixed(2)} s`).join('; ')}`);
  log(`snapshots: ${String(snapshots.length)}, ${mb(rawTotal)} inflated and ${mb(gzTotal)} gzipped in all, ${mb(gzTotal / snapshots.length)} gzipped on average, the largest ${largest.file} ${mb(largest.gzipBytes)} gzipped (${mb(largest.bytes)} inflated); the longest segment's estimated replay ${longest.replaySeconds.toFixed(2)} s from ${longest.file}`);
  log(`wrote ${join(MODEL_DIR, 'david.plan.json')} and its files in ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((error) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
