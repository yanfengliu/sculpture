/**
 * The marble shader's GLSL (src/viewer/marble.ts injects it): noise, the stone, the finish codes' colours and marks. World metres in, so every cut reveals the same interior.
 *
 * The stone is Carrara "bianco ordinario" (docs/research/david-history.md, The marble; technique.md, How marble behaves): a warm white mosaic of calcite crystals with sparse fine grey veins and taroli, pores under a millimetre with halos a few millimetres wide.
 * - Veins: the zero lines of a domain-warped gradient fbm, so their course and spacing wander in every direction; a low-frequency mask keeps them to some patches, and the contrast is low. Never a sine of a plane: that drew the regular wavy bands and the evenly spaced fine lines of the 2026-10-14 captures.
 * - Taroli: one pore in some of the cells of a jittered 2 cm lattice, a dark core in a faint grey halo.
 * - Crystals: a cellular grain of 1.5 mm, each grain a little brighter or darker with its facet tilted, which the sun picks out as a faint sparkle.
 * Every feature is faded by the pixel footprint (`px`, metres per pixel), so a feature under a pixel or two fades to its mean instead of aliasing into regular lines or a shimmer.
 * The marks: the point leaves irregular pits 1 to 3 cm across with whiter bottoms (technique.md: the furrow bottoms stay whiter from the crushed crystals), the drill smaller pits, the toothed and flat chisels, rasps and files parallel bands whose phase runs along fixed world directions in each axis plane, blended by the normal, so neighbouring flat-shaded triangles agree.
 * Compile cost: the fbm's loop runs to a bound scaled by the uniform `marbleLoop` (always 1), so the compiler keeps it a loop. Unrolled into its seven call sites, Direct3D's shader compiler (Chrome on Windows) took 8 to 12 s over this program on 2026-10-14 and the page waited for it; as a loop it takes about 2 s.
 * The light first program (`fragmentFunctions(n, false)`, `COLOUR_CHUNK_LITE`) has the finish codes' colours and roughness on the stone's mean colour and no noise: the page draws it while the full stone compiles (src/viewer/marble.ts).
 */
import { FINISH } from '../contracts/grid';

const code = (name: keyof typeof FINISH): string => String(FINISH[name]);

/** Hashes (Dave Hoskins, "Hash without Sine", MIT), gradient noise with a quintic fade, fbm with a rotation between octaves so no lattice axis shows, and a jittered cellular lattice. */
const NOISE = `
float marbleHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 marbleHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float marbleCorner(vec3 i, vec3 f, vec3 o) {
  return dot(marbleHash3(i + o) * 2.0 - 1.0, f - o);
}
float marbleGradient(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = marbleCorner(i, f, vec3(0.0, 0.0, 0.0));
  float b = marbleCorner(i, f, vec3(1.0, 0.0, 0.0));
  float c = marbleCorner(i, f, vec3(0.0, 1.0, 0.0));
  float d = marbleCorner(i, f, vec3(1.0, 1.0, 0.0));
  float e = marbleCorner(i, f, vec3(0.0, 0.0, 1.0));
  float g = marbleCorner(i, f, vec3(1.0, 0.0, 1.0));
  float h = marbleCorner(i, f, vec3(0.0, 1.0, 1.0));
  float k = marbleCorner(i, f, vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
const mat3 MARBLE_TURN = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float marbleFbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  // octaves * marbleLoop is the same count, but one the compiler cannot see, so the loop stays a loop (see fragmentFunctions).
  for (int octave = 0; octave < octaves * marbleLoop; octave++) {
    sum += amplitude * marbleGradient(p);
    p = MARBLE_TURN * p * 2.03 + 0.17;
    amplitude *= 0.5;
  }
  return sum;
}
/** The nearest feature of a jittered lattice of \`cell\` metres that holds a feature in a share \`occupancy\` of its cells: xyz is p minus the feature, w the feature's own hash in [0, 1); w is -1 when no cell within one holds one. */
vec4 marbleCell(vec3 p, float cell, float occupancy) {
  vec3 g = p / cell;
  vec3 i = floor(g);
  vec3 f = g - i;
  float best = 1e9;
  vec4 nearest = vec4(1.0, 1.0, 1.0, -1.0);
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        float own = marbleHash(i + o + 57.0);
        if (own >= occupancy) continue;
        vec3 offset = (f - o - marbleHash3(i + o)) * cell;
        float d = dot(offset, offset);
        if (d < best) {
          best = d;
          nearest = vec4(offset, own / occupancy);
        }
      }
    }
  }
  return nearest;
}
/** Coverage of a line of half-width \`width\` along the zero set of \`field\`: antialiased over a pixel, and faded to its mean coverage where it is thinner than one. */
float marbleLine(float field, float width) {
  float aa = max(fwidth(field), 1e-6);
  return (1.0 - smoothstep(width - aa, width + aa, abs(field))) * min(1.0, width / aa);
}
`;

const STONE = `
vec3 marbleStone(vec3 p, float px) {
  vec3 stone = vec3(0.925, 0.912, 0.878);
  vec3 q = p * 0.9;
  vec3 warp = vec3(marbleFbm(q, 3), marbleFbm(q + vec3(5.2, 1.3, 2.8), 3), marbleFbm(q + vec3(1.7, 9.2, 3.1), 3));
  vec3 flow = q * 1.6 + warp * 2.4;
  // Broad grey clouding of several per cent, from the warp itself.
  stone = mix(stone, vec3(0.79, 0.795, 0.79), 0.4 * smoothstep(-0.2, 0.3, warp.y + 0.6 * warp.z));
  // A vein is a soft grey seam a centimetre or two wide around a fine darker core; its width wanders with the warp.
  float majorField = marbleFbm(flow, 4);
  float minorField = marbleFbm(flow * 2.7 + vec3(3.3, 8.1, 1.4), 3);
  float major = 0.2 * (1.0 - smoothstep(0.0, 0.03 * (0.5 + 1.5 * abs(warp.x)), abs(majorField))) + 0.3 * marbleLine(majorField, 0.005);
  float minor = 0.12 * (1.0 - smoothstep(0.0, 0.014, abs(minorField))) + 0.14 * marbleLine(minorField, 0.003);
  float majorMask = smoothstep(-0.1, 0.12, marbleFbm(p * 0.45 + vec3(11.0, 3.0, 7.0), 2));
  float minorMask = smoothstep(-0.12, 0.08, marbleFbm(p * 0.8 + vec3(2.0, 17.0, 5.0), 2));
  stone = mix(stone, vec3(0.6, 0.625, 0.65), major * majorMask + minor * minorMask);
  // Taroli: a dark core of 0.3 to 0.6 mm in a faint grey halo of 1.5 to 3.5 mm.
  vec4 pore = marbleCell(p, 0.02, 0.45);
  if (pore.w >= 0.0) {
    float d = length(pore.xyz);
    float core = mix(0.0003, 0.0006, pore.w);
    float halo = mix(0.0015, 0.0035, pore.w);
    float coreCover = (1.0 - smoothstep(core - px, core + px, d)) * min(1.0, core / px);
    float haloCover = (1.0 - smoothstep(core, halo, d)) * min(1.0, halo / px);
    stone = mix(stone, vec3(0.80, 0.79, 0.75), 0.18 * haloCover);
    stone = mix(stone, vec3(0.48, 0.47, 0.45), 0.7 * coreCover);
  }
  return stone;
}
/** The crystal grain under p, faded out once a grain spans under two pixels: xyz a facet tilt, w a brightness offset, both zero when faded. */
vec4 marbleCrystal(vec3 p, float px) {
  float fade = 1.0 - smoothstep(0.0005, 0.001, px);
  if (fade <= 0.0) return vec4(0.0);
  vec4 grain = marbleCell(p, 0.0015, 1.0);
  float h = grain.w;
  return vec4(vec3(fract(h * 13.7), fract(h * 71.3), fract(h * 191.9)) * 2.0 - 1.0, h - 0.5) * fade;
}
/** The pit under p for the point and the drill: xyz the offset from the pit's centre in pit radii, stretched along the pit's own direction so a blow struck at a slant leaves a gouge; w its depth there (0 outside); zero for other codes. Not every cell holds a pit, the depths differ and the rims are ragged. */
vec4 marblePit(vec3 p, int code) {
  float cell = code == ${code('point')} ? 0.02 : code == ${code('drill')} ? 0.007 : 0.0;
  if (cell == 0.0) return vec4(0.0);
  vec4 c = marbleCell(p, cell, 0.8);
  if (c.w < 0.0) return vec4(0.0);
  float radius = code == ${code('point')} ? mix(0.006, 0.014, c.w) : mix(0.0015, 0.003, c.w);
  vec3 along = normalize(vec3(fract(c.w * 37.1), fract(c.w * 91.7), fract(c.w * 53.3)) - 0.5);
  vec3 offset = c.xyz + along * dot(c.xyz, along) * -0.45;
  float ragged = 1.0 + 0.25 * marbleGradient(p / cell * 2.7);
  float d = length(offset) * ragged;
  float depth = mix(0.45, 1.0, fract(c.w * 17.9));
  return vec4(offset / radius, depth * (1.0 - smoothstep(0.75 * radius, radius, d)));
}
`;

/** The finish codes' colours, roughness and metalness, which both programs use. */
const FINISHES = `
int marbleCode(float finish) { return int(finish + 0.5); }

vec3 marbleColour(vec3 stone, float finish, vec4 pit, vec4 crystal) {
  int code = marbleCode(finish);
  vec3 marble = stone * (1.0 + 0.05 * crystal.w);
  if (code == ${code('block')}) return mix(vec3(0.60, 0.56, 0.47), marble, 0.35);
  if (code == ${code('drawn')}) return mix(vec3(0.42, 0.40, 0.38), marble, 0.3);
  if (code == ${code('point')} || code == ${code('drill')}) {
    // Fresh broken crystals, whiter at the pit bottoms where the tip crushed them.
    vec3 broken = mix(marble, vec3(0.955, 0.95, 0.935), code == ${code('point')} ? 0.5 : 0.35);
    float bottom = pit.w * clamp(1.0 - dot(pit.xyz, pit.xyz), 0.0, 1.0);
    return mix(broken, vec3(0.99, 0.985, 0.975), 0.65 * bottom);
  }
  if (code == ${code('twoTooth')} || code == ${code('claw')}) return mix(marble, vec3(0.96, 0.95, 0.92), 0.45);
  if (code == ${code('fineClaw')} || code == ${code('roundel')} || code == ${code('flat')}) return mix(marble, vec3(0.95, 0.94, 0.91), 0.3);
  if (code == ${code('rasp')} || code == ${code('file')}) return mix(marble, vec3(0.93, 0.92, 0.89), 0.25);
  if (code == ${code('pumice')}) return mix(marble, vec3(0.94, 0.93, 0.90), 0.15);
  if (code == ${code('gilt')}) return vec3(1.0, 0.84, 0.42);
  return marble;
}
float marbleRoughness(float finish) {
  int code = marbleCode(finish);
  if (code == ${code('block')} || code == ${code('drawn')}) return 0.95;
  if (code == ${code('point')}) return 0.85;
  if (code == ${code('twoTooth')}) return 0.80;
  if (code == ${code('claw')}) return 0.78;
  if (code == ${code('fineClaw')}) return 0.75;
  if (code == ${code('roundel')}) return 0.72;
  if (code == ${code('flat')}) return 0.70;
  if (code == ${code('drill')}) return 0.75;
  if (code == ${code('rasp')}) return 0.65;
  if (code == ${code('file')}) return 0.55;
  if (code == ${code('pumice')}) return 0.60;
  if (code == ${code('polish')}) return 0.28;
  if (code == ${code('gilt')}) return 0.3;
  return 0.6;
}
float marbleMetalness(float finish) {
  // Gold leaf over stone: mostly metal, with enough diffuse left that it reads gold under a dim sky.
  return marbleCode(finish) == ${code('gilt')} ? 0.75 : 0.0;
}
`;

const MARKS = `
/** Parallel bands of \`pitch\` metres at \`angle\` in each axis plane, blended by the normal; the tilt lies in the surface; faded out between seven and three pixels a band, so a fine claw seen from a metre does not hatch the face. */
vec3 marbleBands(vec3 p, vec3 n, float pitch, float amplitude, float angle, float px) {
  float fade = 1.0 - smoothstep(0.15, 0.3, px / pitch);
  if (fade <= 0.0) return vec3(0.0);
  vec3 w = pow(abs(n), vec3(4.0));
  w /= w.x + w.y + w.z;
  vec2 d = vec2(cos(angle), sin(angle));
  vec3 tx = vec3(0.0, d.y, d.x);
  vec3 ty = vec3(d.x, 0.0, d.y);
  vec3 tz = vec3(d.x, d.y, 0.0);
  float k = 6.2831853 / pitch;
  vec3 mark = w.x * tx * cos(k * dot(p, tx)) + w.y * ty * cos(k * dot(p, ty)) + w.z * tz * cos(k * dot(p, tz));
  return mark * amplitude * fade;
}
/** The tool's marks as a world-space normal perturbation; n is the world normal. */
vec3 marbleMark(vec3 p, float finish, vec3 n, float px, vec4 pit) {
  int code = marbleCode(finish);
  vec3 mark = vec3(0.0);
  if (code == ${code('block')} || code == ${code('drawn')}) {
    float fine = 1.0 - smoothstep(0.0015, 0.003, px);
    vec3 coarse = vec3(marbleGradient(p * 45.0), marbleGradient(p * 45.0 + 5.0), marbleGradient(p * 45.0 + 9.0));
    vec3 grit = vec3(marbleGradient(p * 160.0), marbleGradient(p * 160.0 + 5.0), marbleGradient(p * 160.0 + 9.0));
    mark = coarse * 0.5 + grit * 0.45 * fine;
  } else if (code == ${code('point')} || code == ${code('drill')}) {
    // The pit's wall, and between the pits the crumbled ridges of broken crystals.
    float fine = 1.0 - smoothstep(0.001, 0.002, px);
    vec3 crumb = vec3(marbleGradient(p * 220.0), marbleGradient(p * 220.0 + 5.0), marbleGradient(p * 220.0 + 9.0));
    mark = -pit.xyz * pit.w * (code == ${code('point')} ? 0.8 : 0.6) + crumb * 0.35 * fine * (1.0 - pit.w);
  } else if (code == ${code('twoTooth')}) {
    mark = marbleBands(p, n, 0.012, 0.45, 0.64, px);
  } else if (code == ${code('claw')}) {
    mark = marbleBands(p, n, 0.006, 0.35, 0.64, px);
  } else if (code == ${code('fineClaw')}) {
    mark = marbleBands(p, n, 0.003, 0.25, -0.93, px);
  } else if (code == ${code('roundel')}) {
    mark = marbleBands(p, n, 0.02, 0.2, 0.64, px) + marbleBands(p, n, 0.02, 0.2, -0.93, px);
  } else if (code == ${code('flat')}) {
    mark = marbleBands(p, n, 0.015, 0.08, 0.64, px);
  } else if (code == ${code('rasp')}) {
    mark = marbleBands(p, n, 0.002, 0.18, 0.64, px) + marbleBands(p, n, 0.0024, 0.18, -0.93, px);
  } else if (code == ${code('file')}) {
    mark = marbleBands(p, n, 0.001, 0.08, 0.64, px) + marbleBands(p, n, 0.0012, 0.08, -0.93, px);
  }
  return mark;
}
`;

/** The fragment functions, after the uniforms: `finishColours` holds `codeCount` flat colours for `?finish=1`; `marbleLoop` is 1, set by src/viewer/marble.ts, and only hides the fbm's loop bound from the compiler. `full` false gives the light first program's: the finish tables alone. */
export function fragmentFunctions(codeCount: number, full: boolean): string {
  return `
uniform vec3 finishColours[${String(codeCount)}];
uniform float flatCodes;
${full ? `uniform int marbleLoop;\n${NOISE}${STONE}${FINISHES}${MARKS}` : FINISHES}`;
}

/** The stone's mean colour under the clouding and the veins, for the light first program. */
const MEAN_STONE = 'vec3(0.90, 0.89, 0.86)';

/** Replaces `color_fragment` in the light first program: the finish code's colour on the stone's mean, no grain and no pits. */
export const COLOUR_CHUNK_LITE = `
diffuseColor.rgb = flatCodes > 0.5 ? finishColours[marbleCode(vFinish)] * 0.35 : marbleColour(${MEAN_STONE}, vFinish, vec4(0.0), vec4(0.0));
`;

/** Replaces `color_fragment`. At the top of main, in uniform control flow, so the derivatives are defined: the pixel footprint, the stone, the crystal and the pit, which the normal chunk reuses. */
export const COLOUR_CHUNK = `
float marblePx = max(max(length(dFdx(vWorldPos)), length(dFdy(vWorldPos))), 1e-6);
vec3 marbleBase = marbleStone(vWorldPos, marblePx);
vec4 marbleGrain = marbleCrystal(vWorldPos, marblePx);
vec4 marbleHole = marblePit(vWorldPos, marbleCode(vFinish));
diffuseColor.rgb = flatCodes > 0.5 ? finishColours[marbleCode(vFinish)] * 0.35 : marbleColour(marbleBase, vFinish, marbleHole, marbleGrain);
`;

/** Replaces `normal_fragment_maps`: `normal` is in view space here; the mark is built in world space, kept in the surface and brought across with the view matrix. */
export const NORMAL_CHUNK = `
#include <normal_fragment_maps>
if (flatCodes < 0.5) {
  vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
  vec3 mark = marbleMark(vWorldPos, vFinish, worldNormal, marblePx, marbleHole) + marbleGrain.xyz * 0.06;
  mark -= worldNormal * dot(mark, worldNormal);
  normal = normalize(normal + mat3(viewMatrix) * mark);
}
`;
