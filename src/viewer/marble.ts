/**
 * The marble (docs/research/engine-options.md, section 6, Marble; docs/research/technique.md, What is known of the David's surfaces).
 *
 * One MeshPhysicalMaterial: sheen for the soft grazing highlight, a little transmission as the cheap subsurface approximation, ior 1.55 for calcite, flat shading so the engine's chunks need no normals.
 * `onBeforeCompile` injects a 3D vein function (sine plus turbulence, evaluated at the fragment's world position, so every cut reveals the interior consistently) into `color_fragment`, and reads the per-vertex `finish` attribute (Uint8, the codes of `FINISH` in src/contracts/grid.ts) to pick the colour, roughness, metalness and a procedural stroke-mark normal pattern of the last tool that touched the surface there.
 * The flat variant (`?finish=1`) paints each code as one flat colour from `FINISH_FLAT_COLOURS` for checking the finish grid by eye.
 */
import * as THREE from 'three';

import type { FinishCode } from '../contracts/grid';
import { FINISH } from '../contracts/grid';

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
  /** Switches between the marble and the flat finish-code colours; a uniform, so no recompile. */
  setFlat(flat: boolean): void;
}

const DECLARATIONS = `
varying float vFinish;
varying vec3 vWorldPos;
`;

const VERTEX_DECLARATIONS = `attribute float ${FINISH_ATTRIBUTE};${DECLARATIONS}`;

const VERTEX_ASSIGN = `
#include <worldpos_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vFinish = ${FINISH_ATTRIBUTE};
`;

/** Value noise, fbm, the vein function and the per-code looks. World metres in; the frequencies are the mark pitches the tool notes give. */
const FRAGMENT_FUNCTIONS = `
uniform vec3 finishColours[${String(FINISH_CODE_COUNT)}];
uniform float flatCodes;

float marbleHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float marbleNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x00 = mix(marbleHash(i), marbleHash(i + vec3(1.0, 0.0, 0.0)), f.x);
  float x10 = mix(marbleHash(i + vec3(0.0, 1.0, 0.0)), marbleHash(i + vec3(1.0, 1.0, 0.0)), f.x);
  float x01 = mix(marbleHash(i + vec3(0.0, 0.0, 1.0)), marbleHash(i + vec3(1.0, 0.0, 1.0)), f.x);
  float x11 = mix(marbleHash(i + vec3(0.0, 1.0, 1.0)), marbleHash(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}
float marbleFbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    sum += amplitude * marbleNoise(p);
    p = p * 2.03 + 17.1;
    amplitude *= 0.5;
  }
  return sum;
}
/** 1 on a vein, 0 off it: the sine-plus-turbulence marble of Perlin 1985 along direction dir. */
float marbleVein(vec3 p, vec3 dir, float k, float width, float warp) {
  return 1.0 - smoothstep(0.0, width, abs(sin(k * dot(p, dir) + warp * marbleFbm(p * 1.7))));
}
int marbleCode(float finish) { return int(finish + 0.5); }

vec3 marbleColour(vec3 p, float finish) {
  int code = marbleCode(finish);
  // Warm white Carrara with grey-blue veins: a coarse set about every half metre and a fine feathery set.
  vec3 stone = vec3(0.93, 0.91, 0.87);
  vec3 veinColour = vec3(0.42, 0.46, 0.52);
  float coarse = marbleVein(p, normalize(vec3(0.3, 1.0, 0.45)), 12.0, 0.22, 3.0);
  float fine = marbleVein(p, normalize(vec3(1.0, 0.35, -0.2)), 40.0, 0.10, 2.0);
  float grain = marbleNoise(p * 90.0) * 0.06 - 0.03;
  float vein = clamp(0.75 * coarse + 0.4 * fine, 0.0, 1.0);
  vec3 marble = mix(stone, veinColour, vein) + grain;
  if (code == ${String(FINISH.block)}) return mix(vec3(0.60, 0.56, 0.47), marble, 0.35) + grain * 2.0;
  if (code == ${String(FINISH.drawn)}) return mix(vec3(0.42, 0.40, 0.38), marble, 0.3);
  if (code == ${String(FINISH.point)}) return mix(marble, vec3(0.97, 0.96, 0.94), 0.65);
  if (code == ${String(FINISH.twoTooth)} || code == ${String(FINISH.claw)}) return mix(marble, vec3(0.96, 0.95, 0.92), 0.45);
  if (code == ${String(FINISH.fineClaw)} || code == ${String(FINISH.roundel)} || code == ${String(FINISH.flat)}) return mix(marble, vec3(0.95, 0.94, 0.91), 0.3);
  if (code == ${String(FINISH.drill)}) return mix(marble, vec3(0.90, 0.89, 0.86), 0.4);
  if (code == ${String(FINISH.rasp)} || code == ${String(FINISH.file)}) return mix(marble, vec3(0.93, 0.92, 0.89), 0.25);
  if (code == ${String(FINISH.pumice)}) return mix(marble, vec3(0.94, 0.93, 0.90), 0.15);
  if (code == ${String(FINISH.gilt)}) return vec3(1.0, 0.78, 0.35);
  return marble;
}
float marbleRoughness(float finish) {
  int code = marbleCode(finish);
  if (code == ${String(FINISH.block)} || code == ${String(FINISH.drawn)}) return 0.95;
  if (code == ${String(FINISH.point)}) return 0.85;
  if (code == ${String(FINISH.twoTooth)}) return 0.80;
  if (code == ${String(FINISH.claw)}) return 0.78;
  if (code == ${String(FINISH.fineClaw)}) return 0.75;
  if (code == ${String(FINISH.roundel)}) return 0.72;
  if (code == ${String(FINISH.flat)}) return 0.70;
  if (code == ${String(FINISH.drill)}) return 0.75;
  if (code == ${String(FINISH.rasp)}) return 0.65;
  if (code == ${String(FINISH.file)}) return 0.55;
  if (code == ${String(FINISH.pumice)}) return 0.60;
  if (code == ${String(FINISH.polish)}) return 0.28;
  if (code == ${String(FINISH.gilt)}) return 0.35;
  return 0.6;
}
float marbleMetalness(float finish) {
  return marbleCode(finish) == ${String(FINISH.gilt)} ? 1.0 : 0.0;
}
/** Parallel bands of pitch metres along u, tilting the normal along t. */
vec3 marbleBands(float u, vec3 t, float pitch, float amplitude) {
  return t * (amplitude * cos(6.2831853 * u / pitch));
}
/** The stroke marks of the tool as a world-space normal perturbation; n is the world normal. */
vec3 marbleMark(vec3 p, float finish, vec3 n) {
  int code = marbleCode(finish);
  vec3 mark = vec3(0.0);
  // Tangent frame on the dominant plane of the face.
  vec3 a = abs(n);
  vec3 up = a.y > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(up, n));
  vec3 t2 = cross(n, t1);
  vec2 uv = vec2(dot(p, t1), dot(p, t2));
  // Diagonal stroke direction, as a claw works across the form.
  vec2 d1 = normalize(vec2(0.8, 0.6));
  vec2 d2 = normalize(vec2(-0.6, 0.8));
  vec3 s1 = t1 * d1.x + t2 * d1.y;
  vec3 s2 = t1 * d2.x + t2 * d2.y;
  float u1 = dot(uv, d1);
  float u2 = dot(uv, d2);
  if (code == ${String(FINISH.block)} || code == ${String(FINISH.drawn)}) {
    mark = (vec3(marbleNoise(p * 160.0), marbleNoise(p * 160.0 + 5.0), marbleNoise(p * 160.0 + 9.0)) - 0.5) * 0.35;
  } else if (code == ${String(FINISH.point)}) {
    vec3 cell = floor(p / 0.03);
    mark = (vec3(marbleHash(cell), marbleHash(cell + 1.0), marbleHash(cell + 2.0)) - 0.5) * 0.7;
  } else if (code == ${String(FINISH.twoTooth)}) {
    mark = marbleBands(u1, s1, 0.012, 0.45);
  } else if (code == ${String(FINISH.claw)}) {
    mark = marbleBands(u1, s1, 0.006, 0.35);
  } else if (code == ${String(FINISH.fineClaw)}) {
    mark = marbleBands(u2, s2, 0.003, 0.25);
  } else if (code == ${String(FINISH.roundel)}) {
    mark = marbleBands(u1, s1, 0.02, 0.2) + marbleBands(u2, s2, 0.02, 0.2);
  } else if (code == ${String(FINISH.flat)}) {
    mark = marbleBands(u1, s1, 0.015, 0.08);
  } else if (code == ${String(FINISH.drill)}) {
    vec2 cell = fract(uv / 0.008) - 0.5;
    float pit = smoothstep(0.42, 0.2, length(cell));
    mark = (t1 * cell.x + t2 * cell.y) * pit * 1.2;
  } else if (code == ${String(FINISH.rasp)}) {
    mark = marbleBands(u1, s1, 0.002, 0.18) + marbleBands(u2, s2, 0.0024, 0.18);
  } else if (code == ${String(FINISH.file)}) {
    mark = marbleBands(u1, s1, 0.001, 0.08) + marbleBands(u2, s2, 0.0012, 0.08);
  }
  return mark;
}
`;

const COLOUR = `diffuseColor.rgb = flatCodes > 0.5 ? finishColours[marbleCode(vFinish)] * 0.35 : marbleColour(vWorldPos, vFinish);`;
/** Flat codes read as the legend's colours whatever the light: most of the colour comes out as emission. */
const EMISSIVE = `
#include <emissivemap_fragment>
if (flatCodes > 0.5) totalEmissiveRadiance += finishColours[marbleCode(vFinish)] * 0.8;
`;
const ROUGHNESS = `float roughnessFactor = flatCodes > 0.5 ? 0.9 : marbleRoughness(vFinish);`;
const METALNESS = `float metalnessFactor = flatCodes > 0.5 ? 0.0 : marbleMetalness(vFinish);`;
/** `normal` is in view space here; the mark is built in world space and brought across with the view matrix. */
const NORMAL = `
#include <normal_fragment_maps>
if (flatCodes < 0.5) {
  vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
  vec3 mark = marbleMark(vWorldPos, vFinish, worldNormal);
  normal = normalize(normal + mat3(viewMatrix) * mark);
}
`;

export function createMarbleMaterial(options: MarbleOptions): Marble {
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
  const colours = Object.entries(FINISH_FLAT_COLOURS)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, rgb]) => new THREE.Color(...rgb));
  const flatCodes = { value: options.flat ? 1 : 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['finishColours'] = { value: colours };
    shader.uniforms['flatCodes'] = flatCodes;
    shader.vertexShader = VERTEX_DECLARATIONS + shader.vertexShader.replace('#include <worldpos_vertex>', VERTEX_ASSIGN);
    shader.fragmentShader =
      DECLARATIONS +
      FRAGMENT_FUNCTIONS +
      shader.fragmentShader
        .replace('#include <color_fragment>', COLOUR)
        .replace('#include <emissivemap_fragment>', EMISSIVE)
        .replace('#include <roughnessmap_fragment>', ROUGHNESS)
        .replace('#include <metalnessmap_fragment>', METALNESS)
        .replace('#include <normal_fragment_maps>', NORMAL);
  };
  material.customProgramCacheKey = () => 'marble';
  return {
    material,
    get flat() {
      return flatCodes.value > 0.5;
    },
    setFlat(flat) {
      flatCodes.value = flat ? 1 : 0;
    },
  };
}

/** A `finish` attribute for `vertexCount` vertices, every vertex at `code`. */
export function finishAttribute(vertexCount: number, code: FinishCode): THREE.BufferAttribute {
  return new THREE.Uint8BufferAttribute(new Uint8Array(vertexCount).fill(code), 1, false);
}
