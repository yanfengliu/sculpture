/**
 * The mazzuolo (docs/research/tools.md, Mazzuolo): a square iron head of about 40 × 40 × 80 mm on a 15 to 20 cm handle.
 * Local frame: origin at the centre of the striking face, which faces -Y; the head runs along +Y to `headLength`; the handle leaves the head's side along +Z, so the blow cycle lays the face on the chisel's head by pointing local -Y down the chisel axis.
 */
import { CylinderGeometry, Group, Vector3 } from 'three';

import { dimension } from '../catalog';
import { box, part } from './parts';

export function buildMallet(): Group {
  const width = dimension('mallet', 'headWidth');
  const height = dimension('mallet', 'headHeight');
  const length = dimension('mallet', 'headLength');
  const handleLength = dimension('mallet', 'handleLength');
  const grip = dimension('mallet', 'handleDiameter') / 2;
  const group = new Group();
  group.add(part(box(width, length, height, new Vector3(0, length / 2, 0)), 'iron', 'head'));
  // The cylinder's +Y end becomes +Z: the slightly swollen grip is at the hand's end, the thinner end sits in the head.
  const handle = new CylinderGeometry(grip, grip * 0.85, handleLength, 10);
  handle.rotateX(Math.PI / 2);
  handle.translate(0, length / 2, height / 2 + handleLength / 2);
  group.add(part(handle, 'wood', 'handle'));
  return group;
}
