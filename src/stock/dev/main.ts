/**
 * The engine's development page (engine.html; docs/design/spec.md, Modules and ownership): the synthetic figure, or the David grid when `model=david` and public/model/david.json exists, carved by the provisional steps of src/choreography/dev-steps.ts under a plain flat-shaded material and a stub blow cycle.
 * Query: `t=`, `step=`, `shot=1`, `cam=`, `autoplay=0`, `model=`, `noui=1` and `finish=1` (flat colours per finish code) through src/viewer/query.ts. Keys: Space plays and pauses, the arrow keys step to the next or previous integer `t`, Home and End jump. The corner shows `t`, `blowsApplied / planLength` and `dirtyChunks`.
 * Capture: under `shot=1` the page sets `window.__shotReady` once the requested `t` is applied, every dirty chunk is meshed and five more frames have rendered, and publishes `window.__sculpture`.
 * The scaffold's viewer draws a placeholder block; this page removes it and adds the Making's stock in its place.
 */
import * as THREE from 'three';

import { DEV_STAGES, DEV_STEPS } from '../../choreography/dev-steps';
import { BASE_SECONDS } from '../../contracts/making';
import { DEFAULT_CELL_M } from '../../david/frame';
import { syntheticFigure } from '../../david/synthetic';
import { createMaking, type EngineMaking } from '../../timeline/making';
import { EMPTY_FACTS, publishFacts } from '../../viewer/facts';
import { readViewerQuery, type ViewerQuery } from '../../viewer/query';
import { createViewer } from '../../viewer/scene';
import { type Grid, loadFigureGrid } from '../grid';
import { defaultWorkerCount } from '../pool';
import { devBlowCycle } from './stub-cycle';

const DAVID_HEADER = 'model/david.json';
const READY_FRAMES = 5;
const TOOL_LENGTH = 0.28;
const TOOL_WIDTH = 0.018;

interface Figure {
  readonly grid: Grid;
  readonly header: EngineMaking['header'];
  readonly name: string;
}

async function loadFigure(query: ViewerQuery): Promise<Figure> {
  if (query.model === 'david') {
    try {
      const loaded = await loadFigureGrid(DAVID_HEADER);
      return { grid: loaded.grid, header: loaded.header, name: 'david' };
    } catch (error: unknown) {
      console.warn(`model=david: ${error instanceof Error ? error.message : String(error)}; showing the synthetic figure instead`);
    }
  }
  return { grid: syntheticFigure(DEFAULT_CELL_M), header: null, name: 'synthetic' };
}

/** `finish=1`: flat colours per finish code (src/contracts/grid.ts, FINISH) from the per-vertex attribute, so the painting can be checked by eye. */
function tintByFinish(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader): void => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float finish;\nvarying float vFinish;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinish = finish;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFinish;\nconst vec3 FINISH_COLOURS[14] = vec3[14](vec3(0.85, 0.82, 0.76), vec3(0.15, 0.15, 0.15), vec3(0.9, 0.4, 0.3), vec3(0.95, 0.65, 0.2), vec3(0.95, 0.85, 0.2), vec3(0.7, 0.9, 0.2), vec3(0.2, 0.8, 0.5), vec3(0.2, 0.7, 0.9), vec3(0.3, 0.3, 0.9), vec3(0.6, 0.3, 0.9), vec3(0.9, 0.3, 0.8), vec3(0.8, 0.8, 0.95), vec3(1.0, 1.0, 1.0), vec3(1.0, 0.85, 0.3));')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = FINISH_COLOURS[int(clamp(vFinish + 0.5, 0.0, 13.0))];');
  };
  material.customProgramCacheKey = (): string => 'finish-tint';
}

function removePlaceholderBlock(scene: THREE.Scene): void {
  for (const child of [...scene.children]) {
    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) scene.remove(child);
  }
}

/** The position a `step=` query asks for: the end of that step, by id or 1-based index. */
function requestedTime(query: ViewerQuery, making: EngineMaking): number {
  const step = query.step;
  if (step !== null) {
    const index = step.kind === 'index' ? step.index : making.steps.findIndex((s) => s.id === step.id) + 1;
    if (index >= 1 && index <= making.N) return index;
    console.warn(`query parameter step=${step.kind === 'index' ? String(step.index) : step.id} was ignored: it takes a step id or an index from 1 to ${String(making.N)}.`);
  }
  return Math.min(query.t ?? 0, making.N);
}

function publish(query: ViewerQuery, making: EngineMaking, playing: boolean): void {
  publishFacts({
    ...EMPTY_FACTS,
    stepIds: making.steps.map((s) => s.id),
    stepTitles: making.steps.map((s) => s.title),
    stepStages: making.steps.map((s) => s.stage),
    stepTools: making.steps.map((s) => s.tool),
    stepWeights: making.steps.map((s) => s.weight),
    stepBlowCounts: making.steps.map((s) => s.blowCount),
    stages: making.stages.map((s) => s.id),
    N: making.N,
    t: making.t,
    planLength: making.planLength,
    planDigest: making.planDigest,
    blowsApplied: making.blowsApplied,
    dirtyChunks: making.dirtyChunks,
    playing: playing ? 'forward' : null,
    moving: playing,
    finish: query.finish,
    queryProblems: query.problems,
  });
}

async function main(): Promise<void> {
  const query = readViewerQuery();
  for (const problem of query.problems) console.warn(problem);
  const hud = document.getElementById('hud');
  if (hud !== null && query.noui) hud.style.display = 'none';
  const viewer = createViewer(document.body, { shot: false, cam: query.cam });
  removePlaceholderBlock(viewer.scene);
  viewer.start();

  const started = performance.now();
  const figure = await loadFigure(query);
  const material = new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.85, metalness: 0, flatShading: true });
  if (query.finish) tintByFinish(material);
  const making = createMaking({
    figure: figure.grid,
    ...(figure.header === null ? {} : { header: figure.header }),
    steps: DEV_STEPS,
    stages: DEV_STAGES,
    blowCycle: devBlowCycle,
    material,
    workers: defaultWorkerCount(),
  });
  viewer.scene.add(making.stockObject);
  const meshingStarted = performance.now();
  const stopTiming = making.onMeshed(() => {
    console.log(`engine: block skin meshed on ${String(defaultWorkerCount())} workers in ${((performance.now() - meshingStarted) / 1000).toFixed(2)} s, ${String(making.remesher.triangles)} triangles`);
    stopTiming();
  });
  console.log(`engine: ${figure.name} figure ${String(figure.grid.nx)}×${String(figure.grid.ny)}×${String(figure.grid.nz)} at ${String(figure.grid.cell)} m in ${((performance.now() - started) / 1000).toFixed(2)} s`);

  const tools = new THREE.Group();
  viewer.scene.add(tools);
  const toolMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.4 });
  const toolGeometry = new THREE.BoxGeometry(TOOL_WIDTH, TOOL_LENGTH, TOOL_WIDTH).translate(0, TOOL_LENGTH / 2, 0);

  let t = requestedTime(query, making);
  let playing = query.autoplay && !query.shot;
  let readyFrames = 0;
  let lastFrame = performance.now();
  making.setTime(t);
  publish(query, making, playing);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      playing = !playing;
      event.preventDefault();
    } else if (event.code === 'ArrowRight') t = Math.min(making.N, Math.floor(t) + 1);
    else if (event.code === 'ArrowLeft') t = Math.max(0, Math.ceil(t) - 1);
    else if (event.code === 'Home') t = 0;
    else if (event.code === 'End') t = making.N;
    else return;
    making.setTime(t);
  });

  function frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (playing && t < making.N) {
      const weight = making.steps[Math.min(Math.floor(t), making.N - 1)]?.weight ?? 1;
      t = Math.min(making.N, t + dt / (weight * BASE_SECONDS));
      making.setTime(t);
      if (t >= making.N) playing = false;
    }
    const poses = making.poses;
    while (tools.children.length < poses.length) tools.add(new THREE.Mesh(toolGeometry, toolMaterial));
    tools.children.forEach((child, index) => {
      const pose = poses[index];
      child.visible = pose !== undefined;
      if (pose === undefined) return;
      child.position.set(...pose.position);
      child.quaternion.set(...pose.quaternion);
    });
    const step = making.steps[Math.min(Math.floor(making.t), making.N - 1)];
    if (hud !== null) {
      hud.textContent = [
        `${figure.name} ${String(figure.grid.cell * 1000)} mm  t ${making.t.toFixed(3)} / ${String(making.N)}  ${playing ? 'playing' : 'paused'}`,
        `${step?.stage ?? ''} — ${step?.title ?? ''}`,
        `blows ${String(making.blowsApplied)} / ${String(making.planLength)}   dirty chunks ${String(making.dirtyChunks)}`,
        'Space play/pause, arrows step, Home/End',
      ].join('\n');
    }
    publish(query, making, playing);
    if (query.shot && window.__shotReady !== true) {
      readyFrames = making.dirtyChunks === 0 ? readyFrames + 1 : 0;
      if (readyFrames >= READY_FRAMES) window.__shotReady = true;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  console.error(error);
});
