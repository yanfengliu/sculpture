/**
 * Checks the plan file against the browser (docs/design/spec.md, Undo and replay): with the dev server running, opens a headless page on the installed Chrome and has scripts/lib/plan/verify-replay.ts replay the David's whole plan in the page's worker pool, comparing the grids' SHA-256 with the table's at every snapshot. The snapshots are built in Node; a jump through one equals a replay only if the browser's carving writes the same bytes, which this is the check of (about 25 s on this machine).
 *
 * Usage: node scripts/verify-plan.mjs     with `npm run dev` running and `npm run model` built
 * env:   SHOT_BASE  origin of the dev server, default http://127.0.0.1:<SCULPTURE_PORT or 5181>
 * Exit:  0 every snapshot matched; 1 one differed or the check failed, with the reason; 2 the dev server could not be reached.
 */
import { chromium } from '@playwright/test';

import { BROWSER_ARGS, BROWSER_CHANNEL, devOrigin } from './harness.mjs';
import { noServerMessage, serverReachable } from './lib/capture.mjs';

const BASE = (process.env['SHOT_BASE'] ?? devOrigin()).replace(/\/$/, '');
const WORKERS = 8;
const TIMEOUT_MS = 600_000;

if (!(await serverReachable(BASE))) {
  console.error(noServerMessage('verify-plan', BASE));
  process.exit(2);
}

const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true, args: [...BROWSER_ARGS] });
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`verify-plan: page error: ${message.text()}`);
  });
  await page.exposeFunction('reportCheck', (check) => {
    console.log(`verify-plan: ${check.same ? 'same   ' : 'DIFFERS'} ${check.file} at blow ${String(check.blow)} (${check.seconds.toFixed(1)} s)`);
  });
  // The synthetic figure keeps the page's own making light while the check runs its own.
  await page.goto(`${BASE}/?shot=1&model=synthetic&autoplay=0`, { waitUntil: 'load' });
  page.setDefaultTimeout(TIMEOUT_MS);
  // A string expression, evaluated in the page: `window` and the import are the browser's.
  const checks = await page.evaluate(`(async () => { const { verifyReplay } = await import('/scripts/lib/plan/verify-replay.ts'); return verifyReplay(${String(WORKERS)}, (check) => window.reportCheck(check)); })()`);
  const differing = checks.filter((check) => !check.same);
  if (differing.length > 0 || checks.length === 0) {
    failed = true;
    console.error(`verify-plan: ${String(differing.length)} of ${String(checks.length)} snapshots differ from the page's replay: the browser's carving does not write Node's bytes there, so a jump through those snapshots and a replay reach different states; rebuild with npm run model:plan and look for a transcendental Math call in the carving (docs/research/decisions.md, Engine).`);
  } else {
    console.log(`verify-plan: all ${String(checks.length)} snapshots equal the page's replay`);
  }
} catch (error) {
  failed = true;
  console.error(`verify-plan: the check did not finish: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
