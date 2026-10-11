/**
 * Boot: read the query, build the marble and the making, the player, the viewer and the chrome, then run the frame loop that moves the player, poses the tools and chips, follows the tip, refreshes the UI and publishes the facts (docs/design/spec.md, Page; Query contract).
 * `createMakingForQuery` below is the one place the engine and the tools plug in; everything else here reads only the contract (src/contracts/making.ts).
 */
import { Group } from 'three';
import type { Material, Object3D } from 'three';

import { DAVID_STEPS } from './choreography/david-steps';
import { STAGES } from './choreography/stages';
import type { GridHeader } from './contracts/grid';
import type { Making } from './contracts/making';
import { BASE_SECONDS } from './contracts/making';
import { DEFAULT_CELL_M } from './david/frame';
import { syntheticFigure } from './david/synthetic';
import { loadFigureGrid } from './stock/grid';
import type { Grid } from './stock/grid';
import { defaultWorkerCount } from './stock/pool';
import { createMaking } from './timeline/making';
import { createPlayer } from './timeline/player';
import { APPROACH_END, createBlowCycle } from './tools/blow-cycle';
import { TOOL_CATALOG } from './tools/catalog';
import type { CatalogId } from './tools/catalog';
import { ChipPool } from './tools/chips';
import { animateToolParts, toolModel } from './tools/geometry/index';
import { createUi } from './ui';
import type { Attribution } from './ui';
import { installKeyboard } from './ui/keyboard';
import type { MakingBundle, RenderedTool } from './viewer/bundle';
import { buildFacts, factsSignature, publishFacts } from './viewer/facts';
import { DEFAULT_FOLLOW_DISTANCE, createFollow, framingFor, viewDirectionFor } from './viewer/follow';
import { createMarbleMaterial } from './viewer/marble';
import { DEFAULT_PRESET, FOLLOW_VIEW, PRESETS, findPreset, isPresetId } from './viewer/presets';
import type { CameraPose, ViewerQuery } from './viewer/query';
import { readViewerQuery } from './viewer/query';
import { createToolRig } from './viewer/rig';
import { createViewer } from './viewer/scene';

/** Frames rendered at the requested state before `window.__shotReady` (spec, Query contract). */
const READY_FRAMES = 5;

/** The pipeline's figure grid (docs/design/spec.md, Grid file format), served from `public/model/`, which `npm run model` writes. */
const DAVID_HEADER = 'model/david.json';

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

/**
 * INTEGRATION POINT. The engine and the tools plug in here and nowhere else: the figure grid `query.model` names, the engine's Making (src/timeline/making.ts) over the David steps of src/choreography/ (docs/design/choreography.md) with `material` for its chunk meshes, the tools' cycle and meshes (src/tools/), the catalogue's names and the grid header's `source` for the footer.
 */
async function createMakingForQuery(query: ViewerQuery, material: Material, problems: string[]): Promise<MakingBundle> {
  const blowCycle = createBlowCycle();
  const toolMeshes = new Map<RenderedTool, Object3D>();
  for (const id of Object.keys(TOOL_CATALOG) as CatalogId[]) toolMeshes.set(id, toolModel(id));
  const figure = await loadFigure(query, problems);
  const options = { figure: figure.grid, steps: DAVID_STEPS, stages: STAGES, blowCycle, material, workers: defaultWorkerCount() };
  const making = createMaking(figure.header === undefined ? options : { ...options, header: figure.header });
  return {
    making,
    blowCycle,
    toolMeshes,
    toolNames: (tool) => ({ italian: TOOL_CATALOG[tool].italian, english: TOOL_CATALOG[tool].english }),
    carrySeconds: (blow) => blowCycle.approachSeconds(blow, null),
    source: figure.header?.source ?? null,
  };
}

/** `step=` (end of that step) wins over `t=`; a step the making does not have is reported and skipped. */
function initialPosition(query: ViewerQuery, making: Making, problems: string[]): number {
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
  if (query.t !== null) return Math.min(making.N, Math.max(0, query.t));
  return 0;
}

/** `cam=` wins over `view=`; `view=follow` frames the blow in progress at the initial position. */
function initialCamera(query: ViewerQuery, making: Making, problems: string[]): { pose: CameraPose; view: string } {
  const fallback = { pose: findPreset(DEFAULT_PRESET)?.pose ?? PRESETS[0]?.pose ?? { position: [7, 4, 8], target: [0, 2.5, 0] }, view: DEFAULT_PRESET };
  if (query.cam !== null) return { pose: query.cam, view: 'free' };
  if (query.view === null) return fallback;
  if (query.view === FOLLOW_VIEW) {
    const current = making.current;
    if (current !== null) return { pose: framingFor(current.blow.point, DEFAULT_FOLLOW_DISTANCE, viewDirectionFor(current.blow.normal)), view: FOLLOW_VIEW };
    problems.push(`query parameter view="follow" was ignored: no blow is in progress at t=${String(making.t)}; it takes a t inside a step.`);
    return fallback;
  }
  const preset = findPreset(query.view);
  if (preset !== undefined) return { pose: preset.pose, view: preset.id };
  problems.push(`query parameter view=${JSON.stringify(query.view)} was ignored: it takes one of ${PRESETS.map((item) => item.id).join(', ')} or follow.`);
  return fallback;
}

function attributionOf(bundle: MakingBundle): Attribution | null {
  const source = bundle.source;
  return source === null ? null : { text: source.attribution, url: source.url, licenceUrl: source.licenceUrl };
}

const query = readViewerQuery();
const problems = [...query.problems];
const marble = createMarbleMaterial({ flat: query.finish });
const bundle = await createMakingForQuery(query, marble.material, problems);
const { making } = bundle;
const player = createPlayer(making.steps.map((step) => step.weight));
player.seek(initialPosition(query, making, problems));
making.setTime(player.t);
const camera = initialCamera(query, making, problems);
for (const problem of problems) console.warn(problem);

const viewer = createViewer(document.body, { shot: query.shot, pose: camera.pose });
const isGroup = (object: Object3D): object is Group => object instanceof Group;
const rig = createToolRig({
  meshes: bundle.toolMeshes,
  restPose: (tool) => bundle.blowCycle.restPose(tool),
  animateParts: (model, tool, phase) => {
    if (isGroup(model)) animateToolParts(model, tool, phase);
  },
});
const chips = new ChipPool();
viewer.scene.add(making.stockObject, rig.group, chips.mesh);
const follow = createFollow(viewer.camera, viewer.controls);
let view = camera.view;
viewer.controls.addEventListener('start', () => {
  view = 'free';
});

let lastSignature = '';
/** Publishes the facts when any of them changed: every frame, and right after a control acts, so a test that reads them after a click never sees the frame before it. */
function publish(): void {
  const facts = buildFacts(making, player, { view, follow: follow.enabled, finish: marble.flat, queryProblems: problems });
  const signature = factsSignature(facts);
  if (signature === lastSignature) return;
  lastSignature = signature;
  publishFacts(facts);
}

/** A control action: runs, then publishes the facts it changed. */
function act<A extends unknown[]>(run: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    run(...args);
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
  playPause: act(() => {
    if (player.playing !== null) {
      player.pause();
      return;
    }
    if (player.t >= making.N) player.seek(0);
    player.play('forward');
  }),
  playBackward: act(() => {
    if (player.playing === 'backward') {
      player.pause();
      return;
    }
    if (player.t <= 0) player.seek(making.N);
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
};

const ui = query.noui ? null : createUi(document.body, { making, presets: PRESETS, attribution: attributionOf(bundle), toolNames: bundle.toolNames, actions });
installKeyboard(actions);
if (query.autoplay) player.play('forward');

let readyFrames = 0;
if (query.shot) {
  window.__shotSeek = (t: number): void => {
    window.__shotReady = false;
    readyFrames = 0;
    player.pause();
    player.seek(t);
    making.setTime(player.t);
    // A follow shot re-frames the blow in progress at the new position, as a fresh load with view=follow would.
    const current = making.current;
    if (view === FOLLOW_VIEW && current !== null) viewer.setPose(framingFor(current.blow.point, DEFAULT_FOLLOW_DISTANCE, viewDirectionFor(current.blow.normal)));
  };
}

/**
 * How much slower wall time runs while a step's first tool is carried from the bench: the approach window of its first blow (src/tools/blow-cycle.ts, APPROACH_END) is stretched to the hand's carry time, so a tool never crosses metres in a frame. 1 outside that window, backward, or in capture mode.
 */
function carryScale(): number {
  const current = making.current;
  const carry = bundle.carrySeconds;
  if (query.shot || carry === undefined || current === null || current.phase >= APPROACH_END) return 1;
  const forward = player.playing === 'forward' || (player.target !== null && player.target > player.t);
  const step = making.steps[Math.floor(player.t)];
  if (!forward || step === undefined || making.blowsApplied !== step.firstBlow) return 1;
  const approachWall = (APPROACH_END * step.weight * BASE_SECONDS) / step.blowCount / player.speed;
  const needed = carry(current.blow) / player.speed;
  return needed > approachWall ? approachWall / needed : 1;
}

viewer.start((seconds) => {
  player.update(seconds * carryScale());
  if (player.t !== making.t) making.setTime(player.t);
  const current = making.current;
  rig.update(making.poses, current === null ? null : { tool: current.blow.tool, phase: current.phase });
  chips.update(making.chips);
  if (!query.shot && player.moving) follow.update(seconds, current?.blow.point ?? null, DEFAULT_FOLLOW_DISTANCE);
  ui?.update({ t: player.t, playing: player.playing, speed: player.speed, view: isPresetId(view) ? view : 'free', follow: follow.enabled, finish: marble.flat });
  publish();
  if (query.shot) {
    if (making.dirtyChunks === 0 && !player.moving) {
      readyFrames += 1;
      if (readyFrames >= READY_FRAMES) window.__shotReady = true;
    } else {
      readyFrames = 0;
    }
  }
});
