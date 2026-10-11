/**
 * The chips one blow sends (docs/design/spec.md, Tools: launched from the tip at the blow, ballistic with a floor bounce, fading on the ground; docs/research/technique.md, How marble behaves: the chip breaks away sideways and forward from a point driven at a shallow angle).
 * Pure in the blow and the seconds since the strike: the burst is seeded by the blow's fields, so the same blow always sends the same chips, and a chip's state at any time is computed from its launch, not integrated frame by frame.
 * Count and size come from the catalog; rasps and abrasives send nothing; the drill sends fine grit.
 */
import { Quaternion, Vector3 } from 'three';

import type { Blow, ChipState } from '../contracts/making';
import { BULK_CUT_SIZE_M, TOOL_CATALOG } from './catalog';
import { hashString, lerp, perpendicularTo, seededRandom, toQuat, toVec3, toVector } from './math';

export const GRAVITY = 9.81;
/** Chips are full until FADE_START seconds after the strike and gone at FADE_END. */
export const FADE_START = 1.0;
export const FADE_END = 1.5;
const RESTITUTION = 0.3;
const FRICTION_KEEP = 0.55;
const SETTLE_SPEED = 0.25;
const MAX_BOUNCES = 6;
/** Launch speeds by tool class, metres per second: heavy point chips fly furthest, grit barely leaves the hole. */
const SPEED: Readonly<Record<'struck' | 'drill', readonly [number, number]>> = { struck: [1.5, 3.5], drill: [0.3, 0.9] };
const CONE_HALF_ANGLE = 0.6;
const SIDEWAYS_SHARE = 0.7;

interface Launch {
  readonly origin: Vector3;
  readonly velocity: Vector3;
  readonly spinAxis: Vector3;
  readonly spinRate: number;
  readonly scale: number;
}

function seedOf(blow: Blow): number {
  return hashString([blow.tool, ...blow.point, ...blow.direction, blow.size, blow.stroke].map(String).join('|'));
}

/** Rest height of a chip's centre on the floor: it lies on its flat side. */
const restHeight = (scale: number): number => scale * 0.12;

function launches(blow: Blow): Launch[] {
  const spec = TOOL_CATALOG[blow.tool];
  const range = spec.motion === 'struck' ? SPEED.struck : spec.motion === 'drill' ? SPEED.drill : null;
  if (range === null || spec.chips.count.max === 0) return [];
  const random = seededRandom(seedOf(blow));
  const bulk = blow.tool === 'point' && blow.size >= BULK_CUT_SIZE_M ? 1.3 : 1;
  const count = Math.round(lerp(spec.chips.count.min, spec.chips.count.max, random()));
  const normal = toVector(blow.normal).normalize();
  const direction = toVector(blow.direction).normalize();
  // Forward: the direction reflected off the surface, so a shallow blow throws its chips along the stone and up.
  const forward = direction.clone().sub(normal.clone().multiplyScalar(2 * direction.dot(normal)));
  if (forward.dot(normal) < 0.2) forward.addScaledVector(normal, 0.2 - forward.dot(normal)).normalize();
  const side = perpendicularTo(normal, forward.clone().cross(normal));
  const result: Launch[] = [];
  for (let i = 0; i < count; i += 1) {
    const sideways = (random() * 2 - 1) * SIDEWAYS_SHARE;
    const lift = random() * CONE_HALF_ANGLE;
    const yaw = (random() * 2 - 1) * CONE_HALF_ANGLE;
    const velocity = forward
      .clone()
      .multiplyScalar(Math.cos(yaw))
      .addScaledVector(side, Math.sin(yaw) + sideways)
      .addScaledVector(normal, lift)
      .normalize()
      .multiplyScalar(lerp(range[0], range[1], random()) * bulk);
    const spinAxis = new Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
    result.push({
      origin: toVector(blow.point).addScaledVector(normal, 0.004),
      velocity,
      spinAxis,
      spinRate: lerp(4, 18, random()),
      scale: lerp(spec.chips.size.min, spec.chips.size.max, random()) * bulk,
    });
  }
  return result;
}

/** Time at which a chip at height `y` with vertical speed `vy` reaches `floor` under gravity, or null if it never does on the way down. */
function fallTime(y: number, vy: number, floor: number): number | null {
  const discriminant = vy * vy + 2 * GRAVITY * (y - floor);
  if (discriminant < 0) return null;
  const t = (vy + Math.sqrt(discriminant)) / GRAVITY;
  return t > 1e-6 ? t : null;
}

function stateAt(launch: Launch, seconds: number): { position: Vector3; spin: number } {
  const floor = restHeight(launch.scale);
  const position = launch.origin.clone();
  const velocity = launch.velocity.clone();
  let elapsed = 0;
  let spin = 0;
  for (let bounce = 0; bounce <= MAX_BOUNCES; bounce += 1) {
    const hit = fallTime(position.y, velocity.y, floor);
    const flight = hit === null ? seconds - elapsed : Math.min(hit, seconds - elapsed);
    position.addScaledVector(velocity, flight);
    position.y -= 0.5 * GRAVITY * flight * flight;
    velocity.y -= GRAVITY * flight;
    spin += launch.spinRate * flight;
    elapsed += flight;
    if (hit === null || elapsed >= seconds - 1e-9) break;
    position.y = floor;
    velocity.set(velocity.x * FRICTION_KEEP, -velocity.y * RESTITUTION, velocity.z * FRICTION_KEEP);
    if (Math.abs(velocity.y) < SETTLE_SPEED) {
      // Sliding to rest: the horizontal speed decays over about a fifth of a second.
      const remaining = seconds - elapsed;
      const decay = 5;
      const slide = (1 - Math.exp(-decay * remaining)) / decay;
      position.addScaledVector(new Vector3(velocity.x, 0, velocity.z), slide);
      spin += launch.spinRate * Math.min(slide, remaining) * 0.5;
      break;
    }
  }
  position.y = Math.max(position.y, floor);
  return { position, spin };
}

/** Chips of `blow` at `secondsSince` the strike: empty before it and once all have faded. */
export function chipsAt(blow: Blow, secondsSince: number): readonly ChipState[] {
  if (secondsSince < 0 || secondsSince >= FADE_END) return [];
  const life = secondsSince <= FADE_START ? 1 : (FADE_END - secondsSince) / (FADE_END - FADE_START);
  return launches(blow).map((launch) => {
    const { position, spin } = stateAt(launch, secondsSince);
    return { position: toVec3(position), quaternion: toQuat(new Quaternion().setFromAxisAngle(launch.spinAxis, spin)), scale: launch.scale, life };
  });
}
