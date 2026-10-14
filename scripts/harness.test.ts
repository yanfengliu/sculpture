/**
 * Bound: `devPort` and `devOrigin` are checked on injected environments only; whether the port is free is the server's job, not this module's.
 */
import { describe, expect, it } from 'vitest';

import { BROWSER_ARGS, BROWSER_CHANNEL, DEFAULT_PORT, devOrigin, devPort } from './harness.mjs';

describe('devPort', () => {
  it('defaults to DEFAULT_PORT when SCULPTURE_PORT is unset, empty or blank, a port no sibling repo uses (met 5310, 3d-maker 5199)', () => {
    expect(devPort({})).toBe(DEFAULT_PORT);
    expect(devPort({ SCULPTURE_PORT: '' })).toBe(DEFAULT_PORT);
    expect(devPort({ SCULPTURE_PORT: '  ' })).toBe(DEFAULT_PORT);
    expect(devPort({ SCULPTURE_PORT: String(DEFAULT_PORT) })).toBe(DEFAULT_PORT);
    expect([5310, 5199]).not.toContain(DEFAULT_PORT);
  });

  it('reads a whole port number from 1024 to 65535', () => {
    expect(devPort({ SCULPTURE_PORT: '5182' })).toBe(5182);
    expect(devPort({ SCULPTURE_PORT: ' 5190 ' })).toBe(5190);
    expect(devPort({ SCULPTURE_PORT: '1024' })).toBe(1024);
    expect(devPort({ SCULPTURE_PORT: '65535' })).toBe(65535);
  });

  it.each(['abc', '5181.5', '-1', '80', '1023', '65536', '0x143D', '1e4', '51 81'])(
    'rejects %s and names the input and the accepted range',
    (value) => {
      expect(() => devPort({ SCULPTURE_PORT: value })).toThrow(
        new RegExp(`SCULPTURE_PORT must be a whole number from 1024 to 65535.*got "${value}"`),
      );
    },
  );
});

describe('devOrigin and the browser choice', () => {
  it('builds the loopback origin on the selected port', () => {
    expect(devOrigin({})).toBe('http://127.0.0.1:5181');
    expect(devOrigin({ SCULPTURE_PORT: '5182' })).toBe('http://127.0.0.1:5182');
  });

  it('runs on an installed branded browser, never a downloaded Chromium, with the software WebGL flag', () => {
    expect(['chrome', 'chrome-beta', 'msedge']).toContain(BROWSER_CHANNEL);
    expect(BROWSER_ARGS).toContain('--enable-unsafe-swiftshader');
  });
});
