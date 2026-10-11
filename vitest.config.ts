import { defineConfig } from 'vitest/config';

/** Unit tests only, in Node. Playwright specs live in `tests/e2e/` and run through `npm run test:e2e`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
