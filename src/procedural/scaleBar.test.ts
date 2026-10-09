/** A calibrated scale bar on a micrograph (#6): grouped with it, and still true after a resize. */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { scaleObj } from '@/core/geometry/transform';
import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Figure, Group, Image, Procedural } from '@/core/model/types';

import { addScaleBar } from './edits';
import { lengthLabel, type ScaleBarParams } from './kinds/scaleBar';
import { decodeParams, roundTo } from './params';
import type { PathPrim, TextPrim } from './prims';
import { getKind } from './registry';

const image: Image = {
  id: newId('o'),
  type: 'image',
  asset: 'h',
  frame: { x: 100, y: 50, w: 300, h: 200, rotation: 0, flipY: true },
  opacity: 1,
};

const assets: Figure['assets'] = {
  h: {
    kind: 'image',
    mime: 'image/png',
    dataBase64: '',
    meta: { name: 'cells.png', width: 2048, height: 1365 },
  },
};

function barred(): { fig: Figure; edit: ReturnType<typeof addScaleBar> } {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const fig = addObjects(page.id, [image]).apply({ doc, assets });
  const edit = addScaleBar(page.id, image);
  return { fig: edit.apply(fig), edit };
}

const kind = () => {
  const k = getKind('scaleBar');
  if (!k) throw new Error('kind');
  return k;
};

/** The bar's drawn width in points. */
function barWidth(o: Procedural, over: Partial<ScaleBarParams> = {}): number {
  const k = kind();
  const p = decodeParams(k.fields, { ...(o.params as object), ...over });
  const bar = k
    .render(p, { w: o.frame.w, h: o.frame.h, slots: {} })
    .find((q): q is PathPrim => q.kind === 'path');
  const r = bar?.subs[0];
  if (r?.t !== 'rect') throw new Error('no bar');
  return r.w;
}

describe('addScaleBar', () => {
  it('groups the picture with a bar on its box that knows its width in pixels', () => {
    const { fig, edit } = barred();
    const g = fig.doc.pages[0]?.layers[0]?.children[0] as Group;
    expect(g.type).toBe('group');
    const [img, bar] = g.children as [Image, Procedural];
    expect(img).toEqual(image);
    expect(bar.kind).toBe('scaleBar');
    expect(bar.frame).toEqual({ x: 100, y: 50, w: 300, h: 200, rotation: 0 });
    expect((bar.params as ScaleBarParams).imageWidth).toBe(2048);
    expect(edit.select).toEqual([bar.id]);
  });

  it('draws the calibrated length, and keeps it true when the group is resized', () => {
    const { fig } = barred();
    const g = fig.doc.pages[0]?.layers[0]?.children[0] as Group;
    const cal = { pixelSize: 0.065, length: 20 };
    // 20 µm = 307.7 px of 2048 across 300 pt.
    const umPerPt = (o: Procedural) => (2048 * 0.065) / o.frame.w;
    const before = g.children[1] as Procedural;
    expect(barWidth(before, cal) * umPerPt(before)).toBeCloseTo(20, 9);
    for (const s of [0.4, 2.5]) {
      const scaled = scaleObj(g, { x: 100, y: 50 }, s, s) as Group;
      const [img, bar] = scaled.children as [Image, Procedural];
      expect(bar.frame).toMatchObject({ x: img.frame.x, w: img.frame.w });
      expect(barWidth(bar, cal) * umPerPt(bar)).toBeCloseTo(20, 9);
      // Thickness and text keep their size in points.
      const p = decodeParams(kind().fields, bar.params);
      expect(p['thickness']).toBe(3);
      expect(p['size']).toBe(8);
    }
  });

  it('never draws a bar wider than the picture', () => {
    const { fig } = barred();
    const bar = (fig.doc.pages[0]?.layers[0]?.children[0] as Group).children[1] as Procedural;
    expect(barWidth(bar, { pixelSize: 0.001, length: 5000 })).toBe(300);
  });

  it('writes the label from the length unless one is typed', () => {
    expect(lengthLabel(10)).toBe('10 µm');
    expect(lengthLabel(0.5)).toBe('500 nm');
    expect(lengthLabel(1500)).toBe('1.5 mm');
    expect(lengthLabel(2.25)).toBe('2.25 µm');
    const k = kind();
    const texts = (over: Partial<ScaleBarParams>) =>
      k
        .render(decodeParams(k.fields, over), { w: 200, h: 150, slots: {} })
        .filter((q): q is TextPrim => q.kind === 'text')
        .map((q) => q.text);
    expect(texts({ length: 25 })).toEqual(['25 µm']);
    expect(texts({ label: 'Scale' })).toEqual(['Scale']);
    expect(texts({ showLabel: false })).toEqual([]);
  });

  it('refuses anything but a picture', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    expect(() => addScaleBar(page.id, { ...image, type: 'rect' } as never)).toThrow();
  });
});

describe('roundTo', () => {
  it('shows as many decimals as the step has, and at least two', () => {
    expect(roundTo(0.06451, 0.0001)).toBe(0.0645);
    expect(roundTo(1.23456, 0.5)).toBe(1.23);
    expect(roundTo(1.23456, undefined)).toBe(1.23);
  });
});
