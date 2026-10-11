/**
 * The props: each has names and a source, and its model's size matches its dimensions within 5 percent (the wax model about 45 cm tall on its stand).
 */
import { describe, expect, it } from 'vitest';

import { PROPS, PROP_IDS, propExtent, propModel } from './props';

describe('workshop props', () => {
  it('names every prop and cites a research section with an [S n] reference', () => {
    expect(PROP_IDS).toEqual(['square', 'plumb-line', 'wax-model', 'curved-rasp', 'leather-pad']);
    for (const id of PROP_IDS) {
      const spec = PROPS[id];
      expect(spec.italian.length).toBeGreaterThan(0);
      expect(spec.english.length).toBeGreaterThan(0);
      expect(spec.source).toMatch(/(tools|technique)\.md, /);
      expect(spec.source).toMatch(/\[S\d+\]/);
      expect(Object.keys(spec.dimensions).length).toBeGreaterThan(0);
    }
  });

  it('builds each prop at its documented size', () => {
    const near = (actual: number, expected: number, what: string): void => {
      expect(Math.abs(actual - expected) / expected, `${what}: ${actual.toFixed(4)} m against ${expected.toFixed(4)} m`).toBeLessThanOrEqual(0.05);
    };
    const square = propExtent('square');
    near(square.y, PROPS.square.dimensions['armLong']?.value ?? 0, 'square upright');
    near(square.x, PROPS.square.dimensions['armShort']?.value ?? 0, 'square foot');
    const plumb = PROPS['plumb-line'].dimensions;
    near(propExtent('plumb-line').y, (plumb['bobHeight']?.value ?? 0) + (plumb['cordLength']?.value ?? 0) + (plumb['reelHeight']?.value ?? 0), 'plumb line');
    const wax = PROPS['wax-model'].dimensions;
    near(propExtent('wax-model').y, (wax['figureHeight']?.value ?? 0) + (wax['standHeight']?.value ?? 0), 'wax model with stand');
    near(propExtent('curved-rasp').y, PROPS['curved-rasp'].dimensions['length']?.value ?? 0, 'curved rasp');
    const pad = PROPS['leather-pad'].dimensions;
    near(propExtent('leather-pad').x, pad['length']?.value ?? 0, 'leather pad length');
    near(propExtent('leather-pad').z, pad['width']?.value ?? 0, 'leather pad width');
  });

  it('clones a cached model', () => {
    const a = propModel('square');
    const b = propModel('square');
    expect(a).not.toBe(b);
    expect(a.children.length).toBe(b.children.length);
  });
});
