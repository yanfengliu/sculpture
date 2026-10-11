/**
 * The Opera del Duomo yard as docs/research/technique.md stage 0 infers it: a packed-earth floor; the `turata` of planks Vasari describes around the block, open at the front for the camera; a two-level timber scaffold with plank decks at 1.5 m and 3.2 m ringing the front and sides, standing half a metre clear of the stock; a plumb line from the top beam; a plank bench for the tools; the small wax model on a stand.
 * World frame per docs/design/spec.md: metres, +Y up, the figure faces +Z, the origin under the block's footprint centre. The block's size comes from src/david/frame.ts.
 *
 * The enclosure's planks are single-sided and face inward, so a camera outside the turata (the back, left and right presets) looks through its wall; from inside, the planks are the backdrop. They still cast shadows from either side.
 * Every texture is drawn on a canvas here: no runtime asset is fetched.
 */
import * as THREE from 'three';

import { BLOCK_M } from '../david/frame';
import { BENCH, LEATHER_PAD_REST } from '../tools/bench';
import { quatFromBasis } from '../tools/math';
import { propModel } from '../tools/props';

/** Deck heights above the floor, metres (technique.md, stage 0). */
export const DECK_LEVELS = [1.5, 3.2] as const;
/** Clearance between the scaffold's inner edge and the block's faces. */
const CLEARANCE = 0.5;
const DECK_WIDTH = 0.8;
const PLANK_W = 0.25;
const PLANK_T = 0.04;
const PLANK_GAP = 0.02;
const POST = 0.12;
const BEAM = 0.1;
const POST_HEIGHT = 6.0;
/** Above the block's top, so the beam crosses no preset's view of the head. */
const TOP_BEAM_Y = 5.85;
/** The turata: side walls at ±x, back wall at −z, open at +z. */
const WALL_X = 4.5;
const WALL_BACK_Z = -3.5;
const WALL_FRONT_Z = 4.5;
const WALL_HEIGHT = 4.0;
const WALL_PLANK_W = 0.26;
const FLOOR_SIZE = 60;

/** The bench top's plank thickness; its extent is `BENCH` from src/tools/bench.ts, where the tools' rest slots are laid out. */
const BENCH_THICKNESS = 0.05;
/** The plumb line (a prop of src/tools/props.ts, 1.58 m from bob tip to reel) hangs from the top deck's inner front ledger just right of the block's front face. */
export const PLUMB_LINE = { x: 0.95, z: BLOCK_M.depth / 2 + CLEARANCE, reel: 3.2 - PLANK_T - BEAM, height: 1.58 } as const;
/** Where the small wax model's stand (a post and a board) stands, beside the bench. */
const WAX_STAND = { x: -3.3, z: 0.3, boardTop: 1.03 } as const;

interface Timber {
  readonly size: readonly [number, number, number];
  readonly centre: readonly [number, number, number];
  readonly shade: number;
}

/** Collects boxes and builds them as one instanced mesh, so the whole scaffold is one draw call. */
class Timbers {
  private readonly items: Timber[] = [];
  constructor(private readonly material: THREE.Material, private readonly seed: number) {}

  add(size: readonly [number, number, number], centre: readonly [number, number, number]): void {
    this.items.push({ size, centre, shade: 0.85 + 0.3 * hash(this.seed + this.items.length) });
  }

  build(): THREE.InstancedMesh {
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
    return mesh;
  }
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Wood grain: streaks along the plank's length with a little noise. */
function woodTexture(base: readonly [number, number, number], seed: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('the wood texture needs a 2d canvas context, and the browser gave none');
  const [r, g, b] = base;
  context.fillStyle = `rgb(${String(r)},${String(g)},${String(b)})`;
  context.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    const streak = 0.5 + 0.5 * Math.sin(y * 0.35 + 4 * hash(seed + y));
    const dark = 0.75 + 0.25 * streak;
    context.fillStyle = `rgba(${String(Math.round(r * dark))},${String(Math.round(g * dark))},${String(Math.round(b * dark))},${String(0.35 + 0.3 * hash(seed + y * 7))})`;
    context.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 400; i += 1) {
    context.fillStyle = `rgba(40,25,10,${String(0.05 + 0.1 * hash(seed + i * 3))})`;
    context.fillRect(Math.floor(hash(seed + i) * size), Math.floor(hash(seed + i * 11) * size), 1 + Math.floor(hash(seed + i * 13) * 3), 6 + Math.floor(hash(seed + i * 17) * 30));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Packed earth: a mottled warm grey-brown with stones and a dusting of marble chips near the block. */
function earthTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('the earth texture needs a 2d canvas context, and the browser gave none');
  context.fillStyle = 'rgb(150,132,108)';
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i += 1) {
    const shade = 110 + Math.floor(hash(i * 5 + 1) * 70);
    context.fillStyle = `rgba(${String(shade)},${String(shade - 14)},${String(shade - 30)},${String(0.25 + 0.5 * hash(i * 7 + 2))})`;
    const radius = 2 + hash(i * 3 + 3) * 10;
    context.beginPath();
    context.arc(hash(i * 11 + 4) * size, hash(i * 13 + 5) * size, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (let i = 0; i < 700; i += 1) {
    const shade = 180 + Math.floor(hash(i * 17 + 6) * 60);
    context.fillStyle = `rgba(${String(shade)},${String(shade)},${String(shade - 6)},0.8)`;
    context.fillRect(hash(i * 19 + 7) * size, hash(i * 23 + 8) * size, 1 + hash(i * 29 + 9) * 2, 1 + hash(i * 31 + 10) * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_SIZE / 5, FLOOR_SIZE / 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildFloor(): THREE.Mesh {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  return floor;
}

/** Plank decks and their timbers on both levels, the posts, and the top beam across the front. */
function buildScaffold(timbers: Timbers, decks: Timbers): void {
  const halfW = BLOCK_M.width / 2;
  const halfD = BLOCK_M.depth / 2;
  const innerX = halfW + CLEARANCE;
  const outerX = innerX + DECK_WIDTH;
  const sideBackZ = -halfD - 0.4;
  const sideFrontZ = halfD + 0.2;
  const frontInnerZ = halfD + CLEARANCE;
  const frontOuterZ = frontInnerZ + DECK_WIDTH;
  const frontHalfX = halfW + 0.45;

  const postAt = (x: number, z: number): void => {
    timbers.add([POST, POST_HEIGHT, POST], [x, POST_HEIGHT / 2, z]);
  };
  for (const sign of [-1, 1]) {
    postAt(sign * outerX, sideBackZ);
    postAt(sign * outerX, sideFrontZ);
    postAt(sign * innerX, sideBackZ);
    postAt(sign * innerX, sideFrontZ);
    postAt(sign * frontHalfX, frontOuterZ);
    postAt(sign * frontHalfX, frontInnerZ);
  }
  // Top beam across the front, the plumb line's anchor.
  timbers.add([frontHalfX * 2 + POST, BEAM, BEAM], [0, TOP_BEAM_Y, frontInnerZ]);

  for (const level of DECK_LEVELS) {
    const beamY = level - PLANK_T - BEAM / 2;
    const sideLength = sideFrontZ - sideBackZ;
    for (const sign of [-1, 1]) {
      // Ledgers along the side decks and transoms across them.
      timbers.add([BEAM, BEAM, sideLength], [sign * outerX, beamY, (sideBackZ + sideFrontZ) / 2]);
      timbers.add([BEAM, BEAM, sideLength], [sign * innerX, beamY, (sideBackZ + sideFrontZ) / 2]);
      for (let z = sideBackZ; z <= sideFrontZ + 1e-6; z += 1.0) timbers.add([DECK_WIDTH + POST, BEAM, BEAM], [sign * (innerX + outerX) / 2, beamY, z]);
      // Side deck planks run across the deck width, laid along z.
      for (let z = sideBackZ + PLANK_W / 2; z <= sideFrontZ - PLANK_W / 2 + 1e-6; z += PLANK_W + PLANK_GAP) {
        decks.add([DECK_WIDTH, PLANK_T, PLANK_W], [sign * (innerX + outerX) / 2, level - PLANK_T / 2, z]);
      }
    }
    // Front deck: ledgers along x, planks laid along x running across z.
    timbers.add([frontHalfX * 2, BEAM, BEAM], [0, beamY, frontInnerZ]);
    timbers.add([frontHalfX * 2, BEAM, BEAM], [0, beamY, frontOuterZ]);
    for (let x = -frontHalfX; x <= frontHalfX + 1e-6; x += 1.0) timbers.add([BEAM, BEAM, DECK_WIDTH + POST], [x, beamY, (frontInnerZ + frontOuterZ) / 2]);
    for (let x = -frontHalfX + PLANK_W / 2; x <= frontHalfX - PLANK_W / 2 + 1e-6; x += PLANK_W + PLANK_GAP) {
      decks.add([PLANK_W, PLANK_T, DECK_WIDTH], [x, level - PLANK_T / 2, (frontInnerZ + frontOuterZ) / 2]);
    }
  }
}

/** The plumb line prop: origin at the bob's tip, the cord up +Y to the reel; the reel sits under the ledger. */
function buildPlumbLine(): THREE.Group {
  const line = propModel('plumb-line');
  line.position.set(PLUMB_LINE.x, PLUMB_LINE.reel - PLUMB_LINE.height, PLUMB_LINE.z);
  line.traverse((object) => {
    object.castShadow = true;
  });
  return line;
}

/** The props that rest in the yard: the leather pad with tripoli at its bench slot, the curved rasp beside the chisels, the carpenter's square leaning on the left wall. */
function buildProps(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'props';
  const pad = propModel('leather-pad');
  pad.position.set(...LEATHER_PAD_REST.position);
  pad.quaternion.set(...LEATHER_PAD_REST.quaternion);
  const rasp = propModel('curved-rasp');
  // Lying like the chisels: local +Y (the length) along world +X, tip toward the wall.
  rasp.quaternion.copy(quatFromBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  rasp.position.set(-2.37, BENCH.top + 0.006, 1.35);
  const square = propModel('square');
  // Standing on the floor, the foot along +z, leaning 12 degrees back against the left wall's planks.
  square.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.21).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)));
  square.position.set(-WALL_X + 0.15, 0, 1.9);
  group.add(pad, rasp, square);
  group.traverse((object) => {
    object.castShadow = true;
  });
  return group;
}

function buildBench(timbers: Timbers): void {
  const width = BENCH.xMax - BENCH.xMin;
  const depth = BENCH.zMax - BENCH.zMin;
  const cx = (BENCH.xMin + BENCH.xMax) / 2;
  const cz = (BENCH.zMin + BENCH.zMax) / 2;
  timbers.add([width, BENCH_THICKNESS, depth], [cx, BENCH.top - BENCH_THICKNESS / 2, cz]);
  const legHeight = BENCH.top - BENCH_THICKNESS;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      timbers.add([0.06, legHeight, 0.06], [cx + sx * (width / 2 - 0.06), legHeight / 2, cz + sz * (depth / 2 - 0.06)]);
    }
  }
  timbers.add([width - 0.16, 0.04, 0.04], [cx, 0.25, cz - depth / 2 + 0.06]);
  timbers.add([width - 0.16, 0.04, 0.04], [cx, 0.25, cz + depth / 2 - 0.06]);
}

/** The small wax model (technique.md, stage 1: about 45 cm; the prop of src/tools/props.ts) on a post-and-board stand beside the bench. */
function buildWaxModel(timbers: Timbers): THREE.Group {
  const { x, z, boardTop } = WAX_STAND;
  timbers.add([0.1, boardTop - 0.03, 0.1], [x, (boardTop - 0.03) / 2, z]);
  timbers.add([0.36, 0.03, 0.36], [x, boardTop - 0.015, z]);
  const model = propModel('wax-model');
  model.position.set(x, boardTop, z);
  model.traverse((object) => {
    object.castShadow = true;
  });
  return model;
}

/** The turata: vertical planks facing inward on three sides, nailed to posts and two rails. */
function buildTurata(posts: Timbers): THREE.InstancedMesh {
  const material = new THREE.MeshStandardMaterial({ map: woodTexture([150, 128, 98], 7), roughness: 0.9, metalness: 0, side: THREE.FrontSide });
  material.shadowSide = THREE.DoubleSide;
  const walls: { readonly x: number; readonly z: number; readonly rotation: number }[] = [];
  for (let z = WALL_BACK_Z + WALL_PLANK_W / 2; z < WALL_FRONT_Z; z += WALL_PLANK_W + PLANK_GAP) {
    walls.push({ x: WALL_X, z, rotation: -Math.PI / 2 });
    walls.push({ x: -WALL_X, z, rotation: Math.PI / 2 });
  }
  for (let x = -WALL_X + WALL_PLANK_W / 2; x < WALL_X; x += WALL_PLANK_W + PLANK_GAP) walls.push({ x, z: WALL_BACK_Z, rotation: 0 });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(WALL_PLANK_W, WALL_HEIGHT), material, walls.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const colour = new THREE.Color();
  walls.forEach(({ x, z, rotation }, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    matrix.compose(new THREE.Vector3(x, WALL_HEIGHT / 2, z), quaternion, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, colour.setScalar(0.8 + 0.3 * hash(index * 3 + 101)));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'turata';
  // Side-wall posts off the block's centre line (z = 0), so the left and right presets look at the figure between them.
  for (const z of [WALL_BACK_Z, -1.5, 2.5, WALL_FRONT_Z]) {
    posts.add([POST, WALL_HEIGHT + 0.3, POST], [WALL_X + POST / 2, (WALL_HEIGHT + 0.3) / 2, z]);
    posts.add([POST, WALL_HEIGHT + 0.3, POST], [-WALL_X - POST / 2, (WALL_HEIGHT + 0.3) / 2, z]);
  }
  // Back-wall posts off the centre line, so the back preset looks at the figure between them.
  for (const x of [-WALL_X / 2, WALL_X / 2]) posts.add([POST, WALL_HEIGHT + 0.3, POST], [x, (WALL_HEIGHT + 0.3) / 2, WALL_BACK_Z - POST / 2]);
  for (const y of [1.0, 3.0]) {
    posts.add([POST / 2, BEAM, WALL_FRONT_Z - WALL_BACK_Z], [WALL_X + POST / 4, y, (WALL_BACK_Z + WALL_FRONT_Z) / 2]);
    posts.add([POST / 2, BEAM, WALL_FRONT_Z - WALL_BACK_Z], [-WALL_X - POST / 4, y, (WALL_BACK_Z + WALL_FRONT_Z) / 2]);
    posts.add([WALL_X * 2 + POST, BEAM, POST / 2], [0, y, WALL_BACK_Z - POST / 4]);
  }
  return mesh;
}

/** Everything in the yard but the stock, the tools and the chips. */
export function buildYard(): THREE.Group {
  const yard = new THREE.Group();
  yard.name = 'yard';
  const timberMaterial = new THREE.MeshStandardMaterial({ map: woodTexture([156, 122, 82], 3), roughness: 0.85, metalness: 0 });
  const deckMaterial = new THREE.MeshStandardMaterial({ map: woodTexture([172, 142, 100], 5), roughness: 0.9, metalness: 0 });
  const timbers = new Timbers(timberMaterial, 1);
  const decks = new Timbers(deckMaterial, 2);
  buildScaffold(timbers, decks);
  buildBench(timbers);
  const waxModel = buildWaxModel(timbers);
  const turata = buildTurata(timbers);
  const timberMesh = timbers.build();
  timberMesh.name = 'timbers';
  const deckMesh = decks.build();
  deckMesh.name = 'decks';
  yard.add(buildFloor(), timberMesh, deckMesh, turata, buildPlumbLine(), waxModel, buildProps());
  return yard;
}
