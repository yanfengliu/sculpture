import { defineConfig } from 'vitest/config';

/** Unit tests only, in Node. Playwright specs live in `tests/e2e/` and run through `npm run test:e2e`; the minute-long `*.slow.test.ts` cases run through `npm run test:slow` (vitest.slow.config.ts), so the pre-commit gate stays fast. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.slow.test.ts'],
    // 20 s, not the 5 s default: the grid tests take 1 to 4 s alone and went red by timeout while three worktrees ran their suites at once (2026-10-11); a timeout is not one of the claims these tests make.
    testTimeout: 20_000,
  },
});
