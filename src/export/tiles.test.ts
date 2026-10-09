import fc from 'fast-check';
import * as UTIF from 'utif';
import { describe, expect, it } from 'vitest';

import { decodePng } from '@/io/png';

import { PngWriter, readChunks, readDpi } from './png';
import { encodeTiff, TiffWriter } from './tiff';
import { MAX_SIDE, MAX_TOTAL_PIXELS, maxDpiForSize, planBands, rasterLimit } from './tiles';

const image = (w: number, h: number, seed: number, alpha: boolean) => {
  let s = seed;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < px.length; i += 1) {
    s = (Math.imul(s, 1103515245) + 12345) | 0;
    // Mostly flat runs with some noise, like a figure.
    px[i] =
      i % 4 === 3
        ? alpha
          ? (s >>> 16) & 0xff
          : 255
        : (s >>> 20) & 0x3
          ? (i >> 6) & 0xff
          : (s >>> 16) & 0xff;
  }
  return px;
};

/** Pushes the image through a writer in the bands planBands makes under a tiny cap. */
async function banded(
  px: Uint8Array,
  w: number,
  h: number,
  cap: number,
  push: (b: Uint8Array) => void | Promise<void>,
) {
  for (const b of planBands(w, h, cap))
    await push(px.subarray(b.y0 * w * 4, (b.y0 + b.rows) * w * 4));
}

describe('planBands', () => {
  it('covers every row once, each band within the cap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 5 }),
        (w, h, rowsWanted) => {
          const cap = w * rowsWanted;
          const bands = planBands(w, h, cap);
          let y = 0;
          for (const b of bands) {
            expect(b.y0).toBe(y);
            expect(b.rows).toBeGreaterThan(0);
            expect(b.rows * w).toBeLessThanOrEqual(cap);
            y += b.rows;
          }
          expect(y).toBe(h);
        },
      ),
    );
  });

  it('refuses a width no band can hold', () => {
    expect(() => planBands(100, 10, 50)).toThrow();
  });

  it('plans one band when the page fits', () => {
    expect(planBands(100, 100, 16_777_216)).toEqual([{ y0: 0, rows: 100 }]);
  });
});

describe('limits', () => {
  it('admits large pages and refuses absurd ones', () => {
    expect(rasterLimit(10_000, 10_000)).toBeNull();
    expect(rasterLimit(MAX_SIDE + 1, 10)).toBe('width');
    expect(rasterLimit(30_000, 30_000)).toBe('total');
    const dpi = maxDpiForSize(595, 842);
    const k = dpi / 72;
    expect(Math.round(595 * k) * Math.round(842 * k)).toBeLessThanOrEqual(MAX_TOTAL_PIXELS);
  });
});

describe('tiled TIFF', () => {
  it('is byte for byte the untiled file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 120 }),
        fc.integer({ min: 1, max: 7 }),
        fc.boolean(),
        fc.integer(),
        async (w, h, rowsWanted, alpha, seed) => {
          const px = image(w, h, seed, alpha);
          const opts = { width: w, height: h, dpi: 300, alpha, software: 't' };
          const t = new TiffWriter(opts);
          await banded(px, w, h, w * rowsWanted, (b) => {
            t.push(b);
          });
          expect(t.finish()).toEqual(encodeTiff(px, opts));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('decodes to the same pixels', async () => {
    const w = 37;
    const h = 53;
    const px = image(w, h, 7, true);
    const t = new TiffWriter({ width: w, height: h, dpi: 300, alpha: true });
    await banded(px, w, h, w * 4, (b) => {
      t.push(b);
    });
    const out = t.finish();
    const ifd = UTIF.decode(out)[0];
    if (!ifd) throw new Error('no IFD');
    UTIF.decodeImage(out, ifd);
    expect(Array.from(UTIF.toRGBA8(ifd))).toEqual(Array.from(px));
  });

  it('rejects a short image', () => {
    const t = new TiffWriter({ width: 4, height: 4, dpi: 72, alpha: false });
    t.push(new Uint8Array(4 * 4 * 2));
    expect(() => t.finish()).toThrow();
  });
});

describe('tiled PNG', () => {
  it('decodes to the same pixels whatever the bands', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 90 }),
        fc.integer({ min: 1, max: 7 }),
        fc.boolean(),
        fc.integer(),
        async (w, h, rowsWanted, alpha, seed) => {
          const px = image(w, h, seed, alpha);
          const opts = { width: w, height: h, dpi: 300, alpha, software: 'test 1' };
          const run = async (cap: number) => {
            const p = new PngWriter(opts);
            await banded(px, w, h, cap, (b) => p.push(b));
            return p.finish();
          };
          const a = decodePng(await run(w * rowsWanted));
          const b = decodePng(await run(w * h));
          if (!a || !b) throw new Error('not decodable');
          expect(a.width).toBe(w);
          expect(a.height).toBe(h);
          expect(a.data).toEqual(b.data);
          // And the pixels are the input's.
          const ch = alpha ? 4 : 3;
          for (let i = 0; i < w * h; i += 1)
            for (let c = 0; c < ch; c += 1) expect(a.data[i * ch + c]).toBe(px[i * 4 + c]);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('writes the resolution and the software chunk', async () => {
    const p = new PngWriter({ width: 2, height: 2, dpi: 600, alpha: false, software: 'S 1' });
    await p.push(new Uint8Array(16));
    const png = await p.finish();
    expect(readDpi(png)).toBe(600);
    const types = readChunks(png).map((c) => c.type);
    expect(types.slice(0, 3)).toEqual(['IHDR', 'pHYs', 'tEXt']);
    expect(types.at(-1)).toBe('IEND');
  });
});
