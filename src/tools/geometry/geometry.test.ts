/**
 * Each tool model's bounding box against its catalog dimensions within 5 percent (docs/design/spec.md, Tools), and the local frame: the working tip at the origin, the body along +Y.
 * Bound: a box says the overall size is right and the frame is right; it says nothing about the shape inside the box, which the gallery captures are for.
 */
import { Box3, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import type { CatalogId } from '../catalog';
import { CATALOG_IDS, TOOL_CATALOG, dimension } from '../catalog';
import { animateToolParts, toolBounds, toolExtent, toolModel } from './index';

type Expected = { readonly x?: number; readonly y: number; readonly z?: number };

/** The catalog numbers each axis of the box must match; an axis left out is a modelling choice (a rasp's teeth above its bar, the drill's bow in front of its spindle). */
function expectedExtent(id: CatalogId): Expected {
  const d = (key: Parameters<typeof dimension>[1]): number => dimension(id, key);
  switch (id) {
    case 'charcoal':
      return { x: d('diameter'), y: d('length'), z: d('diameter') };
    case 'point':
      return { x: d('shaftDiameter'), y: d('shaftLength'), z: d('shaftDiameter') };
    case 'two-tooth':
    case 'claw':
    case 'fine-claw':
    case 'flat':
      return { x: d('bladeWidth'), y: d('shaftLength'), z: d('shaftDiameter') };
    case 'roundel':
      return { x: d('shaftDiameter'), y: d('shaftLength'), z: d('shaftDiameter') };
    case 'drill':
      return { x: d('bowLength'), y: d('height') };
    case 'rasp':
    case 'file':
      return { x: d('width'), y: d('length') };
    case 'pumice':
      return { x: d('length'), y: d('height'), z: d('width') };
    case 'polish':
      return { x: d('diameter'), y: d('length'), z: d('diameter') };
    case 'gilding':
      return { x: d('width'), y: d('length') };
    case 'mallet':
      return { x: d('headWidth'), y: d('headLength'), z: d('headHeight') + d('handleLength') };
  }
}

const TOLERANCE = 0.05;

describe('tool geometry', () => {
  it.each(CATALOG_IDS)('%s matches its catalog dimensions within 5 percent', (id) => {
    const size = toolExtent(id);
    const expected = expectedExtent(id);
    for (const [axis, value] of Object.entries(expected) as [keyof Expected, number][]) {
      const actual = size[axis];
      expect(Math.abs(actual - value) / value, `${id} ${axis}: model ${actual.toFixed(4)} m, catalog ${value.toFixed(4)} m`).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it.each(CATALOG_IDS)('%s has its working tip at the origin and its body along +Y', (id) => {
    const bounds = toolBounds(id);
    expect(Math.abs(bounds.min.y), `${id} min y`).toBeLessThan(0.002);
    expect(bounds.max.y, `${id} max y`).toBeGreaterThan(0.01);
    // Centred on the axis: a chisel's tip is on it; the drill's bow and the mallet's handle reach out on one side only.
    if (TOOL_CATALOG[id].motion === 'struck') {
      expect(Math.abs(bounds.min.x + bounds.max.x), `${id} centred in x`).toBeLessThan(0.002);
      expect(Math.abs(bounds.min.z + bounds.max.z), `${id} centred in z`).toBeLessThan(0.002);
    }
  });

  it('hands out separate instances that share one cached geometry', () => {
    const a = toolModel('point');
    const b = toolModel('point');
    expect(a).not.toBe(b);
    const meshA = a.children.find((child): child is Mesh => child instanceof Mesh);
    const meshB = b.children.find((child): child is Mesh => child instanceof Mesh);
    expect(meshA?.geometry).toBeDefined();
    expect(meshA?.geometry).toBe(meshB?.geometry);
    expect(meshA?.material).toBe(meshB?.material);
  });

  it('saws the drill bow and spins the spindle with the phase, and leaves other tools alone', () => {
    const drill = toolModel('drill');
    animateToolParts(drill, 'drill', 0.25);
    expect(drill.getObjectByName('bow')?.position.x).toBeCloseTo(0.15, 6);
    expect(drill.getObjectByName('spindle')?.rotation.y).toBeCloseTo(10, 6);
    animateToolParts(drill, 'drill', 0.5);
    expect(drill.getObjectByName('bow')?.position.x).toBeCloseTo(0, 6);
    const point = toolModel('point');
    const before = new Box3().setFromObject(point, true);
    animateToolParts(point, 'point', 0.4);
    expect(new Box3().setFromObject(point, true).equals(before)).toBe(true);
  });

  it('cuts the teeth into the blade: the two-tooth edge has two teeth touching y = 0 either side of a notch', () => {
    const found = toolModel('two-tooth').getObjectByName('blade');
    // A typed guard: `instanceof Mesh` alone narrows to Mesh<any, any> and its geometry would be untyped.
    const isMesh = (object: Object3D | undefined): object is Mesh => object instanceof Mesh;
    expect(isMesh(found)).toBe(true);
    if (!isMesh(found)) return;
    const blade: Mesh = found;
    const positions = blade.geometry.getAttribute('position');
    const edgeXs = new Set<number>();
    for (let i = 0; i < positions.count; i += 1) if (Math.abs(positions.getY(i)) < 1e-6) edgeXs.add(Number(positions.getX(i).toFixed(4)));
    const notch = dimension('two-tooth', 'toothPitch') * 0.35;
    const sorted = [...edgeXs].sort((p, q) => p - q);
    expect(sorted.length).toBe(4);
    expect((sorted[2] ?? 0) - (sorted[1] ?? 0)).toBeCloseTo(notch, 4);
    const centre = new Vector3();
    new Box3().setFromObject(blade, true).getCenter(centre);
    expect(Math.abs(centre.x)).toBeLessThan(1e-6);
  });
});
