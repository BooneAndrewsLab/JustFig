import { writeFileSync } from 'node:fs';
import fc from 'fast-check';
import * as UTIF from 'utif';
import { describe, expect, it } from 'vitest';

import { encodeTiff, lzwEncode } from './tiff';

function decode(tiff: Uint8Array) {
  const ifds = UTIF.decode(tiff);
  const ifd = ifds[0];
  if (!ifd) throw new Error('no IFD');
  UTIF.decodeImage(tiff, ifd);
  return { ifd, rgba: UTIF.toRGBA8(ifd) };
}

const image = (w: number, h: number, f: (x: number, y: number, c: number) => number) => {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1)
      for (let c = 0; c < 4; c += 1) px[(y * w + x) * 4 + c] = f(x, y, c);
  return px;
};

let oracleCount = 0;

describe('TIFF writer', () => {
  // libtiff is the second oracle: scripts/oracle/check_tiff_roundtrip.py
  // reads what TIFF_ORACLE_DIR collects through Pillow.
  it('round-trips RGBA and RGB pixels through UTIF', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.boolean(),
        fc.integer(),
        (w, h, alpha, seed) => {
          let s = seed;
          const dir = process.env['TIFF_ORACLE_DIR'];
          const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) | 0) >>> 16) & 0xff;
          const px = image(w, h, (_x, _y, c) =>
            c === 3 && !alpha ? 255 : rnd() < 128 ? rnd() : 40,
          );
          const tiff = encodeTiff(px, { width: w, height: h, dpi: 300, alpha });
          if (dir) {
            oracleCount += 1;
            writeFileSync(`${dir}/${String(oracleCount)}.tif`, tiff);
            writeFileSync(`${dir}/${String(oracleCount)}.raw`, px);
          }
          const { rgba, ifd } = decode(tiff);
          expect(ifd.width).toBe(w);
          expect(ifd.height).toBe(h);
          expect(Array.from(rgba)).toEqual(Array.from(px));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('writes the resolution in inches', () => {
    const tiff = encodeTiff(
      image(4, 4, () => 200),
      { width: 4, height: 4, dpi: 600, alpha: false, software: 'test' },
    );
    const ifd = UTIF.decode(tiff)[0];
    expect(ifd?.['t282']).toEqual([600]);
    expect(ifd?.['t283']).toEqual([600]);
    expect(ifd?.['t296']).toEqual([2]);
    expect(ifd?.['t259']).toEqual([5]);
    expect(ifd?.['t317']).toEqual([2]);
    expect(ifd?.['t305']).toEqual(['test']);
  });

  it('compresses a figure-like image well and survives table resets', () => {
    const w = 1200;
    const h = 800;
    // Mostly white with bands: what a figure looks like.
    const px = image(w, h, (x, y, c) =>
      c === 3 ? 255 : (x >> 5) % 7 === 0 && y % 50 < 30 ? (x * 3 + c * 70) & 255 : 255,
    );
    const tiff = encodeTiff(px, { width: w, height: h, dpi: 300, alpha: true });
    expect(tiff.length).toBeLessThan(px.length / 10);
    expect(Buffer.compare(Buffer.from(decode(tiff).rgba), Buffer.from(px))).toBe(0);
    if (process.env['TIFF_OUT']) writeFileSync(process.env['TIFF_OUT'], tiff);
  });

  it('encodes incompressible data past the 4094-code table limit', () => {
    let s = 7;
    const data = Uint8Array.from(
      { length: 50_000 },
      () => ((s = (Math.imul(s, 1103515245) + 12345) | 0) >>> 16) & 0xff,
    );
    const out = lzwEncode(data);
    expect(out.length).toBeGreaterThan(data.length);
    const w = 100;
    const px = new Uint8Array(w * 125 * 4);
    px.set(data.subarray(0, px.length));
    const back = decode(encodeTiff(px, { width: w, height: 125, dpi: 72, alpha: true })).rgba;
    expect(Buffer.compare(Buffer.from(back), Buffer.from(px))).toBe(0);
  });
});
