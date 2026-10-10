/** Split channels pixels (note 45): grey versus tinted, on a tiny synthetic merge. */
import { describe, expect, it } from 'vitest';

import type { ImageAsset } from '@/core/edits/crop';
import { asId } from '@/core/model/ids';
import type { Assets, Channel, Image } from '@/core/model/types';

import { base64, decodePng, encodePngSync, fromBase64 } from './png';
import { bakeSplit } from './split';

const grey = (v: number[], width: number, name: string, credit?: string): ImageAsset => {
  const data = new Uint8Array(v.flatMap((x) => [x, x, x]));
  const height = v.length / width;
  return {
    kind: 'image',
    mime: 'image/png',
    dataBase64: base64(encodePngSync({ width, height, channels: 3, data })),
    meta: { name, width, height, ...(credit === undefined ? {} : { credit }) },
  };
};

const channels: Channel[] = [
  { asset: 'd', color: '#0000ff', on: true, min: 0, max: 255 },
  { asset: 'g', color: '#00ff00', on: true, min: 0, max: 100 },
];
const assets: Assets = {
  d: grey([0, 100, 255, 50], 2, 'DAPI.tif', 'Lab A'),
  g: grey([255, 50, 0, 100], 2, 'GFP.png'),
  m: grey([0, 0, 0, 0], 2, 'merge'),
};
const merge: Image = {
  id: asId('m1'),
  type: 'image',
  asset: 'm',
  frame: { x: 0, y: 0, w: 20, h: 20, rotation: 0 },
  opacity: 1,
  channels,
};
const rgbs = (a: ImageAsset): number[][] => {
  const px = decodePng(fromBase64(a.dataBase64));
  if (!px) throw new Error('not a PNG');
  const out: number[][] = [];
  for (let i = 0; i < px.width * px.height; i++)
    out.push([...px.data.slice(i * px.channels, i * px.channels + 3)]);
  return out;
};
const out = (c: { asset: ImageAsset } | undefined): number[][] => {
  if (!c) throw new Error('missing');
  return rgbs(c.asset);
};
const named = [
  { channel: channels[0]!, name: 'DAPI' },
  { channel: channels[1]!, name: 'GFP' },
];

describe('bakeSplit', () => {
  it('greyscale: the channel through its display range, equal R, G, B', async () => {
    const parts = await bakeSplit(merge, named, assets, false);
    expect(parts).toHaveLength(2);
    expect(out(parts[0]?.baked.merge)).toEqual([
      [0, 0, 0],
      [100, 100, 100],
      [255, 255, 255],
      [50, 50, 50],
    ]);
    // GFP's range 0..100: 50 -> 128, 100 and above -> 255.
    expect(out(parts[1]?.baked.merge)).toEqual([
      [255, 255, 255],
      [128, 128, 128],
      [0, 0, 0],
      [255, 255, 255],
    ]);
  });

  it('tinted: the same brightness in the channel colour on black', async () => {
    const parts = await bakeSplit(merge, named, assets, true);
    expect(out(parts[0]?.baked.merge)).toEqual([
      [0, 0, 0],
      [0, 0, 100],
      [0, 0, 255],
      [0, 0, 50],
    ]);
    expect(out(parts[1]?.baked.merge)[1]).toEqual([0, 128, 0]);
  });

  it('carries the source credit, and applies the merge’s levels', async () => {
    const parts = await bakeSplit(
      { ...merge, levels: { min: 0, max: 255, invert: true, base: 'm' } },
      named,
      assets,
      false,
    );
    const p = parts[0];
    expect(p?.baked.unadjusted?.asset.meta.credit).toBe('Lab A');
    expect(out(p?.baked.merge)[0]).toEqual([255, 255, 255]);
    expect(out(p?.baked.unadjusted)[0]).toEqual([0, 0, 0]);
  });
});
