/**
 * The viewer: renderer, scene, warm daylight, camera and orbit controls, and the frame loop the page drives.
 * World frame per docs/design/spec.md: 1 unit = 1 metre, +Y up, the figure faces +Z, the origin is the centre of the block's footprint on the yard floor. The yard itself is src/viewer/yard.ts.
 * Rendering choices follow docs/research/decisions.md (WebGLRenderer, GLSL injection) and docs/research/engine-options.md section 6.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { BLOCK_M } from '../david/frame';
import type { CameraPose } from './query';
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
  /** Frames rendered since `start`. */
  readonly frames: number;
  setPose(pose: CameraPose): void;
  /** Starts the render loop; `tick` runs before every render with the clamped seconds since the previous frame. */
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
  const environment = new THREE.PMREMGenerator(renderer);
  scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  scene.add(...buildLights(), buildYard());

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !options.shot;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  // 20 cm tools must be framed from close by in the follow view.
  controls.minDistance = 0.2;
  controls.maxDistance = 80;

  function setPose(pose: CameraPose): void {
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    controls.update();
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
    get frames() {
      return frames;
    },
    setPose,
    start(tick) {
      window.addEventListener('resize', resize);
      resize();
      const frame = (now: number): void => {
        const seconds = last === null ? 0 : Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
        last = now;
        tick?.(seconds);
        controls.update();
        renderer.render(scene, camera);
        frames += 1;
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
