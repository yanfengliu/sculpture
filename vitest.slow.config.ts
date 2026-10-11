import { defineConfig } from 'vitest/config';

/** The slow unit cases (`*.slow.test.ts`, about a minute each: full plans and replays at the page's 8 mm resolution), run on request through `npm run test:slow`; the pre-commit gate (`vitest.config.ts`) excludes them. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.slow.test.ts'],
    testTimeout: 300_000,
  },
});
