/**
 * Completeness of the tool catalog (docs/design/spec.md, Verification: every tool has dimensions and a source line).
 * Bound: it checks presence, finiteness, positivity and the shape of the source line; whether a number is the right number is the research note's claim, not this test's.
 */
import { describe, expect, it } from 'vitest';

import type { ToolId } from '../contracts/making';
import { CATALOG_IDS, TOOL_CATALOG, dimension } from './catalog';

const TOOL_IDS: readonly ToolId[] = ['charcoal', 'point', 'two-tooth', 'claw', 'fine-claw', 'roundel', 'flat', 'drill', 'rasp', 'file', 'pumice', 'polish', 'gilding'];

describe('tool catalog', () => {
  it('has an entry for every ToolId and the mallet, keyed by its own id', () => {
    expect([...CATALOG_IDS].sort()).toEqual([...TOOL_IDS, 'mallet'].sort());
    for (const id of CATALOG_IDS) expect(TOOL_CATALOG[id].id).toBe(id);
  });

  it('names every tool in Italian and English with a material and a source that cites a tools.md or technique.md section and an [S n] reference', () => {
    for (const id of CATALOG_IDS) {
      const spec = TOOL_CATALOG[id];
      expect(spec.italian.length, `${id} italian name`).toBeGreaterThan(0);
      expect(spec.english.length, `${id} english name`).toBeGreaterThan(0);
      expect(spec.material.length, `${id} material`).toBeGreaterThan(0);
      expect(spec.source, `${id} source names the note`).toMatch(/(tools|technique)\.md, /);
      expect(spec.source, `${id} source cites a reference`).toMatch(/\[S\d+\]/);
    }
  });

  it('gives every tool at least one finite positive dimension, each flagged stated or inferred', () => {
    for (const id of CATALOG_IDS) {
      const entries = Object.entries(TOOL_CATALOG[id].dimensions);
      expect(entries.length, `${id} dimensions`).toBeGreaterThan(0);
      for (const [key, measured] of entries) {
        expect(Number.isFinite(measured.value) && measured.value > 0, `${id}.${key} = ${String(measured.value)}`).toBe(true);
        expect(typeof measured.inferred, `${id}.${key} inferred flag`).toBe('boolean');
      }
    }
  });

  it('gives every tool but the mallet a working angle range inside [0, 90] with min at or below max', () => {
    for (const id of CATALOG_IDS) {
      const angle = TOOL_CATALOG[id].angle;
      if (id === 'mallet') {
        expect(angle).toBeNull();
        continue;
      }
      expect(angle, `${id} angle`).not.toBeNull();
      if (angle === null) continue;
      expect(angle.min).toBeGreaterThanOrEqual(0);
      expect(angle.max).toBeLessThanOrEqual(90);
      expect(angle.min).toBeLessThanOrEqual(angle.max);
    }
  });

  it('gives the struck chisels chips and a blows-per-shown basis, and the abrasives neither', () => {
    for (const id of CATALOG_IDS) {
      const { motion, chips, blowsPerShown } = TOOL_CATALOG[id];
      expect(chips.count.min).toBeLessThanOrEqual(chips.count.max);
      expect(chips.size.min).toBeLessThanOrEqual(chips.size.max);
      if (motion === 'struck') {
        expect(chips.count.max, `${id} sends chips`).toBeGreaterThan(0);
        expect(blowsPerShown?.value ?? 0, `${id} blows per shown`).toBeGreaterThan(0);
      } else if (motion === 'drill') {
        expect(chips.count.max, `${id} sends grit`).toBeGreaterThan(0);
      } else {
        expect(chips.count.max, `${id} sends no chips`).toBe(0);
        expect(blowsPerShown, `${id} has no blows-per-shown basis`).toBeNull();
      }
    }
  });

  it('reads a dimension by key and names the tool and key when it is missing', () => {
    expect(dimension('point', 'shaftLength')).toBe(TOOL_CATALOG.point.dimensions['shaftLength']?.value);
    expect(() => dimension('point', 'bowLength')).toThrow(/point has no bowLength/);
  });

  it('keeps the point steeper than the toothed chisels only for bulk cuts and the drill at the running-drill angle', () => {
    const { point, claw, drill } = { point: TOOL_CATALOG.point.angle, claw: TOOL_CATALOG.claw.angle, drill: TOOL_CATALOG.drill.angle };
    if (point === null || claw === null || drill === null) throw new Error('the point, the claw and the drill each need a working angle range');
    // Only bulk cuts go steeper than any toothed chisel; the sculptor's stroke lies lower than the claw's lowest.
    expect(point.max).toBeGreaterThan(claw.max);
    expect(point.min).toBeLessThan(claw.min);
    // The running drill works inside the claw's range, at a narrower span.
    expect(drill.min).toBeGreaterThanOrEqual(claw.min);
    expect(drill.max).toBeLessThanOrEqual(claw.max);
    expect(drill.max - drill.min).toBeLessThan(claw.max - claw.min);
    expect([point.inferred, claw.inferred, drill.inferred]).toEqual([false, false, false]);
    expect(TOOL_CATALOG.mallet.dimensions['handleLength']?.inferred).toBe(false);
  });
});
