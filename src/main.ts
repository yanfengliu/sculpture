/**
 * Boot: read the query, build the marble and the making, the player, the viewer and the chrome, then run the frame loop that moves the player, poses the tools and chips, follows the tip, refreshes the UI and publishes the facts (docs/design/spec.md, Page; Query contract).
 * `createMakingForQuery` below is the one place the engine and the tools plug in; everything else here reads only the contract (src/contracts/making.ts).
 */
import type { Material } from 'three';

import type { Making } from './contracts/making';
import { createPlayer } from './timeline/player';
import { createUi } from './ui';
import type { Attribution } from './ui';
import { installKeyboard } from './ui/keyboard';
import type { MakingBundle } from './viewer/bundle';
import { createChipPool } from './viewer/chips';
import { buildFacts, factsSignature, publishFacts } from './viewer/facts';
import { DEFAULT_FOLLOW_DISTANCE, createFollow, framingFor } from './viewer/follow';
import { createMarbleMaterial } from './viewer/marble';
import { DEFAULT_PRESET, FOLLOW_VIEW, PRESETS, findPreset, isPresetId } from './viewer/presets';
import type { CameraPose, ViewerQuery } from './viewer/query';
import { readViewerQuery } from './viewer/query';
import { createToolRig } from './viewer/rig';
import { createViewer } from './viewer/scene';
import { createStubBundle } from './viewer/stub-making';

/** Frames rendered at the requested state before `window.__shotReady` (spec, Query contract). */
const READY_FRAMES = 5;

/**
 * INTEGRATION POINT. Swap the development stub for the engine and the tools here, and nowhere else:
 * return the engine's Making (src/timeline/making.ts, built from the grid `query.model` names, the tools' BlowCycle and `material` for its chunk meshes), the tools' meshes (src/tools/geometry/), the catalogue's names (src/tools/catalog.ts) and the grid header's `source`.
 */
function createMakingForQuery(query: ViewerQuery, material: Material): MakingBundle {
  return createStubBundle(material); // ← the one line to change at integration; the stub ignores `query.model`
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
    if (current !== null) return { pose: framingFor(current.blow.point, DEFAULT_FOLLOW_DISTANCE), view: FOLLOW_VIEW };
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
const bundle = createMakingForQuery(query, marble.material);
const { making } = bundle;
const player = createPlayer(making.steps.map((step) => step.weight));
player.seek(initialPosition(query, making, problems));
making.setTime(player.t);
const camera = initialCamera(query, making, problems);
for (const problem of problems) console.warn(problem);

const viewer = createViewer(document.body, { shot: query.shot, pose: camera.pose });
const rig = createToolRig(bundle.toolMeshes);
const chips = createChipPool();
viewer.scene.add(making.stockObject, rig.group, chips.mesh);
const follow = createFollow(viewer.camera, viewer.controls);
let view = camera.view;
viewer.controls.addEventListener('start', () => {
  view = 'free';
});

const actions = {
  start(): void {
    player.pause();
    player.seek(0);
  },
  end(): void {
    player.pause();
    player.seek(making.N);
  },
  stepBack(): void {
    player.stepBack();
  },
  stepForward(): void {
    player.stepForward();
  },
  playPause(): void {
    if (player.playing !== null) {
      player.pause();
      return;
    }
    if (player.t >= making.N) player.seek(0);
    player.play('forward');
  },
  playBackward(): void {
    if (player.playing === 'backward') {
      player.pause();
      return;
    }
    if (player.t <= 0) player.seek(making.N);
    player.play('backward');
  },
  seek(t: number): void {
    player.pause();
    player.seek(t);
  },
  setSpeed(speed: typeof player.speed): void {
    player.setSpeed(speed);
  },
  chooseStage(id: string): void {
    const first = making.steps.findIndex((step) => step.stage === id);
    if (first >= 0) player.seek(first);
  },
  chooseView(id: string): void {
    const preset = findPreset(id);
    if (preset === undefined) return;
    view = preset.id;
    if (preset.id === 'free') return;
    follow.setEnabled(false);
    viewer.setPose(preset.pose);
  },
  toggleFollow(): void {
    follow.setEnabled(!follow.enabled);
  },
  toggleFinish(): void {
    marble.setFlat(!marble.flat);
  },
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
  };
}

let lastSignature = '';
viewer.start((seconds) => {
  player.update(seconds);
  if (player.t !== making.t) making.setTime(player.t);
  rig.setPoses(making.poses);
  chips.set(making.chips);
  if (!query.shot && player.moving) follow.update(seconds, making.current?.blow.point ?? null, DEFAULT_FOLLOW_DISTANCE);
  ui?.update({ t: player.t, playing: player.playing, speed: player.speed, view: isPresetId(view) ? view : 'free', follow: follow.enabled, finish: marble.flat });
  const facts = buildFacts(making, player, { view, follow: follow.enabled, finish: marble.flat, queryProblems: problems });
  const signature = factsSignature(facts);
  if (signature !== lastSignature) {
    lastSignature = signature;
    publishFacts(facts);
  }
  if (query.shot) {
    if (making.dirtyChunks === 0 && !player.moving) {
      readyFrames += 1;
      if (readyFrames >= READY_FRAMES) window.__shotReady = true;
    } else {
      readyFrames = 0;
    }
  }
});
