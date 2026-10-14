/**
 * The Opera del Duomo yard as docs/research/technique.md stage 0 infers it: a packed-earth floor; the `turata` of planks Vasari describes around the block, open at the front for the camera; a two-level timber scaffold with plank decks at 1.5 m and 3.2 m ringing the front and sides, standing half a metre clear of the stock; a plumb line from the top beam; a plank bench for the tools; the small wax model on a stand.
 * World frame per docs/design/spec.md: metres, +Y up, the figure faces +Z, the origin under the block's footprint centre. The block's size comes from src/david/frame.ts.
 *
 * Spans (docs/policies/local-rules.md: nothing stands between the camera and the stock): the structures are built as one group per side of the block (each turata wall with its posts and rails, each scaffold side with its posts, ledgers and decks, the head bridge across the front, the back bridges, the bench with the props on it, the model stand), each with the centre, outward normal and inner faces of src/viewer/yard-spans.ts. `Yard.update(camera)` hides the spans the camera is outside of and shows the rest; `setEnabled(false)` (the Yard toggle, `yard=0`) hides them all. The floor always stays.
 * Bridges: each plank bridge of src/tools/scaffold.ts is its own mesh, hidden until `setBridges` lays it (src/viewer/bridges.ts decides when the work needs it); a span's inner faces count only its laid bridges.
 * The enclosure's planks are single-sided and face inward, so a camera outside the turata looks through its wall; from inside, the planks are the backdrop. They still cast shadows from either side.
 * The materials and their canvas textures are src/viewer/yard-materials.ts: no runtime asset is fetched.
 */
import * as THREE from 'three';

import type { Vec3 } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { BENCH, LEATHER_PAD_REST } from '../tools/bench';
import { quatFromBasis } from '../tools/math';
import { propModel } from '../tools/props';
import type { Platform } from '../tools/scaffold';
import { BRIDGES, DECK_EXTENTS, DECK_LEVELS, SCAFFOLD_TIMBER } from '../tools/scaffold';
import type { YardMaterials } from './yard-materials';
import { FLOOR_SIZE, hash, yardMaterials } from './yard-materials';
import type { Box, SpanFace, SpanGeometry, YardSpanId } from './yard-spans';
import { hiddenSpans, innerFaces, outwardNormal } from './yard-spans';

/** The scaffold's timbers, deck extents and bridges are the tools' model (src/tools/scaffold.ts), the one the reach check uses, so the decks drawn are the decks the blows are planned from. */
const { deckWidth: DECK_WIDTH, plankWidth: PLANK_W, plankThickness: PLANK_T, plankGap: PLANK_GAP, post: POST, beam: BEAM, postHeight: POST_HEIGHT, topBeamY: TOP_BEAM_Y } = SCAFFOLD_TIMBER;
const { innerX: INNER_X, outerX: OUTER_X, sideZMin: SIDE_BACK_Z, sideZMax: SIDE_FRONT_Z, frontZMin: FRONT_INNER_Z, frontZMax: FRONT_OUTER_Z, frontHalfX: FRONT_HALF_X } = DECK_EXTENTS;
/** The turata: side walls at ±x, back wall at −z, open at +z. */
const WALL_X = 4.5;
const WALL_BACK_Z = -3.5;
const WALL_FRONT_Z = 4.5;
const WALL_HEIGHT = 4.0;
const WALL_PLANK_W = 0.26;

/** The bench top's plank thickness; its extent is `BENCH` from src/tools/bench.ts, where the tools' rest slots are laid out. */
const BENCH_THICKNESS = 0.05;
/** The plumb line (a prop of src/tools/props.ts, 1.58 m from bob tip to reel) hangs from the top deck's inner front ledger just right of the block's front face. */
export const PLUMB_LINE = { x: 0.95, z: FRONT_INNER_Z, reel: DECK_LEVELS[1] - PLANK_T - BEAM, height: 1.58 } as const;
/** Where the small wax model's stand (a post and a board) stands, beside the bench. */
const WAX_STAND = { x: -3.3, z: 0.3, boardTop: 1.03 } as const;
/** The bridges behind the block (src/tools/scaffold.ts) make the scaffold's back span; the head bridge across the front is a span of its own, so its plank ends, which stick out past the block's sides, never hide the front scaffold. */
const BACK_BRIDGES = BRIDGES.filter((bridge) => bridge.zMax <= 0);
const FRONT_BRIDGES = BRIDGES.filter((bridge) => bridge.zMax > 0);
/** Name of a bridge's mesh; its `userData.bridge` holds the bridge's id. */
const bridgeMeshName = (id: string): string => `bridge-${id}`;

interface Timber {
  readonly size: readonly [number, number, number];
  readonly centre: readonly [number, number, number];
  readonly shade: number;
}

/** Collects boxes and builds them as one instanced mesh, so a span's timbers are one draw call. */
class Timbers {
  private readonly items: Timber[] = [];
  constructor(
    private readonly material: THREE.Material,
    private readonly seed: number,
  ) {}

  add(size: readonly [number, number, number], centre: readonly [number, number, number]): void {
    this.items.push({ size, centre, shade: 0.85 + 0.3 * hash(this.seed + this.items.length) });
  }

  build(name: string): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, Math.max(1, this.items.length));
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    this.items.forEach(({ size, centre, shade }, index) => {
      matrix.makeScale(...size).setPosition(...centre);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colour.setScalar(shade));
    });
    mesh.count = this.items.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    return mesh;
  }
}

function buildFloor(material: THREE.Material): THREE.Mesh {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), material);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  return floor;
}

type Materials = YardMaterials;


/** One span under construction: its timbers and deck planks as instanced boxes, plus any props, built into one group named by its id. */
class SpanBuilder {
  readonly timbers: Timbers;
  readonly decks: Timbers;
  private readonly extras: THREE.Object3D[] = [];
  constructor(
    readonly id: YardSpanId,
    private readonly materials: Materials,
    private readonly seed: number,
  ) {
    this.timbers = new Timbers(materials.timber, seed);
    this.decks = new Timbers(materials.deck, seed + 1);
  }

  /** A plank bridge of src/tools/scaffold.ts as its own mesh, hidden until laid: planks along x, resting on the side decks' inner ledgers at the bridge's level, their tops flush with the decks. */
  bridge(bridge: Platform): void {
    const planks = new Timbers(this.materials.deck, this.seed + 7 + this.extras.length);
    for (let z = bridge.zMin + PLANK_W / 2; z <= bridge.zMax - PLANK_W / 2 + 1e-6; z += PLANK_W + PLANK_GAP) {
      planks.add([bridge.xMax - bridge.xMin, PLANK_T, PLANK_W], [(bridge.xMin + bridge.xMax) / 2, bridge.level - PLANK_T / 2, z]);
    }
    const mesh = planks.build(bridgeMeshName(bridge.id));
    mesh.userData['bridge'] = bridge.id;
    mesh.visible = false;
    this.extras.push(mesh);
  }

  post(x: number, z: number): void {
    this.timbers.add([POST, POST_HEIGHT, POST], [x, POST_HEIGHT / 2, z]);
  }

  add(object: THREE.Object3D): void {
    object.traverse((child) => {
      child.castShadow = true;
    });
    this.extras.push(object);
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    group.name = this.id;
    group.add(this.timbers.build(`${this.id}-timbers`), this.decks.build(`${this.id}-decks`), ...this.extras);
    return group;
  }
}

/** One side of the scaffold (sign −1 left, +1 right): posts, ledgers along it, transoms across it and the deck planks on both levels. */
function buildSideScaffold(span: SpanBuilder, sign: -1 | 1): void {
  span.post(sign * OUTER_X, SIDE_BACK_Z);
  span.post(sign * OUTER_X, SIDE_FRONT_Z);
  span.post(sign * INNER_X, SIDE_BACK_Z);
  span.post(sign * INNER_X, SIDE_FRONT_Z);
  const length = SIDE_FRONT_Z - SIDE_BACK_Z;
  const midZ = (SIDE_BACK_Z + SIDE_FRONT_Z) / 2;
  const midX = (sign * (INNER_X + OUTER_X)) / 2;
  for (const level of DECK_LEVELS) {
    const beamY = level - PLANK_T - BEAM / 2;
    span.timbers.add([BEAM, BEAM, length], [sign * OUTER_X, beamY, midZ]);
    span.timbers.add([BEAM, BEAM, length], [sign * INNER_X, beamY, midZ]);
    for (let z = SIDE_BACK_Z; z <= SIDE_FRONT_Z + 1e-6; z += 1.0) span.timbers.add([DECK_WIDTH + POST, BEAM, BEAM], [midX, beamY, z]);
    // Deck planks run across the deck width, laid along z.
    for (let z = SIDE_BACK_Z + PLANK_W / 2; z <= SIDE_FRONT_Z - PLANK_W / 2 + 1e-6; z += PLANK_W + PLANK_GAP) {
      span.decks.add([DECK_WIDTH, PLANK_T, PLANK_W], [midX, level - PLANK_T / 2, z]);
    }
  }
}

/** The front of the scaffold: posts, the top beam the plumb line hangs from, ledgers along x, transoms across and the deck planks on both levels, with the plumb line itself. */
function buildFrontScaffold(span: SpanBuilder): void {
  for (const sign of [-1, 1]) {
    span.post(sign * FRONT_HALF_X, FRONT_OUTER_Z);
    span.post(sign * FRONT_HALF_X, FRONT_INNER_Z);
  }
  span.timbers.add([FRONT_HALF_X * 2 + POST, BEAM, BEAM], [0, TOP_BEAM_Y, FRONT_INNER_Z]);
  const midZ = (FRONT_INNER_Z + FRONT_OUTER_Z) / 2;
  for (const level of DECK_LEVELS) {
    const beamY = level - PLANK_T - BEAM / 2;
    span.timbers.add([FRONT_HALF_X * 2, BEAM, BEAM], [0, beamY, FRONT_INNER_Z]);
    span.timbers.add([FRONT_HALF_X * 2, BEAM, BEAM], [0, beamY, FRONT_OUTER_Z]);
    for (let x = -FRONT_HALF_X; x <= FRONT_HALF_X + 1e-6; x += 1.0) span.timbers.add([BEAM, BEAM, DECK_WIDTH + POST], [x, beamY, midZ]);
    for (let x = -FRONT_HALF_X + PLANK_W / 2; x <= FRONT_HALF_X - PLANK_W / 2 + 1e-6; x += PLANK_W + PLANK_GAP) {
      span.decks.add([PLANK_W, PLANK_T, DECK_WIDTH], [x, level - PLANK_T / 2, midZ]);
    }
  }
  // The plumb line prop: origin at the bob's tip, the cord up +Y to the reel; the reel sits under the ledger.
  const line = propModel('plumb-line');
  line.position.set(PLUMB_LINE.x, PLUMB_LINE.reel - PLUMB_LINE.height, PLUMB_LINE.z);
  span.add(line);
}

/** The back of the scaffold: the bridges laid behind the block at both levels, which the decks do not ring. */
function buildBackScaffold(span: SpanBuilder): void {
  for (const bridge of BACK_BRIDGES) span.bridge(bridge);
}

/** The head bridge across the front at the top level. */
function buildHeadBridge(span: SpanBuilder): void {
  for (const bridge of FRONT_BRIDGES) span.bridge(bridge);
}

/** The bench with the tools' rest slots on top and the props that lie on it: the leather pad with tripoli at its slot, the curved rasp beside the chisels. */
function buildBench(span: SpanBuilder): void {
  const width = BENCH.xMax - BENCH.xMin;
  const depth = BENCH.zMax - BENCH.zMin;
  const cx = (BENCH.xMin + BENCH.xMax) / 2;
  const cz = (BENCH.zMin + BENCH.zMax) / 2;
  span.timbers.add([width, BENCH_THICKNESS, depth], [cx, BENCH.top - BENCH_THICKNESS / 2, cz]);
  const legHeight = BENCH.top - BENCH_THICKNESS;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      span.timbers.add([0.06, legHeight, 0.06], [cx + sx * (width / 2 - 0.06), legHeight / 2, cz + sz * (depth / 2 - 0.06)]);
    }
  }
  span.timbers.add([width - 0.16, 0.04, 0.04], [cx, 0.25, cz - depth / 2 + 0.06]);
  span.timbers.add([width - 0.16, 0.04, 0.04], [cx, 0.25, cz + depth / 2 - 0.06]);
  const pad = propModel('leather-pad');
  pad.position.set(...LEATHER_PAD_REST.position);
  pad.quaternion.set(...LEATHER_PAD_REST.quaternion);
  const rasp = propModel('curved-rasp');
  // Lying like the chisels: local +Y (the length) along world +X, tip toward the wall.
  rasp.quaternion.copy(quatFromBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  rasp.position.set(-2.37, BENCH.top + 0.006, 1.35);
  span.add(pad);
  span.add(rasp);
}

/** The small wax model (technique.md, stage 1: about 45 cm; the prop of src/tools/props.ts) on a post-and-board stand beside the bench. */
function buildWaxModel(span: SpanBuilder): void {
  const { x, z, boardTop } = WAX_STAND;
  span.timbers.add([0.1, boardTop - 0.03, 0.1], [x, (boardTop - 0.03) / 2, z]);
  span.timbers.add([0.36, 0.03, 0.36], [x, boardTop - 0.015, z]);
  const model = propModel('wax-model');
  model.position.set(x, boardTop, z);
  span.add(model);
}

/** Vertical planks of one turata wall facing inward, as one instanced mesh. */
function wallPlanks(material: THREE.Material, planks: readonly { readonly x: number; readonly z: number; readonly rotation: number }[], name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(WALL_PLANK_W, WALL_HEIGHT), material, planks.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const colour = new THREE.Color();
  planks.forEach(({ x, z, rotation }, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    matrix.compose(new THREE.Vector3(x, WALL_HEIGHT / 2, z), quaternion, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, colour.setScalar(0.8 + 0.3 * hash(index * 3 + 101)));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

/** A side wall of the turata (sign −1 left, +1 right): its planks, posts off the block's centre line (so the left and right presets look at the figure between them) and two rails. */
function buildSideWall(span: SpanBuilder, sign: -1 | 1, material: THREE.Material): void {
  const planks: { x: number; z: number; rotation: number }[] = [];
  for (let z = WALL_BACK_Z + WALL_PLANK_W / 2; z < WALL_FRONT_Z; z += WALL_PLANK_W + PLANK_GAP) planks.push({ x: sign * WALL_X, z, rotation: (-sign * Math.PI) / 2 });
  span.add(wallPlanks(material, planks, `${span.id}-planks`));
  for (const z of [WALL_BACK_Z, -1.5, 2.5, WALL_FRONT_Z]) span.timbers.add([POST, WALL_HEIGHT + 0.3, POST], [sign * (WALL_X + POST / 2), (WALL_HEIGHT + 0.3) / 2, z]);
  for (const y of [1.0, 3.0]) span.timbers.add([POST / 2, BEAM, WALL_FRONT_Z - WALL_BACK_Z], [sign * (WALL_X + POST / 4), y, (WALL_BACK_Z + WALL_FRONT_Z) / 2]);
  if (sign === -1) {
    // The carpenter's square leans on the left wall: standing on the floor, the foot along +z, 12 degrees back against the planks.
    const square = propModel('square');
    square.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.21).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)));
    square.position.set(-WALL_X + 0.15, 0, 1.9);
    span.add(square);
  }
}

/** The back wall of the turata: planks, posts off the centre line (so the back preset looks at the figure between them) and two rails. */
function buildBackWall(span: SpanBuilder, material: THREE.Material): void {
  const planks: { x: number; z: number; rotation: number }[] = [];
  for (let x = -WALL_X + WALL_PLANK_W / 2; x < WALL_X; x += WALL_PLANK_W + PLANK_GAP) planks.push({ x, z: WALL_BACK_Z, rotation: 0 });
  span.add(wallPlanks(material, planks, `${span.id}-planks`));
  for (const x of [-WALL_X / 2, WALL_X / 2]) span.timbers.add([POST, WALL_HEIGHT + 0.3, POST], [x, (WALL_HEIGHT + 0.3) / 2, WALL_BACK_Z - POST / 2]);
  for (const y of [1.0, 3.0]) span.timbers.add([WALL_X * 2 + POST, BEAM, POST / 2], [0, y, WALL_BACK_Z - POST / 4]);
}

export interface YardSpan extends SpanGeometry {
  readonly group: THREE.Group;
}

/** A span as the yard keeps it: its faces follow the bridges laid. */
interface LiveSpan extends YardSpan {
  faces: readonly SpanFace[];
}

export interface Yard {
  /** Everything in the yard but the stock, the tools and the chips; add this to the scene. */
  readonly group: THREE.Group;
  readonly spans: readonly YardSpan[];
  /** Whether the yard structures show at all (the Yard toggle, `yard=0`); the floor stays either way. */
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  /** Ids of the spans hidden now, in span order. */
  readonly hidden: readonly YardSpanId[];
  /** Applies the rule for a camera at `position`: hides the spans the camera is outside of, or every span while the yard is off. */
  update(position: { readonly x: number; readonly y: number; readonly z: number }): void;
  /** Ids of the bridges laid now, in the order of BRIDGES (src/tools/scaffold.ts). */
  readonly bridges: readonly string[];
  /** Lays exactly the bridges `ids` names: shows their planks, hides the rest, and counts only laid bridges in their spans' inner faces. */
  setBridges(ids: readonly string[]): void;
}

interface SpanPlan extends Omit<SpanGeometry, 'faces'> {
  /** Adds the span's timbers, decks and props to the builder. */
  readonly build: (span: SpanBuilder, materials: Materials) => void;
}

const SIDE_SCAFFOLD_CENTRE_X = (INNER_X + OUTER_X) / 2;
const SIDE_SCAFFOLD_CENTRE_Z = (SIDE_BACK_Z + SIDE_FRONT_Z) / 2;
const SCAFFOLD_CENTRE_Y = (DECK_LEVELS[0] + DECK_LEVELS[1]) / 2;
const HEAD_BRIDGE_CENTRE: Vec3 = FRONT_BRIDGES[0] === undefined ? [0, DECK_LEVELS[1], BLOCK_M.depth / 2] : [0, FRONT_BRIDGES[0].level, (FRONT_BRIDGES[0].zMin + FRONT_BRIDGES[0].zMax) / 2];
const BACK_SCAFFOLD_Z = BACK_BRIDGES.length === 0 ? -BLOCK_M.depth / 2 : BACK_BRIDGES.reduce((sum, bridge) => sum + (bridge.zMin + bridge.zMax) / 2, 0) / BACK_BRIDGES.length;
const WALL_CENTRE_Z = (WALL_BACK_Z + WALL_FRONT_Z) / 2;
const BENCH_CENTRE: Vec3 = [(BENCH.xMin + BENCH.xMax) / 2, BENCH.top / 2, (BENCH.zMin + BENCH.zMax) / 2];
const STAND_CENTRE: Vec3 = [WAX_STAND.x, WAX_STAND.boardTop / 2, WAX_STAND.z];

/** The spans in the order of `YARD_SPAN_IDS` (src/viewer/yard-spans.ts), each with how it is built. The bench never hides for the camera: the tools rest on it. */
const SPAN_PLANS: readonly SpanPlan[] = [
  {
    id: 'wall-left',
    centre: [-WALL_X, WALL_HEIGHT / 2, WALL_CENTRE_Z],
    normal: [-1, 0, 0],
    cameraHides: true,
    build: (span, m) => {
      buildSideWall(span, -1, m.wall);
    },
  },
  {
    id: 'wall-right',
    centre: [WALL_X, WALL_HEIGHT / 2, WALL_CENTRE_Z],
    normal: [1, 0, 0],
    cameraHides: true,
    build: (span, m) => {
      buildSideWall(span, 1, m.wall);
    },
  },
  {
    id: 'wall-back',
    centre: [0, WALL_HEIGHT / 2, WALL_BACK_Z],
    normal: [0, 0, -1],
    cameraHides: true,
    build: (span, m) => {
      buildBackWall(span, m.wall);
    },
  },
  { id: 'scaffold-front', centre: [0, SCAFFOLD_CENTRE_Y, (FRONT_INNER_Z + FRONT_OUTER_Z) / 2], normal: [0, 0, 1], cameraHides: true, build: buildFrontScaffold },
  { id: 'head-bridge', centre: HEAD_BRIDGE_CENTRE, normal: [0, 0, 1], cameraHides: true, build: buildHeadBridge },
  {
    id: 'scaffold-left',
    centre: [-SIDE_SCAFFOLD_CENTRE_X, SCAFFOLD_CENTRE_Y, SIDE_SCAFFOLD_CENTRE_Z],
    normal: [-1, 0, 0],
    cameraHides: true,
    build: (span) => {
      buildSideScaffold(span, -1);
    },
  },
  {
    id: 'scaffold-right',
    centre: [SIDE_SCAFFOLD_CENTRE_X, SCAFFOLD_CENTRE_Y, SIDE_SCAFFOLD_CENTRE_Z],
    normal: [1, 0, 0],
    cameraHides: true,
    build: (span) => {
      buildSideScaffold(span, 1);
    },
  },
  { id: 'scaffold-back', centre: [0, SCAFFOLD_CENTRE_Y, BACK_SCAFFOLD_Z], normal: [0, 0, -1], cameraHides: true, build: buildBackScaffold },
  { id: 'bench', centre: BENCH_CENTRE, normal: outwardNormal(BENCH_CENTRE), cameraHides: false, build: buildBench },
  { id: 'model-stand', centre: STAND_CENTRE, normal: outwardNormal(STAND_CENTRE), cameraHides: true, build: buildWaxModel },
];

/** Every mesh and instance box of `group` in world space, bridges only when `laid` names them: the pieces whose inner faces decide when the span hides. */
function pieceBoxes(group: THREE.Group, laid: ReadonlySet<string>): Box[] {
  group.updateMatrixWorld(true);
  const boxes: Box[] = [];
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const bridge: unknown = object.userData['bridge'];
    if (typeof bridge === 'string' && !laid.has(bridge)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    geometry.computeBoundingBox();
    const local = geometry.boundingBox;
    if (local === null) return;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let i = 0; i < count; i += 1) {
      if (object instanceof THREE.InstancedMesh) object.getMatrixAt(i, matrix).premultiply(object.matrixWorld);
      else matrix.copy(object.matrixWorld);
      box.copy(local).applyMatrix4(matrix);
      boxes.push({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] });
    }
  });
  return boxes;
}

const BLOCK_BOX: Box = { min: [-BLOCK_M.width / 2, 0, -BLOCK_M.depth / 2], max: [BLOCK_M.width / 2, BLOCK_M.height, BLOCK_M.depth / 2] };

/** Builds the yard: the floor and one group per span, with the visibility rule ready to apply. */
export function buildYard(materials: YardMaterials = yardMaterials()): Yard {
  const group = new THREE.Group();
  group.name = 'yard';
  let laid: ReadonlySet<string> = new Set();
  const spans: LiveSpan[] = SPAN_PLANS.map((plan, index) => {
    const builder = new SpanBuilder(plan.id, materials, 1 + index * 37);
    plan.build(builder, materials);
    const built = builder.build();
    return { id: plan.id, centre: plan.centre, normal: plan.normal, faces: innerFaces(pieceBoxes(built, laid), BLOCK_BOX, plan.normal), cameraHides: plan.cameraHides, group: built };
  });
  group.add(buildFloor(materials.floor), ...spans.map((span) => span.group));
  const bridgeMeshes = spans.flatMap((span) => span.group.children.filter((child) => typeof child.userData['bridge'] === 'string').map((mesh) => ({ span, mesh, id: String(mesh.userData['bridge']) })));

  let enabled = true;
  let hidden: readonly YardSpanId[] = [];
  let camera: Vec3 | null = null;
  const apply = (force = false): void => {
    if (camera === null) return;
    const ids = hiddenSpans(spans, camera, enabled);
    if (!force && ids.length === hidden.length && ids.every((id, index) => id === hidden[index])) return;
    hidden = ids;
    for (const span of spans) span.group.visible = !ids.includes(span.id);
  };
  return {
    group,
    spans,
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      apply();
    },
    get hidden() {
      return hidden;
    },
    update(position) {
      camera = [position.x, position.y, position.z];
      apply();
    },
    get bridges() {
      return BRIDGES.map((bridge) => bridge.id).filter((id) => laid.has(id));
    },
    setBridges(ids) {
      const next = new Set(ids);
      if (next.size === laid.size && [...next].every((id) => laid.has(id))) return;
      laid = next;
      for (const { mesh, id } of bridgeMeshes) mesh.visible = laid.has(id);
      for (const span of new Set(bridgeMeshes.map((item) => item.span))) span.faces = innerFaces(pieceBoxes(span.group, laid), BLOCK_BOX, span.normal);
      apply(true);
    },
  };
}
