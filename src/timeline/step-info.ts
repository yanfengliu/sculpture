/**
 * Step definitions as the Making takes them in (docs/design/spec.md, Blows, strokes and steps): the checks on a `StepDef` list and the `StepInfo` the page reads, carried out of src/timeline/making.ts so that file keeps to its line bound.
 */
import type { StepDef, StepInfo } from '../contracts/making';

const TITLE_LIMIT = 48;
const DETAIL_LIMIT = 200;

/** Throws on a step id that is not kebab-case or is used twice, a title or detail over its limit, or a weight that is not positive. */
export function checkSteps(steps: readonly StepDef[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(step.id)) throw new Error(`step id "${step.id}" is not kebab-case`);
    if (seen.has(step.id)) throw new Error(`step id "${step.id}" is used twice`);
    seen.add(step.id);
    if (step.title.length > TITLE_LIMIT) throw new Error(`step "${step.id}" has a title of ${String(step.title.length)} characters; the limit is ${String(TITLE_LIMIT)}`);
    if (step.detail.length > DETAIL_LIMIT) throw new Error(`step "${step.id}" has a detail of ${String(step.detail.length)} characters; the limit is ${String(DETAIL_LIMIT)}`);
    if (!(step.weight > 0)) throw new Error(`step "${step.id}" needs a positive weight`);
  }
}

/** The step's info with its blow range. */
export function stepInfo(step: StepDef, firstBlow: number, blowCount: number): StepInfo {
  return {
    id: step.id,
    stage: step.stage,
    title: step.title,
    detail: step.detail,
    tool: step.tool,
    blowsPerShown: step.blowsPerShown,
    weight: step.weight,
    calendar: step.calendar,
    ...(step.focus === undefined ? {} : { focus: step.focus }),
    firstBlow,
    blowCount,
  };
}
