/**
 * Bound: the fetch script's pure parts only: the Commons API answer is parsed from a literal built here, the three recorded values are compared, the User-Agent names the repo without an address, and the SOURCE.json record carries every GridSource field. Nothing touches the network or the cache.
 */
import { describe, expect, it } from 'vitest';

import { RECORD, USER_AGENT, readImageInfo, recordDifferences, sourceRecord } from '../../fetch-model.mjs';

function answer(overrides: Partial<{ size: number; sha1: string; licence: string }> = {}) {
  const size = overrides.size ?? RECORD.size;
  const sha1 = overrides.sha1 ?? RECORD.sha1;
  const licence = overrides.licence ?? RECORD.licence;
  return {
    query: {
      pages: {
        '66868883': {
          imageinfo: [{ size, sha1, url: RECORD.fileUrl, timestamp: '2018-02-21T08:58:02Z', extmetadata: { LicenseShortName: { value: licence }, LicenseUrl: { value: RECORD.licenceUrl } } }],
        },
      },
    },
  };
}

describe('readImageInfo and recordDifferences', () => {
  it('reads size, SHA-1, URL, licence and licence URL from the API answer', () => {
    expect(readImageInfo(answer())).toEqual({ size: 59_997_484, sha1: '4d9648fad3882ea2fcb5c17232ef4826b23c045c', url: RECORD.fileUrl, licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', timestamp: '2018-02-21T08:58:02Z' });
    expect(recordDifferences(readImageInfo(answer()))).toEqual([]);
  });

  it('names each recorded value that differs', () => {
    const problems = recordDifferences(readImageInfo(answer({ size: 1, sha1: 'ffff', licence: 'CC0' })));
    expect(problems).toEqual([
      'size is 1 bytes, the note recorded 59997484',
      'SHA-1 is ffff, the note recorded 4d9648fad3882ea2fcb5c17232ef4826b23c045c',
      'licence short name is "CC0", the note recorded "CC BY-SA 4.0"',
    ]);
    expect(recordDifferences(readImageInfo(answer({ licence: 'CC BY-SA 3.0' })))).toHaveLength(1);
  });

  it('throws when the answer has no imageinfo', () => {
    expect(() => readImageInfo({ query: { pages: { '-1': { missing: '' } } } })).toThrow(/no imageinfo/);
  });
});

describe('USER_AGENT and sourceRecord', () => {
  it('names the repo and carries no address', () => {
    expect(USER_AGENT).toMatch(/^sculpture-model-pipeline\/\d+\.\d+ \(https:\/\/github\.com\/[^)]+\/sculpture\)$/);
    expect(USER_AGENT).not.toContain('@');
  });

  it('fills every GridSource field plus the size and the page', () => {
    const record = sourceRecord(RECORD.sha1, '2026-10-11T08:11:02.211Z', readImageInfo(answer()));
    expect(Object.keys(record).sort()).toEqual(['attribution', 'author', 'fetchedAt', 'licence', 'licenceUrl', 'pageUrl', 'sha1', 'size', 'title', 'url'].sort());
    expect(record.licence).toBe('CC BY-SA 4.0');
    expect(record.attribution).toContain('Scan the World');
    expect(record.attribution).toContain('CC BY-SA 4.0');
    expect(record.size).toBe(59_997_484);
    expect(sourceRecord('x', 't', undefined).licenceUrl).toBe(RECORD.licenceUrl);
  });
});
