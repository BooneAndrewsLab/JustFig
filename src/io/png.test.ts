/** PNG encoding for pictures inside imported PDF plots (issue 24), checked by decoding with pngjs. */
import fc from 'fast-check';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import {
  base64,
  decodePng,
  encodePng,
  encodePngSync,
  filterRows,
  fromBase64,
  isOpaqueImage,
} from './png';

/** The five-trial-rows filter chooser filterRow replaced (issue 60): the output must not change. */
function referenceFilter(width: number, height: number, bpp: number, data: Uint8Array) {
  const stride = width * bpp;
  const out = new Uint8Array(height * (stride + 1));
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    let best: number[] = [];
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const t: number[] = [];
      for (let i = 0; i < stride; i++) {
        const x = data[y * stride + i]!;
        const a = i >= bpp ? data[y * stride + i - bpp]! : 0;
        const b = y > 0 ? data[(y - 1) * stride + i]! : 0;
        const c = y > 0 && i >= bpp ? data[(y - 1) * stride + i - bpp]! : 0;
        const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]!;
        t.push((x - pred) & 0xff);
      }
      const sum = t.reduce((n, v) => n + (v < 128 ? v : 256 - v), 0);
      if (sum < bestSum) [bestSum, best] = [sum, [f, ...t]];
    }
    out.set(best, y * (stride + 1));
  }
  return out;
}

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

  it('chooses and applies the same filters as five trial rows did (issue 60)', () => {
    const used = new Set<number>();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom(3 as const, 4 as const),
        fc.integer(),
        (w, h, bpp, seed) => {
          let s = seed;
          // Runs, ramps and noise, so every filter wins somewhere.
          const data = Uint8Array.from({ length: w * h * bpp }, (_, i) => {
            s = (Math.imul(s, 1103515245) + 12345) | 0;
            const mode = (s >>> 28) & 3;
            return mode === 0 ? 200 : mode === 1 ? (i * 5) & 0xff : (s >>> 16) & 0xff;
          });
          const out = filterRows({ width: w, height: h, channels: bpp, data });
          expect(out).toEqual(referenceFilter(w, h, bpp, data));
          for (let y = 0; y < h; y++) used.add(out[y * (w * bpp + 1)]!);
        },
      ),
      { numRuns: 300 },
    );
    expect([...used].sort()).toEqual([0, 1, 2, 3, 4]); // every filter won somewhere
  });

  it('tells opaque headers from see-through ones', () => {
    expect(isOpaqueImage(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(isOpaqueImage(Uint8Array.from([1, 2, 3]))).toBe(false);
    expect(fromBase64(base64(Uint8Array.from([0, 200, 255])))).toEqual(
      Uint8Array.from([0, 200, 255]),
    );
  });

  it('encodes synchronously and decodes 8-bit PNGs of every colour type pngjs writes (issue 36)', () => {
    const data = gradient(13, 7, 4);
    const px = { width: 13, height: 7, channels: 4 as const, data };
    expect(decodePng(encodePngSync(px))).toEqual(px);
    const rgb = { width: 13, height: 7, channels: 3 as const, data: gradient(13, 7, 3) };
    expect(decodePng(encodePngSync(rgb))).toEqual(rgb);
    const src = new PNG({ width: 13, height: 7 });
    src.data = Buffer.from(data);
    for (const colorType of [0, 2, 4, 6] as const) {
      const bytes = PNG.sync.write(src, { colorType });
      const back = PNG.sync.read(bytes);
      const out = decodePng(new Uint8Array(bytes));
      expect(out?.channels).toBe(colorType >= 4 ? 4 : 3);
      for (let p = 0; p < 13 * 7; p++)
        for (let c = 0; c < (out?.channels ?? 0); c++)
          expect(out?.data[p * out.channels + c]).toBe(back.data[p * 4 + c]);
    }
    expect(decodePng(new Uint8Array(PNG.sync.write(src, { bitDepth: 16 })))).toBeNull();
    expect(decodePng(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
