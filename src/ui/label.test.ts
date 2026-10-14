/**
 * The label's string functions (src/ui/label.ts) on fixed steps: no DOM, no making.
 * Bound: it pins the day count from 9 September 1501, the date interpolation within a step, the label and detail formats; whether the page shows them belongs to the e2e suite.
 */
import { describe, expect, it } from 'vitest';

import { CALENDAR_END, CALENDAR_START, TIME_LAPSE_STATEMENT, dateAt, dayNumber, daysBetween, formatDate, formatDetail, formatLabel, formatYears } from './label';

const STEP = { title: 'Roughing the front with the point', detail: 'The point opens the front face (technique.md, stage 2).', calendar: { from: '1501-09-18', to: '1502-01-08' }, blowsPerShown: 40 };

describe('calendar arithmetic', () => {
  it('counts days across a year end and backwards', () => {
    expect(daysBetween('1501-09-13', '1501-09-13')).toBe(0);
    expect(daysBetween('1501-09-13', '1501-09-14')).toBe(1);
    expect(daysBetween('1501-12-31', '1502-01-01')).toBe(1);
    expect(daysBetween('1501-09-13', '1502-02-28')).toBe(168);
    // technique.md says 697 for this span; the exclusive count is 696 (365 + 365 − 34), so the note counts both ends.
    expect(daysBetween('1502-02-28', '1504-01-25')).toBe(696);
    expect(daysBetween('1501-09-14', '1501-09-13')).toBe(-1);
  });

  it('numbers 9 September 1501 as day 1, the formal start of 13 September as day 5 and the unveiling as day 1096', () => {
    expect(dayNumber(CALENDAR_START)).toBe(1);
    expect(dayNumber('1501-09-13')).toBe(5);
    expect(dayNumber(CALENDAR_END)).toBe(1096);
  });

  it('interpolates the date over the step span by local progress, rounding down to whole days', () => {
    expect(dateAt(STEP.calendar, 0)).toBe('1501-09-18');
    expect(dateAt(STEP.calendar, 1)).toBe('1502-01-08');
    expect(dateAt(STEP.calendar, 0.5)).toBe('1501-11-13');
    expect(dateAt(STEP.calendar, 0.004)).toBe('1501-09-18');
    expect(dateAt(STEP.calendar, -1)).toBe('1501-09-18');
    expect(dateAt(STEP.calendar, 2)).toBe('1502-01-08');
  });

  it('formats dates in words and rejects a malformed one by name', () => {
    expect(formatDate('1501-09-13')).toBe('13 September 1501');
    expect(formatDate('1504-01-05')).toBe('5 January 1504');
    expect(() => formatDate('13/09/1501')).toThrow('calendar date "13/09/1501" is not YYYY-MM-DD');
  });
});

describe('label and detail', () => {
  it('writes Day d · date · stage — title', () => {
    expect(formatLabel(STEP, 'Roughing', 0)).toBe('Day 10 · 18 September 1501 · Roughing — Roughing the front with the point');
    expect(formatLabel(STEP, 'Roughing', 1)).toBe('Day 122 · 8 January 1502 · Roughing — Roughing the front with the point');
  });

  it('writes the years instead of a day count for a step that starts before the calendar start, at any progress', () => {
    const agostino = { title: "Agostino's roughing of the legs", calendar: { from: '1464-08-18', to: '1466-04-02' } };
    for (const f of [0, 0.5, 1]) expect(formatLabel(agostino, 'The stock and its support', f)).toBe("1464–1466 · The stock and its support — Agostino's roughing of the legs");
    expect(formatYears({ from: '1464-01-01', to: '1464-12-31' })).toBe('1464');
    // The day before the calendar start has no day number either; the start itself is Day 1.
    expect(formatLabel({ ...agostino, calendar: { from: '1501-09-08', to: '1501-09-08' } }, 'Setup', 0)).toBe("1501 · Setup — Agostino's roughing of the legs");
    expect(formatLabel({ ...agostino, calendar: { from: CALENDAR_START, to: '1501-09-13' } }, 'Setup', 0)).toBe("Day 1 · 9 September 1501 · Setup — Agostino's roughing of the legs");
  });

  it('writes the detail with the tool names and the blows per shown blow first, singular and plural, then the step detail', () => {
    expect(formatDetail(STEP, { italian: 'subbia', english: 'point' })).toBe('subbia (point); each shown blow stands for 40 real blows. The point opens the front face (technique.md, stage 2).');
    expect(formatDetail({ ...STEP, blowsPerShown: 1 }, { italian: 'carbone', english: 'charcoal' })).toMatch(/^carbone \(charcoal\); each shown blow stands for one real blow\. /);
  });

  it('states the time-lapse with both ends of the calendar', () => {
    expect(TIME_LAPSE_STATEMENT).toContain('9 September 1501');
    expect(TIME_LAPSE_STATEMENT).toContain('8 September 1504');
    expect(TIME_LAPSE_STATEMENT).toContain('five minutes');
  });
});
