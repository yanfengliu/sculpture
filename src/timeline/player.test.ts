/**
 * The player's contract (src/contracts/making.ts, Player; docs/design/spec.md, Blows, strokes and steps) on injected weights and seconds only: no clock, no DOM.
 * Bound: it pins rates, stops, stepping and retargeting, seeking and speeds on a three-step timeline with weights 1, 2 and 0.5; it says nothing about the page that drives the player or the making that reads `t`.
 */
import { describe, expect, it } from 'vitest';

import { BASE_SECONDS } from '../contracts/making';
import { SPEEDS, createPlayer } from './player';

const WEIGHTS = [1, 2, 0.5] as const;

describe('createPlayer', () => {
  it('starts at rest at t = 0 with N steps, speed 1 and nothing moving', () => {
    const player = createPlayer(WEIGHTS);
    expect(player).toMatchObject({ t: 0, N: 3, playing: null, speed: 1, target: null, moving: false });
    expect(SPEEDS).toEqual([0.5, 1, 2, 4]);
  });

  it('plays forward at weight × BASE_SECONDS / speed seconds per step and reports whether t changed', () => {
    const player = createPlayer(WEIGHTS);
    expect(player.update(1)).toBe(false);
    player.play('forward');
    expect(player.playing).toBe('forward');
    expect(player.update(BASE_SECONDS / 2)).toBe(true);
    expect(player.t).toBeCloseTo(0.5, 9);
    expect(player.update(BASE_SECONDS / 2)).toBe(true);
    expect(player.t).toBe(1);
    // Step 1 has weight 2: a full BASE_SECONDS moves half a step.
    player.update(BASE_SECONDS);
    expect(player.t).toBeCloseTo(1.5, 9);
    expect(player.update(0)).toBe(false);
  });

  it('crosses a step boundary within one update at each step\'s own rate', () => {
    const player = createPlayer(WEIGHTS);
    player.play('forward');
    // Half of step 0 (6 s) plus a quarter of step 1 (6 s of its 24 s).
    player.seek(0.5);
    player.update(12);
    expect(player.t).toBeCloseTo(1.25, 9);
  });

  it('stops at N and clears playing; a further update changes nothing', () => {
    const player = createPlayer(WEIGHTS);
    player.play('forward');
    expect(player.update(1000)).toBe(true);
    expect(player.t).toBe(3);
    expect(player.playing).toBeNull();
    expect(player.update(1)).toBe(false);
    expect(player.t).toBe(3);
  });

  it('plays backward at the same rates and stops at 0', () => {
    const player = createPlayer(WEIGHTS);
    player.seek(3);
    player.play('backward');
    player.update(BASE_SECONDS / 4);
    expect(player.t).toBeCloseTo(2.5, 9);
    player.update(BASE_SECONDS / 4 + BASE_SECONDS);
    expect(player.t).toBeCloseTo(1.5, 9);
    expect(player.update(1000)).toBe(true);
    expect(player.t).toBe(0);
    expect(player.playing).toBeNull();
  });

  it('play from an end in the direction of that end does not move', () => {
    const player = createPlayer(WEIGHTS);
    player.play('backward');
    expect(player.update(5)).toBe(false);
    expect(player.playing).toBeNull();
    player.seek(3);
    player.play('forward');
    expect(player.update(5)).toBe(false);
    expect(player.playing).toBeNull();
  });

  it.each([0.5, 1, 2, 4] as const)('speed %s scales the rate', (speed) => {
    const player = createPlayer(WEIGHTS);
    player.setSpeed(speed);
    expect(player.speed).toBe(speed);
    player.play('forward');
    player.update(BASE_SECONDS / 4);
    expect(player.t).toBeCloseTo(speed / 4, 9);
  });

  it('step forward animates to the next integer at the playback rate and stops there', () => {
    const player = createPlayer(WEIGHTS);
    player.stepForward();
    expect(player).toMatchObject({ target: 1, moving: true, playing: null });
    expect(player.update(BASE_SECONDS / 2)).toBe(true);
    expect(player.t).toBeCloseTo(0.5, 9);
    player.update(BASE_SECONDS);
    expect(player.t).toBe(1);
    expect(player.target).toBeNull();
    expect(player.moving).toBe(false);
    expect(player.update(1)).toBe(false);
  });

  it('step forward from inside a step targets the next integer; step back the previous one', () => {
    const player = createPlayer(WEIGHTS);
    player.seek(1.3);
    player.stepForward();
    expect(player.target).toBe(2);
    player.seek(1.3);
    player.stepBack();
    expect(player.target).toBe(1);
    player.update(1000);
    expect(player.t).toBe(1);
    player.stepBack();
    expect(player.target).toBe(0);
    player.update(1000);
    expect(player.t).toBe(0);
  });

  it('a second press while moving retargets one integer further, clamped to [0, N]', () => {
    const player = createPlayer(WEIGHTS);
    player.stepForward();
    player.update(1);
    player.stepForward();
    expect(player.target).toBe(2);
    player.stepForward();
    player.stepForward();
    expect(player.target).toBe(3);
    player.update(1000);
    expect(player.t).toBe(3);
    expect(player.target).toBeNull();
    player.stepBack();
    player.update(1);
    player.stepBack();
    expect(player.target).toBe(1);
    player.stepBack();
    player.stepBack();
    expect(player.target).toBe(0);
    player.update(1000);
    expect(player.t).toBe(0);
  });

  it('a step press in the other direction while moving retargets back across t', () => {
    const player = createPlayer(WEIGHTS);
    player.seek(2.5);
    player.stepForward();
    expect(player.target).toBe(3);
    player.stepBack();
    expect(player.target).toBe(2);
    player.update(1000);
    expect(player.t).toBe(2);
  });

  it('step presses at the ends do nothing', () => {
    const player = createPlayer(WEIGHTS);
    player.stepBack();
    expect(player.target).toBeNull();
    expect(player.update(1)).toBe(false);
    player.seek(3);
    player.stepForward();
    expect(player.target).toBeNull();
    expect(player.update(1)).toBe(false);
  });

  it('a step press pauses continuous playback', () => {
    const player = createPlayer(WEIGHTS);
    player.play('forward');
    player.update(1);
    player.stepForward();
    expect(player.playing).toBeNull();
    expect(player.target).toBe(1);
  });

  it('play cancels a step animation and pause cancels both', () => {
    const player = createPlayer(WEIGHTS);
    player.stepForward();
    player.play('backward');
    expect(player.target).toBeNull();
    expect(player.playing).toBe('backward');
    player.pause();
    expect(player.playing).toBeNull();
    expect(player.moving).toBe(false);
  });

  it('seek clamps to [0, N], ignores non-finite values and ends a step animation but not playback', () => {
    const player = createPlayer(WEIGHTS);
    player.seek(2.25);
    expect(player.t).toBe(2.25);
    player.seek(-4);
    expect(player.t).toBe(0);
    player.seek(99);
    expect(player.t).toBe(3);
    player.seek(Number.NaN);
    expect(player.t).toBe(3);
    player.stepBack();
    player.seek(1);
    expect(player.target).toBeNull();
    player.play('forward');
    player.seek(0.5);
    expect(player.playing).toBe('forward');
    expect(player.t).toBe(0.5);
  });

  it('a zero-weight step is instant and an empty timeline never moves', () => {
    const instant = createPlayer([0, 1]);
    instant.play('forward');
    instant.update(BASE_SECONDS / 2);
    expect(instant.t).toBeCloseTo(1.5, 9);
    const empty = createPlayer([]);
    expect(empty.N).toBe(0);
    empty.play('forward');
    expect(empty.update(1)).toBe(false);
    empty.stepForward();
    expect(empty.target).toBeNull();
  });
});
