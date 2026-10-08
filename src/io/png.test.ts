/** PNG encoding for pictures inside imported PDF plots (issue 24), checked by decoding with pngjs. */
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { base64, encodePng, filterRows, fromBase64, isOpaqueImage } from './png';

const gradient = (w: number, h: number, ch: 3 | 4) =>
  Uint8Array.from({ length: w * h * ch }, (_, i) =>
    ch === 4 && i % 4 === 3 ? (i * 13) % 256 : (i * 7 + Math.floor(i / (w * ch)) * 3) % 256,
  );

describe('png', () => {
  for (const ch of [3, 4] as const)
    it(`round-trips ${ch === 3 ? 'RGB' : 'RGBA'} pixels`, async () => {
      const data = gradient(17, 9, ch);
      const bytes = await encodePng({ width: 17, height: 9, channels: ch, data });
      const png = PNG.sync.read(Buffer.from(bytes));
      expect([png.width, png.height]).toEqual([17, 9]);
      const rgba = [...png.data];
      for (let p = 0; p < 17 * 9; p++)
        for (let c = 0; c < 4; c++) expect(rgba[p * 4 + c]).toBe(c < ch ? data[p * ch + c] : 255);
      expect(isOpaqueImage(bytes)).toBe(ch === 3);
    });

  it('filters smooth rows to small differences', () => {
    const data = Uint8Array.from({ length: 64 * 3 }, (_, i) => Math.floor(i / 3) * 4);
    const rows = filterRows({ width: 64, height: 1, channels: 3, data });
    expect(rows[0]).toBe(1); // Sub: each pixel minus the one before
    expect([...rows.subarray(4, 10)]).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it('tells opaque headers from see-through ones', () => {
    expect(isOpaqueImage(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(isOpaqueImage(Uint8Array.from([1, 2, 3]))).toBe(false);
    expect(fromBase64(base64(Uint8Array.from([0, 200, 255])))).toEqual(
      Uint8Array.from([0, 200, 255]),
    );
  });
});
