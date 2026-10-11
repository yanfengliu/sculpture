import { defineConfig } from '@playwright/test';

import { BROWSER_ARGS, BROWSER_CHANNEL, PORT_VARIABLE, devOrigin, devPort } from './scripts/harness.mjs';

/**
 * Chromium only, headless, at the capture viewport of 1400×1000 CSS pixels with a device scale factor of 1, so the canvas the tests measure is the canvas `scripts/capture-shots.mjs` captures.
 * The browser is the installed Chrome (`scripts/harness.mjs` says why); no browser is downloaded.
 * The suite starts its own Vite dev server on `SCULPTURE_PORT` (default 5181) and never reuses one that is already running, so a test cannot reach the server of another worktree. If the port is taken the run fails instead of borrowing it.
 */
const port = devPort();
const origin = devOrigin();

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: origin,
    headless: true,
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { channel: BROWSER_CHANNEL, launchOptions: { args: [...BROWSER_ARGS] } },
    },
  ],
  webServer: {
    command: `npx vite --port ${String(port)} --strictPort`,
    url: origin,
    env: { [PORT_VARIABLE]: String(port) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
