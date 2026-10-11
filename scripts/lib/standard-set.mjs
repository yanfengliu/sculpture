/**
 * The standard capture set of docs/design/spec.md (Verification), built from the page's facts: every preset at the finished state, the front and three-quarter presets at each stage boundary, the follow view mid-blow for the first step of each tool that has blows, and the front at the finished state with the finish codes.
 * The facts must come from a page at `t = N`, where every step is planned: planning is lazy, so at `t = 0` later steps still report zero blows, and a follow shot built from a zero count asked for `t=Infinity` (the defect of 2026-10-11, pinned in standard-set.test.ts). A tool whose steps all have no blows gets no follow shot and a message naming the steps.
 * Pure: no browser, no file system; the caller turns each `{ name, view, params }` into a URL and a file.
 */

export const PRESETS = ['front', 'back', 'left', 'right', 'three-quarter', 'head', 'hands', 'sling-and-stump', 'free'];

/**
 * Builds the set from `facts` (`N`, `stages`, `stepIds`, `stepStages`, `stepTools`, `stepBlowCounts`).
 * Returns `{ shots, skipped }`: `shots` as `{ name, view, params }` in capture order, `skipped` as one message per tool without a follow shot.
 * Throws when the facts hold no steps or still hold an unplanned step (a blow count that is not a whole number at or above 0), naming the step.
 */
export function standardSet(facts) {
  const N = facts.N;
  if (!(Number.isInteger(N) && N > 0)) throw new Error(`the page published no steps (window.__sculpture.N is ${String(N)}), so the standard set cannot be built; pass SHOT_LIST for explicit shots.`);
  const counts = facts.stepBlowCounts ?? [];
  const bad = counts.findIndex((count) => !(Number.isInteger(count) && count >= 0));
  if (bad >= 0 || counts.length !== N) throw new Error(`the page published blow counts ${JSON.stringify(counts)} for ${String(N)} steps; the standard set needs one whole number per step, read at t=${String(N)} when every step is planned.`);
  const shots = PRESETS.map((preset) => ({ name: preset, view: preset, params: { t: N } }));
  shots.push({ name: 'front_finish', view: 'front', params: { t: N, finish: 1 } });
  for (const stage of facts.stages) {
    const first = facts.stepStages.indexOf(stage);
    if (first < 0) continue;
    for (const preset of ['front', 'three-quarter']) shots.push({ name: `${preset}_t-${String(first)}_${stage}`, view: preset, params: { t: first } });
  }
  const skipped = [];
  const seenTools = new Set();
  facts.stepTools.forEach((tool, index) => {
    if (seenTools.has(tool)) return;
    const withBlows = facts.stepTools.findIndex((other, i) => i >= index && other === tool && (counts[i] ?? 0) > 0);
    seenTools.add(tool);
    if (withBlows < 0) {
      const steps = facts.stepTools.flatMap((other, i) => (other === tool ? [facts.stepIds[i] ?? String(i)] : []));
      skipped.push(`no follow shot for ${tool}: its step${steps.length === 1 ? '' : 's'} ${steps.join(', ')} ${steps.length === 1 ? 'has' : 'have'} no blows.`);
      return;
    }
    const count = counts[withBlows];
    // Mid-cycle of the middle blow of the first step that uses the tool and has blows.
    const t = withBlows + (Math.floor(count / 2) + 0.5) / count;
    shots.push({ name: `follow_${tool}_t-${t.toFixed(4)}`, view: 'follow', params: { t: t.toFixed(4) } });
  });
  return { shots, skipped };
}
