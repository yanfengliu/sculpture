import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** The Node globals the plain-JavaScript scripts use. ESLint ships no Node environment and the `globals` package is not a dependency, so the list is kept here; extend it when a script needs another. */
const NODE_GLOBALS = Object.fromEntries(
  [
    'AbortController',
    'AbortSignal',
    'Buffer',
    'console',
    'crypto',
    'fetch',
    'performance',
    'process',
    'queueMicrotask',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
    'structuredClone',
    'TextDecoder',
    'TextEncoder',
    'URL',
    'URLSearchParams',
  ].map((name) => [name, 'readonly']),
);

export default defineConfig(
  // Build output, task evidence and local caches; the same set .gitignore keeps out of Git.
  globalIgnores(['dist/', 'output/', 'tmp/', 'coverage/', '.shots/', 'test-results/', 'playwright-report/', 'assets/cache/', 'public/model/']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
  // Plain JavaScript (this file, scripts/*.mjs) is not type-checked by tsc, so the type-checked rules cannot apply to it; it keeps the base rules plus the Node globals.
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: NODE_GLOBALS },
  },
);
