/**
 * Chips: determinism in the blow's fields, the timing window, the floor bound, the catalog's counts and sizes, launch away from the stone, and the pool's instance count.
 */
import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';

import type { Blow, ChipState, ToolId } from '../contracts/making';
import { TOOL_CATALOG } from './catalog';
import { FADE_END, FADE_START, chipsAt } from './chip-burst';
import { CHIP_POOL_SIZE, ChipPool } from './chips';
import { DEG, toVector } from './math';

function blow(tool: ToolId, overrides: Partial<Blow> = {}): Blow {
  const a = 45 * DEG;
  return { tool, point: [0.2, 1.5, 0.7], normal: [0, 0, 1], direction: [0, -Math.cos(a), -Math.sin(a)], size: 0.01, stroke: 3, ...overrides };
}

describe('chips', () => {
  it('is deterministic in the blow and differs between blows', () => {
    const b = blow('point');
    expect(chipsAt(b, 0.3)).toEqual(chipsAt(b, 0.3));
    expect(chipsAt(b, 0.3)).not.toEqual(chipsAt(blow('point', { stroke: 4 }), 0.3));
    expect(chipsAt(b, 0.3)).not.toEqual(chipsAt(blow('point', { point: [0.21, 1.5, 0.7] }), 0.3));
  });

  it('is empty before the strike and once faded, full until the fade starts, then fading', () => {
    const b = blow('claw');
    expect(chipsAt(b, -0.01)).toEqual([]);
    expect(chipsAt(b, FADE_END)).toEqual([]);
    expect(chipsAt(b, 3)).toEqual([]);
    expect(chipsAt(b, 0).length).toBeGreaterThan(0);
    for (const chip of chipsAt(b, FADE_START)) expect(chip.life).toBe(1);
    for (const chip of chipsAt(b, (FADE_START + FADE_END) / 2)) expect(chip.life).toBeCloseTo(0.5, 9);
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
    for (const tool of ['rasp', 'file', 'pumice', 'polish', 'charcoal', 'gilding'] as const) expect(chipsAt(blow(tool), 0.2)).toEqual([]);
  });

  it('never puts a chip below the floor and brings every chip to the ground before it fades', () => {
    for (const b of [blow('point', { point: [0.2, 0.3, 0.7] }), blow('point', { point: [0, 1.2, 0.7], size: 0.05 }), blow('claw', { point: [0.5, 0.05, 0.7] }), blow('drill')]) {
      for (let seconds = 0; seconds < FADE_END; seconds += 0.025) {
        for (const chip of chipsAt(b, seconds)) expect(chip.position[1], `${b.tool} at ${seconds.toFixed(3)} s`).toBeGreaterThanOrEqual(0);
      }
      for (const chip of chipsAt(b, FADE_END - 0.01)) expect(chip.position[1]).toBeLessThan(0.05);
    }
  });

  it('falls under gravity: a chip launched at 1.5 m is lower at 0.5 s than its launch would put it without gravity', () => {
    const b = blow('point');
    const early = chipsAt(b, 0.01);
    const later = chipsAt(b, 0.4);
    expect(later.length).toBe(early.length);
    early.forEach((chip, i) => {
      const velocity = toVector(chip.position).sub(toVector(b.point)).divideScalar(0.01);
      const ballistic = toVector(b.point).addScaledVector(velocity, 0.4).y - 0.5 * 9.81 * 0.4 * 0.4;
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
