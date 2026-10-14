/**
 * Step definitions as the Making takes them in (docs/design/spec.md, Blows, strokes and steps): the checks on a `StepDef` list and the `StepInfo` the page reads, carried out of src/timeline/making.ts so that file keeps to its line bound.
 */
import { type StepDef, type StepInfo, WORK_HOURS_PER_DAY } from '../contracts/making';

const TITLE_LIMIT = 48;
const DETAIL_LIMIT = 200;

/** Throws on a step id that is not kebab-case or is used twice, a title or detail over its limit, a weight or rate that is not positive, a direct count that is not a whole number of at least 1, or a calendar date that does not parse. */
export function checkSteps(steps: readonly StepDef[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(step.id)) throw new Error(`step id "${step.id}" is not kebab-case`);
    if (seen.has(step.id)) throw new Error(`step id "${step.id}" is used twice`);
    seen.add(step.id);
    if (step.title.length > TITLE_LIMIT) throw new Error(`step "${step.id}" has a title of ${String(step.title.length)} characters; the limit is ${String(TITLE_LIMIT)}`);
    if (step.detail.length > DETAIL_LIMIT) throw new Error(`step "${step.id}" has a detail of ${String(step.detail.length)} characters; the limit is ${String(DETAIL_LIMIT)}`);
    if (!(step.weight > 0)) throw new Error(`step "${step.id}" needs a positive weight`);
    if (!(step.rate > 0) || !Number.isFinite(step.rate)) throw new Error(`step "${step.id}" has a rate of ${String(step.rate)} real blows a second; give a positive number (docs/research/decisions.md, the real-blows rule)`);
    if (step.realPerShown !== undefined && !(Number.isInteger(step.realPerShown) && step.realPerShown >= 1)) throw new Error(`step "${step.id}" gives ${String(step.realPerShown)} real blows per shown blow; a direct count is a whole number of at least 1`);
    if (!Number.isFinite(Date.parse(step.calendar.from)) || !Number.isFinite(Date.parse(step.calendar.to))) throw new Error(`step "${step.id}" has the calendar ${step.calendar.from} to ${step.calendar.to}; give ISO dates (YYYY-MM-DD)`);
  }
}

/** Days a calendar span covers, at least one (a step dated on a single day is a day's work). */
export function calendarDays(calendar: StepDef['calendar']): number {
  return Math.max(1, Math.round((Date.parse(calendar.to) - Date.parse(calendar.from)) / 86_400_000));
}

/** Real blows one shown blow stands for (docs/research/decisions.md, the real-blows rule): the step's direct count when it gives one, else its days × WORK_HOURS_PER_DAY × 3600 s × its rate ÷ the planned blows, rounded, at least 1; 0 for a step with no planned blows yet. */
export function realBlowsPerShown(step: StepDef, plannedBlows: number): number {
  if (step.realPerShown !== undefined) return step.realPerShown;
  if (plannedBlows <= 0) return 0;
  return Math.max(1, Math.round((calendarDays(step.calendar) * WORK_HOURS_PER_DAY * 3600 * step.rate) / plannedBlows));
}

/** The step's info with its blow range; `blowCount` is the planned count (0 before planning), from which the real blows per shown blow are computed. */
export function stepInfo(step: StepDef, firstBlow: number, blowCount: number): StepInfo {
  return {
    id: step.id,
    stage: step.stage,
    title: step.title,
    detail: step.detail,
    tool: step.tool,
    blowsPerShown: realBlowsPerShown(step, blowCount),
    weight: step.weight,
    calendar: step.calendar,
    ...(step.focus === undefined ? {} : { focus: step.focus }),
    firstBlow,
    blowCount,
  };
}
