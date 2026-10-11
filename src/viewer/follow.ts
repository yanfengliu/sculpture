/**
 * The follow-tool camera (docs/design/spec.md, Page, View menu): while playback moves, the orbit target glides to the working tip and the camera keeps its viewing direction at the step's focus distance, with a soft lag; a drag on the canvas switches it off.
 * `framingFor` is the same framing as one fixed pose, for `?view=follow` captures where nothing moves.
 */
import type { PerspectiveCamera } from 'three';
import { Vector3 as Vec } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { Vec3 } from '../contracts/making';
import type { CameraPose } from './query';

/** Distance from the tip when a step sets no focus, metres. */
export const DEFAULT_FOLLOW_DISTANCE = 2.2;
/** Time constant of the lag, seconds. */
const LAG_SECONDS = 0.35;
/** Viewing direction of a fresh follow framing: from the front right, a little above the tip. */
const DEFAULT_VIEW_DIRECTION: Vec3 = [0.55, 0.35, 1.0];
const MIN_CAMERA_HEIGHT = 0.3;

export interface FollowCamera {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  /** Moves the camera toward the framing of `tip` over `seconds`; a null tip (a rest position) leaves the camera where it is. */
  update(seconds: number, tip: Vec3 | null, distance: number): void;
  /** Listener for the drag switch-off, so the menu's toggle can follow. */
  onDisabled(listener: () => void): void;
  dispose(): void;
}

/** A fixed pose that frames `tip` from `distance` along `viewDirection`. */
export function framingFor(tip: Vec3, distance: number, viewDirection: Vec3 = DEFAULT_VIEW_DIRECTION): CameraPose {
  const direction = new Vec(...viewDirection).normalize();
  const position = new Vec(...tip).addScaledVector(direction, distance);
  position.y = Math.max(MIN_CAMERA_HEIGHT, position.y);
  return { position: [position.x, position.y, position.z], target: [...tip] };
}

export function createFollow(camera: PerspectiveCamera, controls: OrbitControls): FollowCamera {
  let enabled = false;
  const listeners: (() => void)[] = [];
  const desiredTarget = new Vec();
  const desiredPosition = new Vec();
  const direction = new Vec();

  const onDrag = (): void => {
    if (!enabled) return;
    enabled = false;
    for (const listener of listeners) listener();
  };
  controls.addEventListener('start', onDrag);

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
    },
    update(seconds, tip, distance) {
      if (!enabled || tip === null) return;
      desiredTarget.set(...tip);
      direction.subVectors(camera.position, controls.target);
      if (direction.lengthSq() < 1e-6) direction.set(...DEFAULT_VIEW_DIRECTION);
      direction.normalize();
      desiredPosition.copy(desiredTarget).addScaledVector(direction, distance);
      desiredPosition.y = Math.max(MIN_CAMERA_HEIGHT, desiredPosition.y);
      const blend = 1 - Math.exp(-seconds / LAG_SECONDS);
      controls.target.lerp(desiredTarget, blend);
      camera.position.lerp(desiredPosition, blend);
    },
    onDisabled(listener) {
      listeners.push(listener);
    },
    dispose() {
      controls.removeEventListener('start', onDrag);
    },
  };
}
