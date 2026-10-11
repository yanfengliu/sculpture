/**
 * The yard and the block: renderer, scene, lights, camera and orbit controls.
 * World frame per docs/design/spec.md: 1 unit = 1 metre, +Y up, the figure faces +Z, the origin is the centre of the block's footprint on the yard floor.
 *
 * The block is a placeholder box until `src/david/frame.ts` (coordinator) lands the researched constants; the page then reads them from there and these three numbers go.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { CameraPose } from './query';

/** Placeholder block, metres: width across the front (x), height (y), depth (z). Replaced by `src/david/frame.ts`. */
export const PLACEHOLDER_BLOCK = { width: 2.0, height: 5.5, depth: 1.2 } as const;

const YARD_SIZE = 40;
const SKY_COLOUR = 0xcfd9e3;
const YARD_COLOUR = 0xa89c86;
const MARBLE_COLOUR = 0xece9e2;
/** Frames the whole block from the front right, a little above eye height. */
const DEFAULT_CAMERA: CameraPose = { position: [7, 4.5, 10], target: [0, PLACEHOLDER_BLOCK.height / 2, 0] };
const READY_FRAMES = 5;

export interface ViewerOptions {
  /** Capture mode: no damping, so the first frames show the requested pose exactly, and `window.__shotReady` after `READY_FRAMES`. */
  readonly shot: boolean;
  /** Explicit camera from `?cam=`; the default framing when null. */
  readonly cam: CameraPose | null;
}

export interface Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Starts the render loop; resizes with the window. */
  start(): void;
}

export function createViewer(container: HTMLElement, options: ViewerOptions): Viewer {
  // preserveDrawingBuffer: headless capture reads the canvas after the frame; without it the capture is blank (spec, Query contract).
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOUR);
  scene.add(...buildLights(), buildYard(), buildBlock());

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !options.shot;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 1;
  controls.maxDistance = 80;
  applyPose(camera, controls, options.cam ?? DEFAULT_CAMERA);

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  let frames = 0;
  function frame(): void {
    controls.update();
    renderer.render(scene, camera);
    frames += 1;
    if (options.shot && frames === READY_FRAMES) window.__shotReady = true;
    requestAnimationFrame(frame);
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    start(): void {
      window.addEventListener('resize', resize);
      resize();
      requestAnimationFrame(frame);
    },
  };
}

function applyPose(camera: THREE.PerspectiveCamera, controls: OrbitControls, pose: CameraPose): void {
  camera.position.set(...pose.position);
  controls.target.set(...pose.target);
  controls.update();
}

/** Neutral daylight: a sky-and-ground hemisphere plus one sun, low enough in front that the block's vertical faces read as white stone, casting its shadow on the yard. */
function buildLights(): THREE.Light[] {
  const hemisphere = new THREE.HemisphereLight(0xdfe8f0, 0x8a7a66, 0.9);
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.5);
  sun.position.set(6, 9, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -4;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0005;
  return [hemisphere, sun];
}

function buildYard(): THREE.Mesh {
  const yard = new THREE.Mesh(
    new THREE.PlaneGeometry(YARD_SIZE, YARD_SIZE),
    new THREE.MeshStandardMaterial({ color: YARD_COLOUR, roughness: 1, metalness: 0 }),
  );
  yard.rotation.x = -Math.PI / 2;
  yard.receiveShadow = true;
  return yard;
}

function buildBlock(): THREE.Mesh {
  const { width, height, depth } = PLACEHOLDER_BLOCK;
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: MARBLE_COLOUR, roughness: 0.85, metalness: 0 }),
  );
  block.position.y = height / 2;
  block.castShadow = true;
  block.receiveShadow = true;
  return block;
}
