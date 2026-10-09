/** Levels and invert (#51): the pixel transform, exactly, and the baked PNG. */
import { describe, expect, it } from 'vitest';

import type { ImageAsset } from '@/core/edits/crop';

import { levelTable } from './channels';
import { NO_LEVELS, applyLevels, bakeLevels, isNoLevels, levelsTable } from './levels';
import { type Pixels, base64, decodePng, encodePngSync, fromBase64 } from './png';

const rgba: Pixels = {
  width: 3,
  height: 1,
  channels: 4,
  data: Uint8Array.from([0, 100, 255, 7, 50, 150, 60, 200, 255, 0, 128, 255]),
};

describe('applyLevels', () => {
  it('is the identity for the whole range, not inverted', () => {
    expect(isNoLevels(NO_LEVELS)).toBe(true);
    expect(applyLevels(rgba, NO_LEVELS).data).toEqual(rgba.data);
  });

  it('stretches min..max to black..full on each colour, keeping alpha', () => {
    const out = applyLevels(rgba, { min: 50, max: 150, invert: false });
    const t = levelTable(50, 150);
    expect([...out.data]).toEqual([
      t[0],
      t[100],
      t[255],
      7,
      t[50],
      t[150],
      t[60],
      200,
      t[255],
      t[0],
      t[128],
      255,
    ]);
    expect(t[50]).toBe(0);
    expect(t[150]).toBe(255);
    expect(t[100]).toBe(128);
  });

  it('inverts after the levels, and twice is the original', () => {
    const inv = applyLevels(rgba, { min: 0, max: 255, invert: true });
    expect([...inv.data.subarray(0, 4)]).toEqual([255, 155, 0, 7]);
    expect(applyLevels(inv, { min: 0, max: 255, invert: true }).data).toEqual(rgba.data);
    const both = levelsTable({ min: 50, max: 150, invert: true });
    expect(both[50]).toBe(255);
    expect(both[150]).toBe(0);
  });

  it('does not change its input', () => {
    const copy = new Uint8Array(rgba.data);
    applyLevels(rgba, { min: 10, max: 20, invert: true });
    expect(rgba.data).toEqual(copy);
  });
});

describe('bakeLevels', () => {
  it('bakes a PNG of the same size from the original, the same each time', async () => {
    const px: Pixels = {
      width: 2,
      height: 1,
      channels: 3,
      data: Uint8Array.from([40, 40, 40, 200, 200, 200]),
    };
    const src: ImageAsset = {
      kind: 'image',
      mime: 'image/png',
      dataBase64: base64(encodePngSync(px)),
      meta: { name: 'blot.png', width: 2, height: 1, credit: 'A. Author' },
    };
    const once = await bakeLevels(src, { min: 40, max: 200, invert: false });
    const again = await bakeLevels(src, { min: 40, max: 200, invert: false });
    expect(again.hash).toBe(once.hash);
    expect(once.asset.meta).toEqual({ name: 'blot.png', width: 2, height: 1 });
    const back = decodePng(fromBase64(once.asset.dataBase64));
    expect([...(back?.data ?? [])]).toEqual([0, 0, 0, 255, 255, 255]);
  });
});
