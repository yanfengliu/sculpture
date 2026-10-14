/**
 * Boot: read the query, build the marble and the making, the player, the viewer and the chrome, then run the frame loop that moves the player, poses the tools and chips, follows the tip, refreshes the UI and publishes the facts (docs/design/spec.md, Page; Query contract).
 * `createMakingForQuery` below is the one place the engine and the tools plug in; everything else here reads only the contract (src/contracts/making.ts).
 */
import { Group } from 'three';
import type { Material, Object3D } from 'three';

import { DAVID_STEPS } from './choreography/david-steps';
import { STAGES } from './choreography/stages';
import type { GridHeader } from './contracts/grid';
import type { Making, Vec3 } from './contracts/making';
import { DEFAULT_CELL_M } from './david/frame';
import { syntheticFigure } from './david/synthetic';
import { loadFigureGrid } from './stock/grid';
import type { Grid } from './stock/grid';
import { defaultWorkerCount } from './stock/pool';
import { maxSnapshotBytes } from './stock/snapshot';
import { createSnapshotLoader } from './stock/snapshot-loader';
import type { CarrySeconds } from './timeline/carry';
import { advanceWithCarry } from './timeline/carry';
import { createMaking, type PlanSource } from './timeline/making';
import { decodedPlanProblem, decodePlan, type PlanHeader, planHeaderProblem, sweptProblem } from './timeline/plan-file';
import { createPlayer } from './timeline/player';
import { createBlowCycle } from './tools/blow-cycle';
import { TOOL_CATALOG } from './tools/catalog';
import type { CatalogId } from './tools/catalog';
import { ChipPool } from './tools/chips';
import { recordStrikes } from './tools/dust';
import { DustPool } from './tools/dust-pool';
import { animateToolParts, toolModel } from './tools/geometry/index';
import { createUi } from './ui';
import type { Attribution } from './ui';
import { installKeyboard } from './ui/keyboard';
import type { MakingBundle, RenderedTool } from './viewer/bundle';
import { buildFacts, factsSignature, publishFacts } from './viewer/facts';
import { DEFAULT_FOLLOW_DISTANCE, createFollow, framingFor, viewDirectionFor } from './viewer/follow';
import { createMarbleMaterial } from './viewer/marble';
import { poseProblem } from './viewer/orbit-limits';
import { DEFAULT_PRESET, FOLLOW_VIEW, PRESETS, findPreset, isPresetId } from './viewer/presets';
import type { CameraPose, ViewerQuery } from './viewer/query';
import { readViewerQuery } from './viewer/query';
import { createToolRig } from './viewer/rig';
import { createViewer } from './viewer/scene';

/** Frames rendered at the requested state before `window.__shotReady` (spec, Query contract). */
const READY_FRAMES = 5;

/** The pipeline's figure grid (docs/design/spec.md, Grid file format), served from `public/model/`, which `npm run model` writes. */
const DAVID_HEADER = 'model/david.json';
/** The plan file and its snapshots beside the grid (src/timeline/plan-file.ts), which `npm run model` builds after the grid. */
const MODEL_DIRECTORY = 'model/';
const DAVID_PLAN = 'model/david.plan.json';
const DAVID_PLAN_DATA = 'model/david.plan.bin';

interface Figure {
  readonly grid: Grid;
  readonly header: GridHeader | undefined;
}

/** The figure `query.model` names: the David grid, or the synthetic figure built in code when the grid is asked for but cannot be loaded (reported, so a capture cannot pass as the David by mistake). */
async function loadFigure(query: ViewerQuery, problems: string[]): Promise<Figure> {
  if (query.model === 'david') {
    try {
      const loaded = await loadFigureGrid(DAVID_HEADER);
      return { grid: loaded.grid, header: loaded.header };
    } catch (error: unknown) {
      problems.push(`model=david could not load ${DAVID_HEADER} (${error instanceof Error ? error.message : String(error)}): run npm run model; showing the synthetic figure instead.`);
    }
  }
  return { grid: syntheticFigure(DEFAULT_CELL_M), header: undefined };
}

/** The plan file's header and data, fetched while the grid loads; null when the query asks for no David. */
function fetchPlanFile(query: ViewerQuery): Promise<[unknown, ArrayBuffer]> | null {
  if (query.model !== 'david') return null;
  const read = async (url: string): Promise<Response> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
    return response;
  };
  return Promise.all([read(DAVID_PLAN).then((r) => r.json() as Promise<unknown>), read(DAVID_PLAN_DATA).then((r) => r.arrayBuffer())]);
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The plan file's plan and snapshots when they were built for this grid and these steps by this planner (src/timeline/plan-file.ts), else why not: the making then plans in the page. */
async function planFor(fetched: Promise<[unknown, ArrayBuffer]> | null, header: GridHeader | undefined): Promise<PlanSource | string> {
  if (fetched === null || header === undefined) return 'the figure is not the David grid';
  try {
    const [parsed, data] = await fetched;
    const problem = planHeaderProblem(parsed, { gridSha256: header.sha256, steps: DAVID_STEPS.map((step) => step.id) });
    if (problem !== null) return `${DAVID_PLAN} does not fit: ${problem}`;
    const plan = parsed as PlanHeader;
    const digest = hex(await crypto.subtle.digest('SHA-256', data));
    if (digest !== plan.planSha256) return `${DAVID_PLAN_DATA} has SHA-256 ${digest} and its header says ${plan.planSha256}`;
    const decoded = decodePlan(new Uint8Array(data));
    const mismatch = decodedPlanProblem(decoded, plan) ?? sweptProblem(decoded.swept, header.size[0] * header.size[1] * header.size[2]);
    if (mismatch !== null) return `${DAVID_PLAN_DATA} does not fit its header or the grid: ${mismatch}`;
    const loader = createSnapshotLoader(MODEL_DIRECTORY, maxSnapshotBytes(header.size));
    return { blows: decoded.blows, swept: decoded.swept, snapshots: plan.snapshots, load: (entry) => loader.load(entry), dispose: () => { loader.dispose(); } };
  } catch (error: unknown) {
    return `${DAVID_PLAN} could not be read (${error instanceof Error ? error.message : String(error)})`;
  }
}

/**
 * INTEGRATION POINT. The engine and the tools plug in here and nowhere else: the figure grid `query.model` names, the plan file built for it when there is a usable one, the engine's Making (src/timeline/making.ts) over the David steps of src/choreography/ (docs/design/choreography.md) with `material` for its chunk meshes, the tools' cycle and meshes (src/tools/), the catalogue's names and the grid header's `source` for the footer.
 */
async function createMakingForQuery(query: ViewerQuery, material: Material, problems: string[]): Promise<MakingBundle & { readonly planSource: 'file' | 'page' }> {
  const blowCycle = createBlowCycle();
  // The Making asks the cycle for chips; the log keeps those strikes for the dust puffs.
  const strikes = recordStrikes(blowCycle);
  const toolMeshes = new Map<RenderedTool, Object3D>();
  for (const id of Object.keys(TOOL_CATALOG) as CatalogId[]) toolMeshes.set(id, toolModel(id));
  const fetched = fetchPlanFile(query);
  // An unused fetch must not surface as an unhandled rejection; planFor reads its outcome.
  fetched?.catch(() => undefined);
  const figure = await loadFigure(query, problems);
  const plan = await planFor(fetched, figure.header);
  if (typeof plan === 'string' && query.model === 'david' && figure.header !== undefined) console.warn(`model=david plans in the page, which takes tens of seconds for a late position: ${plan}. Run npm run model to build the plan file.`);
  const options = { figure: figure.grid, steps: DAVID_STEPS, stages: STAGES, blowCycle: strikes.cycle, material, workers: defaultWorkerCount(), ...(typeof plan === 'string' ? {} : { plan }) };
  const making = createMaking(figure.header === undefined ? options : { ...options, header: figure.header });
  return {
    making,
    blowCycle,
    toolMeshes,
    toolNames: (tool) => ({ italian: TOOL_CATALOG[tool].italian, english: TOOL_CATALOG[tool].english }),
    carrySeconds: (blow, previous) => blowCycle.approachSeconds(blow, previous),
    source: figure.header?.source ?? null,
    strikes,
    planSource: making.planSource,
  };
}

/** The position the query sets, or null when it sets none: `step=` (end of that step) wins over `t=`; a step the making does not have is reported and skipped. */
function initialPosition(query: ViewerQuery, making: Making, problems: string[]): number | null {
  if (query.step !== null) {
    if (query.step.kind === 'index') {
      if (query.step.index >= 1 && query.step.index <= making.N) return query.step.index;
      problems.push(`query parameter step=${JSON.stringify(String(query.step.index))} was ignored: it takes a step id or a 1-based index from 1 to ${String(making.N)}.`);
    } else {
      const wanted = query.step.id;
      const index = making.steps.findIndex((step) => step.id === wanted);
      if (index >= 0) return index + 1;
      problems.push(`query parameter step=${JSON.stringify(wanted)} was ignored: it takes a step id (${making.steps.map((step) => step.id).join(', ')}) or a 1-based index.`);
    }
  }
  if (query.t !== null) {
    if (query.t > making.N) problems.push(`query parameter t=${JSON.stringify(String(query.t))} was clamped to N=${String(making.N)}, the end of the timeline: it takes a number from 0 to ${String(making.N)}.`);
    return Math.min(making.N, Math.max(0, query.t));
  }
  return null;
}

/** `cam=` wins over `view=` when the orbit's limits keep it (src/viewer/orbit-limits.ts), else it is reported and `view=` stands; `view=follow` starts from the default pose and is framed by `applyFollowView` once the making is at the position. */
function initialCamera(query: ViewerQuery, problems: string[]): { pose: CameraPose; view: string } {
  const fallback = { pose: findPreset(DEFAULT_PRESET)?.pose ?? PRESETS[0]?.pose ?? { position: [7, 4, 8], target: [0, 2.5, 0] }, view: DEFAULT_PRESET };
  if (query.cam !== null) {
    const problem = poseProblem(query.cam);
    if (problem === null) return { pose: query.cam, view: 'free' };
    problems.push(`query parameter cam=${JSON.stringify([...query.cam.position, ...query.cam.target].join(','))} was ignored: ${problem}.`);
  }
  if (query.view === null) return fallback;
  if (query.view === FOLLOW_VIEW) return { pose: fallback.pose, view: FOLLOW_VIEW };
  const preset = findPreset(query.view);
  if (preset !== undefined) return { pose: preset.pose, view: preset.id };
  problems.push(`query parameter view=${JSON.stringify(query.view)} was ignored: it takes one of ${PRESETS.map((item) => item.id).join(', ')} or follow.`);
  return fallback;
}

/** The follow distance of the step at `t`: its focus distance, or the default (docs/design/spec.md, Page, View menu). */
function focusDistance(making: Making, t: number): number {
  return making.steps[Math.min(making.N - 1, Math.floor(t))]?.focus?.distance ?? DEFAULT_FOLLOW_DISTANCE;
}

function attributionOf(bundle: MakingBundle): Attribution | null {
  const source = bundle.source;
  return source === null ? null : { text: source.attribution, url: source.url, licence: source.licence, licenceUrl: source.licenceUrl };
}

const query = readViewerQuery();
const problems = [...query.problems];
const marble = createMarbleMaterial({ flat: query.finish });
const bundle = await createMakingForQuery(query, marble.material, problems);
const { making } = bundle;
const player = createPlayer(making.steps.map((step) => step.weight));
const position = initialPosition(query, making, problems);
player.seek(position ?? 0);
// The making stays at t = 0 until the first frame has rendered: the replay to the position runs from the second frame on (see the frame loop), so a load at t = N shows the block within the grid's load time instead of after the whole replay (Claude 3.1).
const camera = initialCamera(query, problems);
for (const problem of problems) console.warn(problem);

const viewer = createViewer(document.body, { shot: query.shot, pose: camera.pose });
viewer.yard.setEnabled(query.yard);
const isGroup = (object: Object3D): object is Group => object instanceof Group;
const rig = createToolRig({
  meshes: bundle.toolMeshes,
  restPose: (tool) => bundle.blowCycle.restPose(tool),
  animateParts: (model, tool, phase) => {
    if (isGroup(model)) animateToolParts(model, tool, phase);
  },
});
const chips = new ChipPool();
const dust = new DustPool();
viewer.scene.add(making.stockObject, rig.group, chips.mesh, dust.points);
const follow = createFollow(viewer.camera, viewer.controls);
let view = camera.view;
viewer.controls.addEventListener('start', () => {
  view = 'free';
});

let lastSignature = '';
/** Publishes the facts when any of them changed: every frame, and right after a control acts, so a test that reads them after a click never sees the frame before it. */
function publish(): void {
  const facts = buildFacts(making, player, { view, follow: follow.enabled, finish: marble.flat, yard: viewer.yard.enabled, hiddenSpans: viewer.yard.hidden, queryProblems: problems, planSource: bundle.planSource });
  const signature = factsSignature(facts);
  if (signature === lastSignature) return;
  lastSignature = signature;
  publishFacts(facts);
}

/** A control action: runs, brings the making to the player's position, then publishes the facts it changed, so a read right after a control never sees the player ahead of the stock. */
function act<A extends unknown[]>(run: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    run(...args);
    if (player.t !== making.t) making.setTime(player.t);
    publish();
  };
}

const actions = {
  start: act(() => {
    player.pause();
    player.seek(0);
  }),
  end: act(() => {
    player.pause();
    player.seek(making.N);
  }),
  stepBack: act(() => {
    player.stepBack();
  }),
  stepForward: act(() => {
    player.stepForward();
  }),
  // Play at the end and Play backward at the start do nothing: a jump to the other end would replay the whole plan in one frame (Claude 3.1), and the start and end buttons are there for that choice.
  playPause: act(() => {
    if (player.playing !== null) {
      player.pause();
      return;
    }
    if (player.t >= making.N) return;
    player.play('forward');
  }),
  playBackward: act(() => {
    if (player.playing === 'backward') {
      player.pause();
      return;
    }
    if (player.t <= 0) return;
    player.play('backward');
  }),
  seek: act((t: number) => {
    player.pause();
    player.seek(t);
  }),
  setSpeed: act((speed: typeof player.speed) => {
    player.setSpeed(speed);
  }),
  chooseStage: act((id: string) => {
    const first = making.steps.findIndex((step) => step.stage === id);
    if (first >= 0) player.seek(first);
  }),
  chooseView: act((id: string) => {
    const preset = findPreset(id);
    if (preset === undefined) return;
    view = preset.id;
    if (preset.id === 'free') return;
    follow.setEnabled(false);
    viewer.setPose(preset.pose);
  }),
  toggleFollow: act(() => {
    follow.setEnabled(!follow.enabled);
  }),
  toggleFinish: act(() => {
    marble.setFlat(!marble.flat);
  }),
  toggleYard: act(() => {
    viewer.yard.setEnabled(!viewer.yard.enabled);
  }),
};

const ui = query.noui ? null : createUi(document.body, { making, presets: PRESETS, attribution: attributionOf(bundle), toolNames: bundle.toolNames, actions });
installKeyboard(actions);
// The page plays on load only when the query set no position (spec, Page, First load): a valid t= or step= is a place to look at, not a start.
if (query.autoplay && position === null) player.play('forward');

/**
 * A `view=follow` framing waiting for the making to reach the player's position: from the load, where a position with no blow in progress is reported and the default preset stands, or from `__shotSeek`, where it keeps the pose. The framing waits until `dirtyChunks` is 0 (a jump in flight counts there, and the step at the position is planned only once the jump before it has landed), so a follow shot frames the blow in progress rather than the block before the replay (query.spec.ts, `shot=1&t=2.5&view=follow`).
 */
let followPending: 'load' | 'seek' | null = view === FOLLOW_VIEW ? 'load' : null;

let readyFrames = 0;
if (query.shot) {
  window.__shotSeek = (t: number): void => {
    window.__shotReady = false;
    readyFrames = 0;
    player.pause();
    player.seek(t);
    making.setTime(player.t);
    // A follow shot re-frames the blow in progress at the new position, as a fresh load with view=follow would, once the replay to it has landed.
    if (view === FOLLOW_VIEW) followPending = 'seek';
  };
}

/** The carry a step's first approach gets (src/timeline/carry.ts): the tools' carry time from the bench, or from the previous step's last blow when the tool is unchanged, so a tool never crosses metres in a frame; none in capture mode, where nothing plays. */
const carry: CarrySeconds = query.shot ? null : (bundle.carrySeconds ?? null);

/** What the follow camera frames at the player's position: the step's focus point, else the working tip, at the step's focus distance and from the side the blow's normal faces; null at a rest position without a focus point. */
function followFraming(): { readonly target: Vec3; readonly distance: number; readonly direction: Vec3 | null } | null {
  const current = making.current;
  const focus = making.steps[Math.min(making.N - 1, Math.floor(player.t))]?.focus;
  const distance = focusDistance(making, player.t);
  const direction = current === null ? null : viewDirectionFor(current.blow.normal);
  if (focus?.kind === 'point' && focus.point !== undefined) return { target: focus.point, distance, direction };
  return current === null ? null : { target: current.blow.point, distance, direction };
}

/** Frames the blow in progress for `view=follow` once the making is at the requested position with every chunk meshed; a load at a position with no blow in progress is reported and the default preset stands. */
function applyFollowView(): void {
  const pending = followPending;
  followPending = null;
  const current = making.current;
  if (current !== null) {
    viewer.setPose(framingFor(current.blow.point, focusDistance(making, player.t), viewDirectionFor(current.blow.normal)));
    return;
  }
  if (pending !== 'load') return;
  const problem = `query parameter view="follow" was ignored: no blow is in progress at t=${String(player.t)}; it takes a t inside a step.`;
  problems.push(problem);
  console.warn(problem);
  view = DEFAULT_PRESET;
}

viewer.start((seconds) => {
  // The first frame draws the untouched block at once; from the second frame on the making follows the player, which replays to the requested position.
  if (viewer.frames > 0) {
    advanceWithCarry(seconds, player, making, carry);
    if (player.t !== making.t) making.setTime(player.t);
    if (followPending !== null && making.dirtyChunks === 0) applyFollowView();
  }
  const current = making.current;
  rig.update(making.poses, current === null ? null : { tool: current.blow.tool, phase: current.phase });
  bundle.strikes?.clear();
  chips.update(making.chips);
  dust.update(bundle.strikes?.dust() ?? []);
  if (!query.shot && player.moving) {
    const framing = followFraming();
    follow.update(seconds, framing?.target ?? null, framing?.distance ?? DEFAULT_FOLLOW_DISTANCE, framing?.direction ?? null);
  }
  ui?.update({ t: player.t, playing: player.playing, speed: player.speed, view: isPresetId(view) ? view : 'free', follow: follow.enabled, finish: marble.flat, yard: viewer.yard.enabled });
  publish();
  if (query.shot) {
    // Ready only once the follow framing, if any, has been applied: the frames before it show the pose the load started from.
    if (making.dirtyChunks === 0 && !player.moving && followPending === null) {
      readyFrames += 1;
      if (readyFrames >= READY_FRAMES) window.__shotReady = true;
    } else {
      readyFrames = 0;
    }
  }
});
