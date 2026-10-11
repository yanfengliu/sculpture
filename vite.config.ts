import { defineConfig } from 'vite';

import { devPort } from './scripts/harness.mjs';

/**
 * One page, `index.html`. `base: './'` keeps every asset URL relative, so the built site works from any path.
 * The dev and preview servers listen on `SCULPTURE_PORT` (default 5181) and fail rather than move to another port, so a client never reaches a server of another worktree or repo.
 * `three` alone minifies to about 520 kB, so the default 500 kB chunk warning would fire on every build; the limit is 1 MB, and a chunk over it is app code worth splitting.
 */
const port = devPort();

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port, strictPort: true },
  preview: { host: '127.0.0.1', port, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1000,
    // The tools gallery (tools.html, src/tools/dev) and the engine's dev page (engine.html, src/stock/dev) are further page entries.
    rolldownOptions: { input: ['index.html', 'tools.html', 'engine.html'] },
  },
});
