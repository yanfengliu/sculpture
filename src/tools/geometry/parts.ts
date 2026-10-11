/**
 * Part builders every tool model shares: shanks, tips, blades cut from a profile, bars with raised teeth and bent sticks.
 * Local frame of every tool (docs/design/spec.md, Tools): origin at the working tip, the shaft along +Y, the struck end at +Y.
 * Only Lathe, Extrude, Cylinder (and its Cone case) and Box geometry are used; a taper or a tooth is a vertex transform or a merge of those.
 */
import { BoxGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Mesh, Quaternion, Shape, Vector2, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { MaterialId } from './materials';
import { material } from './materials';

export function part(geometry: BufferGeometry, materialId: MaterialId, name: string): Mesh {
  const mesh = new Mesh(geometry, material(materialId));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A shank along +Y from `y0` to `y1`, octagonal when `sides` is 8, tapering from `radiusTop` at `y1` to `radiusBottom` at `y0`. */
export function shank(y0: number, y1: number, radiusBottom: number, radiusTop: number, sides = 8): BufferGeometry {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, y1 - y0, sides);
  geometry.rotateY(Math.PI / sides);
  geometry.translate(0, (y0 + y1) / 2, 0);
  return geometry;
}

/** A four-faceted pyramid with its apex at the origin and its square base of half-width `radius` at `y = height`. */
export function pyramidTip(radius: number, height: number): BufferGeometry {
  const geometry = new ConeGeometry(radius, height, 4);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

/** The slightly mushroomed struck head of a chisel: a lathe of a rounded profile from `y0` to `y1`, no wider than `radius`. */
export function struckHead(y0: number, y1: number, radius: number): BufferGeometry {
  const height = y1 - y0;
  const profile = [new Vector2(0, 0), new Vector2(radius * 0.9, 0), new Vector2(radius, height * 0.35), new Vector2(radius * 0.96, height * 0.8), new Vector2(radius * 0.7, height), new Vector2(0, height)];
  const geometry = new LatheGeometry(profile, 12);
  geometry.translate(0, y0, 0);
  return geometry;
}

/**
 * A blade cut from a front profile: `outline` is the closed polygon in the XY plane (the working edge at y = 0, teeth and notches included), extruded `thickness` along Z and centred on it.
 * The blade then tapers: its thickness at y = 0 is `edgeThickness`, growing linearly to the full thickness at `y = length`.
 */
export function bladeFromProfile(outline: readonly Vector2[], length: number, thickness: number, edgeThickness: number): BufferGeometry {
  const shape = new Shape(outline.map((point) => point.clone()));
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -thickness / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i);
    const factor = (edgeThickness + (thickness - edgeThickness) * Math.min(1, Math.max(0, y / length))) / thickness;
    positions.setZ(i, positions.getZ(i) * factor);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** The front profile of a toothed edge: a blade `width` wide and `length` tall, its bottom edge cut into `teeth` flat teeth separated by notches `notchDepth` deep, narrowing to `topWidth` at the top. */
export function toothedOutline(width: number, length: number, topWidth: number, teeth: number, notchWidth: number, notchDepth: number): Vector2[] {
  const points: Vector2[] = [new Vector2(-width / 2, 0)];
  const toothWidth = (width - notchWidth * (teeth - 1)) / teeth;
  let x = -width / 2;
  for (let i = 0; i < teeth; i += 1) {
    x += toothWidth;
    points.push(new Vector2(x, 0));
    if (i < teeth - 1) {
      points.push(new Vector2(x, notchDepth), new Vector2(x + notchWidth, notchDepth));
      x += notchWidth;
      points.push(new Vector2(x, 0));
    }
  }
  points.push(new Vector2(width / 2, length * 0.55), new Vector2(topWidth / 2, length), new Vector2(-topWidth / 2, length), new Vector2(-width / 2, length * 0.55));
  return points;
}

/** A straight bar along +Y from `y0` to `y1` with pyramidal teeth raised `toothHeight` off its -Z face on a grid of `pitch`. */
export function raisedTeeth(y0: number, y1: number, width: number, pitch: number, toothHeight: number, zFace: number): BufferGeometry {
  const teeth: BufferGeometry[] = [];
  const columns = Math.max(1, Math.floor(width / pitch));
  const rows = Math.max(1, Math.floor((y1 - y0) / pitch));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tooth = new ConeGeometry(pitch * 0.45, toothHeight, 4);
      tooth.rotateY(Math.PI / 4);
      // The cone's apex is at +Y; a quarter turn the other way about X points it along -Z, off the working face.
      tooth.rotateX(-Math.PI / 2);
      const stagger = row % 2 === 0 ? 0 : pitch / 2;
      tooth.translate(-width / 2 + pitch * (column + 0.5) + stagger * 0.5, y0 + pitch * (row + 0.5), zFace - toothHeight / 2);
      teeth.push(tooth);
    }
  }
  return mergeGeometries(teeth, false);
}

/** A stick of radius `radius` bent along `points` (an extrusion of a circle along a Catmull-Rom path). */
export function bentStick(points: readonly Vector3[], radius: number, segments = 24): BufferGeometry {
  const path = new CatmullRomCurve3(points.map((point) => point.clone()));
  const section = new Shape();
  section.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return new ExtrudeGeometry(section, { extrudePath: path, steps: segments, bevelEnabled: false });
}

/** A straight rod of radius `radius` from `a` to `b`. */
export function rod(a: Vector3, b: Vector3, radius: number, sides = 6): BufferGeometry {
  const span = b.clone().sub(a);
  const geometry = new CylinderGeometry(radius, radius, span.length(), sides);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), span.clone().normalize()));
  const middle = a.clone().add(b).multiplyScalar(0.5);
  geometry.translate(middle.x, middle.y, middle.z);
  return geometry;
}

/** A box centred at `centre`. */
export function box(width: number, height: number, depth: number, centre: Vector3): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(centre.x, centre.y, centre.z);
  return geometry;
}
