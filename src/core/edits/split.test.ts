/** Split channels (note 45, issue 67): the row, the labels, undo, the set. */
import { beforeAll, describe, expect, it } from 'vitest';

import { History } from '@/core/history/history';
import { cloneObjects } from '@/core/model/clone';
import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import { pageObjects } from '@/core/model/tree';
import type { Channel, Figure, Group, Image, Text } from '@/core/model/types';
import { loadTestFonts } from '@/test/fonts';

import {
  type BakedMerge,
  ROW_GAP,
  type SplitPart,
  splitChannels,
  splitChannelsOf,
  splitSetOf,
  withSplitSets,
} from './channels';
import type { CroppedPicture } from './crop';
import { type Edit, addObjects } from './edits';
import { matchLevels } from './levels';

beforeAll(async () => {
  await loadTestFonts();
});

const meta = { name: 'm', width: 200, height: 100 };
const asset = (hash: string, name = 'x', credit?: string): CroppedPicture => ({
  hash,
  asset: {
    kind: 'image',
    mime: 'image/png',
    dataBase64: `X${hash}`,
    meta: { ...meta, name, ...(credit ? { credit } : {}) },
  },
});
const assets: Figure['assets'] = {
  d: { kind: 'image', mime: 'image/png', dataBase64: 'AA', meta: { ...meta, name: 'DAPI.tif' } },
  g: { kind: 'image', mime: 'image/png', dataBase64: 'BB', meta: { ...meta, name: 'GFP.png' } },
  off: { kind: 'image', mime: 'image/png', dataBase64: 'CC', meta: { ...meta, name: 'RFP.png' } },
};
const channels: Channel[] = [
  { asset: 'd', color: '#0000ff', on: true, min: 0, max: 255 },
  { asset: 'g', color: '#00ff00', on: true, min: 0, max: 255 },
  { asset: 'off', color: '#ff0000', on: false, min: 0, max: 255 },
];
const mergePic = (extra: Partial<Image> = {}): Image => ({
  id: newId('o'),
  type: 'image',
  asset: 'm',
  frame: { x: 10, y: 20, w: 100, h: 50, rotation: 0 },
  opacity: 1,
  channels,
  ...extra,
});
const parts = (): SplitPart[] =>
  splitChannelsOf(mergePic(), assets).map(({ channel, name }, i): SplitPart => {
    const baked: BakedMerge = {
      merge: asset(`p${String(i)}`, name, i === 0 ? 'Lab A' : undefined),
    };
    return { channel, name, baked };
  });

function setup(extra: Partial<Image> = {}) {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const m = mergePic(extra);
  const all = { ...assets, m: asset('m').asset };
  const fig = addObjects(page.id, [m], all).apply({ doc, assets: all });
  return { fig, pageId: page.id, m };
}
const row = (fig: Figure): Group => {
  const g = fig.doc.pages[0]?.layers[0]?.children[0];
  if (g?.type !== 'group') throw new Error('no row');
  return g;
};
const imagesOf = (fig: Figure): Image[] => {
  const page = fig.doc.pages[0];
  if (!page) throw new Error('no page');
  return [...pageObjects(page)].filter((o): o is Image => o.type === 'image');
};
const step = (h: History<Figure>, e: Edit): History<Figure> => h.push(e.apply(h.present), e.label);

describe('splitChannels', () => {
  it('makes a picture per shown channel, the merge last, labels, one group', () => {
    const { fig, pageId, m } = setup();
    const next = splitChannels(pageId, m.id, parts()).apply(fig);
    const g = row(next);
    const pics = g.children.filter((o): o is Image => o.type === 'image');
    const texts = g.children.filter((o): o is Text => o.type === 'text');
    expect(pics.map((p) => p.name)).toEqual(['DAPI', 'GFP', 'Merge']);
    expect(pics[2]?.id).toBe(m.id);
    expect(texts).toHaveLength(3);
    // One row from the merge's place, the same size, left to right with the gap.
    expect(pics.map((p) => p.frame.y)).toEqual([20, 20, 20]);
    expect(pics.map((p) => [p.frame.w, p.frame.h])).toEqual([
      [100, 50],
      [100, 50],
      [100, 50],
    ]);
    expect(pics[0]?.frame.x).toBe(10);
    expect(pics[1]?.frame.x).toBeCloseTo(10 + 100 + ROW_GAP);
    expect(pics[2]?.frame.x).toBeCloseTo(10 + 2 * (100 + ROW_GAP));
    // Single-channel pictures are plain: no channels list, their own baked asset.
    expect(pics[0]?.channels).toBeUndefined();
    expect(pics[0]?.asset).toBe('p0');
    expect(pics[2]?.asset).toBe('m');
    // Credits ride on the baked assets.
    const a = next.assets['p0'];
    expect(a?.kind === 'image' && a.meta.credit).toBe('Lab A');
  });

  it('labels each panel with its channel name in its colour; the merge gets every name', () => {
    const { fig, pageId, m } = setup();
    const g = row(splitChannels(pageId, m.id, parts()).apply(fig));
    const texts = g.children.filter((o): o is Text => o.type === 'text');
    const words = texts.map((t) => t.runs[0]?.map((r) => r.text).join(''));
    expect(words).toEqual(['DAPI', 'GFP', 'DAPI + GFP']);
    expect(texts[0]?.runs[0]?.[0]?.color).toEqual({ hex: '#0000ff' });
    expect(texts[1]?.runs[0]?.[0]?.color).toEqual({ hex: '#00ff00' });
    const merged = texts[2]?.runs[0] ?? [];
    expect(merged.filter((r) => r.text !== ' + ').map((r) => r.color)).toEqual([
      { hex: '#0000ff' },
      { hex: '#00ff00' },
    ]);
    // Inside the panel, at its top-left.
    expect(texts[1]?.frame.x).toBeCloseTo(10 + 100 + ROW_GAP + 3);
    expect(texts[1]?.frame.y).toBeCloseTo(23);
  });

  it('is one undo step and records the set on every picture', () => {
    const { fig, pageId, m } = setup();
    let h = History.create(fig);
    h = step(h, splitChannels(pageId, m.id, parts()));
    const pics = imagesOf(h.present);
    for (const p of pics) expect(new Set(p.splitSet)).toEqual(new Set(pics.map((q) => q.id)));
    expect(h.undoDepth).toBe(1);
    h = h.undo();
    expect(h.present.doc.pages[0]?.layers[0]?.children.map((o) => o.id)).toEqual([m.id]);
  });

  it('keeps the merge’s crop and levels on every panel', () => {
    const { fig, pageId, m } = setup({
      crop: { x: 1, y: 2, w: 50, h: 25 },
      cropped: 'mc',
      levels: { min: 5, max: 200, invert: false, base: 'mu' },
    });
    const ps = parts().map((p, i) => ({
      ...p,
      baked: { ...p.baked, unadjusted: asset(`u${String(i)}`), cropped: asset(`c${String(i)}`) },
    }));
    const g = row(splitChannels(pageId, m.id, ps).apply(fig));
    const first = g.children.find((o): o is Image => o.type === 'image');
    expect(first?.crop).toEqual({ x: 1, y: 2, w: 50, h: 25 });
    expect(first?.cropped).toBe('c0');
    expect(first?.levels).toEqual({ min: 5, max: 200, invert: false, base: 'u0' });
  });
});

describe('the split set', () => {
  it('finds the rest of the row; copies of one member leave the set, copies of all keep it', () => {
    const { fig, pageId, m } = setup();
    const next = splitChannels(pageId, m.id, parts()).apply(fig);
    const page = next.doc.pages[0];
    if (!page) throw new Error('no page');
    const pics = imagesOf(next);
    const first = pics[0];
    if (!first) throw new Error('no picture');
    expect(splitSetOf(page, first)).toHaveLength(3);
    expect(withSplitSets(page, [first, pics[1]!])).toHaveLength(3);
    const [lone] = cloneObjects([first]);
    expect((lone as Image).splitSet).toBeUndefined();
    const [group] = cloneObjects([row(next)]);
    const copied = (group as Group).children.filter((o): o is Image => o.type === 'image');
    expect(copied[0]?.splitSet).toHaveLength(3);
    expect(copied[0]?.splitSet).not.toContain(first.id);
  });

  it('levels set on one panel reach the whole set, one undo step', () => {
    const { fig, pageId, m } = setup();
    let h = History.create(fig);
    h = step(h, splitChannels(pageId, m.id, parts()));
    const page = h.present.doc.pages[0];
    const pic = imagesOf(h.present)[0];
    if (!page || !pic) throw new Error('no picture');
    const set = splitSetOf(page, pic);
    const levels = { min: 10, max: 180, invert: false };
    h = step(
      h,
      matchLevels(
        pageId,
        levels,
        set.map((o, i) => ({ id: o.id, baked: { adjusted: asset(`a${String(i)}`) } })),
        'Set levels',
      ),
    );
    expect(imagesOf(h.present).map((p) => p.levels?.min)).toEqual([10, 10, 10]);
    h = h.undo();
    expect(imagesOf(h.present).map((p) => p.levels)).toEqual([undefined, undefined, undefined]);
  });
});
