/** TIFF micrographs as pictures (#65, note 43): 16-bit kept, calibration carried, stacks as channels. */
import { describe, expect, it } from 'vitest';

import { channelsOf } from '@/core/edits/channels';
import { addObjects } from '@/core/edits/edits';
import { setLevels } from '@/core/edits/levels';
import { placeImport } from '@/core/edits/placeImport';
import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Figure, Image, Procedural } from '@/core/model/types';
import { addScaleBar } from '@/procedural/edits';
import type { ScaleBarParams } from '@/procedural/kinds/scaleBar';
import { type TiffPageSpec, writeTiff } from '@/test/tiffWriter';

import { channelIntensities } from './channels';
import { importFile } from './import';
import { bakeLevels, levels16To8, levelsTable16, needsBake } from './levels';
import { decodeGrey16Png, decodePng, fromBase64 } from './png';
import { readJfig, writeJfig } from './jfig';

const tiffFile = (spec: Parameters<typeof writeTiff>[0], name = 'cells.tif'): File =>
  new File([writeTiff(spec) as BlobPart], name, { type: 'image/tiff' });

/** 12-bit-looking data: nothing above 4000. */
const dim = (n: number, k = 1): number[] =>
  Array.from({ length: n }, (_, i) => (i * 37 * k) % 4001);

const grey16 = (over: Partial<TiffPageSpec> = {}): TiffPageSpec => ({
  width: 8,
  height: 6,
  bits: 16,
  samples: 1,
  values: dim(48),
  ...over,
});

const place = async (
  file: File,
): Promise<{ fig: Figure; page: string; imp: Awaited<ReturnType<typeof importFile>> }> => {
  const imp = await importFile(file);
  if (!imp) throw new Error('not imported');
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const fig = placeImport(page.id, imp, { x: 200, y: 150 }).apply({ doc, assets: {} });
  return { fig, page: page.id, imp };
};

const pictures = (fig: Figure): Image[] =>
  (fig.doc.pages[0]?.layers[0]?.children ?? []).filter((o): o is Image => o.type === 'image');

describe('importing a TIFF', () => {
  it('stores an 8-bit grey picture as a grey PNG with its pixel size', async () => {
    const values = Array.from({ length: 48 }, (_, i) => i * 5);
    const imp = await importFile(
      tiffFile({
        pages: [
          {
            width: 8,
            height: 6,
            bits: 8,
            samples: 1,
            values,
            compression: 5,
            predictor: 2,
            description: 'ImageJ=1.54f\nunit=micron\n',
            xResolution: 10,
          },
        ],
      }),
    );
    expect(imp?.asset.kind).toBe('image');
    if (imp?.asset.kind !== 'image') return;
    expect(imp.asset.mime).toBe('image/png');
    expect(imp.asset.meta).toMatchObject({ name: 'cells.tif', width: 8, height: 6 });
    expect(imp.asset.meta.pixelSize).toBeCloseTo(0.1, 3);
    expect(imp.asset.meta.peak).toBeUndefined();
    expect(imp.base).toBeUndefined();
    const px = decodePng(fromBase64(imp.asset.dataBase64));
    expect(px?.channels).toBe(3);
    expect(Array.from({ length: 48 }, (_, i) => px?.data[i * 3])).toEqual(values);
  });

  it('keeps a 16-bit picture whole as the base of its levels', async () => {
    const { fig, imp } = await place(
      tiffFile({
        littleEndian: false,
        pages: [
          grey16({ description: 'ImageJ=1\nunit=micron\n', xResolution: 20, compression: 8 }),
        ],
      }),
    );
    if (!imp?.base || imp.asset.kind !== 'image') throw new Error('no 16-bit base');
    // The base is the 16-bit samples exactly, and says how bright it gets.
    const g = decodeGrey16Png(fromBase64(imp.base.asset.dataBase64));
    expect(Array.from(g?.values ?? [])).toEqual(dim(48));
    expect(imp.base.asset.meta.peak).toBe(Math.max(...dim(48)));
    expect(imp.base.asset.meta.pixelSize).toBeCloseTo(0.05, 3);
    // What is shown is that range stretched to 8 bits, brightest = white.
    const shown = decodePng(fromBase64(imp.asset.dataBase64));
    const peak = imp.base.asset.meta.peak ?? 1;
    expect(shown?.data[0]).toBe(Math.round(((dim(48)[0] ?? 0) * 255) / peak));
    expect(Math.max(...Array.from(shown?.data ?? []))).toBe(255);
    expect(imp.asset.meta.peak).toBeUndefined();
    expect(imp.asset.meta.pixelSize).toBeCloseTo(0.05, 3);
    // The picture's levels point at the base, so they stay editable.
    const [pic] = pictures(fig);
    expect(pic?.levels).toEqual({ min: 0, max: 255, invert: false, base: imp.base.hash });
    expect(fig.assets[imp.base.hash]).toBeDefined();
  });

  it('bakes 16-bit levels from the chosen black and white points over the full range', async () => {
    const { fig, page, imp } = await place(tiffFile({ pages: [grey16()] }));
    if (!imp?.base) throw new Error('no base');
    const peak = imp.base.asset.meta.peak ?? 1;
    const l = { min: 20, max: 200, invert: false };
    expect(needsBake(imp.base.asset, { min: 0, max: 255, invert: false })).toBe(true);
    const baked = await bakeLevels(imp.base.asset, l);
    const out = decodePng(fromBase64(baked.asset.dataBase64));
    const want = levels16To8(Uint16Array.from(dim(48)), peak, l);
    expect(Array.from({ length: 48 }, (_, i) => out?.data[i * 3])).toEqual(Array.from(want));
    // A table over 0..peak, not 0..65535: black at 20/255 of the picture's brightest.
    const t = levelsTable16(l, peak);
    expect(t[Math.floor((20 * peak) / 255)]).toBe(0);
    expect(t[Math.ceil((200 * peak) / 255)]).toBe(255);
    expect(baked.asset.meta.pixelSize).toBe(imp.base.asset.meta.pixelSize);
    // setLevels keeps the levels at the identity too: the 16-bit base is never shown.
    const [pic] = pictures(fig);
    if (!pic) throw new Error('no picture');
    const reset = await bakeLevels(imp.base.asset, { min: 0, max: 255, invert: false });
    const edited = setLevels(page as never, pic.id, l, { adjusted: baked }).apply(fig);
    const back = setLevels(
      page as never,
      pic.id,
      { min: 0, max: 255, invert: false },
      {
        adjusted: reset,
      },
    ).apply(edited);
    const [after] = pictures(back);
    expect(after?.levels?.base).toBe(imp.base.hash);
    expect(after?.asset).toBe(reset.hash);
  });

  it('a scale bar placed on the picture takes the pixel size without typing', async () => {
    const { fig, page } = await place(
      tiffFile({
        pages: [grey16({ description: 'ImageJ=1\nunit=micron\n', xResolution: 15.3846 })],
      }),
    );
    const [pic] = pictures(fig);
    if (!pic) throw new Error('no picture');
    const withBar = addScaleBar(page as never, pic).apply(fig);
    const group = withBar.doc.pages[0]?.layers[0]?.children[0];
    const bar = group?.type === 'group' ? (group.children[1] as Procedural) : undefined;
    const p = bar?.params as ScaleBarParams;
    expect(p.pixelSize).toBeCloseTo(0.065, 4);
    expect(p.imageWidth).toBe(8);
  });

  it('a picture without a stated pixel size gets the scale bar default', async () => {
    const { fig, page } = await place(
      tiffFile({ pages: [grey16({ xResolution: 72, resolutionUnit: 2 })] }),
    );
    const [pic] = pictures(fig);
    if (!pic) throw new Error('no picture');
    const withBar = addScaleBar(page as never, pic).apply(fig);
    const group = withBar.doc.pages[0]?.layers[0]?.children[0];
    const bar = group?.type === 'group' ? (group.children[1] as Procedural) : undefined;
    expect((bar?.params as ScaleBarParams).pixelSize).toBe(0.1);
  });

  it('scales 16-bit colour to 8-bit and says so', async () => {
    const imp = await importFile(
      tiffFile({
        pages: [
          { width: 2, height: 1, bits: 16, samples: 3, values: [0, 32768, 65535, 65535, 0, 100] },
        ],
      }),
    );
    expect(imp?.warnings.join(' ')).toMatch(/16-bit colour/);
    if (imp?.asset.kind !== 'image') throw new Error('no image');
    const px = decodePng(fromBase64(imp.asset.dataBase64));
    expect(Array.from(px?.data ?? [])).toEqual([0, 128, 255, 255, 0, 0]);
  });

  it('a stack becomes one picture per channel, side by side and selected for Merge channels', async () => {
    const pages = [0, 1, 2].map((c) => grey16({ values: dim(48, c + 1) }));
    const { fig, imp } = await place(
      tiffFile({
        imageJStack: true,
        pages: pages.map((p, i) =>
          i === 0
            ? {
                ...p,
                description: 'ImageJ=1.54f\nimages=3\nchannels=3\nunit=micron\n',
                xResolution: 10,
              }
            : p,
        ),
      }),
    );
    expect(imp?.channelStack).toHaveLength(3);
    const pics = pictures(fig);
    expect(pics).toHaveLength(3);
    expect(pics[0]?.frame.x).toBeLessThan(pics[1]?.frame.x ?? 0);
    expect(pics.every((p) => p.levels !== undefined)).toBe(true);
    // The merge starts from the 16-bit sources, each one's brightest sample at full.
    const channels = channelsOf(pics);
    expect(channels).toHaveLength(3);
    const first = fig.assets[channels[0]?.asset ?? ''];
    if (first?.kind !== 'image') throw new Error('no channel');
    const ints = await channelIntensities(first);
    expect(Math.max(...Array.from(ints.values))).toBe(255);
    expect(first.meta.pixelSize).toBeCloseTo(0.1, 3);
  });

  it('refuses what it cannot read with a plain message', async () => {
    await expect(importFile(tiffFile({ pages: [grey16({ compression: 7 })] }))).rejects.toThrow(
      /JPEG compression cannot be imported/,
    );
  });
});

describe('.jfig keeps the calibration and the 16-bit marker', () => {
  it('round-trips pixelSize and peak on an asset without a schema change', async () => {
    const { fig, imp } = await place(
      tiffFile({ pages: [grey16({ description: 'ImageJ=1\nunit=micron\n', xResolution: 10 })] }),
    );
    const text = writeJfig(fig, { name: 'test', version: '0.0.0' });
    const back = readJfig(text);
    if (!imp?.base) throw new Error('no base');
    expect(back.assets[imp.base.hash]).toEqual(fig.assets[imp.base.hash]);
    expect(back.assets[imp.hash]).toEqual(fig.assets[imp.hash]);
    expect(writeJfig(back, { name: 'test', version: '0.0.0' })).toBe(text);
  });

  it('rejects a damaged pixel size or peak by name', () => {
    const doc0 = createDoc();
    const page = doc0.pages[0];
    if (!page) throw new Error('no page');
    const pic: Image = {
      id: newId('o'),
      type: 'image',
      asset: 'h',
      frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      opacity: 1,
    };
    const doc = addObjects(page.id, [pic]).apply({ doc: doc0, assets: {} }).doc;
    const asset = (meta: object) =>
      writeJfig(
        {
          doc,
          assets: {
            h: {
              kind: 'image',
              mime: 'image/png',
              dataBase64: '',
              meta: { name: 'a', width: 1, height: 1, ...meta },
            },
          },
        },
        { name: 't', version: '0' },
      );
    expect(() => readJfig(asset({ pixelSize: -1 }))).toThrow(/pixelSize/);
    expect(() => readJfig(asset({ peak: 70000 }))).toThrow(/peak/);
    expect(readJfig(asset({ pixelSize: 0.1, peak: 4000 })).assets['h']).toMatchObject({
      meta: { pixelSize: 0.1, peak: 4000 },
    });
  });
});
