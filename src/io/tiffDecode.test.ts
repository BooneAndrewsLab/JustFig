/** The TIFF reader (#65, note 43): every supported variant against a writer built for the test. */
import { describe, expect, it } from 'vitest';

import { type TiffPageSpec, writeTiff } from '@/test/tiffWriter';

import { TiffError, decodePage, decodeTiff, parseTiff } from './tiffDecode';

/** Deterministic samples with runs and noise, so LZW and the predictor have something to do. */
function samples(n: number, bits: 8 | 16, seed = 1): number[] {
  let s = seed;
  const max = bits === 8 ? 255 : 65535;
  return Array.from({ length: n }, (_, i) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return i % 7 < 3 ? (i * 5) % (max + 1) : s % (max + 1);
  });
}

const page = (over: Partial<TiffPageSpec> = {}): TiffPageSpec => {
  const base = { width: 17, height: 13, bits: 8 as const, samples: 1, ...over };
  return {
    values: samples(base.width * base.height * base.samples, base.bits),
    ...base,
  };
};

const rejects = (bytes: Uint8Array, message: RegExp): void => {
  expect(() => decodeTiff(bytes)).toThrow(TiffError);
  expect(() => decodeTiff(bytes)).toThrow(message);
};

describe('decodeTiff: every combination of what is supported', () => {
  const layouts: [string, Partial<TiffPageSpec>][] = [
    ['one strip', {}],
    ['strips of 4 rows', { rowsPerStrip: 4 }],
    ['strips of 1 row', { rowsPerStrip: 1 }],
    ['planar strips', { planar: true, rowsPerStrip: 5 }],
    ['tiles of 8 x 8', { tile: { w: 8, h: 8 } }],
    ['planar tiles', { planar: true, tile: { w: 16, h: 16 } }],
  ];
  for (const little of [true, false])
    for (const bits of [8, 16] as const)
      for (const samplesPer of [1, 3])
        for (const compression of [1, 5, 8, 32946])
          for (const predictor of [1, 2] as const)
            for (const [name, layout] of layouts) {
              if ((layout.planar ?? false) && samplesPer === 1) continue;
              const label = `${little ? 'little' : 'big'}-endian, ${String(bits)}-bit, ${String(samplesPer)} sample(s), compression ${String(compression)}, predictor ${String(predictor)}, ${name}`;
              it(label, () => {
                const spec = page({ bits, samples: samplesPer, compression, predictor, ...layout });
                const [img] = decodeTiff(writeTiff({ pages: [spec], littleEndian: little }));
                expect(img?.width).toBe(17);
                expect(img?.height).toBe(13);
                expect(img?.bits).toBe(bits);
                expect(img?.channels).toBe(samplesPer);
                expect(Array.from(img?.data ?? [])).toEqual(Array.from(spec.values));
              });
            }
});

describe('decodeTiff', () => {
  it('survives LZW tables that fill and clear (noise, 16-bit)', () => {
    const spec = page({ width: 120, height: 90, bits: 16, compression: 5, predictor: 2 });
    const [img] = decodeTiff(writeTiff({ pages: [spec] }));
    expect(Array.from(img?.data ?? [])).toEqual(Array.from(spec.values));
  });

  it('inverts WhiteIsZero', () => {
    const spec = page({ photometric: 0, width: 3, height: 1, values: [0, 100, 255] });
    const [img] = decodeTiff(writeTiff({ pages: [spec] }));
    expect(Array.from(img?.data ?? [])).toEqual([255, 155, 0]);
    const wide = page({ photometric: 0, bits: 16, width: 2, height: 1, values: [0, 65535] });
    expect(Array.from(decodeTiff(writeTiff({ pages: [wide] }))[0]?.data ?? [])).toEqual([65535, 0]);
  });

  it('drops an alpha sample', () => {
    const spec = page({ samples: 4, width: 2, height: 1, values: [1, 2, 3, 255, 4, 5, 6, 0] });
    const [img] = decodeTiff(writeTiff({ pages: [spec] }));
    expect(img?.channels).toBe(3);
    expect(Array.from(img?.data ?? [])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reads every page of the IFD chain and skips reduced-resolution copies', () => {
    const a = page({ values: samples(17 * 13, 8, 1) });
    const b = page({ bits: 16, compression: 8, values: samples(17 * 13, 16, 2) });
    const thumb = page({ width: 4, height: 3, thumbnail: true, values: samples(12, 8, 3) });
    const imgs = decodeTiff(writeTiff({ pages: [a, thumb, b], littleEndian: false }));
    expect(imgs).toHaveLength(2);
    expect(Array.from(imgs[0]?.data ?? [])).toEqual(Array.from(a.values));
    expect(imgs[1]?.bits).toBe(16);
    expect(Array.from(imgs[1]?.data ?? [])).toEqual(Array.from(b.values));
  });

  it('says what a page states about itself', () => {
    const spec = page({
      description: 'hello',
      xResolution: 300,
      yResolution: 150,
      resolutionUnit: 3,
    });
    const file = parseTiff(writeTiff({ pages: [spec] }));
    const meta = decodePage(file, 0).meta;
    expect(meta.description).toBe('hello');
    expect(meta.xResolution).toBeCloseTo(300, 2);
    expect(meta.yResolution).toBeCloseTo(150, 2);
    expect(meta.resolutionUnit).toBe(3);
  });

  describe('refuses what it cannot read, saying what', () => {
    it('JPEG inside TIFF', () => {
      rejects(writeTiff({ pages: [page({ compression: 7 })] }), /JPEG compression cannot/);
    });
    it('PackBits', () => {
      rejects(writeTiff({ pages: [page({ compression: 32773 })] }), /PackBits/);
    });
    it('a palette', () => {
      rejects(writeTiff({ pages: [page({ photometric: 3 })] }), /palette/);
    });
    it('CMYK', () => {
      rejects(writeTiff({ pages: [page({ photometric: 5, samples: 4 })] }), /CMYK/);
    });
    it('floating point', () => {
      rejects(writeTiff({ pages: [page({ sampleFormat: 3 })] }), /Floating-point/);
    });
    it('signed integers', () => {
      rejects(writeTiff({ pages: [page({ sampleFormat: 2 })] }), /Signed-integer/);
    });
    it('other bit depths', () => {
      const file = writeTiff({ pages: [page()] }).slice();
      // Patch BitsPerSample (tag 258) to 12.
      const v = new DataView(file.buffer);
      const ifd = v.getUint32(4, true);
      const n = v.getUint16(ifd, true);
      for (let i = 0; i < n; i++) {
        const o = ifd + 2 + i * 12;
        if (v.getUint16(o, true) === 258) v.setUint16(o + 8, 12, true);
      }
      rejects(file, /Only 8 and 16-bit.*12-bit/);
    });
    it('BigTIFF', () => {
      rejects(Uint8Array.from([0x49, 0x49, 43, 0, 8, 0, 0, 0, 0, 0, 0, 0]), /BigTIFF/);
    });
    it('a file that is not a TIFF', () => {
      rejects(new TextEncoder().encode('not a tiff at all'), /not a TIFF/);
    });
    it('a damaged file', () => {
      const bytes = writeTiff({ pages: [page({ compression: 8 })] });
      expect(() => decodeTiff(bytes.slice(0, 40))).toThrow(TiffError);
    });
  });
});
