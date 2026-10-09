/** Levels and invert (#51): the edit, its undo, reset, crop, and channel merges. */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { History } from '@/core/history/history';
import { createDoc } from '@/core/model/factory';
import { type Id, newId } from '@/core/model/ids';
import { objectAssets, pageObjects } from '@/core/model/tree';
import type { Figure, Image } from '@/core/model/types';

import { type BakedMerge, channelsOf, setChannels } from './channels';
import type { CroppedPicture } from './crop';
import { isIdentity, setLevels } from './levels';

const meta = { name: 'b.png', width: 200, height: 100 };
const assets: Figure['assets'] = {
  orig: { kind: 'image', mime: 'image/png', dataBase64: 'AAAA', meta },
};
const baked = (hash: string, w = 200, h = 100): CroppedPicture => ({
  hash,
  asset: {
    kind: 'image',
    mime: 'image/png',
    dataBase64: `X${hash}`,
    meta: { ...meta, width: w, height: h },
  },
});

const levels = (min: number, invert = false) => ({ min, max: 200, invert });

function fig(extra: Partial<Image> = {}): { f: Figure; id: Id; page: Id } {
  const doc = createDoc();
  const p = doc.pages[0];
  if (!p) throw new Error('no page');
  const o: Image = {
    id: newId('o'),
    type: 'image',
    asset: 'orig',
    frame: { x: 0, y: 0, w: 100, h: 50, rotation: 0 },
    opacity: 1,
    ...extra,
  };
  return { f: addObjects(p.id, [o]).apply({ doc, assets }), id: o.id, page: p.id };
}
const img = (f: Figure, id: Id): Image => {
  const p = f.doc.pages[0];
  const o = p ? [...pageObjects(p)].find((x) => x.id === id) : undefined;
  if (o?.type !== 'image') throw new Error('no picture');
  return o;
};

describe('setLevels', () => {
  it('keeps the original as the base and shows the baked result', () => {
    const { f, id, page } = fig();
    const next = setLevels(page, id, levels(10, true), { adjusted: baked('l1') }).apply(f);
    const o = img(next, id);
    expect(o.asset).toBe('l1');
    expect(o.levels).toEqual({ min: 10, max: 200, invert: true, base: 'orig' });
    expect(next.assets['l1']).toBeDefined();
    expect(objectAssets(o)).toContain('orig');
  });

  it('re-editing bakes from the same base, never compounding', () => {
    const { f, id, page } = fig();
    const a = setLevels(page, id, levels(10), { adjusted: baked('l1') }).apply(f);
    const b = setLevels(page, id, levels(20), { adjusted: baked('l2') }).apply(a);
    expect(img(b, id).levels?.base).toBe('orig');
    expect(img(b, id).asset).toBe('l2');
  });

  it('resets to the original pixels, and an identity is a reset', () => {
    const { f, id, page } = fig();
    const a = setLevels(page, id, levels(10), { adjusted: baked('l1') }).apply(f);
    expect(isIdentity({ min: 0, max: 255, invert: false })).toBe(true);
    for (const reset of [null, { min: 0, max: 255, invert: false }]) {
      const b = setLevels(page, id, reset, {}).apply(a);
      expect(img(b, id).asset).toBe('orig');
      expect(img(b, id).levels).toBeUndefined();
    }
  });

  it('is one undo step, and a drag coalesces by the caller’s key', () => {
    const { f, id, page } = fig();
    const e = setLevels(page, id, levels(10), { adjusted: baked('l1') });
    const one = e.apply(f);
    expect(History.create(f).push(one, e.label).undo().present).toEqual(f);
    const e2 = setLevels(page, id, levels(30), { adjusted: baked('l2') });
    const co = { follows: 'k', key: 'k' };
    const drag = History.create(f).push(one, e.label, 0, co).push(e2.apply(one), e2.label, 10, co);
    expect(drag.undo().present).toEqual(f);
  });

  it('re-bakes the crop of the adjusted picture, and needs it', () => {
    const { f, id, page } = fig({ crop: { x: 10, y: 10, w: 50, h: 20 }, cropped: 'c0' });
    expect(() => setLevels(page, id, levels(10), { adjusted: baked('l1') }).apply(f)).toThrow(
      /cropped/,
    );
    const next = setLevels(page, id, levels(10), {
      adjusted: baked('l1'),
      cropped: baked('c1', 50, 20),
    }).apply(f);
    const o = img(next, id);
    expect(o.crop).toEqual({ x: 10, y: 10, w: 50, h: 20 });
    expect(o.cropped).toBe('c1');
    expect(o.asset).toBe('l1');
  });

  it('keeps levels over a channel merge: re-merging re-bases them on the new merge', () => {
    const { f, id, page } = fig();
    const ch = channelsOf([img(f, id)]);
    const m = setChannels(page, id, ch, { merge: baked('m1') }).apply(f);
    const lv = setLevels(page, id, levels(5, true), { adjusted: baked('l1') }).apply(m);
    expect(img(lv, id).levels?.base).toBe('m1');
    expect(channelsOf([img(lv, id)])[0]?.asset).toBe('orig');
    const bad: BakedMerge = { merge: baked('l2') };
    expect(() => setChannels(page, id, ch, bad).apply(lv)).toThrow(/unadjusted/);
    const re = setChannels(page, id, ch, { merge: baked('l2'), unadjusted: baked('m2') }).apply(lv);
    expect(img(re, id).asset).toBe('l2');
    expect(img(re, id).levels).toEqual({ min: 5, max: 200, invert: true, base: 'm2' });
  });
});
