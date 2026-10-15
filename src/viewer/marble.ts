/**
 * The marble (docs/research/engine-options.md, section 6, Marble; docs/research/technique.md, What is known of the David's surfaces).
 *
 * One MeshPhysicalMaterial: sheen for the soft grazing highlight, a little transmission as the cheap subsurface approximation, ior 1.55 for calcite, flat shading so the engine's chunks need no normals.
 * `onBeforeCompile` injects the stone of src/viewer/marble-glsl.ts (domain-warped veins, taroli and the crystal grain, evaluated at the fragment's world position, so every cut reveals the interior consistently) into `color_fragment`, and reads the per-vertex `finish` attribute (Uint8, the codes of `FINISH` in src/contracts/grid.ts) to pick the colour, roughness, metalness and a procedural mark normal pattern of the last tool that touched the surface there. The code reaches the fragment as a `flat` varying, one code per triangle, so no fragment shows a tool between its vertices' codes.
 * The flat variant (`?finish=1`) paints each code as one flat colour from `FINISH_FLAT_COLOURS` for checking the finish grid by eye.
 * First visit: the full stone's program takes seconds to compile, so the material starts on a light first program (the finish codes on the stone's mean colour) and `prepare` switches it to the full stone once a twin's program has compiled in the background (docs/design/spec.md, Budgets).
 */
import * as THREE from 'three';

import type { FinishCode } from '../contracts/grid';
import { FINISH } from '../contracts/grid';
import { COLOUR_CHUNK, COLOUR_CHUNK_LITE, NORMAL_CHUNK, fragmentFunctions } from './marble-glsl';

/** Name of the per-vertex attribute the engine's chunk geometries carry: one unsigned byte per vertex, a code of `FINISH`, not normalised. */
export const FINISH_ATTRIBUTE = 'finish';

/** Flat colours per finish code for `?finish=1`, as 0 to 1 RGB. Distinct by hue in code order, so a legend reads as a sequence. */
export const FINISH_FLAT_COLOURS: Readonly<Record<FinishCode, readonly [number, number, number]>> = {
  [FINISH.block]: [0.45, 0.45, 0.45],
  [FINISH.drawn]: [0.15, 0.15, 0.15],
  [FINISH.point]: [0.85, 0.15, 0.15],
  [FINISH.twoTooth]: [0.95, 0.5, 0.1],
  [FINISH.claw]: [0.95, 0.85, 0.1],
  [FINISH.fineClaw]: [0.6, 0.85, 0.15],
  [FINISH.roundel]: [0.1, 0.65, 0.25],
  [FINISH.flat]: [0.1, 0.65, 0.65],
  [FINISH.drill]: [0.15, 0.8, 0.95],
  [FINISH.rasp]: [0.15, 0.4, 0.95],
  [FINISH.file]: [0.35, 0.2, 0.85],
  [FINISH.pumice]: [0.6, 0.3, 0.85],
  [FINISH.polish]: [0.9, 0.35, 0.75],
  [FINISH.gilt]: [1.0, 0.8, 0.2],
};

/** Human names per code, for the legend the finish toggle shows. */
export const FINISH_NAMES: Readonly<Record<FinishCode, string>> = {
  [FINISH.block]: 'block face',
  [FINISH.drawn]: 'drawn',
  [FINISH.point]: 'point',
  [FINISH.twoTooth]: 'two-tooth',
  [FINISH.claw]: 'claw',
  [FINISH.fineClaw]: 'fine claw',
  [FINISH.roundel]: 'roundel',
  [FINISH.flat]: 'flat',
  [FINISH.drill]: 'drill',
  [FINISH.rasp]: 'rasp',
  [FINISH.file]: 'file',
  [FINISH.pumice]: 'pumice',
  [FINISH.polish]: 'polish',
  [FINISH.gilt]: 'gilt',
};

export const FINISH_CODE_COUNT = Object.keys(FINISH).length;

export interface MarbleOptions {
  /** Start with flat finish-code colours instead of marble (`?finish=1`). */
  readonly flat: boolean;
}

export interface Marble {
  readonly material: THREE.MeshPhysicalMaterial;
  readonly flat: boolean;
  /** True once the material draws the full stone; until `prepare` has switched it, it draws the light first program (finish colours on the stone's mean, no noise). */
  readonly full: boolean;
  /** Switches between the marble and the flat finish-code colours; a uniform, so no recompile. */
  setFlat(flat: boolean): void;
  /**
   * Compiles the full stone's program off the page's thread for a mesh like the stock's under `scene`'s lights (three.js `compileAsync`, in the background where the browser has `KHR_parallel_shader_compile`), then switches the material to it, so the switch finds the program compiled and the page never waits for it. Resolves once switched.
   * The compile is a twin material's, the same in every program parameter, so three.js hands the material the twin's program by its cache key.
   */
  prepare(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void>;
}

/** `vFinish` is `flat`: a finish code is a category, so a triangle whose vertices carry different codes takes its provoking vertex's code everywhere, never a blend that rounds to tools that touched neither vertex (the defect of 2026-10-11, pinned in marble.test.ts). */
const DECLARATIONS = `
flat varying float vFinish;
varying vec3 vWorldPos;
`;

const VERTEX_DECLARATIONS = `attribute float ${FINISH_ATTRIBUTE};${DECLARATIONS}`;

const VERTEX_ASSIGN = `
#include <worldpos_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vFinish = ${FINISH_ATTRIBUTE};
`;

/** Flat codes read as the legend's colours whatever the light: most of the colour comes out as emission. */
const EMISSIVE = `
#include <emissivemap_fragment>
if (flatCodes > 0.5) totalEmissiveRadiance += finishColours[marbleCode(vFinish)] * 0.8;
`;
const ROUGHNESS = `float roughnessFactor = flatCodes > 0.5 ? 0.9 : marbleRoughness(vFinish);`;
const METALNESS = `float metalnessFactor = flatCodes > 0.5 ? 0.0 : marbleMetalness(vFinish);`;

/** The uniforms every marble program reads; shared by the material and its twin. */
interface StoneUniforms {
  readonly colours: readonly THREE.Color[];
  readonly flatCodes: { value: number };
  /** Always 1: scales the fbm's loop bound so the compiler keeps the loop (src/viewer/marble-glsl.ts). */
  readonly loop: { value: number };
}

/** The physical material with the stone injected: the full stone while `full()` is true, else the light first program; the cache key tells the two apart. */
function stoneMaterial(uniforms: StoneUniforms, full: () => boolean): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0,
    flatShading: true,
    sheen: 0.3,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xfff6ea),
    ior: 1.55,
    specularIntensity: 1,
    transmission: 0.08,
    thickness: 0.1,
    attenuationColor: new THREE.Color(0xf6e9d2),
    attenuationDistance: 0.25,
  });
  material.onBeforeCompile = (shader) => {
    const stone = full();
    shader.uniforms['finishColours'] = { value: uniforms.colours };
    shader.uniforms['flatCodes'] = uniforms.flatCodes;
    if (stone) shader.uniforms['marbleLoop'] = uniforms.loop;
    shader.vertexShader = VERTEX_DECLARATIONS + shader.vertexShader.replace('#include <worldpos_vertex>', VERTEX_ASSIGN);
    const fragment = shader.fragmentShader
      .replace('#include <color_fragment>', stone ? COLOUR_CHUNK : COLOUR_CHUNK_LITE)
      .replace('#include <emissivemap_fragment>', EMISSIVE)
      .replace('#include <roughnessmap_fragment>', ROUGHNESS)
      .replace('#include <metalnessmap_fragment>', METALNESS);
    shader.fragmentShader = DECLARATIONS + fragmentFunctions(FINISH_CODE_COUNT, stone) + (stone ? fragment.replace('#include <normal_fragment_maps>', NORMAL_CHUNK) : fragment);
  };
  material.customProgramCacheKey = () => (full() ? 'marble' : 'marble-lite');
  return material;
}

/** A triangle with the stock chunks' attributes (a position, a finish code, no normal; src/stock/remesh.ts), so a program compiled for it is the one the chunks draw with. */
function standInGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute(FINISH_ATTRIBUTE, finishAttribute(3, FINISH.block));
  return geometry;
}

export function createMarbleMaterial(options: MarbleOptions): Marble {
  const uniforms: StoneUniforms = {
    colours: Object.entries(FINISH_FLAT_COLOURS)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, rgb]) => new THREE.Color(...rgb)),
    flatCodes: { value: options.flat ? 1 : 0 },
    loop: { value: 1 },
  };
  let full = false;
  const material = stoneMaterial(uniforms, () => full);
  let preparing: Promise<void> | null = null;
  return {
    material,
    get flat() {
      return uniforms.flatCodes.value > 0.5;
    },
    get full() {
      return full;
    },
    setFlat(flat) {
      uniforms.flatCodes.value = flat ? 1 : 0;
    },
    prepare(renderer, scene, camera) {
      preparing ??= (async () => {
        // The stand-ins cast and take shadows as the chunks do; the light program compiles alongside, for the frame that first draws the stock. The twin is kept, not disposed, so its program stays in three.js's cache for the switch.
        const standIn = (stone: THREE.Material): THREE.Mesh => Object.assign(new THREE.Mesh(standInGeometry(), stone), { castShadow: true, receiveShadow: true });
        await Promise.all([renderer.compileAsync(standIn(material), camera, scene), renderer.compileAsync(standIn(stoneMaterial(uniforms, () => true)), camera, scene)]);
        full = true;
        material.needsUpdate = true;
      })();
      return preparing;
    },
  };
}

/** A `finish` attribute for `vertexCount` vertices, every vertex at `code`. */
export function finishAttribute(vertexCount: number, code: FinishCode): THREE.BufferAttribute {
  return new THREE.Uint8BufferAttribute(new Uint8Array(vertexCount).fill(code), 1, false);
}
