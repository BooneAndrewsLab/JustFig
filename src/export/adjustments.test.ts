/** The image-adjustments statement (note 37). */
import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc, createPanel, frame } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Figure, Image, Obj } from '@/core/model/types';

import { adjustmentsStatement } from './adjustments';

const pic = (levels?: { min: number; max: number; invert: boolean }): Image => ({
  id: newId('o'),
  type: 'image',
  asset: 'a',
  frame: frame(0, 0, 10, 10),
  opacity: 1,
  ...(levels ? { levels: { ...levels, base: 'b' } } : {}),
});

/** One panel per entry, side by side, each holding the given pictures. */
const figWith = (...panels: Image[][]): Figure => {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const objs: Obj[] = panels.map((kids, i) => ({
    ...createPanel(frame(i * 150, 0, 100, 100)),
    children: kids,
  }));
  return addObjects(page.id, objs).apply({ doc, assets: {} });
};

const L = { min: 10, max: 200, invert: false };

describe('adjustmentsStatement', () => {
  it('is empty when no picture was adjusted', () => {
    expect(adjustmentsStatement(figWith([pic()], [pic()]))).toBe('');
    expect(adjustmentsStatement(figWith())).toBe('');
  });

  it('names the adjusted panel and the ones left alone', () => {
    expect(adjustmentsStatement(figWith([pic()], [pic(L)], [pic()]))).toBe(
      'Image adjustments: Levels (black and white points, a linear stretch) were applied to the whole image in panel B. Pictures in panels A and C were not adjusted.',
    );
  });

  it('says nothing about unadjusted panels when every panel was adjusted', () => {
    const s = adjustmentsStatement(figWith([pic(L)], [pic(L)]));
    expect(s).toContain('in panels A and B.');
    expect(s).not.toContain('not adjusted');
  });

  it('tells inversion from levels, and an inversion alone from both', () => {
    const inv = { min: 0, max: 255, invert: true };
    expect(adjustmentsStatement(figWith([pic(inv)]))).toBe(
      'Image adjustments: Intensities were inverted over the whole image in panel A.',
    );
    expect(adjustmentsStatement(figWith([pic(L)], [pic(inv)]))).toBe(
      'Image adjustments: Levels (black and white points, a linear stretch) were applied to the whole image in panel A, and intensities were inverted over the whole image in panel B.',
    );
  });

  it('mentions pictures outside any panel', () => {
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const f = addObjects(page.id, [pic(L)]).apply({ doc, assets: {} });
    expect(adjustmentsStatement(f)).toContain('in pictures outside the lettered panels.');
  });
});
