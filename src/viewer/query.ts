/**
 * The only reader of the page URL (docs/design/spec.md, Query contract; `src/repo-conventions.test.ts` enforces it).
 *
 * Every parameter is parsed here into one typed object; the rest of the app takes it from that object and never touches the URL.
 * The viewer uses `shot` and `cam` today; `view`, `autoplay`, `noui`, `model`, `finish`, `yard`, `t` and `step` are parsed and exposed for the page, timeline and model owners.
 * A value that does not fit its parameter is dropped to the parameter's default and named in `problems`, so a typo in a capture URL is reported, not silently a different shot.
 */

export type ModelId = 'david' | 'synthetic';

/** `cam=px,py,pz,tx,ty,tz`: camera position and orbit target in world metres. */
export interface CameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/** `step=<id or 1-based index>`: an index when the value is all digits, a step id otherwise. */
export type StepRef = { readonly kind: 'index'; readonly index: number } | { readonly kind: 'id'; readonly id: string };

export interface ViewerQuery {
  /** `shot=1`: capture mode, so no autoplay, no follow camera, no chip motion and `window.__shotReady` once the state is rendered. */
  readonly shot: boolean;
  /** `view=<preset id>`, unchecked here: the presets and their ids belong to the page owner. */
  readonly view: string | null;
  /** `cam=px,py,pz,tx,ty,tz`; wins over `view` when both are set. */
  readonly cam: CameraPose | null;
  /** `autoplay=0` switches playing on load off; `shot=1` also switches it off, and so does a valid `t=` or `step=` (src/main.ts: a position set is a place to look at). */
  readonly autoplay: boolean;
  /** `noui=1`: hide the page chrome. */
  readonly noui: boolean;
  /** `model=david|synthetic`; the page defaults to `david`, tests pass `synthetic`. */
  readonly model: ModelId;
  /** `finish=1`: show the finish grid as flat colours. */
  readonly finish: boolean;
  /** `yard=0`: hide every yard structure (the enclosure, the scaffold, the bench, the model stand); the floor stays. */
  readonly yard: boolean;
  /** `t=<number>`, a finite timeline position at or above 0; clamping to `[0, N]` is the timeline's job. */
  readonly t: number | null;
  /** `step=<id or 1-based index>`: position at the end of that step; wins over `t`. */
  readonly step: StepRef | null;
  /** One line per rejected value, naming the parameter, the value and what would be accepted. */
  readonly problems: readonly string[];
}

export const DEFAULT_MODEL: ModelId = 'david';
const MODELS: readonly ModelId[] = ['david', 'synthetic'];
const CAM_COMPONENTS = 6;
/** Every parameter the page reads (docs/design/spec.md, Query contract); any other key is reported, so a misspelt one is not silently a different shot. */
export const KNOWN_PARAMETERS: readonly string[] = ['shot', 't', 'step', 'view', 'cam', 'model', 'finish', 'yard', 'autoplay', 'noui'];

/** Parses a query string (`location.search`, with or without the leading `?`). Pure, so the unit tests cover it without a browser. */
export function parseViewerQuery(search: string): ViewerQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const problems: string[] = [];
  const reject = (name: string, value: string, accepted: string): void => {
    problems.push(`query parameter ${name}=${JSON.stringify(value)} was ignored: it takes ${accepted}.`);
  };

  const flag = (name: string, fallback: boolean): boolean => {
    const value = params.get(name);
    if (value === null) return fallback;
    if (value === '1') return true;
    if (value === '0') return false;
    reject(name, value, '1 or 0');
    return fallback;
  };

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (!KNOWN_PARAMETERS.includes(key)) problems.push(`query parameter ${key}=${JSON.stringify(values[0] ?? '')} was ignored: the page reads only ${KNOWN_PARAMETERS.join(', ')}.`);
    else if (values.length > 1) problems.push(`query parameter ${key} is given ${String(values.length)} times (${values.map((value) => JSON.stringify(value)).join(', ')}); the first is used.`);
  }
  const shot = flag('shot', false);
  const autoplayFlag = flag('autoplay', true);
  const view = nonEmpty(params.get('view'));
  const model = parseModel(params.get('model'), reject);
  const cam = parseCam(params.get('cam'), reject);
  const t = parseT(params.get('t'), reject);
  const step = parseStep(params.get('step'));

  return { shot, view, cam, autoplay: autoplayFlag && !shot, noui: flag('noui', false), model, finish: flag('finish', false), yard: flag('yard', true), t, step, problems };
}

/** Reads the live page URL. The only place in `src/` that touches `location`. */
export function readViewerQuery(): ViewerQuery {
  return parseViewerQuery(window.location.search);
}

function nonEmpty(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value.trim();
}

type Reject = (name: string, value: string, accepted: string) => void;

function parseModel(value: string | null, reject: Reject): ModelId {
  if (value === null) return DEFAULT_MODEL;
  const found = MODELS.find((id) => id === value);
  if (found !== undefined) return found;
  reject('model', value, MODELS.join(' or '));
  return DEFAULT_MODEL;
}

function parseCam(value: string | null, reject: Reject): CameraPose | null {
  if (value === null) return null;
  const numbers = value.split(',').map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  const [px, py, pz, tx, ty, tz] = numbers;
  const complete = numbers.length === CAM_COMPONENTS && numbers.every((n) => Number.isFinite(n));
  if (!complete || px === undefined || py === undefined || pz === undefined || tx === undefined || ty === undefined || tz === undefined) {
    reject('cam', value, 'six finite numbers px,py,pz,tx,ty,tz in metres');
    return null;
  }
  return { position: [px, py, pz], target: [tx, ty, tz] };
}

function parseT(value: string | null, reject: Reject): number | null {
  if (value === null) return null;
  const t = value.trim() === '' ? Number.NaN : Number(value);
  if (!Number.isFinite(t) || t < 0) {
    reject('t', value, 'a finite number at or above 0');
    return null;
  }
  return t;
}

function parseStep(value: string | null): StepRef | null {
  const text = nonEmpty(value);
  if (text === null) return null;
  return /^[1-9]\d*$/.test(text) ? { kind: 'index', index: Number(text) } : { kind: 'id', id: text };
}
