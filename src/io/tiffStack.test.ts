/** What a TIFF states: pixel size from ImageJ, OME-XML and resolution tags; stacks and channels (#65, note 43). */
import { describe, expect, it } from 'vitest';

import { type TiffPageSpec, writeTiff } from '@/test/tiffWriter';

import { calibrationOf, omePage, parseImageJ, parseOme } from './tiffCalibration';
import { readTiffForImport } from './tiffStack';

const px = (n: number, k = 1): number[] => Array.from({ length: n }, (_, i) => (i * k) % 256);

const page = (over: Partial<TiffPageSpec> = {}): TiffPageSpec => {
  const base = { width: 6, height: 4, bits: 8 as const, samples: 1, ...over };
  return { values: px(base.width * base.height * base.samples), ...base };
};

const OME = (attrs: string): string =>
  `<?xml version="1.0"?><OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06"><Image ID="Image:0"><Pixels ID="Pixels:0" ${attrs}/></Image></OME>`;

describe('calibrationOf', () => {
  const meta = (m: object) => ({ resolutionUnit: 2, ...m });

  it('reads ImageJ unit=micron with the resolution in pixels per micron', () => {
    const c = calibrationOf(
      meta({ description: 'ImageJ=1.54f\nunit=micron\nspacing=0.5\n', xResolution: 15.3846 }),
    );
    expect(c?.source).toBe('imagej');
    expect(c?.pixelSize).toBeCloseTo(0.065, 4);
    expect(c?.notSquare).toBe(false);
  });

  it('reads other ImageJ units, and the escaped micro sign', () => {
    expect(
      calibrationOf(meta({ description: 'ImageJ=1\nunit=nm\n', xResolution: 0.01 }))?.pixelSize,
    ).toBeCloseTo(0.1, 9);
    expect(
      calibrationOf(meta({ description: 'ImageJ=1\nunit=\\u00B5m\n', xResolution: 10 }))?.pixelSize,
    ).toBeCloseTo(0.1, 9);
    expect(
      calibrationOf(meta({ description: 'ImageJ=1\nunit=mm\n', xResolution: 1000 }))?.pixelSize,
    ).toBeCloseTo(1, 9);
  });

  it('ignores ImageJ pixels (no unit) and a calibration out of the scale bar range', () => {
    expect(
      calibrationOf(meta({ description: 'ImageJ=1\nunit=pixel\n', xResolution: 1 })),
    ).toBeNull();
    expect(calibrationOf(meta({ description: 'ImageJ=1\nunit=m\n', xResolution: 1 }))).toBeNull();
  });

  it('reads OME PhysicalSizeX with its unit (default µm)', () => {
    const a = calibrationOf(meta({ description: OME('PhysicalSizeX="0.108" SizeX="6"') }));
    expect(a?.source).toBe('ome');
    expect(a?.pixelSize).toBeCloseTo(0.108, 9);
    const b = calibrationOf(
      meta({
        description: OME(
          'PhysicalSizeX="325" PhysicalSizeXUnit="nm" PhysicalSizeY="400" PhysicalSizeYUnit="nm"',
        ),
      }),
    );
    expect(b?.pixelSize).toBeCloseTo(0.325, 9);
    expect(b?.notSquare).toBe(true);
    expect(calibrationOf(meta({ description: OME('SizeX="6"') }))).toBeNull();
  });

  it('prefers OME over the resolution tags', () => {
    const c = calibrationOf(
      meta({ description: OME('PhysicalSizeX="0.2"'), xResolution: 100, resolutionUnit: 3 }),
    );
    expect(c?.pixelSize).toBeCloseTo(0.2, 9);
  });

  it('reads plain resolution in centimetres and inches, not at a default dpi', () => {
    expect(calibrationOf(meta({ xResolution: 100000, resolutionUnit: 3 }))?.pixelSize).toBeCloseTo(
      0.1,
      9,
    );
    expect(calibrationOf(meta({ xResolution: 2540, resolutionUnit: 2 }))?.pixelSize).toBeCloseTo(
      10,
      9,
    );
    expect(calibrationOf(meta({ xResolution: 72, resolutionUnit: 2 }))).toBeNull();
    expect(calibrationOf(meta({ xResolution: 300, resolutionUnit: 2 }))).toBeNull();
    expect(calibrationOf(meta({ xResolution: 5, resolutionUnit: 1 }))).toBeNull();
    expect(calibrationOf(meta({}))).toBeNull();
  });

  it('notes pixels that are not square', () => {
    const c = calibrationOf(meta({ xResolution: 100000, yResolution: 50000, resolutionUnit: 3 }));
    expect(c?.notSquare).toBe(true);
  });
});

describe('the descriptions', () => {
  it('parses ImageJ hyperstacks', () => {
    expect(
      parseImageJ('ImageJ=1.53t\nimages=12\nchannels=3\nslices=2\nframes=2\nunit=micron\n'),
    ).toEqual({
      images: 12,
      channels: 3,
      slices: 2,
      frames: 2,
      unit: 'micron',
    });
    expect(parseImageJ('something else')).toBeNull();
  });

  it('parses OME sizes and the plane of each channel', () => {
    const o = parseOme(OME('SizeC="3" SizeZ="4" SizeT="2" DimensionOrder="XYZCT"'));
    expect(o).toMatchObject({ sizeC: 3, sizeZ: 4, sizeT: 2, dimensionOrder: 'XYZCT' });
    if (!o) throw new Error('no OME');
    // XYZCT: Z is fastest, then C.
    expect([0, 1, 2].map((c) => omePage(o, c))).toEqual([0, 4, 8]);
    const f = parseOme(OME('SizeC="3" SizeZ="4" DimensionOrder="XYCZT"'));
    expect([0, 1, 2].map((c) => (f ? omePage(f, c) : -1))).toEqual([0, 1, 2]);
    expect(parseOme('ImageJ=1')).toBeNull();
  });
});

describe('readTiffForImport', () => {
  it('one 8-bit picture with its pixel size', () => {
    const d = readTiffForImport(
      writeTiff({
        pages: [
          page({ description: 'ImageJ=1.54f\nunit=micron\n', xResolution: 10, yResolution: 10 }),
        ],
      }),
    );
    expect(d.channels).toBe(false);
    expect(d.images).toHaveLength(1);
    expect(d.pixelSize).toBeCloseTo(0.1, 3);
    expect(d.warnings).toEqual([]);
  });

  it('an ImageJ stack kept in one IFD, as channels', () => {
    const pages = [0, 1, 2].map((c) =>
      page({ bits: 16, values: Array.from({ length: 24 }, (_, i) => c * 1000 + i) }),
    );
    const d = readTiffForImport(
      writeTiff({
        imageJStack: true,
        littleEndian: false,
        pages: pages.map((p, i) =>
          i === 0
            ? {
                ...p,
                description: 'ImageJ=1.54f\nimages=3\nchannels=3\nunit=micron\n',
                xResolution: 4,
              }
            : p,
        ),
      }),
    );
    expect(d.channels).toBe(true);
    expect(d.images.map((i) => Array.from(i.data)[5])).toEqual([5, 1005, 2005]);
    expect(d.pixelSize).toBeCloseTo(0.25, 3);
  });

  it('an ImageJ hyperstack takes the first slice of each channel and says so', () => {
    const pages = Array.from({ length: 6 }, (_, k) => page({ values: px(24).map((v) => v + k) }));
    const d = readTiffForImport(
      writeTiff({
        pages: pages.map((p, i) =>
          i === 0
            ? {
                ...p,
                description: 'ImageJ=1.54f\nimages=6\nchannels=2\nslices=3\nhyperstack=true\n',
              }
            : p,
        ),
      }),
    );
    expect(d.channels).toBe(true);
    expect(d.images).toHaveLength(2);
    expect(Array.from(d.images[1]?.data ?? [])[0]).toBe(1);
    expect(d.warnings.join(' ')).toMatch(/first slice/);
  });

  it('OME-TIFF channels by dimension order', () => {
    const pages = Array.from({ length: 4 }, (_, k) =>
      page({ values: px(24).map((v) => (v + k * 10) % 256) }),
    );
    const d = readTiffForImport(
      writeTiff({
        pages: pages.map((p, i) =>
          i === 0
            ? {
                ...p,
                description: OME('SizeC="2" SizeZ="2" DimensionOrder="XYZCT" PhysicalSizeX="0.5"'),
              }
            : p,
        ),
      }),
    );
    expect(d.channels).toBe(true);
    // XYZCT: channel 1 starts at plane 2.
    expect(Array.from(d.images[1]?.data ?? [])[0]).toBe(20);
    expect(d.pixelSize).toBeCloseTo(0.5, 9);
  });

  it('planar RGB the description calls three channels', () => {
    const d = readTiffForImport(
      writeTiff({
        pages: [
          page({
            samples: 3,
            planar: true,
            description: 'ImageJ=1.54f\nchannels=3\nunit=micron\n',
            xResolution: 2,
          }),
        ],
      }),
    );
    expect(d.channels).toBe(true);
    expect(d.images).toHaveLength(3);
    expect(d.images.every((i) => i.channels === 1)).toBe(true);
    expect(Array.from(d.images[2]?.data ?? [])[0]).toBe(px(72)[2]);
  });

  it('plain RGB stays one colour picture', () => {
    const d = readTiffForImport(writeTiff({ pages: [page({ samples: 3 })] }));
    expect(d.channels).toBe(false);
    expect(d.images[0]?.channels).toBe(3);
  });

  it('a plain multi-page TIFF imports its first page and says so', () => {
    const d = readTiffForImport(writeTiff({ pages: [page(), page(), page()] }));
    expect(d.images).toHaveLength(1);
    expect(d.warnings.join(' ')).toMatch(/3 pages/);
  });

  it('a channel count the pages do not match falls back to the first page', () => {
    const d = readTiffForImport(
      writeTiff({ pages: [page({ description: 'ImageJ=1\nchannels=3\n' })] }),
    );
    expect(d.channels).toBe(false);
    expect(d.warnings.join(' ')).toMatch(/3 channels/);
  });
});
