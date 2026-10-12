import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { hexToHsv, hsvToHex, normalizeHex } from './hsv';

describe('hsv', () => {
  it('knows the primaries', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00')?.h).toBeCloseTo(120);
    expect(hexToHsv('#0000ff')?.h).toBeCloseTo(240);
    expect(hexToHsv('#808080')?.s).toBe(0);
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('round-trips every hex colour', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffff }), (n) => {
        const hex = `#${n.toString(16).padStart(6, '0')}`;
        const hsv = hexToHsv(hex);
        expect(hsv && hsvToHex(hsv)).toBe(hex);
      }),
    );
  });

  it('normalises typed hex', () => {
    expect(normalizeHex('#0AF')).toBe('#00aaff');
    expect(normalizeHex(' 00AAFF ')).toBe('#00aaff');
    expect(normalizeHex('#00aa')).toBeNull();
    expect(normalizeHex('zzzzzz')).toBeNull();
  });
});
