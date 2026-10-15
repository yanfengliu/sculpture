/**
 * The viewer: renderer, scene, warm daylight, camera and orbit controls, and the frame loop the page drives.
 * World frame per docs/design/spec.md: 1 unit = 1 metre, +Y up, the figure faces +Z, the origin is the centre of the block's footprint on the yard floor. The yard itself is src/viewer/yard.ts.
 * Rendering choices follow docs/research/decisions.md (WebGLRenderer, GLSL injection) and docs/research/engine-options.md section 6.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { BLOCK_M } from '../david/frame';
import { createCompileGate } from './compile-gate';
import { buildEnvironment } from './environment';
import { MAX_DISTANCE, MAX_POLAR_ANGLE, MIN_DISTANCE } from './orbit-limits';
import type { CameraPose } from './query';
import type { Yard } from './yard';
import { buildYard } from './yard';

/** Kept for src/tools/dev/main.ts, which looks for a placeholder block of this height; the scene holds no block of its own any more (the stock comes from the making). */
export const PLACEHOLDER_BLOCK = BLOCK_M;
/** The three-quarter framing of src/viewer/presets.ts, for a caller that passes no pose. */
const DEFAULT_POSE: CameraPose = { position: [7, 4.2, 8.2], target: [0, BLOCK_M.height / 2 - 0.15, 0] };

/** Neutral sky: a pale grey-blue, not the page background (#202020), so a blank canvas is told from a drawn one. */
const SKY_COLOUR = 0xd8dee5;
/** Warm Tuscan sun from the front right, high enough that the turata's walls shade none of the block. */
const SUN_DIRECTION = new THREE.Vector3(5, 14, 9);
const SUN_COLOUR = 0xfff1dc;
const SUN_INTENSITY = 2.3;
const SHADOW_EXTENT = 10;
const MAX_FRAME_SECONDS = 0.1;

export interface ViewerOptions {
  /** Capture mode: no damping, so the first frames show the requested pose exactly. */
  readonly shot: boolean;
  /** The initial camera; `cam` is the older name src/tools/dev/main.ts still passes (null for the default). */
  readonly pose?: CameraPose;
  readonly cam?: CameraPose | null;
}

export interface Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** The yard's spans and their visibility rule (src/viewer/yard.ts): applied after every camera move, before the frame renders. */
  readonly yard: Yard;
  /** Settles once a program compiled for the scene is the one it draws with: its lights are in and its environment, or a stand-in with the same mapping and size, is set. */
  readonly lit: Promise<void>;
  /** Frames rendered since `start`. */
  readonly frames: number;
  setPose(pose: CameraPose): void;
  /** Starts the render loop; `tick` runs before every render with the clamped seconds since the previous frame. A frame whose scene holds a material with no compiled program yet neither ticks nor draws until the compile, off the page's thread, is done (src/viewer/compile-gate.ts); a frame whose tick brought one in ticks but does not draw. */
  start(tick?: (seconds: number) => void): void;
}

export function createViewer(container: HTMLElement, options: ViewerOptions): Viewer {
  // preserveDrawingBuffer: headless capture reads the canvas after the frame; without it the capture is blank (spec, Query contract).
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.domElement.setAttribute('aria-label', 'The workshop yard');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOUR);
  scene.fog = new THREE.Fog(SKY_COLOUR, 40, 90);
  // The room's PMREM is built once its programs have compiled in the background (src/viewer/environment.ts); programs compile against its stand-in meanwhile, and nothing draws before it is in.
  const environment = buildEnvironment(renderer);
  scene.environment = environment.standIn;
  let environmentIn = false;
  const built = environment.texture.then(
    (texture) => {
      scene.environment = texture;
    },
    (error: unknown) => {
      scene.environment = null;
      console.error(`The yard's environment light could not be built (${error instanceof Error ? error.message : String(error)}); the scene draws without it.`);
    },
  );
  void built.then(() => {
    environmentIn = true;
  });
  const lit = environment.standIn === null ? built : Promise.resolve();
  scene.environmentIntensity = 0.25;
  const yard = buildYard();
  scene.add(...buildLights(), yard.group);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !options.shot;
  // The limits live in src/viewer/orbit-limits.ts, where the page checks an explicit cam= pose against them before keeping it.
  controls.maxPolarAngle = MAX_POLAR_ANGLE;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  // The yard's programs start compiling as soon as the light is in, while the page loads the rest.
  const gate = createCompileGate(renderer, scene, camera, lit);
  /** Starts compiling new materials, and is true when nothing waits: every program compiled and the environment in. */
  const drawable = (): boolean => gate.ready() && environmentIn;

  function setPose(pose: CameraPose): void {
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    controls.update();
    yard.update(camera.position);
  }
  setPose(options.pose ?? options.cam ?? DEFAULT_POSE);

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  let frames = 0;
  let last: number | null = null;
  return {
    renderer,
    scene,
    camera,
    controls,
    yard,
    lit,
    get frames() {
      return frames;
    },
    setPose,
    start(tick) {
      window.addEventListener('resize', resize);
      resize();
      const frame = (now: number): void => {
        // Nothing ticks and nothing is drawn while new materials compile off the page's thread or the environment is built.
        if (!drawable()) {
          last = now;
          requestAnimationFrame(frame);
          return;
        }
        const seconds = last === null ? 0 : Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
        last = now;
        tick?.(seconds);
        controls.update();
        // After the controls, so an orbit in progress hides the spans the camera has just moved outside of.
        yard.update(camera.position);
        // The tick may have brought a material in (the stock's first chunk): it compiles before anything draws it.
        if (drawable()) {
          renderer.render(scene, camera);
          frames += 1;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
  };
}

/** Daylight: a sky-and-ground hemisphere fill plus one sun with soft shadows over the yard; the sun's target is returned with it so the scene holds both. */
function buildLights(): THREE.Object3D[] {
  const hemisphere = new THREE.HemisphereLight(0xdde6ef, 0x8a7a66, 0.55);
  const sun = new THREE.DirectionalLight(SUN_COLOUR, SUN_INTENSITY);
  sun.position.copy(SUN_DIRECTION).normalize().multiplyScalar(35);
  sun.target.position.set(0, 2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SHADOW_EXTENT;
  sun.shadow.camera.right = SHADOW_EXTENT;
  sun.shadow.camera.top = SHADOW_EXTENT;
  sun.shadow.camera.bottom = -SHADOW_EXTENT;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  return [hemisphere, sun, sun.target];
}
