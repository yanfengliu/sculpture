/**
 * When the plank bridges are laid (src/viewer/bridges.ts), on hand-made blows and a stand-in stock: no making, no WebGL.
 * Bound: it pins which bridge a blow needs (through the tools' own `isReachable` and `nearestPlatform`), the depth of stone in a bridge's planks, and the tracker's rule: laid once the position is inside the first step that needs it, not at the integer before, not for a step not planned yet, never while stone fills its box (reported once with the step and the depth), and gone again when the position goes back. Whether the page shows what it lays is the yard's job (src/viewer/yard.ts) and the captures'.
 */
import { describe, expect, it } from 'vitest';

import type { Blow, Vec3 } from '../contracts/making';
import { BLOCK_M } from '../david/frame';
import { BRIDGES } from '../tools/scaffold';
import type { BridgeSource } from './bridges';
import { bridgeFor, createBridgeTracker, stoneDepth } from './bridges';

const blow = (point: Vec3): Blow => ({ tool: 'point', point, normal: [0, 0, 1], direction: [0, 0, -1], size: 0.02, stroke: 0 });
/** The floor reaches the block's foot from outside it. */
const FOOT = blow([0, 0.8, BLOCK_M.depth / 2]);
/** Over the middle of the block at head height: no deck reaches it, the head bridge is the nearest platform that does. */
const CROWN = blow([0, 4.5, 0]);
/** Behind the block's middle, over the floor's reach: the upper back bridge is the nearest platform that reaches it. */
const BACK = blow([0, 2.4, -0.3]);

const headBridge = BRIDGES.find((bridge) => bridge.id === 'head-bridge');
if (headBridge === undefined) throw new Error('the scaffold has no head bridge');
/** Stone where the uncarved block stands. */
const block = (_x: number, _y: number, z: number): number => z - BLOCK_M.depth / 2;

describe('bridgeFor', () => {
  it('names no bridge for a blow the floor or a deck reaches, else the nearest platform that reaches it', () => {
    expect(bridgeFor(FOOT)).toBeNull();
    expect(bridgeFor(CROWN)).toBe('head-bridge');
    expect(bridgeFor(BACK)).toBe('back-bridge-3.2');
  });
});

describe('stoneDepth', () => {
  it('is zero for clear planks and the deepest stone inside them otherwise', () => {
    expect(stoneDepth(headBridge, () => 1)).toBe(0);
    // The head bridge's near edge lies inside the uncarved block's front face.
    expect(stoneDepth(headBridge, block)).toBeCloseTo(BLOCK_M.depth / 2 - headBridge.zMin, 6);
  });
});

/** A stand-in making: three steps, the second needing the head bridge and the third the upper back bridge; stone fills the block until `carvedAt` blows are applied. */
function source(options: { planned: number; applied: number; carvedAt: number }): BridgeSource & { planned: number; applied: number } {
  const plans: readonly (readonly Blow[])[] = [[FOOT], [FOOT, CROWN], [BACK]];
  const state = {
    N: plans.length,
    planned: options.planned,
    applied: options.applied,
    blowsOf: (step: number): readonly Blow[] => (step < state.planned ? (plans[step] ?? []) : []),
    get blowsApplied() {
      return state.applied;
    },
    sampleStock: (x: number, y: number, z: number): number => (state.applied >= options.carvedAt ? 1 : block(x, y, z)),
    stepId: (step: number) => ['foot', 'crown', 'back'][step] ?? String(step),
  };
  return state;
}

describe('createBridgeTracker', () => {
  it('lays a bridge once the position is inside the first step that needs it, and takes it up going back', () => {
    const making = source({ planned: 3, applied: 100, carvedAt: 0 });
    const tracker = createBridgeTracker(making);
    expect(tracker.update(0).laid).toEqual([]);
    expect(tracker.update(1).laid).toEqual([]);
    expect(tracker.update(1.01).laid).toEqual(['head-bridge']);
    expect(tracker.update(2).laid).toEqual(['head-bridge']);
    expect(tracker.update(2.5).laid).toEqual(['head-bridge', 'back-bridge-3.2']);
    expect(tracker.update(0.5).laid).toEqual([]);
    expect(tracker.update(3).problems).toEqual([]);
  });

  it('lays nothing for a step not planned yet', () => {
    const making = source({ planned: 1, applied: 100, carvedAt: 0 });
    const tracker = createBridgeTracker(making);
    expect(tracker.update(1.5).laid).toEqual([]);
    making.planned = 2;
    expect(tracker.update(1.5).laid).toEqual(['head-bridge']);
  });

  it('keeps a needed bridge hidden while stone fills its box and reports the step and depth once, then lays it when the box is clear', () => {
    const making = source({ planned: 3, applied: 5, carvedAt: 10 });
    const tracker = createBridgeTracker(making);
    const blocked = tracker.update(1.5);
    expect(blocked.laid).toEqual([]);
    expect(blocked.problems).toEqual(["head-bridge is needed from step 2 (crown), but stone fills its planks' box up to 17.0 cm deep there (5 blows applied); it stays hidden until the box is clear."]);
    expect(tracker.update(1.6).problems).toHaveLength(1);
    making.applied = 12;
    expect(tracker.update(1.7).laid).toEqual(['head-bridge']);
    making.applied = 6;
    expect(tracker.update(1.55).laid).toEqual([]);
  });
});
