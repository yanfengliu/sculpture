/**
 * The tool gallery (the tools worker's own page, tools.html): every catalog tool and prop standing on a 1 m grid floor, each beside a 1 m rule with its name behind it, plus the rest bench with every tool lying in its slot.
 * Exhibit spots are a fixed function of the exhibit index so a capture script can aim at each one without reading the page.
 */
import { BoxGeometry, CanvasTexture, GridHelper, Group, Mesh, MeshStandardMaterial, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Scene } from 'three';

import { BENCH, LEATHER_PAD_REST, benchPose } from '../bench';
import type { CatalogId } from '../catalog';
import { CATALOG_IDS, TOOL_CATALOG } from '../catalog';
import { animateToolParts, toolModel } from '../geometry/index';
import { fromQuat } from '../math';
import type { PropId } from '../props';
import { PROPS, PROP_IDS, propModel } from '../props';

export interface Exhibit {
  readonly id: CatalogId | PropId;
  readonly kind: 'tool' | 'prop';
  readonly title: string;
  readonly subtitle: string;
  readonly spot: Vector3;
}

const COLUMNS = 7;
const PITCH_X = 1.0;
const PITCH_Z = 1.5;
const RULE_OFFSET_X = 0.25;

/** World spot of exhibit `index`: seven to a row along x, rows 1.5 m apart toward -z. */
export function exhibitSpot(index: number): Vector3 {
  return new Vector3((index % COLUMNS) * PITCH_X - 3, 0, -Math.floor(index / COLUMNS) * PITCH_Z);
}

export const EXHIBITS: readonly Exhibit[] = [
  ...CATALOG_IDS.map((id): Omit<Exhibit, 'spot'> => ({ id, kind: 'tool', title: TOOL_CATALOG[id].italian, subtitle: TOOL_CATALOG[id].english })),
  ...PROP_IDS.map((id): Omit<Exhibit, 'spot'> => ({ id, kind: 'prop', title: PROPS[id].italian, subtitle: PROPS[id].english })),
].map((exhibit, index) => ({ ...exhibit, spot: exhibitSpot(index) }));

export interface Gallery {
  /** Moves the parts that move (the drill's bow) for cycle phase `p`. */
  animate(phase: number): void;
}

export function buildGallery(scene: Scene): Gallery {
  scene.add(buildGrid(), buildBench());
  const animated: { model: Group; id: CatalogId }[] = [];
  for (const exhibit of EXHIBITS) {
    const model = exhibit.kind === 'tool' ? toolModel(exhibit.id as CatalogId) : propModel(exhibit.id as PropId);
    model.position.copy(exhibit.spot);
    // The mallet's handle would point at the camera; turn it along +x.
    if (exhibit.id === 'mallet') model.rotation.y = Math.PI / 2;
    // Rasps and the file carry their teeth on local -Z; turn them so the teeth face the gallery's +z camera side.
    if (exhibit.id === 'rasp' || exhibit.id === 'file' || exhibit.id === 'curved-rasp') model.rotation.y = Math.PI;
    scene.add(model, buildRule(exhibit.spot.clone().add(new Vector3(RULE_OFFSET_X, 0, 0))), buildLabel(exhibit.title, exhibit.subtitle, exhibit.spot.clone().add(new Vector3(0, 0.06, -0.3))));
    if (exhibit.kind === 'tool' && exhibit.id === 'drill') animated.push({ model, id: 'drill' });
  }
  return {
    animate(phase) {
      for (const { model, id } of animated) animateToolParts(model, id, phase);
    },
  };
}

/** 1 m cells over the yard and 10 cm cells under the exhibits. */
function buildGrid(): Group {
  const group = new Group();
  const metres = new GridHelper(40, 40, 0x5a5048, 0x8c7f6e);
  metres.position.y = 0.002;
  const decimetres = new GridHelper(8, 80, 0xa89c86, 0xb8ab93);
  decimetres.position.set(0, 0.001, -1.5);
  group.add(metres, decimetres);
  return group;
}

const RULE_LIGHT = new MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 });
const RULE_DARK = new MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });

/** A vertical rule of 1 m: ten bands of 10 cm alternating light and dark, with a tick every centimetre. */
function buildRule(at: Vector3): Group {
  const group = new Group();
  for (let band = 0; band < 10; band += 1) {
    const mesh = new Mesh(new BoxGeometry(0.02, 0.1, 0.02), band % 2 === 0 ? RULE_LIGHT : RULE_DARK);
    mesh.position.set(0, band * 0.1 + 0.05, 0);
    group.add(mesh);
  }
  for (let tick = 1; tick < 100; tick += 1) {
    if (tick % 10 === 0) continue;
    const long = tick % 5 === 0;
    const mesh = new Mesh(new BoxGeometry(long ? 0.012 : 0.006, 0.0015, 0.004), Math.floor(tick / 10) % 2 === 0 ? RULE_DARK : RULE_LIGHT);
    mesh.position.set(-0.01 - (long ? 0.006 : 0.003), tick * 0.01, 0.01);
    group.add(mesh);
  }
  group.position.copy(at);
  return group;
}

/** A name on a canvas, as a sprite that always faces the camera; drawn, not loaded, so the page needs no asset. */
function buildLabel(title: string, subtitle: string, at: Vector3): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.fillStyle = 'rgba(32, 32, 32, 0.72)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f4efe4';
    context.textAlign = 'center';
    context.font = 'bold 50px Georgia, serif';
    context.fillText(title, canvas.width / 2, 58);
    context.font = '34px Georgia, serif';
    context.fillStyle = '#d8d0c0';
    context.fillText(subtitle, canvas.width / 2, 106);
  }
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthTest: true }));
  sprite.scale.set(0.8, 0.1, 1);
  sprite.position.copy(at);
  sprite.renderOrder = 10;
  return sprite;
}

const PLANK = new MeshStandardMaterial({ color: 0x9a7b55, roughness: 0.9 });

/** The plank bench of src/tools/bench.ts with every tool at its rest pose and the leather pad at its spot. */
function buildBench(): Group {
  const group = new Group();
  const width = BENCH.xMax - BENCH.xMin;
  const depth = BENCH.zMax - BENCH.zMin;
  const top = new Mesh(new BoxGeometry(width, 0.04, depth), PLANK);
  top.position.set((BENCH.xMin + BENCH.xMax) / 2, BENCH.top - 0.02, (BENCH.zMin + BENCH.zMax) / 2);
  top.receiveShadow = true;
  group.add(top);
  for (const [x, z] of ([
    [BENCH.xMin + 0.05, BENCH.zMin + 0.05],
    [BENCH.xMax - 0.05, BENCH.zMin + 0.05],
    [BENCH.xMin + 0.05, BENCH.zMax - 0.05],
    [BENCH.xMax - 0.05, BENCH.zMax - 0.05],
  ] as const)) {
    const leg = new Mesh(new BoxGeometry(0.06, BENCH.top - 0.04, 0.06), PLANK);
    leg.position.set(x, (BENCH.top - 0.04) / 2, z);
    group.add(leg);
  }
  for (const id of CATALOG_IDS) {
    const pose = benchPose(id);
    const model = toolModel(id);
    model.position.set(...pose.position);
    model.quaternion.copy(fromQuat(pose.quaternion));
    group.add(model);
  }
  const pad = propModel('leather-pad');
  pad.position.set(...LEATHER_PAD_REST.position);
  pad.quaternion.copy(fromQuat(LEATHER_PAD_REST.quaternion));
  group.add(pad);
  return group;
}
