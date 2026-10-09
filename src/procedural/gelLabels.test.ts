/** Gel lane labels on a picture (#13): grouped with it, and still on the lanes after a resize. */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { scaleObj } from '@/core/geometry/transform';
import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Figure, Group, Image, Procedural } from '@/core/model/types';

import { labelGelImage } from './edits';
import { decodeParams } from './params';
import type { TextPrim } from './prims';
import { getKind } from './registry';

const image: Image = {
  id: newId('o'),
  type: 'image',
  asset: 'h',
  frame: { x: 100, y: 50, w: 300, h: 200, rotation: 0, flipX: true },
  opacity: 1,
};

function labelled(): { fig: Figure; edit: ReturnType<typeof labelGelImage> } {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const fig = addObjects(page.id, [image]).apply({ doc, assets: {} });
  const edit = labelGelImage(page.id, image);
  return { fig: edit.apply(fig), edit };
}

const laneXs = (o: Procedural): number[] => {
  const k = getKind('gelLabels');
  if (!k) throw new Error('kind');
  const p = decodeParams(k.fields, o.params);
  return k
    .render(p, { w: o.frame.w, h: o.frame.h, slots: {} })
    .filter((q): q is TextPrim => q.kind === 'text' && q.y < 0)
    .map((q) => o.frame.x + q.x);
};

describe('labelGelImage', () => {
  it('groups the picture with labels over its box, unflipped, and selects the labels', () => {
    const { fig, edit } = labelled();
    const g = fig.doc.pages[0]?.layers[0]?.children[0] as Group;
    expect(g.type).toBe('group');
    const [img, labels] = g.children as [Image, Procedural];
    expect(img).toEqual(image);
    expect(labels.kind).toBe('gelLabels');
    expect(labels.frame).toEqual({ x: 100, y: 50, w: 300, h: 200, rotation: 0 });
    expect(edit.select).toEqual([labels.id]);
  });

  it('keeps every lane label at the same place on the picture when the group is resized', () => {
    const { fig } = labelled();
    const g = fig.doc.pages[0]?.layers[0]?.children[0] as Group;
    const before = laneXs(g.children[1] as Procedural).map((x) => (x - 100) / 300);
    const scaled = scaleObj(g, { x: 100, y: 50 }, 0.5, 0.5) as Group;
    const [img, labels] = scaled.children as [Image, Procedural];
    expect(labels.frame).toMatchObject({ x: img.frame.x, w: img.frame.w });
    const after = laneXs(labels).map((x) => (x - img.frame.x) / img.frame.w);
    after.forEach((x, i) => {
      expect(x).toBeCloseTo(before[i] ?? NaN, 9);
    });
    // Text keeps its size in points.
    expect(decodeParams(getKind('gelLabels')?.fields ?? [], labels.params)['size']).toBe(8);
  });

  it('refuses anything but a picture', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    expect(() => labelGelImage(page.id, { ...image, type: 'rect' } as never)).toThrow();
  });
});
