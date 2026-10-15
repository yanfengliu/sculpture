/**
 * The yard's materials (src/viewer/yard.ts builds the yard with them): wood grain for the timbers, decks and the turata's planks and packed earth for the floor, every texture drawn on a canvas here, so no runtime asset is fetched.
 * Kept apart from the yard's geometry so a unit test can build the yard in Node, which has no canvas, by passing plain materials.
 */
import * as THREE from 'three';

/** The yard floor's side, metres: the earth texture repeats every 5 m across it. */
export const FLOOR_SIZE = 60;

/** A repeatable pseudo-random number in [0, 1) for `n`. */
export function hash(n: number): number {
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

/** The yard's materials: `yardMaterials()` draws their textures on canvases for the page; a unit test passes plain ones, since Node has no canvas. */
export interface YardMaterials {
  readonly timber: THREE.Material;
  readonly deck: THREE.Material;
  readonly wall: THREE.Material;
  readonly floor: THREE.Material;
}

/** The page's materials, with wood grain and packed earth drawn on canvases. */
export function yardMaterials(): YardMaterials {
  const wall = new THREE.MeshStandardMaterial({ map: woodTexture([150, 128, 98], 7), roughness: 0.9, metalness: 0, side: THREE.FrontSide });
  wall.shadowSide = THREE.DoubleSide;
  return {
    timber: new THREE.MeshStandardMaterial({ map: woodTexture([156, 122, 82], 3), roughness: 0.85, metalness: 0 }),
    deck: new THREE.MeshStandardMaterial({ map: woodTexture([172, 142, 100], 5), roughness: 0.9, metalness: 0 }),
    wall,
    floor: new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 1, metalness: 0 }),
  };
}
