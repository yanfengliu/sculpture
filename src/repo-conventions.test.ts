/**
 * The repo's prose rules (AGENTS.md; docs/design/spec.md, Query contract) as gates. What a green result proves, and no more:
 *
 *   1. Line bound. No file under `src/`, `scripts/` or `tests/` has more than 500 lines.
 *      - Inclusive: 500 lines pass, 501 fail. AGENTS.md says "under 500", one line stricter; this gate is the looser reading, so a file at exactly 500 does not redden a tree nobody owns.
 *      - Lines are counted as an editor counts them: a trailing newline opens no line, and CRLF counts once.
 *      - Every text file under those roots counts, whatever its extension. A file with a NUL byte in its first 8000 bytes is binary and skipped, and so is any directory named like generated or task output (node_modules, dist, .shots, output, tmp, coverage, test-results, playwright-report).
 *      - Not counted: `docs/`, the root configs, `index.html` and anything else outside the three roots.
 *      - A failure names each offender's path and line count.
 *
 *   2. One URL reader. `src/viewer/query.ts` is the only file under `src/` that reads the page URL. Any other file under `src/` whose text matches /\blocation\b/, /new URL\(/ or the `URLSearchParams` constructor's name fails, with its path, line and text.
 *      - Textual and unanchored: a comment that names the global counts too, so rephrase the comment (say "position", not "location"). The third pattern is built from two fragments below so this file does not match itself.
 *      - `*.test.ts` under `src/` are out of scope: they run in Node, never in the page, and read fixtures through `new URL(…, import.meta.url)`.
 *      - `new URL(` is a hit even for a module-relative asset URL: create a Web Worker through Vite's `?worker` import, not through `new URL('./worker.ts', import.meta.url)`.
 *      - Both directions: `src/viewer/query.ts` must exist and must itself match a pattern, so renaming or hollowing it out fails instead of leaving a stale exemption.
 *      - Blind spots: an alias (`globalThis['loc' + 'ation']`), `document.URL`, `document.baseURI`, `history`, and reads outside `src/`.
 *
 *   3. No environment reads. No file under `src/`, tests included, matches /import\.meta\.env/ or /process\.env/: runtime inputs reach the app through the page URL only. This header writes both as escaped regexes so it matches neither.
 *      - Blind spots: an alias of the meta object, a computed key, and files outside `src/` (`vite.config.ts` and `scripts/harness.mjs` read the process environment on purpose).
 *
 *   4. No pinned constants. No test file (`*.test.ts`, `*.spec.ts`) under the three roots asserts the literal value of a constant it imports: a line matching `expect(NAME…).toBe|toEqual|toStrictEqual(<literal>)` fails, with its path, line and text, where NAME is an UPPER_SNAKE_CASE name the file imports (from `src/contracts/` or any other module), optionally followed by member or index access, and the literal starts with a digit, a minus sign, a quote, `{` or `[`. A constant is a decision; a test checks what the code does with it (the lesson of 2026-10-11: `scripts/lib/model/grid-writer.test.ts` pinned `DEFAULT_BAND_CELLS` and went red on the next decision, never on a defect).
 *      - Line-based: an `expect(` split over lines, a constant renamed on import into lower case, or a constant reached through a function call (`dimension('point', 'shaftLength')`) passes.
 *
 *   5. No wall-clock bounds. No test file asserts an ordering bound (`toBeLessThan`, `toBeLessThanOrEqual`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`) on a wall-clock delta: `performance.now() -` or `Date.now() -` inside the `expect(…)`, or a name the file assigned, pushed or derived from one (followed through any number of assignments in the file). A bound in wall time measures the machine's load as much as the code (the lesson of 2026-10-14: the determinism case of `src/timeline/making.test.ts` passed one full-suite run and failed the next at 3.35 s); state it in the file's own CPU time (`process.cpuUsage()`) or move it to the slow suite. A logged timing that asserts nothing stays.
 *      - Textual: a delta computed in a helper in another file, a destructured name, or `new Date()` arithmetic passes.
 *
 *   6. Anti-vacuity. Each root exists and holds at least one text file, so a renamed root or a broken walk fails instead of reporting "passed" for "did not run". The detectors also run on synthetic input below, so each has been seen to fail.
 *
 * This file reads the repository's own sources from disk and imports nothing from the app. It needs no browser.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** AGENTS.md, Conventions: files under 500 lines. Applied inclusively, see the header. */
const MAX_LINES = 500;
const LINE_ROOTS = ['src', 'scripts', 'tests'] as const;
const SRC_ROOT = 'src/';
/** docs/design/spec.md, Query contract: the only reader of the page URL. */
const URL_READER = 'src/viewer/query.ts';
const TEST_FILE = /\.test\.ts$/;
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', 'dist', '.shots', 'output', 'tmp', 'coverage', 'test-results', 'playwright-report']);
const BINARY_PROBE_BYTES = 8000;
/** The third is built from fragments so this file's own text does not match it; the first two are escaped for the same reason. */
const URL_PATTERNS: readonly RegExp[] = [/\blocation\b/, /new URL\(/, new RegExp(['URLSearch', 'Params'].join(''))];
/** Escaped, so this file's own source matches neither pattern and needs no exemption from itself. */
const ENV_PATTERNS: readonly RegExp[] = [/import\.meta\.env/, /process\.env/];
const ANY_TEST_FILE = /\.(test|spec)\.ts$/;
/** `expect(NAME…)` asserted equal to a literal; group 1 is the constant's name. Written with character classes so this file's own text does not match it. */
const PINNED = /\bexpect[(]\s*([A-Z][A-Z0-9_]*)(?:\.[A-Za-z_$][\w$]*|\[[^\]]*\])*\s*(?:,[^)]*)?[)]\s*\.(?:toBe|toEqual|toStrictEqual)[(]\s*(?:-?\d|['"`{[])/;
/** The names an import clause brings in, as written in the importing file. */
const IMPORT_CLAUSE = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
/** A wall-clock delta: the clock read and something subtracted from it. Built from fragments so this file's own text does not match it. */
const WALL_CLOCK = new RegExp(['\\b(?:performance\\.now|Date\\.now)', '\\(\\)\\s*-'].join(''));
const ORDERING_MATCHER = /\.(?:toBeLessThan|toBeLessThanOrEqual|toBeGreaterThan|toBeGreaterThanOrEqual)\(/;
const ASSIGNED_NAMES: readonly RegExp[] = [/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g, /\b([A-Za-z_$][\w$]*)\.push\(/g, /(?:^\s*|[;{]\s*)([A-Za-z_$][\w$]*)\s*[-+*/]?=(?![=>])/g];

interface SourceFile {
  /** Repository-relative, always with `/` separators. */
  readonly path: string;
  readonly text: string;
}

interface LineOffender {
  readonly path: string;
  readonly lines: number;
}

interface Hit {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

function compareNames(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function walk(directory: string, files: SourceFile[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(compareNames)) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(absolute, files);
    } else if (entry.isFile()) {
      const bytes = readFileSync(absolute);
      if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) continue;
      files.push({ path: relative(REPO_ROOT, absolute).split(sep).join('/'), text: bytes.toString('utf8') });
    }
  }
}

/** Every text file under one root. A missing or empty root throws, so the gate cannot pass without reading it. */
function loadRoot(root: string): SourceFile[] {
  const absolute = join(REPO_ROOT, root);
  if (!existsSync(absolute)) {
    throw new Error(`${root}/ does not exist, so this gate would read nothing from it: restore the directory, or remove it from LINE_ROOTS in src/repo-conventions.test.ts in the same commit.`);
  }
  const files: SourceFile[] = [];
  walk(absolute, files);
  if (files.length === 0) {
    throw new Error(`${root}/ holds no text files, so this gate would read nothing from it: the walk is broken or the directory was emptied; fix that, or remove the root from LINE_ROOTS in src/repo-conventions.test.ts.`);
  }
  return files;
}

const LINE_BREAK = /\r\n|\r|\n/;

/** Lines the way an editor counts them. */
function countLines(text: string): number {
  const lines = text.split(LINE_BREAK);
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

function lineOffenders(files: readonly SourceFile[]): LineOffender[] {
  return files.map(({ path, text }) => ({ path, lines: countLines(text) })).filter(({ lines }) => lines > MAX_LINES);
}

function matchingLines(files: readonly SourceFile[], patterns: readonly RegExp[], inScope: (path: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const { path, text } of files) {
    if (!inScope(path)) continue;
    text.split(LINE_BREAK).forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) hits.push({ path, line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

/** Page-URL reads in app code under `src/`: everything but the declared reader and the Node-run test files. */
function urlReads(files: readonly SourceFile[]): Hit[] {
  return matchingLines(files, URL_PATTERNS, (path) => path.startsWith(SRC_ROOT) && path !== URL_READER && !TEST_FILE.test(path));
}

/** Build or process environment reads anywhere under `src/`, test files included. */
function envReads(files: readonly SourceFile[]): Hit[] {
  return matchingLines(files, ENV_PATTERNS, (path) => path.startsWith(SRC_ROOT));
}

/** The names `text` imports, local names after `as`. */
function importedNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const clause of text.matchAll(IMPORT_CLAUSE)) {
    for (const part of (clause[1] ?? '').split(',')) {
      const name = part.replace(/^\s*type\s+/, '').split(/\s+as\s+/).at(-1)?.trim();
      if (name !== undefined && name !== '') names.add(name);
    }
  }
  return names;
}

/** Assertions of an imported constant's literal value in test files. */
function pinnedConstants(files: readonly SourceFile[]): Hit[] {
  const hits: Hit[] = [];
  for (const { path, text } of files) {
    if (!ANY_TEST_FILE.test(path)) continue;
    const imported = importedNames(text);
    text.split(LINE_BREAK).forEach((line, index) => {
      const name = PINNED.exec(line)?.[1];
      if (name !== undefined && imported.has(name)) hits.push({ path, line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

/** The text inside the first `expect(…)` of a line, to its matching parenthesis. */
function expectArgument(line: string): string | null {
  const start = line.indexOf('expect(');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + 'expect'.length; i < line.length; i += 1) {
    if (line[i] === '(') depth += 1;
    else if (line[i] === ')') {
      depth -= 1;
      if (depth === 0) return line.slice(start + 'expect('.length, i);
    }
  }
  return line.slice(start + 'expect('.length);
}

const mentions = (text: string, names: ReadonlySet<string>): boolean => [...names].some((name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(text));

/** Ordering bounds on a wall-clock delta in test files, following the delta through the names it is assigned to. */
function wallClockBounds(files: readonly SourceFile[]): Hit[] {
  const hits: Hit[] = [];
  for (const { path, text } of files) {
    if (!ANY_TEST_FILE.test(path)) continue;
    const lines = text.split(LINE_BREAK);
    const tainted = new Set<string>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const line of lines) {
        if (!WALL_CLOCK.test(line) && !mentions(line, tainted)) continue;
        for (const pattern of ASSIGNED_NAMES) {
          for (const match of line.matchAll(pattern)) {
            const name = match[1];
            if (name !== undefined && !tainted.has(name)) {
              tainted.add(name);
              grew = true;
            }
          }
        }
      }
    }
    lines.forEach((line, index) => {
      const argument = expectArgument(line);
      if (argument === null || !ORDERING_MATCHER.test(line)) return;
      if (WALL_CLOCK.test(argument) || mentions(argument, tainted)) hits.push({ path, line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

function describePinned({ path, line, text }: Hit): string {
  return `${path}:${String(line)} asserts an imported constant's literal value (${text}): that compares the constant with itself and goes red on the next decision, never on a defect; test what the code does with the constant instead.`;
}

function describeWallClock({ path, line, text }: Hit): string {
  return `${path}:${String(line)} bounds a wall-clock time (${text}): wall time grows with the machine's load and the suite's parallel files; measure the file's own CPU time with process.cpuUsage() or move the bound to the slow suite.`;
}

function describeLineOffender({ path, lines }: LineOffender): string {
  return `${path} has ${String(lines)} lines, ${String(lines - MAX_LINES)} over the ${String(MAX_LINES)}-line bound: split it into modules of one concern each.`;
}

function describeUrlRead({ path, line, text }: Hit): string {
  return `${path}:${String(line)} reads the page URL (${text}): ${URL_READER} is the only URL reader (docs/design/spec.md, Query contract); add the parameter there and take it from the parsed query.`;
}

function describeEnvRead({ path, line, text }: Hit): string {
  return `${path}:${String(line)} reads the build or process environment (${text}): src/ takes runtime inputs only from the page URL through ${URL_READER}; read the environment in a root config or under scripts/ instead.`;
}

describe('repository conventions', () => {
  it('keeps every file under src/, scripts/ and tests/ within 500 lines', () => {
    const files = LINE_ROOTS.flatMap((root) => loadRoot(root));
    expect(lineOffenders(files).map(describeLineOffender)).toEqual([]);
  });

  it('reads the page URL nowhere under src/ but in src/viewer/query.ts', () => {
    expect(urlReads(loadRoot('src')).map(describeUrlRead)).toEqual([]);
  });

  it('keeps src/viewer/query.ts in place and reading the URL, so the exemption is live', () => {
    const reader = loadRoot('src').find(({ path }) => path === URL_READER);
    expect(reader, `${URL_READER} is missing: move the query contract back, or change URL_READER in src/repo-conventions.test.ts in the same commit.`).toBeDefined();
    expect(URL_PATTERNS.some((pattern) => pattern.test(reader?.text ?? '')), `${URL_READER} no longer reads the page URL, so nothing does`).toBe(true);
  });

  it('reads no build or process environment under src/', () => {
    expect(envReads(loadRoot('src')).map(describeEnvRead)).toEqual([]);
  });

  it('asserts the literal value of no imported constant in a test file', () => {
    const files = LINE_ROOTS.flatMap((root) => loadRoot(root));
    expect(files.filter(({ path }) => ANY_TEST_FILE.test(path)).length).toBeGreaterThan(10);
    expect(pinnedConstants(files).map(describePinned)).toEqual([]);
  });

  it('bounds no wall-clock time in a test file', () => {
    expect(wallClockBounds(LINE_ROOTS.flatMap((root) => loadRoot(root))).map(describeWallClock)).toEqual([]);
  });
});

describe('repository convention detectors', () => {
  const lines = (count: number): string => 'x\n'.repeat(count);

  it('counts lines the way an editor does', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\r\nb\r\n')).toBe(2);
    expect(countLines('a\n\nb')).toBe(3);
  });

  it('passes exactly 500 lines, fails 501 and reports each offender with its path and count', () => {
    const files: SourceFile[] = [
      { path: 'src/at-bound.ts', text: lines(500) },
      { path: 'src/over-by-one.ts', text: lines(501) },
      { path: 'tests/e2e/far-over.spec.ts', text: lines(612) },
    ];
    expect(lineOffenders(files).map(describeLineOffender)).toEqual([
      'src/over-by-one.ts has 501 lines, 1 over the 500-line bound: split it into modules of one concern each.',
      'tests/e2e/far-over.spec.ts has 612 lines, 112 over the 500-line bound: split it into modules of one concern each.',
    ]);
  });

  it('finds every shape of page-URL read outside the reader and the test files, and nothing else', () => {
    const params = ['URLSearch', 'Params'].join('');
    const files: SourceFile[] = [
      { path: 'src/viewer/query.ts', text: 'const q = window.location.search;\n' },
      { path: 'src/ui/bar.ts', text: 'const a = 1;\nconst href = location.href;\n' },
      { path: 'src/stock/mesh.ts', text: `const worker = new Worker(new URL('./worker.ts', import.meta.url));\n` },
      { path: 'src/timeline/player.ts', text: `const p = new ${params}(search);\n` },
      { path: 'src/tools/chips.ts', text: 'const allocation = 3; // relocation is fine\n' },
      { path: 'src/timeline/player.test.ts', text: `const fixture = new URL('./fixture.json', import.meta.url);\n` },
      { path: 'scripts/capture-shots.mjs', text: 'const base = new URL(process.argv[2]);\n' },
    ];
    expect(urlReads(files)).toEqual([
      { path: 'src/ui/bar.ts', line: 2, text: 'const href = location.href;' },
      { path: 'src/stock/mesh.ts', line: 1, text: `const worker = new Worker(new URL('./worker.ts', import.meta.url));` },
      { path: 'src/timeline/player.ts', line: 1, text: `const p = new ${params}(search);` },
    ]);
  });

  it('finds both environment reads under src/, test files included, and ignores everything else', () => {
    const viteEnv = ['import', 'meta', 'env'].join('.');
    const nodeEnv = ['process', 'env'].join('.');
    const files: SourceFile[] = [
      { path: 'src/viewer/a.ts', text: `const a = 1;\nconst mode = ${viteEnv}.MODE;\n` },
      { path: 'src/viewer/b.test.ts', text: `const port = ${nodeEnv}.SCULPTURE_PORT;\n` },
      { path: 'src/viewer/clean.ts', text: 'const url = 1;\n' },
      { path: 'scripts/harness.mjs', text: `const env = ${nodeEnv};\n` },
      { path: 'vite.config.ts', text: `const env = ${nodeEnv};\n` },
    ];
    expect(envReads(files)).toEqual([
      { path: 'src/viewer/a.ts', line: 2, text: `const mode = ${viteEnv}.MODE;` },
      { path: 'src/viewer/b.test.ts', line: 1, text: `const port = ${nodeEnv}.SCULPTURE_PORT;` },
    ]);
  });

  it('finds an imported constant asserted equal to a literal, through members and indexes, and nothing else', () => {
    const pin = (name: string, literal: string): string => ['expect', '(', name, ').toBe(', literal, ');'].join('');
    const files: SourceFile[] = [
      { path: 'scripts/lib/model/grid-writer.test.ts', text: `import { DEFAULT_BAND_CELLS, FIXED_POINT } from '../../../src/contracts/grid';\n${pin('DEFAULT_BAND_CELLS', '32')}\n${pin('FIXED_POINT', 'DEFAULT_BAND_CELLS * 8')}\n` },
      { path: 'src/tools/catalog.test.ts', text: `import { TOOL_CATALOG } from './catalog';\n${['expect', '(TOOL_CATALOG.point.angle).toEqual({ min: 30 });'].join('')}\n${['expect', "(TOOL_CATALOG['claw'].chips, 'chips').toStrictEqual([1]);"].join('')}\n` },
      { path: 'src/ui/label.test.ts', text: `import { CALENDAR_START } from './label';\n${pin('CALENDAR_START', "'1501-09-09'")}\n${pin('dayNumber(CALENDAR_START)', '1')}\n` },
      { path: 'src/viewer/local.test.ts', text: `const LIMIT = 3;\n${pin('LIMIT', '3')}\n` },
      { path: 'src/viewer/renamed.test.ts', text: `import { MAX as LIMIT, MIN } from './limits';\n${pin('LIMIT', '-1')}\n${pin('MAX', '2')}\n` },
      { path: 'src/viewer/app.ts', text: `import { MAX } from './limits';\n${pin('MAX', '2')}\n` },
    ];
    expect(pinnedConstants(files).map(({ path, line }) => `${path}:${String(line)}`)).toEqual([
      'scripts/lib/model/grid-writer.test.ts:2',
      'src/tools/catalog.test.ts:2',
      'src/tools/catalog.test.ts:3',
      'src/ui/label.test.ts:2',
      'src/viewer/renamed.test.ts:2',
    ]);
  });

  it('finds ordering bounds on a wall-clock delta, directly or through assigned, pushed and derived names, and leaves logged timings and CPU time alone', () => {
    const clock = ['performance', 'now()'].join('.');
    const date = ['Date', 'now()'].join('.');
    const files: SourceFile[] = [
      { path: 'src/timeline/making.test.ts', text: `const start = ${clock};\nrun();\n${['expect', `(${clock} - start).toBeLessThan(3000);`].join('')}\n` },
      { path: 'src/david/synthetic.test.ts', text: `const start = ${clock};\nconst seconds = (${clock} - start) / 1000;\n${['expect', '(seconds).toBeLessThan(2);'].join('')}\n` },
      { path: 'src/stock/mesher.test.ts', text: `times.push(${clock} - start);\nconst median = times[100] ?? 0;\nconsole.log(median);\n${['expect', '(median, "median").toBeLessThan(5);'].join('')}\n` },
      { path: 'tests/e2e/timing.spec.ts', text: `const waited = ${date} - t0;\n${['expect', '(waited).toBeGreaterThan(10);'].join('')}\n` },
      { path: 'src/stock/budgets.test.ts', text: `const seconds = (${clock} - start) / 1000;\nconsole.log(seconds);\n${['expect', '(triangles).toBeLessThan(2_500_000);'].join('')}\n` },
      { path: 'src/timeline/cpu.test.ts', text: `const used = process.cpuUsage(before);\n${['expect', '(used.user).toBeLessThan(3e6);'].join('')}\n` },
      { path: 'src/stock/app.ts', text: `const seconds = ${clock} - start;\n${['expect', '(seconds).toBeLessThan(2);'].join('')}\n` },
    ];
    expect(wallClockBounds(files).map(({ path, line }) => `${path}:${String(line)}`)).toEqual(['src/timeline/making.test.ts:3', 'src/david/synthetic.test.ts:3', 'src/stock/mesher.test.ts:4', 'tests/e2e/timing.spec.ts:2']);
  });
});
