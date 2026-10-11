/**
 * The trapano a violino (docs/research/tools.md, Trapano): a spade bit on a wooden spindle with a cord wrapped round its pulley, strung on a bow that saws back and forth, and a cap the hand or chest presses on.
 * Local frame: origin at the bit's point, the spindle along +Y to the cap at `height`; the bow lies along X in front of the spindle (+Z).
 * The children named `spindle` and `bow` are what `animateToolParts` spins and slides.
 */
import { Group, LatheGeometry, Vector2, Vector3 } from 'three';

import { dimension } from '../catalog';
import { bentStick, part, pyramidTip, rod, shank, struckHead } from './parts';

const BIT_LENGTH = 0.05;
const CAP_HEIGHT = 0.02;
/** Height of the pulley the cord wraps, as a fraction of the spindle. */
export const PULLEY_Y = 0.12;
export const PULLEY_RADIUS = 0.015;
const BOW_RADIUS = 0.006;
const CORD_RADIUS = 0.002;

export function buildDrill(): Group {
  const height = dimension('drill', 'height');
  const bit = dimension('drill', 'bitDiameter');
  const spindleRadius = dimension('drill', 'spindleDiameter') / 2;
  const bowLength = dimension('drill', 'bowLength');
  const half = bowLength / 2 - BOW_RADIUS;

  const spindle = new Group();
  spindle.name = 'spindle';
  spindle.add(
    part(pyramidTip(bit / 2, bit), 'steel', 'bit-point'),
    part(shank(bit * 0.8, BIT_LENGTH, bit / 2, bit / 2, 8), 'steel', 'bit'),
    part(shank(BIT_LENGTH, height - CAP_HEIGHT, spindleRadius, spindleRadius, 12), 'wood', 'spindle-wood'),
    part(shank(PULLEY_Y - 0.02, PULLEY_Y + 0.02, PULLEY_RADIUS, PULLEY_RADIUS, 12), 'wood', 'pulley'),
    part(cordRing(PULLEY_RADIUS + CORD_RADIUS, PULLEY_Y), 'cord', 'cord-wrap'),
  );

  const bow = new Group();
  bow.name = 'bow';
  const stick = bentStick(
    [new Vector3(-half, PULLEY_Y, 0.02), new Vector3(-half / 2, PULLEY_Y, 0.055), new Vector3(0, PULLEY_Y, 0.07), new Vector3(half / 2, PULLEY_Y, 0.055), new Vector3(half, PULLEY_Y, 0.02)],
    BOW_RADIUS,
  );
  const cordZ = -(PULLEY_RADIUS + CORD_RADIUS);
  bow.add(part(stick, 'wood', 'bow-stick'), part(rod(new Vector3(-half, PULLEY_Y, cordZ), new Vector3(half, PULLEY_Y, cordZ), CORD_RADIUS), 'cord', 'cord'));

  const cap = part(struckHead(height - CAP_HEIGHT, height, 0.025), 'wood', 'cap');
  const group = new Group();
  group.add(spindle, bow, cap);
  return group;
}

/** A thin ring of cord round the pulley, a lathe of a small circle. */
function cordRing(radius: number, y: number): LatheGeometry {
  const points: Vector2[] = [];
  const sides = 8;
  for (let i = 0; i <= sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides;
    points.push(new Vector2(radius + CORD_RADIUS * Math.cos(angle), CORD_RADIUS * Math.sin(angle)));
  }
  const ring = new LatheGeometry(points, 16);
  ring.translate(0, y, 0);
  return ring;
}

/** Bow travel each way, metres, and the spindle turn it gives through the pulley. */
export const BOW_STROKE = 0.15;
export const SPINDLE_TURN_PER_STROKE = BOW_STROKE / PULLEY_RADIUS;
