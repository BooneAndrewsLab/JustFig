/** A crop re-encoded as its own asset (#46): exact pixels for a PNG. */
import { describe, expect, it } from 'vitest';

import type { ImageAsset } from '@/core/edits/crop';
import { usedAssets } from '@/core/model/tree';

import { cropPicture } from './cropImage';
import { base64, decodePng, encodePngSync, fromBase64, type Pixels } from './png';

function picture(w: number, h: number): { px: Pixels; asset: ImageAsset } {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([x * 10, y * 20, (x + y) % 256], (y * w + x) * 3);
  const px: Pixels = { width: w, height: h, channels: 3, data };
  return {
    px,
    asset: {
      kind: 'image',
      mime: 'image/png',
      dataBase64: base64(encodePngSync(px)),
      meta: { name: 'cells.png', credit: 'Lab', width: w, height: h },
    },
  };
}

describe('cropPicture', () => {
  it('cuts a PNG to exactly the crop’s pixels, as a PNG of that size', async () => {
    const { px, asset } = picture(12, 8);
    const r = await cropPicture(asset, { x: 3, y: 2, w: 5, h: 4 });
    expect(r.asset.mime).toBe('image/png');
    expect(r.asset.meta).toEqual({ name: 'cells.png', width: 5, height: 4 });
    const out = decodePng(fromBase64(r.asset.dataBase64));
    expect(out?.width).toBe(5);
    expect(out?.height).toBe(4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 5; x++) {
        const i = ((y + 2) * 12 + x + 3) * 3;
        const o = (y * 5 + x) * 3;
        expect([...(out?.data.subarray(o, o + 3) ?? [])]).toEqual([...px.data.subarray(i, i + 3)]);
      }
  });

  it('gives the same crop the same hash, and a different crop another', async () => {
    const { asset } = picture(12, 8);
    const a = await cropPicture(asset, { x: 1, y: 1, w: 4, h: 4 });
    const b = await cropPicture(asset, { x: 1, y: 1, w: 4, h: 4 });
    const c = await cropPicture(asset, { x: 2, y: 1, w: 4, h: 4 });
    expect(a.hash).toBe(b.hash);
    expect(c.hash).not.toBe(a.hash);
  });
});

describe('a cropped picture in the file', () => {
  it('keeps both the whole picture and its crop', () => {
    const doc = {
      pages: [
        {
          layers: [
            {
              children: [
                {
                  id: 'o1',
                  type: 'image',
                  asset: 'whole',
                  crop: { x: 1, y: 1, w: 2, h: 2 },
                  cropped: 'cut',
                  frame: { x: 0, y: 0, w: 1, h: 1, rotation: 0 },
                  opacity: 1,
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof usedAssets>[0];
    expect([...usedAssets(doc)].sort()).toEqual(['cut', 'whole']);
  });
});
