/**
 * What the dev server, the e2e suite and the capture script share, so they cannot disagree.
 *
 * Port: `SCULPTURE_PORT`, default 5181. `vite.config.ts` and `playwright.config.ts` both read it here, with `strictPort`, so a taken port fails the run rather than moving to a port the client does not know about.
 * 5181 collides with neither met (5310) nor 3d-maker (5199); a second sculpture worktree that runs `npm run test:e2e` at the same time sets its own `SCULPTURE_PORT`.
 *
 * Browser: Playwright 1.64 wants its own Chromium build 1248, which is not installed on this machine (builds 1217 to 1243 are), so the harnesses run headless on the installed Chrome (`channel: 'chrome'`) and download nothing. `npx playwright install chromium` plus deleting `BROWSER_CHANNEL` switches to the bundled build.
 * `--enable-unsafe-swiftshader` keeps WebGL available when headless Chrome has no GPU; Playwright adds it for its own Chromium, and a system Chrome without it may refuse the context.
 *
 * Bound: `devPort` validates the value and nothing else; whether the port is free is the server's job.
 */

export const DEFAULT_PORT = 5181;
export const PORT_VARIABLE = 'SCULPTURE_PORT';
export const BROWSER_CHANNEL = 'chrome';
export const BROWSER_ARGS = Object.freeze(['--enable-unsafe-swiftshader']);

const FIRST_PORT = 1024;
const LAST_PORT = 65535;

/** Reads `SCULPTURE_PORT` from `env`. Unset or blank gives the default; anything but a whole number from 1024 to 65535 throws. */
export function devPort(env = process.env) {
  const text = (env[PORT_VARIABLE] ?? '').trim();
  if (text === '') return DEFAULT_PORT;
  const port = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!(port >= FIRST_PORT && port <= LAST_PORT)) {
    throw new Error(
      `${PORT_VARIABLE} must be a whole number from ${String(FIRST_PORT)} to ${String(LAST_PORT)} (the dev-server port of this worktree); got "${text}". Unset it to use ${String(DEFAULT_PORT)}.`,
    );
  }
  return port;
}

/** The dev server's origin for the port `env` selects. */
export function devOrigin(env = process.env) {
  return `http://127.0.0.1:${String(devPort(env))}`;
}
