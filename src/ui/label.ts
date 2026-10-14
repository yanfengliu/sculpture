/**
 * The timeline label (docs/design/spec.md, Page): `Day d · <date> · <stage> — <title>` from the step's calendar, with the detail line beneath naming the tool and the real blows each shown blow stands for.
 * Pure string functions, unit-tested in label.test.ts. Day 1 is 9 September 1501, the first chisel blows (the nodo; docs/research/technique.md, The record that anchors the timeline), so the formal start of 13 September is Day 5; the date within a step is interpolated over its calendar span by the step's local progress.
 * Dates are the ISO strings of the choreography, taken as calendar days; day counts use UTC arithmetic, which agrees with the Julian calendar's day counts between 1501 and 1504 (no Gregorian century exception falls in the span).
 */
import type { StepInfo } from '../contracts/making';
import type { ToolNames } from '../viewer/bundle';

export const CALENDAR_START = '1501-09-09';
export const CALENDAR_END = '1504-09-08';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86_400_000;

function parseIso(iso: string): { year: number; month: number; day: number } {
  const match = /^(-?\d{1,4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (match === null) throw new Error(`calendar date ${JSON.stringify(iso)} is not YYYY-MM-DD, which the step calendar takes`);
  const [, year = '0', month = '1', day = '1'] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function toUtc(iso: string): number {
  const { year, month, day } = parseIso(iso);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function fromUtc(ms: number): string {
  const date = new Date(ms);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Whole days from `fromIso` to `toIso`; negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
}

/** Day 1 is the calendar start. */
export function dayNumber(iso: string): number {
  return daysBetween(CALENDAR_START, iso) + 1;
}

/** The ISO date at local progress `f` in `[0, 1]` through the span, rounded down to a whole day. */
export function dateAt(calendar: StepInfo['calendar'], f: number): string {
  const span = daysBetween(calendar.from, calendar.to);
  const progress = Math.min(1, Math.max(0, f));
  return fromUtc(toUtc(calendar.from) + Math.floor(progress * span) * DAY_MS);
}

/** `13 September 1501`. */
export function formatDate(iso: string): string {
  const { year, month, day } = parseIso(iso);
  return `${String(day)} ${MONTHS[month - 1] ?? '?'} ${String(year)}`;
}

/** `Day d · <date> · <stage> — <title>`. */
export function formatLabel(step: Pick<StepInfo, 'title' | 'calendar'>, stageTitle: string, f: number): string {
  const date = dateAt(step.calendar, f);
  return `Day ${String(dayNumber(date))} · ${formatDate(date)} · ${stageTitle} — ${step.title}`;
}

function blows(count: number): string {
  return count === 1 ? 'one real blow' : `${String(count)} real blows`;
}

/** The detail line: the tool's names and the real blows one shown blow stands for first, then the step's detail, so the bar's one-line clip (src/ui/style.css, `.detail`) cuts the citation's tail and never the tool or the figure. */
export function formatDetail(step: Pick<StepInfo, 'detail' | 'blowsPerShown'>, names: ToolNames): string {
  return `${names.italian} (${names.english}); each shown blow stands for ${blows(step.blowsPerShown)}. ${step.detail}`;
}

/** The footer's time-lapse statement (docs/research/decisions.md, Time and scale). */
export const TIME_LAPSE_STATEMENT = `Time-lapse: the making from ${formatDate(CALENDAR_START)} to ${formatDate(CALENDAR_END)} passes in about five minutes at 1×; each shown blow stands for the real blows its step records.`;
