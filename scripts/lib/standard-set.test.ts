/**
 * The standard capture set builder (scripts/lib/standard-set.mjs) on hand-made facts: no browser.
 * Bound: it pins the set's shape, the follow shot's position, the skip of a tool with no blows and the refusal of facts read before every step is planned. Whether the page renders each shot is scripts/capture-shots.mjs's run.
 * Defect pinned (2026-10-11): facts read at t = 0 carried zero counts for unplanned steps, and the follow shot asked for t=Infinity.
 */
import { describe, expect, it } from 'vitest';

import { PRESETS, standardSet } from './standard-set.mjs';

const FACTS = {
  N: 4,
  stages: ['setup', 'roughing', 'polishing'],
  stepIds: ['nodo', 'front-furrows', 'sides-point', 'tripoli'],
  stepStages: ['setup', 'roughing', 'roughing', 'polishing'],
  stepTools: ['point', 'point', 'point', 'polish'],
  stepBlowCounts: [4, 100, 50, 0],
};

const build = (facts: unknown): ReturnType<typeof standardSet> => standardSet(facts);

describe('standardSet', () => {
  it('captures every preset at t = N, the finish view, each stage boundary twice and one follow shot per tool with blows', () => {
    const { shots, skipped } = build(FACTS);
    const names = shots.map((shot) => shot.name);
    expect(names.slice(0, PRESETS.length)).toEqual(PRESETS);
    expect(shots[0]?.params).toEqual({ t: 4 });
    expect(names).toContain('front_finish');
    expect(names).toContain('front_t-0_setup');
    expect(names).toContain('three-quarter_t-1_roughing');
    expect(names).toContain('front_t-3_polishing');
    // The point's first step has 4 blows: its middle blow is index 2, mid-cycle at 2.5 / 4 into step 0.
    expect(shots.find((shot) => shot.view === 'follow')).toEqual({ name: 'follow_point_t-0.6250', view: 'follow', params: { t: '0.6250' } });
    expect(shots.filter((shot) => shot.view === 'follow')).toHaveLength(1);
    expect(skipped).toEqual(['no follow shot for polish: its step tripoli has no blows.']);
    for (const shot of shots) expect(String(shot.params['t'])).not.toMatch(/Infinity|NaN/);
  });

  it('takes the follow shot from the first step of the tool that has blows', () => {
    const { shots } = build({ ...FACTS, stepBlowCounts: [0, 100, 50, 0] });
    expect(shots.find((shot) => shot.view === 'follow')?.name).toBe('follow_point_t-1.5050');
  });

  it('refuses facts with no steps or with an unplanned step, naming what it needs', () => {
    expect(() => build({ ...FACTS, N: 0 })).toThrow('published no steps');
    expect(() => build({ ...FACTS, stepBlowCounts: [4, 100] })).toThrow('read at t=4 when every step is planned');
    expect(() => build({ ...FACTS, stepBlowCounts: [4, 100, Number.NaN, 0] })).toThrow('one whole number per step');
  });
});
