/**
 * The query contract's parser (docs/design/spec.md, Query contract), on strings only: no browser, no `location`.
 * Bound: it pins what each parameter parses to and what a bad value does; whether the page then honours the value is the e2e suite's job.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL, parseViewerQuery } from './query';

describe('parseViewerQuery', () => {
  it('gives the defaults for an empty query: play on load, david, nothing else', () => {
    expect(parseViewerQuery('')).toEqual({
      shot: false,
      view: null,
      cam: null,
      autoplay: true,
      noui: false,
      model: 'david',
      finish: false,
      t: null,
      step: null,
      problems: [],
    });
    expect(DEFAULT_MODEL).toBe('david');
  });

  it('reads the flags, with and without the leading question mark', () => {
    expect(parseViewerQuery('?shot=1&noui=1&finish=1')).toMatchObject({ shot: true, noui: true, finish: true });
    expect(parseViewerQuery('shot=1')).toMatchObject({ shot: true });
    expect(parseViewerQuery('shot=0&noui=0&finish=0')).toMatchObject({ shot: false, noui: false, finish: false, problems: [] });
  });

  it('switches autoplay off for autoplay=0 and for every shot', () => {
    expect(parseViewerQuery('autoplay=0').autoplay).toBe(false);
    expect(parseViewerQuery('autoplay=1').autoplay).toBe(true);
    expect(parseViewerQuery('shot=1').autoplay).toBe(false);
    expect(parseViewerQuery('shot=1&autoplay=1').autoplay).toBe(false);
  });

  it('parses cam into a position and a target in metres', () => {
    expect(parseViewerQuery('cam=7,4.5,10,0,2.75,0').cam).toEqual({ position: [7, 4.5, 10], target: [0, 2.75, 0] });
    expect(parseViewerQuery('cam=-1,2e1,0.5,0,0,-3').cam).toEqual({ position: [-1, 20, 0.5], target: [0, 0, -3] });
  });

  it.each(['1,2,3', '1,2,3,4,5,6,7', '1,2,x,4,5,6', '1,2,,4,5,6', ''])('drops cam=%s and names the accepted shape', (value) => {
    const query = parseViewerQuery(`cam=${value}`);
    expect(query.cam).toBeNull();
    expect(query.problems).toEqual([`query parameter cam=${JSON.stringify(value)} was ignored: it takes six finite numbers px,py,pz,tx,ty,tz in metres.`]);
  });

  it('keeps view and model as the page owner expects them', () => {
    expect(parseViewerQuery('view=three-quarter').view).toBe('three-quarter');
    expect(parseViewerQuery('view=').view).toBeNull();
    expect(parseViewerQuery('model=synthetic').model).toBe('synthetic');
    expect(parseViewerQuery('model=david').model).toBe('david');
    const bad = parseViewerQuery('model=bronze');
    expect(bad.model).toBe('david');
    expect(bad.problems).toEqual(['query parameter model="bronze" was ignored: it takes david or synthetic.']);
  });

  it('parses t as a finite position at or above 0 and rejects the rest', () => {
    expect(parseViewerQuery('t=0').t).toBe(0);
    expect(parseViewerQuery('t=3.25').t).toBe(3.25);
    for (const value of ['-1', 'abc', 'Infinity', 'NaN', '']) {
      const query = parseViewerQuery(`t=${value}`);
      expect(query.t).toBeNull();
      expect(query.problems).toEqual([`query parameter t=${JSON.stringify(value)} was ignored: it takes a finite number at or above 0.`]);
    }
  });

  it('parses step as a 1-based index when all digits, else as an id', () => {
    expect(parseViewerQuery('step=12').step).toEqual({ kind: 'index', index: 12 });
    expect(parseViewerQuery('step=rough-torso').step).toEqual({ kind: 'id', id: 'rough-torso' });
    expect(parseViewerQuery('step=0').step).toEqual({ kind: 'id', id: '0' });
    expect(parseViewerQuery('step=').step).toBeNull();
  });

  it('names every bad flag value and keeps the default', () => {
    const query = parseViewerQuery('shot=yes&noui=true');
    expect(query).toMatchObject({ shot: false, noui: false });
    expect(query.problems).toEqual([
      'query parameter shot="yes" was ignored: it takes 1 or 0.',
      'query parameter noui="true" was ignored: it takes 1 or 0.',
    ]);
  });
});
