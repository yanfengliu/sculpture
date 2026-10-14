/**
 * The chips one blow sends (docs/design/spec.md, Tools: launched from the tip at the blow, ballistic with a floor bounce, fading on the ground; docs/research/technique.md, How marble behaves: the chip breaks away sideways and forward from a point driven at a shallow angle).
 * Pure in the blow and the seconds since the strike: the burst is seeded by the blow's fields, so the same blow always sends the same chips, and a chip's state at any time is computed from its launch, not integrated frame by frame.
 * Count and size come from the catalog; rasps and abrasives send nothing; the drill sends fine grit.
 * A chip is full until it has come to rest (its last bounce settled and its slide ended), then fades over FADE_SECONDS, so a chip thrown from the top of the block lives longer than one from the base: `chipLifetime` gives a blow's longest, and MAX_CHIP_SECONDS bounds every blow's for the Making's look-back.
 */
import { Quaternion, Vector3 } from 'three';

import type { Blow, ChipState } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { BULK_CUT_SIZE_M, TOOL_CATALOG } from './catalog';
import { hashString, lerp, perpendicularTo, seededRandom, toQuat, toVec3, toVector } from './math';

export const GRAVITY = 9.81;
/** A chip at rest fades over this many seconds. */
export const FADE_SECONDS = 0.5;
const RESTITUTION = 0.3;
const FRICTION_KEEP = 0.55;
const SETTLE_SPEED = 0.25;
const MAX_BOUNCES = 6;
/** After the settling bounce the chip slides, its horizontal speed decaying at SLIDE_DECAY per second (a time constant of a fifth of a second), and stops at SLIDE_SECONDS, three time constants on, with 5 % of that speed left. */
const SLIDE_DECAY = 5;
const SLIDE_SECONDS = 0.6;
/** Launch speeds by tool class, metres per second: heavy point chips fly furthest, grit barely leaves the hole. */
const SPEED: Readonly<Record<'struck' | 'drill', readonly [number, number]>> = { struck: [1.5, 3.5], drill: [0.3, 0.9] };
/** A bulk point cut (BULK_CUT_SIZE_M and over) throws bigger chips faster by this factor. */
const BULK = 1.3;
const CONE_HALF_ANGLE = 0.6;
const SIDEWAYS_SHARE = 0.7;
/** Chips launch this far off the face along its normal. */
const LAUNCH_LIFT_M = 0.004;

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
  const bulk = blow.tool === 'point' && blow.size >= BULK_CUT_SIZE_M ? BULK : 1;
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
      origin: toVector(blow.point).addScaledVector(normal, LAUNCH_LIFT_M),
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

/** Seconds after the strike at which the chip comes to rest: its last bounce has settled and its slide has ended. A chip that never comes down to the floor (launched below its rest height) rests where it is. */
function settleTime(launch: Launch): number {
  const floor = restHeight(launch.scale);
  let y = launch.origin.y;
  let vy = launch.velocity.y;
  let elapsed = 0;
  for (let bounce = 0; bounce <= MAX_BOUNCES; bounce += 1) {
    const hit = fallTime(y, vy, floor);
    if (hit === null) return elapsed;
    elapsed += hit;
    y = floor;
    vy = -(vy - GRAVITY * hit) * RESTITUTION;
    if (Math.abs(vy) < SETTLE_SPEED) return elapsed + SLIDE_SECONDS;
  }
  return elapsed;
}

/** Where the chip is and how far it has spun `seconds` after the strike, on the bounce schedule of `settleTime`, so a chip is still once its settle time has passed. */
function stateAt(launch: Launch, seconds: number): { position: Vector3; spin: number } {
  const floor = restHeight(launch.scale);
  const position = launch.origin.clone();
  const velocity = launch.velocity.clone();
  let elapsed = 0;
  let spin = 0;
  for (let bounce = 0; bounce <= MAX_BOUNCES; bounce += 1) {
    const hit = fallTime(position.y, velocity.y, floor);
    if (hit === null) break;
    const flight = Math.min(hit, seconds - elapsed);
    position.addScaledVector(velocity, flight);
    position.y -= 0.5 * GRAVITY * flight * flight;
    velocity.y -= GRAVITY * flight;
    spin += launch.spinRate * flight;
    elapsed += flight;
    if (elapsed >= seconds - 1e-9) break;
    position.y = floor;
    velocity.set(velocity.x * FRICTION_KEEP, -velocity.y * RESTITUTION, velocity.z * FRICTION_KEEP);
    if (Math.abs(velocity.y) < SETTLE_SPEED) {
      // Sliding to rest: the horizontal speed decays with the time constant 1 / SLIDE_DECAY and the chip stops at SLIDE_SECONDS.
      const sliding = Math.min(seconds - elapsed, SLIDE_SECONDS);
      const slide = (1 - Math.exp(-SLIDE_DECAY * sliding)) / SLIDE_DECAY;
      position.addScaledVector(new Vector3(velocity.x, 0, velocity.z), slide);
      spin += launch.spinRate * slide * 0.5;
      break;
    }
  }
  position.y = Math.max(position.y, floor);
  return { position, spin };
}

/** Chips of `blow` at `secondsSince` the strike: empty before it and once every chip has faded; each chip is full until it rests, then fades over FADE_SECONDS and leaves the list. */
export function chipsAt(blow: Blow, secondsSince: number): readonly ChipState[] {
  if (secondsSince < 0) return [];
  const chips: ChipState[] = [];
  for (const launch of launches(blow)) {
    const life = Math.min(1, (settleTime(launch) + FADE_SECONDS - secondsSince) / FADE_SECONDS);
    if (life <= 0) continue;
    const { position, spin } = stateAt(launch, secondsSince);
    chips.push({ position: toVec3(position), quaternion: toQuat(new Quaternion().setFromAxisAngle(launch.spinAxis, spin)), scale: launch.scale, life });
  }
  return chips;
}

/** Seconds after the strike by which every chip of `blow` has faded: `chipsAt` is empty from then on; 0 for a tool that sends none. */
export function chipLifetime(blow: Blow): number {
  return launches(blow).reduce((longest, launch) => Math.max(longest, settleTime(launch) + FADE_SECONDS), 0);
}

/** No chip of any blow lives longer than this: the longest-lived is thrown straight up at the fastest bulk speed from the top of the block onto a floor at its centre height, falls, bounces until it settles, slides and fades. Falling, bouncing and settling all take longer the higher and the faster upward the launch, so this launch bounds every other. */
export const MAX_CHIP_SECONDS =
  settleTime({ origin: new Vector3(0, BLOCK_M.height + LAUNCH_LIFT_M, 0), velocity: new Vector3(0, SPEED.struck[1] * BULK, 0), spinAxis: new Vector3(0, 1, 0), spinRate: 0, scale: 0 }) + FADE_SECONDS;
