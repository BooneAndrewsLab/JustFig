import { beforeAll, describe, expect, it } from 'vitest';

import { frameBounds } from '../geometry/matrix';
import { objBounds } from '../geometry/transform';
import {
  createDoc,
  createEllipse,
  createPanel,
  createPath,
  createRect,
  frame,
} from '../model/factory';
import { findObj, pageObjects } from '../model/tree';
import type { Figure, Obj, Page } from '../model/types';
import { loadTestFonts } from '@/test/fonts';
import { readJfig, writeJfig } from '@/io/jfig';

import {
  addObjects,
  alignObjects,
  deleteObjects,
  distributeObjects,
  flipObjects,
  groupObjects,
  moveObjects,
  reorderObjects,
  resizeObjects,
  rotateObjects,
  ungroupObjects,
} from './edits';

beforeAll(loadTestFonts);

const start = (): { fig: Figure; page: Page } => {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return { fig: { doc, assets: {} }, page };
};
const top = (f: Figure): readonly Obj[] => f.doc.pages[0]?.layers[0]?.children ?? [];
const pg = (f: Figure): Page => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p;
};

describe('edits', () => {
  it('adds objects into the panel under their centre, and moves them out again', () => {
    const { fig, page } = start();
    const panel = createPanel(frame(0, 0, 100, 100));
    const r = createRect(frame(10, 10, 20, 20));
    let f = addObjects(page.id, [panel]).apply(fig);
    f = addObjects(page.id, [r]).apply(f);
    expect(top(f).map((o) => o.type)).toEqual(['panel']);
    // Moving the panel moves what is on it.
    f = moveObjects(page.id, [panel.id], 50, 0).apply(f);
    expect(findObj(pg(f), r.id)?.frame.x).toBe(60);
    // Dragged off the panel, the rect leaves it.
    f = moveObjects(page.id, [r.id], 300, 0).apply(f);
    expect(top(f).map((o) => o.type)).toEqual(['panel', 'rect']);
  });

  it('keeps stacking order when a move does not change the panel', () => {
    const { fig, page } = start();
    const a = createRect(frame(0, 0, 10, 10));
    const b = createRect(frame(5, 5, 10, 10));
    let f = addObjects(page.id, [a, b]).apply(fig);
    f = moveObjects(page.id, [a.id], 1, 1).apply(f);
    expect(top(f).map((o) => o.id)).toEqual([a.id, b.id]);
  });

  it('groups and ungroups, keeping bounds and passing opacity down', () => {
    const { fig, page } = start();
    const a = createRect(frame(0, 0, 10, 10));
    const b = createEllipse(frame(20, 30, 10, 10));
    let f = addObjects(page.id, [a, b]).apply(fig);
    const g = groupObjects(page.id, [a.id, b.id]);
    f = g.apply(f);
    const group = top(f)[0];
    expect(group?.type).toBe('group');
    expect(group?.frame).toEqual({ x: 0, y: 0, w: 30, h: 40, rotation: 0 });
    f = {
      ...f,
      doc: {
        ...f.doc,
        pages: [
          { ...pg(f), layers: [{ ...pg(f).layers[0]!, children: [{ ...group!, opacity: 0.5 }] }] },
        ],
      },
    };
    f = ungroupObjects(page.id, [group!.id]).apply(f);
    expect(top(f).map((o) => [o.id, o.opacity])).toEqual([
      [a.id, 0.5],
      [b.id, 0.5],
    ]);
  });

  it('resizing a path bakes the scale into its nodes, not its stroke', () => {
    const { fig, page } = start();
    const p = createPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ],
      false,
    );
    let f = addObjects(page.id, [p]).apply(fig);
    f = resizeObjects(
      page.id,
      [p.id],
      { x: 0, y: 0, w: 10, h: 20 },
      { x: 5, y: 5, w: 30, h: 20 },
    ).apply(f);
    const q = findObj(pg(f), p.id);
    expect(q?.type === 'path' && q.nodes).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 20 },
    ]);
    expect(q?.type === 'path' && q.style.strokeWidth).toBe(p.style.strokeWidth);
    expect(q?.frame).toMatchObject({ x: 5, y: 5, w: 30, h: 20 });
  });

  it('rotates and flips about the selection centre exactly', () => {
    const { fig, page } = start();
    const a = createRect(frame(0, 0, 20, 10));
    let f = addObjects(page.id, [a]).apply(fig);
    f = rotateObjects(page.id, [a.id], { x: 10, y: 5 }, 90).apply(f);
    const b = frameBounds(findObj(pg(f), a.id)!.frame);
    expect(b.w).toBeCloseTo(10);
    expect(b.h).toBeCloseTo(20);
    f = flipObjects(page.id, [a.id], 'x', [findObj(pg(f), a.id)!]).apply(f);
    expect(findObj(pg(f), a.id)?.frame).toMatchObject({ rotation: -90, flipX: true });
  });

  it('aligns and distributes', () => {
    const { fig, page } = start();
    const objs = [0, 15, 100].map((x, i) => createRect(frame(x, i * 7, 10, 10)));
    let f = addObjects(page.id, objs).apply(fig);
    f = alignObjects(page.id, objs, 'top', { x: 0, y: 0, w: 500, h: 500 }).apply(f);
    expect(top(f).map((o) => o.frame.y)).toEqual([0, 0, 0]);
    f = distributeObjects(page.id, top(f), 'x').apply(f);
    expect(top(f).map((o) => o.frame.x)).toEqual([0, 50, 100]);
  });

  it('reorders', () => {
    const { fig, page } = start();
    const [a, b, c] = [1, 2, 3].map((x) => createRect(frame(x, x, 1, 1)));
    let f = addObjects(page.id, [a!, b!, c!]).apply(fig);
    f = reorderObjects(page.id, [a!.id], 'front').apply(f);
    expect(top(f).map((o) => o.id)).toEqual([b!.id, c!.id, a!.id]);
    f = reorderObjects(page.id, [a!.id], 'backward').apply(f);
    expect(top(f).map((o) => o.id)).toEqual([b!.id, a!.id, c!.id]);
  });

  it('leaves a figure that saves and opens after any of them', () => {
    const { fig, page } = start();
    const objs = [createRect(frame(0, 0, 10, 10)), createEllipse(frame(30, 0, 10, 10))];
    let f = addObjects(page.id, objs).apply(fig);
    f = groupObjects(
      page.id,
      objs.map((o) => o.id),
    ).apply(f);
    f = rotateObjects(page.id, [top(f)[0]!.id], { x: 0, y: 0 }, 33).apply(f);
    f = deleteObjects(page.id, [objs[0]!.id]).apply(f);
    expect(readJfig(writeJfig(f, { name: 't', version: '0' })).doc).toEqual(f.doc);
    expect([...pageObjects(pg(f))].map((o) => o.type)).toEqual(['group', 'ellipse']);
    expect(objBounds(top(f)[0]!)).toEqual(objBounds(findObj(pg(f), objs[1]!.id)!));
  });
});
