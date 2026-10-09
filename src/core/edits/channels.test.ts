/** Merged channels (#45): channel lists, re-editing a merge, placing a new one, crop and scale bars. */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { boundsOf } from '@/core/geometry/transform';
import { createDoc } from '@/core/model/factory';
import { type Id, newId } from '@/core/model/ids';
import { objectAssets, pageObjects } from '@/core/model/tree';
import type { Channel, Figure, Frame, Group, Image, Procedural } from '@/core/model/types';
import { addScaleBar } from '@/procedural/edits';
import { barLength, type ScaleBarParams } from '@/procedural/kinds/scaleBar';
import { objectToNode } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';

import {
  type BakedMerge,
  ROW_GAP,
  channelColour,
  channelsOf,
  mergeChannels,
  setChannels,
} from './channels';
import { type CroppedPicture, cropImages } from './crop';

const meta = { name: 'c.png', width: 200, height: 100 };
const assets: Figure['assets'] = {
  h1: { kind: 'image', mime: 'image/png', dataBase64: 'AAAA', meta: { ...meta, name: 'dapi.png' } },
  h2: { kind: 'image', mime: 'image/png', dataBase64: 'BBBB', meta: { ...meta, name: 'gfp.png' } },
};

const pic = (asset: string, frame: Partial<Frame> = {}, extra: Partial<Image> = {}): Image => ({
  id: newId('o'),
  type: 'image',
  asset,
  frame: { x: 0, y: 0, w: 100, h: 50, rotation: 0, ...frame },
  opacity: 1,
  ...extra,
});

const asset = (tag: string, w: number, h: number): CroppedPicture => ({
  hash: tag,
  asset: {
    kind: 'image',
    mime: 'image/png',
    dataBase64: `X${tag}`,
    meta: { name: 'merge', width: w, height: h },
  },
});
const bakedFull = (tag: string): BakedMerge => ({ merge: asset(tag, 200, 100) });

function figWith(...objs: Image[]): { fig: Figure; pageId: Id } {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return { fig: addObjects(page.id, objs).apply({ doc, assets }), pageId: page.id };
}

const objs = (fig: Figure) => {
  const p = fig.doc.pages[0];
  if (!p) throw new Error('no page');
  return [...pageObjects(p)];
};
const byId = (fig: Figure, id: Id) => objs(fig).find((o) => o.id === id);
const topLevel = (fig: Figure) => fig.doc.pages[0]?.layers.flatMap((l) => l.children) ?? [];

const two: Channel[] = [
  { asset: 'h1', color: '#0000ff', on: true, min: 0, max: 255 },
  { asset: 'h2', color: '#00ff00', on: true, min: 10, max: 200 },
];

describe('channelsOf', () => {
  it('makes each plain picture a channel in the default colours, green and magenta first', () => {
    const c = channelsOf([pic('h1'), pic('h2')]);
    expect(c).toEqual([
      { asset: 'h1', color: '#00ff00', on: true, min: 0, max: 255 },
      { asset: 'h2', color: '#ff00ff', on: true, min: 0, max: 255 },
    ]);
    expect(channelColour(7)).toBe(channelColour(0));
  });

  it('takes a merge’s own channels, and each channel picture once', () => {
    const merged = pic('m', {}, { channels: two });
    expect(channelsOf([merged, pic('h2'), pic('h3')])).toEqual([
      ...two,
      { asset: 'h3', color: channelColour(2), on: true, min: 0, max: 255 },
    ]);
  });
});

describe('setChannels', () => {
  it('pseudocolours a plain picture, keeping it as the channel', () => {
    const a = pic('h1');
    const { fig, pageId } = figWith(a);
    const chans: Channel[] = [{ asset: 'h1', color: '#ff00ff', on: true, min: 0, max: 255 }];
    const next = setChannels(pageId, a.id, chans, bakedFull('m1')).apply(fig);
    const o = byId(next, a.id) as Image;
    expect(o.asset).toBe('m1');
    expect(o.channels).toEqual(chans);
    expect(next.assets['m1']).toBeDefined();
    // The channel's own picture stays in the figure (saved, credited).
    expect(objectAssets(o)).toEqual(['m1', 'h1']);
    // The renderer draws the merge.
    const node = objectToNode(o, {
      assets: next.assets,
      palette: [],
      textMode: 'outline',
      screen: false,
      labelStyle: next.doc.panelLabelStyle,
      labels: new Map(),
    });
    if (!node) throw new Error('not drawn');
    expect(nodeToSvgString(node)).toContain('data:image/png;base64,Xm1');
  });

  it('re-bakes a cropped merge’s crop, keeping the crop', () => {
    const crop = { x: 10, y: 10, w: 50, h: 40 };
    const a = pic('m0', {}, { channels: two, crop, cropped: 'c0' });
    const { fig, pageId } = figWith(a);
    const recoloured = two.map((c) => ({ ...c, on: c.asset === 'h1' }));
    const next = setChannels(pageId, a.id, recoloured, {
      merge: asset('m1', 200, 100),
      cropped: asset('c1', 50, 40),
    }).apply(fig);
    const o = byId(next, a.id) as Image;
    expect(o).toMatchObject({ asset: 'm1', crop, cropped: 'c1', channels: recoloured });
    expect(o.frame).toEqual(a.frame);
    expect(() =>
      setChannels(pageId, a.id, recoloured, { merge: asset('m2', 200, 100) }).apply(fig),
    ).toThrow(/cropped merge/);
    expect(() => setChannels(pageId, a.id, [], bakedFull('m3')).apply(fig)).toThrow(/at least one/);
  });

  it('is kept through a crop of the merged picture', () => {
    const a = pic('m0', {}, { channels: two });
    const { fig: f0, pageId } = figWith(a);
    const fig = { ...f0, assets: { ...f0.assets, m0: asset('m0', 200, 100).asset } };
    const c = { x: 0, y: 0, w: 100, h: 50 };
    const next = cropImages(pageId, [a.id], {
      crop: c,
      baked: { [a.id]: asset('c', 100, 50) },
    }).apply(fig);
    expect(byId(next, a.id)).toMatchObject({ asset: 'm0', channels: two, crop: c, cropped: 'c' });
  });
});

describe('mergeChannels', () => {
  it('adds the merge beside the channels, like the first, as one edit', () => {
    const a = pic('h1', { x: 10, y: 20, rotation: 0, flipX: true });
    const b = pic('h2', { x: 200, y: 90 });
    const { fig, pageId } = figWith(a, b);
    const e = mergeChannels(pageId, [a.id, b.id], two, bakedFull('m'), { row: false });
    const next = e.apply(fig);
    const added = topLevel(next).filter((o) => o.id !== a.id && o.id !== b.id);
    expect(added).toHaveLength(1);
    const m = added[0] as Image;
    expect(e.select).toEqual([m.id]);
    expect(m).toMatchObject({ type: 'image', asset: 'm', channels: two, name: 'Merge' });
    expect(m.frame).toEqual({ ...a.frame, x: 300 + ROW_GAP });
    // The channels stay put.
    expect(byId(next, a.id)).toEqual(a);
    expect(byId(next, b.id)).toEqual(b);
  });

  it('lays the channels out in a row from the first, the merge last', () => {
    const a = pic('h1', { x: 10, y: 20 });
    const b = pic('h2', { x: 5, y: 300 });
    const { fig, pageId } = figWith(a, b);
    const next = mergeChannels(pageId, [a.id, b.id], two, bakedFull('m'), { row: true }).apply(fig);
    const nb = byId(next, b.id) as Image;
    expect(nb.frame).toMatchObject({ x: 110 + ROW_GAP, y: 20 });
    const m = topLevel(next).find((o) => o.type === 'image' && o.asset === 'm') as Image;
    expect(m.frame).toMatchObject({ x: 210 + 2 * ROW_GAP, y: 20 });
  });

  it('takes the first channel’s crop, and copies its scale bar, calibrated', () => {
    const crop = { x: 20, y: 10, w: 80, h: 60 };
    const a = pic('h1', { x: 0, y: 0, w: 160, h: 120 }, { crop, cropped: 'ca' });
    const b = pic('h2', { x: 0, y: 200, w: 160, h: 120 }, { crop, cropped: 'cb' });
    const { fig: f0, pageId } = figWith(a, b);
    const withBar = addScaleBar(pageId, a).apply(f0);
    const bar0 = objs(withBar).find((o): o is Procedural => o.type === 'procedural');
    if (!bar0) throw new Error('no bar');
    expect((bar0.params as ScaleBarParams).imageWidth).toBe(80);
    expect(() =>
      mergeChannels(pageId, [a.id, b.id], two, bakedFull('m'), { row: true }).apply(withBar),
    ).toThrow(/cropped merge/);
    const next = mergeChannels(
      pageId,
      [a.id, b.id],
      two,
      { merge: asset('m', 200, 100), cropped: asset('mc', 80, 60) },
      { row: true },
    ).apply(withBar);
    const groups = topLevel(next).filter((o): o is Group => o.type === 'group');
    expect(groups).toHaveLength(2);
    const g = groups[1];
    if (!g) throw new Error('no merge group');
    const [m, bar] = g.children as [Image, Procedural];
    expect(m).toMatchObject({ asset: 'm', crop, cropped: 'mc', channels: two });
    expect(bar.id).not.toBe(bar0.id);
    expect(bar.params).toEqual(bar0.params);
    expect(bar.frame).toEqual(m.frame);
    expect(barLength(bar.params as ScaleBarParams, bar.frame.w)).toBeCloseTo(
      barLength(bar0.params as ScaleBarParams, bar0.frame.w),
      9,
    );
    // The first channel moved as its group with its bar; the second followed in the row.
    const first = groups[0];
    if (!first) throw new Error('no group');
    const nb = byId(next, b.id) as Image;
    expect(nb.frame.x).toBeCloseTo(boundsOf([first]).w + ROW_GAP, 9);
    expect(m.frame.x).toBeCloseTo(nb.frame.x + 160 + ROW_GAP, 9);
    expect(m.frame.y).toBe(0);
  });

  it('refuses when the channels are gone', () => {
    const { fig, pageId } = figWith(pic('h1'));
    expect(() =>
      mergeChannels(pageId, [newId('o')], two, bakedFull('m'), { row: false }).apply(fig),
    ).toThrow(/no longer exist/);
  });
});
