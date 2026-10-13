import { describe, expect, it } from 'vitest';

import { readFragment, writeFragment } from '@/io/jfig';
import { AppStore, currentPage } from '@/ui/state/store';

import { objBounds } from '../geometry/transform';
import { reconcileBindings } from '../model/binding';
import { cloneObjects } from '../model/clone';
import { createArrow, createEllipse, createPage, createRect, frame } from '../model/factory';
import { findObj } from '../model/tree';
import type { Arrow, Obj } from '../model/types';
import { addObjects, addPage, spaceObjects, spacingBetween, swapPositions } from './edits';

const rect = (x: number, y: number, w: number, h: number): Obj => createRect(frame(x, y, w, h));

function setup(objs: readonly Obj[]) {
  const s = new AppStore();
  const page = currentPage(s.getState());
  s.edit(addObjects(page.id, objs));
  const get = (id: string): Obj => {
    const o = findObj(currentPage(s.getState()), id as never);
    if (!o) throw new Error('missing');
    return o;
  };
  return { s, page, get };
}

describe('spacing (note 35)', () => {
  it('measures edge to edge on both axes whatever the order', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(25, 40, 20, 5);
    expect(spacingBetween(a, b)).toEqual({ x: 15, y: 30 });
    expect(spacingBetween(b, a)).toEqual({ x: 15, y: 30 });
    expect(spacingBetween(a, rect(5, 5, 10, 10))).toEqual({ x: -5, y: -5 });
  });

  it('spaces a selection by the gap in its current order, one undo step', () => {
    const [a, b, c] = [rect(0, 0, 10, 10), rect(100, 3, 30, 10), rect(50, 6, 20, 10)] as [
      Obj,
      Obj,
      Obj,
    ];
    const { s, page, get } = setup([a, b, c]);
    const depth = s.getState().history.undoDepth;
    s.edit(spaceObjects(page.id, [a, b, c], 'x', 5));
    expect(s.getState().history.undoDepth).toBe(depth + 1);
    // Order is a, c, b; a stays put.
    expect(get(a.id).frame.x).toBe(0);
    expect(get(c.id).frame.x).toBe(15);
    expect(get(b.id).frame.x).toBe(40);
    // Cross-axis untouched.
    expect(get(b.id).frame.y).toBe(3);
    s.undo();
    expect(get(b.id).frame.x).toBe(100);
    expect(s.undoLabel()).toBe('Undo Add 3 objects');
  });

  it('spaces vertically, and can overlap with a negative gap', () => {
    const [a, b] = [rect(0, 0, 10, 10), rect(7, 90, 10, 20)] as [Obj, Obj];
    const { s, page, get } = setup([a, b]);
    s.edit(spaceObjects(page.id, [a, b], 'y', -4));
    expect(get(b.id).frame.y).toBe(6);
    expect(get(b.id).frame.x).toBe(7);
  });

  it('moves the points of a path and leaves a locked object where it is', () => {
    const arrow = createArrow([
      { x: 100, y: 0 },
      { x: 120, y: 20 },
    ]);
    const locked = { ...rect(200, 0, 10, 10), locked: true };
    const a = rect(0, 0, 10, 10);
    const { s, page, get } = setup([a, arrow, locked]);
    s.edit(spaceObjects(page.id, [a, arrow, locked], 'x', 2));
    expect(objBounds(get(arrow.id)).x).toBe(12);
    expect(get(locked.id).frame.x).toBe(200);
  });
});

describe('swap positions (note 35)', () => {
  it('swaps the top-left corners and keeps each size, in one undo step', () => {
    const a = rect(10, 20, 40, 10);
    const b = createEllipse(frame(100, 5, 8, 30));
    const { s, page, get } = setup([a, b]);
    const depth = s.getState().history.undoDepth;
    s.edit(swapPositions(page.id, [a, b]));
    expect(s.getState().history.undoDepth).toBe(depth + 1);
    expect(get(a.id).frame).toMatchObject({ x: 100, y: 5, w: 40, h: 10 });
    expect(get(b.id).frame).toMatchObject({ x: 10, y: 20, w: 8, h: 30 });
    s.undo();
    expect(get(a.id).frame).toMatchObject({ x: 10, y: 20 });
  });

  it('does nothing unless exactly two unlocked objects are given', () => {
    const [a, b, c] = [rect(0, 0, 5, 5), rect(10, 0, 5, 5), rect(20, 0, 5, 5)] as [Obj, Obj, Obj];
    const { s, page } = setup([a, b, c]);
    const depth = s.getState().history.undoDepth;
    const before = s.getState().history.present;
    s.edit(swapPositions(page.id, [a, b, c]));
    s.edit(swapPositions(page.id, [{ ...a, locked: true }, b]));
    expect(s.getState().history.present.doc).toEqual(before.doc);
    expect(s.getState().history.undoDepth).toBeGreaterThanOrEqual(depth);
  });

  it('does not move an arrow bound to a swapped object inside the edit; reconcile does', () => {
    const a = rect(0, 0, 40, 40);
    const b = rect(200, 0, 40, 40);
    const arrow: Arrow = {
      ...createArrow([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
      bind: { start: { id: a.id }, end: { id: b.id } },
    };
    const { s, page } = setup([a, b, arrow]);
    const before = s.getState().history.present;
    const edit = swapPositions(page.id, [a, b]);
    const raw = edit.apply(before);
    const arrowOf = (f: typeof before): Arrow => findObj(f.doc.pages[0]!, arrow.id) as Arrow;
    expect(arrowOf(raw).nodes).toEqual(arrowOf(before).nodes);
    expect(arrowOf(raw).frame).toEqual(arrowOf(before).frame);
    // The store's reconcile then follows the targets.
    expect(reconcileBindings(before, raw)).not.toEqual(raw);
  });
});

describe('paste in place (note 35)', () => {
  it('keeps the copied position on another page, and after a second paste', () => {
    const a = rect(33, 44, 10, 10);
    const { s, page } = setup([a]);
    const second = createPage('Page 2');
    s.edit(addPage(second));
    const text = writeFragment({ objects: [a], assets: {} });
    const frag = readFragment(text);
    expect(frag).not.toBeNull();
    const copies = cloneObjects(frag?.objects ?? [], 0, 0);
    s.edit(addObjects(second.id, copies, frag?.assets));
    const pasted = findObj(s.getState().history.present.doc.pages[1]!, copies[0]!.id);
    expect(pasted?.frame).toMatchObject({ x: 33, y: 44, w: 10, h: 10 });
    expect(copies[0]?.id).not.toBe(a.id);
    expect(page.id).not.toBe(second.id);
  });
});
