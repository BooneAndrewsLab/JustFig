/** Crop and rotate pictures in lockstep (#46): frames, scale bars, assets and the renderer. */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { apply, frameMatrix } from '@/core/geometry/matrix';
import { createDoc } from '@/core/model/factory';
import { type Id, newId } from '@/core/model/ids';
import { pageObjects } from '@/core/model/tree';
import type { Figure, Frame, Group, Image, Procedural, Rect4 } from '@/core/model/types';
import { addScaleBar } from '@/procedural/edits';
import { barLength, type ScaleBarParams } from '@/procedural/kinds/scaleBar';
import { objectToNode } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';

import {
  type CroppedPicture,
  clampCrop,
  cropFrame,
  cropImages,
  cropTargets,
  sharedSize,
} from './crop';

const meta = { name: 'c.png', width: 200, height: 100 };
const assets: Figure['assets'] = {
  h1: { kind: 'image', mime: 'image/png', dataBase64: 'AAAA', meta },
  h2: { kind: 'image', mime: 'image/png', dataBase64: 'BBBB', meta },
  h3: { kind: 'image', mime: 'image/png', dataBase64: 'CCCC', meta: { ...meta, width: 50 } },
  svg: { kind: 'svgImport', svg: '<svg/>', meta },
};

const pic = (asset: string, frame: Partial<Frame> = {}): Image => ({
  id: newId('o'),
  type: 'image',
  asset,
  frame: { x: 0, y: 0, w: 100, h: 50, rotation: 0, ...frame },
  opacity: 1,
});

const baked = (id: string, c: Rect4): CroppedPicture => ({
  hash: `crop-${id}`,
  asset: {
    kind: 'image',
    mime: 'image/png',
    dataBase64: `X${id}`,
    meta: { name: 'c.png', width: c.w, height: c.h },
  },
});

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

/** Page position of a pixel of a picture showing `shown` in frame `f`. */
const pixelOnPage = (f: Frame, shown: Rect4, px: number, py: number) =>
  apply(frameMatrix(f), {
    x: ((px - shown.x) * f.w) / shown.w,
    y: ((py - shown.y) * f.h) / shown.h,
  });

describe('cropFrame', () => {
  const full = { x: 0, y: 0, w: 200, h: 100 };
  const cut = { x: 50, y: 20, w: 100, h: 40 };

  it('keeps points per pixel and the kept pixels in place', () => {
    const f: Frame = { x: 10, y: 10, w: 100, h: 50, rotation: 0 };
    expect(cropFrame(f, full, cut)).toEqual({ x: 35, y: 20, w: 50, h: 20, rotation: 0 });
  });

  it.each([
    ['turned', { rotation: 30 }],
    ['flipped', { flipX: true, rotation: -75 }],
    ['mirrored both ways', { flipX: true, flipY: true, rotation: 120 }],
  ])('leaves every kept pixel where it was when %s', (_n, extra) => {
    const f: Frame = { x: 10, y: 10, w: 100, h: 50, ...extra };
    const g = cropFrame(f, full, cut);
    for (const [px, py] of [
      [50, 20],
      [150, 60],
      [90, 33],
    ] as const) {
      const a = pixelOnPage(f, full, px, py);
      const b = pixelOnPage(g, cut, px, py);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
    }
    // And back out to the whole picture, from the crop.
    expect(cropFrame(g, cut, full).x).toBeCloseTo(f.x, 9);
    expect(cropFrame(g, cut, full).y).toBeCloseTo(f.y, 9);
  });
});

describe('clampCrop', () => {
  it('rounds to whole pixels inside the picture, at least one each way', () => {
    expect(clampCrop({ x: -5, y: 10.4, w: 500, h: 0 }, 200, 100)).toEqual({
      x: 0,
      y: 10,
      w: 200,
      h: 1,
    });
    expect(clampCrop({ x: Number.NaN, y: 99, w: 3, h: 3 }, 200, 100)).toEqual({
      x: 0,
      y: 99,
      w: 3,
      h: 1,
    });
  });
});

describe('cropImages', () => {
  const c = { x: 50, y: 20, w: 100, h: 40 };

  it('crops and turns every picture in the set alike, as one edit', () => {
    const a = pic('h1');
    const b = pic('h2', { x: 200 });
    const { fig, pageId } = figWith(a, b);
    const e = cropImages(pageId, [a.id, b.id], {
      crop: c,
      baked: { [a.id]: baked('a', c), [b.id]: baked('b', c) },
      rotation: 370,
    });
    const next = e.apply(fig);
    const na = byId(next, a.id) as Image;
    const nb = byId(next, b.id) as Image;
    expect(na.crop).toEqual(c);
    expect(nb.crop).toEqual(c);
    expect(na.cropped).toBe('crop-a');
    expect(nb.cropped).toBe('crop-b');
    expect(na.frame).toMatchObject({ w: 50, h: 20, rotation: 10 });
    expect(nb.frame).toMatchObject({ w: 50, h: 20, rotation: 10 });
    expect(na.asset).toBe('h1');
    expect(next.assets['crop-a']).toBeDefined();
    expect(e.label).toBe('Crop and rotate');
    // The figure it started from is untouched (the undo step).
    expect((byId(fig, a.id) as Image).crop).toBeUndefined();
  });

  it('shows the whole picture again, dropping the crop', () => {
    const a = pic('h1');
    const { fig, pageId } = figWith(a);
    const cropped = cropImages(pageId, [a.id], {
      crop: c,
      baked: { [a.id]: baked('a', c) },
    }).apply(fig);
    const back = cropImages(pageId, [a.id], { crop: null }).apply(cropped);
    const o = byId(back, a.id) as Image;
    expect(o.crop).toBeUndefined();
    expect(o.cropped).toBeUndefined();
    expect(o.frame.x).toBeCloseTo(0, 9);
    expect(o.frame.y).toBeCloseTo(0, 9);
    expect(o.frame.w).toBeCloseTo(100, 9);
    expect(o.frame.h).toBeCloseTo(50, 9);
  });

  it('refuses a crop without its pixels, and pictures that are not PNG or JPEG', () => {
    const a = pic('h1');
    const s = pic('svg');
    const { fig, pageId } = figWith(a, s);
    expect(() => cropImages(pageId, [a.id], { crop: c }).apply(fig)).toThrow(/missing/);
    expect(() => cropImages(pageId, [s.id], { rotation: 5 }).apply(fig)).toThrow(/PNG and JPEG/);
  });

  it('draws the crop’s own pixels, in the frame', () => {
    const a = pic('h1');
    const { fig, pageId } = figWith(a);
    const next = cropImages(pageId, [a.id], {
      crop: c,
      baked: { [a.id]: baked('a', c) },
    }).apply(fig);
    const node = objectToNode(byId(next, a.id) as Image, {
      assets: next.assets,
      palette: [],
      textMode: 'outline',
      screen: false,
      labelStyle: next.doc.panelLabelStyle,
      labels: new Map(),
    });
    if (!node) throw new Error('not drawn');
    const hrefs = [...nodeToSvgString(node).matchAll(/xlink:href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['data:image/png;base64,Xa']);
  });
});

describe('a scale bar on a cropped picture', () => {
  it('follows the picture’s new box and stays calibrated', () => {
    const a = pic('h1', { x: 40, y: 30, w: 300, h: 150, rotation: 20 });
    const { fig: f0, pageId } = figWith(a);
    const fig = addScaleBar(pageId, a).apply(f0);
    const bar0 = objs(fig).find((o): o is Procedural => o.type === 'procedural');
    if (!bar0) throw new Error('no bar');
    const p0 = { ...(bar0.params as ScaleBarParams), pixelSize: 0.1, length: 5 };
    const fig1: Figure = {
      ...fig,
      doc: {
        ...fig.doc,
        pages: fig.doc.pages.map((p) => ({
          ...p,
          layers: p.layers.map((l) => ({
            ...l,
            children: l.children.map((g) =>
              g.type === 'group'
                ? {
                    ...g,
                    children: g.children.map((k) => (k.id === bar0.id ? { ...k, params: p0 } : k)),
                  }
                : g,
            ),
          })),
        })),
      },
    };
    // Selecting the group crops the picture in it.
    const group = objs(fig1).find((o): o is Group => o.type === 'group');
    if (!group) throw new Error('no group');
    expect(cropTargets([group], fig1.assets).map((o) => o.id)).toEqual([a.id]);
    const c = { x: 20, y: 10, w: 80, h: 60 };
    const next = cropImages(pageId, [a.id], {
      crop: c,
      baked: { [a.id]: baked('a', c) },
    }).apply(fig1);
    const img = byId(next, a.id) as Image;
    const bar = byId(next, bar0.id) as Procedural;
    expect(bar.frame).toEqual(img.frame);
    const p = bar.params as ScaleBarParams;
    expect(p.imageWidth).toBe(80);
    // 5 µm is the same length in points before and after: points per pixel did not change.
    expect(barLength(p, bar.frame.w)).toBeCloseTo(barLength(p0, bar0.frame.w), 9);
    expect(barLength(p, bar.frame.w)).toBeCloseTo((5 / 0.1) * (300 / 200), 9);
    // The group was refitted around the new box.
    const g = byId(next, group.id) as Group;
    expect(g.frame.w).toBeLessThan(group.frame.w);
    // A bar added to the cropped picture takes the crop's width.
    const again = addScaleBar(pageId, img).apply(next);
    const bars = objs(again).filter((o): o is Procedural => o.type === 'procedural');
    expect(bars.map((b) => (b.params as ScaleBarParams).imageWidth)).toContain(80);
  });
});

describe('cropTargets and sharedSize', () => {
  it('takes unlocked PNG/JPEG pictures, and a size only when they share it', () => {
    const a = pic('h1');
    const b = pic('h2');
    const c = pic('h3');
    const s = pic('svg');
    const locked = { ...pic('h1'), locked: true };
    expect(cropTargets([a, s, locked, b], assets)).toEqual([a, b]);
    expect(sharedSize([a, b], assets)).toEqual({ w: 200, h: 100 });
    expect(sharedSize([a, c], assets)).toBeNull();
    expect(sharedSize([], assets)).toBeNull();
  });
});
