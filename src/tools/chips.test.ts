/**
 * Chips (src/tools/chip-burst.ts, src/tools/chips.ts). What a green run proves, and its bounds:
 *   1. Determinism: the same blow sends the same chips; a different stroke or point sends different ones.
 *   2. Timing: nothing before the strike; every chip of four blows (a point at 0.3 m, a claw and the drill at 1.5 m, a bulk point at 4.5 m) keeps `life` 1 until it rests under 5 cm, then fades to 0 over FADE_SECONDS without moving, leaving the list once faded; a blow's list is empty at `chipLifetime(blow)` and not just before; no chip is ever below the floor.
 *   3. The 4.5 m blow: at 1 s (the old fixed fade start) a chip is still over 5 cm up and every chip is full; when its first chip starts to fade, every chip is under 5 cm.
 *   4. MAX_CHIP_SECONDS covers `chipLifetime` of bulk point blows on the top face of the block at every tested stroke, and lies between a free fall from the top plus the fade and 5 s.
 *   5. The catalog's counts and sizes per tool, the bulk point's bigger chips, nothing from rasps, abrasives, charcoal and the brush, every chip launched in front of the face, and gravity: at 0.4 s a chip is where its launch velocity and gravity put it, within 8 cm.
 *   6. The pool shows the given states, caps at CHIP_POOL_SIZE and shrinks a fading chip.
 * Bounds: the sweeps sample every 10 ms, so a settle or fade boundary is pinned to within a sample; the blows are hand-made at a few heights and faces, not the choreography's; nothing is rendered.
 */
import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';

import type { Blow, ChipState, ToolId } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { TOOL_CATALOG } from './catalog';
import { FADE_SECONDS, GRAVITY, MAX_CHIP_SECONDS, chipLifetime, chipsAt } from './chip-burst';
import { CHIP_POOL_SIZE, ChipPool } from './chips';
import { DEG, toVector } from './math';

const STEP = 0.01;
const FLOOR_NEAR = 0.05;

function blow(tool: ToolId, overrides: Partial<Blow> = {}): Blow {
  const a = 45 * DEG;
  return { tool, point: [0.2, 1.5, 0.7], normal: [0, 0, 1], direction: [0, -Math.cos(a), -Math.sin(a)], size: 0.01, stroke: 3, ...overrides };
}

const TIMED: readonly Blow[] = [blow('point', { point: [0.2, 0.3, 0.7] }), blow('claw'), blow('drill'), blow('point', { point: [0, 4.5, 0.7], size: 0.05 })];
const HIGH = TIMED[3] as Blow;

interface Sample {
  readonly at: number;
  readonly chip: ChipState;
}

/** Every chip of `b` sampled every STEP seconds from the strike past its lifetime, keyed by its scale, which is unique within a burst. */
function tracks(b: Blow): Map<number, Sample[]> {
  const first = chipsAt(b, 0);
  expect(new Set(first.map((chip) => chip.scale)).size).toBe(first.length);
  const result = new Map<number, Sample[]>();
  for (let at = 0; at <= chipLifetime(b) + STEP; at += STEP) {
    for (const chip of chipsAt(b, at)) {
      const track = result.get(chip.scale) ?? [];
      track.push({ at, chip });
      result.set(chip.scale, track);
    }
  }
  expect(result.size).toBe(first.length);
  return result;
}

describe('chips', () => {
  it('is deterministic in the blow and differs between blows', () => {
    const b = blow('point');
    expect(chipsAt(b, 0.3)).toEqual(chipsAt(b, 0.3));
    expect(chipsAt(b, 0.3)).not.toEqual(chipsAt(blow('point', { stroke: 4 }), 0.3));
    expect(chipsAt(b, 0.3)).not.toEqual(chipsAt(blow('point', { point: [0.21, 1.5, 0.7] }), 0.3));
  });

  it.each(TIMED)('$tool at $point.1 m: every chip is full until it rests on the floor, fades over FADE_SECONDS without moving, and the blow is empty at its lifetime', (b) => {
    expect(chipsAt(b, -0.01)).toEqual([]);
    expect(chipsAt(b, 0).length).toBeGreaterThan(0);
    const lifetime = chipLifetime(b);
    expect(lifetime).toBeGreaterThan(FADE_SECONDS);
    expect(lifetime).toBeLessThanOrEqual(MAX_CHIP_SECONDS);
    expect(chipsAt(b, lifetime - STEP).length).toBeGreaterThan(0);
    expect(chipsAt(b, lifetime)).toEqual([]);
    expect(chipsAt(b, MAX_CHIP_SECONDS)).toEqual([]);
    for (const track of tracks(b).values()) {
      const full = track.filter((s) => s.chip.life === 1);
      const fading = track.filter((s) => s.chip.life < 1);
      const rest = full[full.length - 1] as Sample;
      const last = track[track.length - 1] as Sample;
      expect(track[0]?.at).toBe(0);
      expect(full.length + fading.length).toBe(track.length);
      expect(fading.length).toBeGreaterThan(0);
      // A chip in the list has life in (0, 1], and its last sample is within one step of faded.
      expect(last.chip.life).toBeGreaterThan(0);
      expect(last.chip.life).toBeLessThanOrEqual(STEP / FADE_SECONDS + 1e-9);
      expect(Math.abs(last.at - rest.at - FADE_SECONDS)).toBeLessThan(2 * STEP);
      for (const s of track) expect(s.chip.position[1], `${b.tool} at ${s.at.toFixed(2)} s`).toBeGreaterThanOrEqual(0);
      // The fading samples all lie past the settle time, so the chip is still: the same position throughout, and the life drops a step's worth each sample after a partial first drop.
      const still = fading[0] as Sample;
      expect(still.chip.life).toBeLessThan(1);
      expect(still.chip.life).toBeGreaterThanOrEqual(1 - STEP / FADE_SECONDS - 1e-9);
      fading.forEach((s, i) => {
        expect(s.chip.position[1], `${b.tool} fading at ${s.at.toFixed(2)} s`).toBeLessThan(FLOOR_NEAR);
        for (let axis = 0; axis < 3; axis += 1) expect(s.chip.position[axis]).toBeCloseTo(still.chip.position[axis] ?? Number.NaN, 9);
        if (i > 0) expect((fading[i - 1] as Sample).chip.life - s.chip.life).toBeCloseTo(STEP / FADE_SECONDS, 6);
      });
    }
  });

  it('a bulk blow at 4.5 m: still falling at the old fixed fade start with every chip full, and all on the floor when the first fade begins', () => {
    const atOne = chipsAt(HIGH, 1);
    expect(atOne.some((chip) => chip.position[1] > FLOOR_NEAR)).toBe(true);
    for (const chip of atOne) expect(chip.life).toBe(1);
    let firstFade = Number.NaN;
    for (let at = 0; Number.isNaN(firstFade) && at <= chipLifetime(HIGH); at += STEP) if (chipsAt(HIGH, at).some((chip) => chip.life < 1)) firstFade = at;
    expect(firstFade).toBeGreaterThan(1.5);
    const justBefore = chipsAt(HIGH, firstFade - STEP);
    expect(justBefore.length).toBe(chipsAt(HIGH, 0).length);
    for (const chip of justBefore) {
      expect(chip.life).toBe(1);
      expect(chip.position[1]).toBeLessThan(FLOOR_NEAR);
    }
  });

  it('MAX_CHIP_SECONDS bounds the lifetime of bulk point blows on the top of the block', () => {
    expect(MAX_CHIP_SECONDS).toBeGreaterThan(Math.sqrt((2 * BLOCK_M.height) / GRAVITY) + FADE_SECONDS);
    expect(MAX_CHIP_SECONDS).toBeLessThan(5);
    for (let stroke = 0; stroke < 40; stroke += 1) {
      const a = (20 + stroke) * DEG;
      const top = blow('point', { point: [0.3 * Math.cos(stroke), BLOCK_M.height, 0.2 * Math.sin(stroke)], normal: [0, 1, 0], direction: [Math.cos(a), -Math.sin(a), 0], size: 0.05, stroke });
      expect(chipLifetime(top), `stroke ${String(stroke)}`).toBeLessThanOrEqual(MAX_CHIP_SECONDS);
    }
  });

  it.each<ToolId>(['point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat', 'drill'])('%s: count and size follow the catalog and the chips leave the stone', (tool) => {
    const b = blow(tool);
    const spec = TOOL_CATALOG[tool].chips;
    const chips = chipsAt(b, 0.03);
    expect(chips.length).toBeGreaterThanOrEqual(spec.count.min);
    expect(chips.length).toBeLessThanOrEqual(spec.count.max);
    for (const chip of chips) {
      expect(chip.scale).toBeGreaterThanOrEqual(spec.size.min - 1e-12);
      expect(chip.scale).toBeLessThanOrEqual(spec.size.max + 1e-12);
      const away = toVector(chip.position).sub(toVector(b.point)).dot(toVector(b.normal));
      expect(away, `${tool} chip in front of the face`).toBeGreaterThan(0);
    }
  });

  it('sends bigger chips for a bulk point cut and none for rasps, abrasives, charcoal and the brush', () => {
    const bulk = chipsAt(blow('point', { size: 0.05 }), 0.1);
    expect(Math.max(...bulk.map((chip) => chip.scale))).toBeGreaterThan(TOOL_CATALOG.point.chips.size.max);
    for (const tool of ['rasp', 'file', 'pumice', 'polish', 'charcoal', 'gilding'] as const) {
      expect(chipsAt(blow(tool), 0.2)).toEqual([]);
      expect(chipLifetime(blow(tool))).toBe(0);
    }
  });

  it('falls under gravity: a chip launched at 1.5 m is lower at 0.5 s than its launch would put it without gravity', () => {
    const b = blow('point');
    const early = chipsAt(b, 0.01);
    const later = chipsAt(b, 0.4);
    expect(later.length).toBe(early.length);
    early.forEach((chip, i) => {
      const velocity = toVector(chip.position).sub(toVector(b.point)).divideScalar(0.01);
      const ballistic = toVector(b.point).addScaledVector(velocity, 0.4).y - 0.5 * GRAVITY * 0.4 * 0.4;
      const actual = later[i]?.position[1] ?? Number.NaN;
      expect(actual).toBeLessThan(toVector(b.point).y + velocity.y * 0.4 + 0.01);
      expect(Math.abs(actual - Math.max(ballistic, 0))).toBeLessThan(0.08);
    });
  });

  it('pool: shows the given states, caps at the pool size and shrinks a fading chip', () => {
    const pool = new ChipPool();
    expect(pool.mesh.count).toBe(0);
    const state = (life: number): ChipState => ({ position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: 0.02, life });
    pool.update([state(1), state(0.5), state(0)]);
    expect(pool.mesh.count).toBe(3);
    // With an identity rotation the diagonal of the instance matrix is the scale and the last column the position.
    const matrix = new Matrix4();
    pool.mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[0]).toBeCloseTo(0.02, 9);
    expect(matrix.elements[5]).toBeCloseTo(0.02, 9);
    expect([matrix.elements[12], matrix.elements[13], matrix.elements[14]]).toEqual([1, 2, 3]);
    pool.mesh.getMatrixAt(1, matrix);
    expect(matrix.elements[0]).toBeCloseTo(0.01, 9);
    pool.mesh.getMatrixAt(2, matrix);
    expect(matrix.elements[0]).toBeCloseTo(0, 9);
    pool.update(Array.from({ length: CHIP_POOL_SIZE + 10 }, () => state(1)));
    expect(pool.mesh.count).toBe(CHIP_POOL_SIZE);
  });
});
