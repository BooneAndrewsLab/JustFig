/** Merged channels (#45): the additive pseudocolour blend, exactly, and the baked PNG. */
import { describe, expect, it } from 'vitest';

import type { ImageAsset } from '@/core/edits/crop';
import type { Channel } from '@/core/model/types';

import {
  bakeMerge,
  blendChannels,
  channelIntensities,
  downsample,
  intensities,
  layersOf,
  levelTable,
} from './channels';
import { base64, decodePng, encodePngSync, fromBase64, type Pixels } from './png';

const grey = (values: number[], width: number): Pixels => ({
  width,
  height: values.length / width,
  channels: 3,
  data: Uint8Array.from(values.flatMap((v) => [v, v, v])),
});

const rgbOf = (px: Pixels) =>
  Array.from({ length: px.width * px.height }, (_, i) => [...px.data.subarray(i * 3, i * 3 + 3)]);

describe('intensities', () => {
  it('reads the brightest of R, G, B, ignoring alpha', () => {
    const px: Pixels = {
      width: 3,
      height: 1,
      channels: 4,
      data: Uint8Array.from([10, 20, 30, 0, 0, 200, 0, 255, 7, 7, 7, 128]),
    };
    expect([...intensities(px).values]).toEqual([30, 200, 7]);
  });
});

describe('levelTable', () => {
  it('is the identity over the full range', () => {
    expect([...levelTable(0, 255)]).toEqual(Array.from({ length: 256 }, (_, v) => v));
  });

  it('stretches min..max to black..full, clamping outside', () => {
    const t = levelTable(50, 100);
    expect([t[0], t[50], t[51], t[75], t[99], t[100], t[255]]).toEqual([
      0, 0, 5, 128, 250, 255, 255,
    ]);
  });

  it('thresholds when max is not above min', () => {
    const t = levelTable(80, 80);
    expect([t[80], t[81]]).toEqual([0, 255]);
  });
});

describe('blendChannels', () => {
  it('colours each channel and adds them, clamped to 255', () => {
    const a = intensities(grey([0, 255, 128, 255], 2)).values;
    const b = intensities(grey([255, 255, 0, 64], 2)).values;
    const px = blendChannels(2, 2, [
      { values: a, color: '#00ff00', min: 0, max: 255 },
      { values: b, color: '#ff00ff', min: 0, max: 255 },
    ]);
    expect(px.channels).toBe(3);
    expect(rgbOf(px)).toEqual([
      [255, 0, 255],
      [255, 255, 255],
      [0, 128, 0],
      [64, 255, 64],
    ]);
  });

  it('scales by a part colour, rounding to nearest', () => {
    // 100 × 128 / 255 = 50.196…, 200 × 128 / 255 = 100.39…
    const v = Uint8Array.from([100, 200]);
    const px = blendChannels(2, 1, [{ values: v, color: '#808000', min: 0, max: 255 }]);
    expect(rgbOf(px)).toEqual([
      [50, 50, 0],
      [100, 100, 0],
    ]);
  });

  it('applies each channel’s display range before colouring', () => {
    const v = Uint8Array.from([10, 60, 200]);
    const px = blendChannels(3, 1, [{ values: v, color: '#ffffff', min: 10, max: 60 }]);
    expect(rgbOf(px)).toEqual([
      [0, 0, 0],
      [255, 255, 255],
      [255, 255, 255],
    ]);
  });

  it('is black with no channels', () => {
    expect([...blendChannels(2, 1, []).data]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('layersOf', () => {
  it('leaves out channels turned off', () => {
    const v = Uint8Array.from([1]);
    const chans: Channel[] = [
      { asset: 'a', color: '#00ff00', on: true, min: 0, max: 255 },
      { asset: 'b', color: '#ff00ff', on: false, min: 0, max: 255 },
    ];
    const l = layersOf(chans, () => ({ width: 1, height: 1, values: v }));
    expect(l.map((x) => x.color)).toEqual(['#00ff00']);
  });
});

describe('downsample', () => {
  it('takes every n-th pixel to fit the longest side', () => {
    const src = { width: 4, height: 2, values: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]) };
    expect(downsample(src, 2)).toEqual({ width: 2, height: 1, values: Uint8Array.from([0, 2]) });
    expect(downsample(src, 4)).toBe(src);
  });
});

describe('bakeMerge', () => {
  const asset = (px: Pixels, name: string): ImageAsset => ({
    kind: 'image',
    mime: 'image/png',
    dataBase64: base64(encodePngSync(px)),
    meta: { name, width: px.width, height: px.height },
  });

  it('merges PNG channels exactly into an RGB PNG of the same size', async () => {
    const dapi = asset(grey([0, 50, 100, 255, 200, 0], 3), 'dapi.png');
    const gfp = asset(grey([255, 0, 10, 20, 30, 40], 3), 'gfp.png');
    const px = new Map([
      ['d', await channelIntensities(dapi)],
      ['g', await channelIntensities(gfp)],
    ]);
    const chans: Channel[] = [
      { asset: 'd', color: '#0000ff', on: true, min: 0, max: 255 },
      { asset: 'g', color: '#00ff00', on: true, min: 0, max: 255 },
    ];
    const r = await bakeMerge(chans, (h) => px.get(h), {
      name: 'dapi.png + gfp.png',
      width: 3,
      height: 2,
    });
    expect(r.asset.mime).toBe('image/png');
    expect(r.asset.meta).toEqual({ name: 'dapi.png + gfp.png', width: 3, height: 2 });
    const out = decodePng(fromBase64(r.asset.dataBase64));
    expect(out && rgbOf(out)).toEqual([
      [0, 255, 0],
      [0, 0, 50],
      [0, 10, 100],
      [0, 20, 255],
      [0, 30, 200],
      [0, 40, 0],
    ]);
    // The same merge is the same asset (content hash).
    const again = await bakeMerge(chans, (h) => px.get(h), r.asset.meta);
    expect(again.hash).toBe(r.hash);
  });
});
