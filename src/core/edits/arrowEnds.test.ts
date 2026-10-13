import { describe, expect, it } from 'vitest';

import { BIND_GAP, reconcileBindings } from '../model/binding';
import { createArrow, createDoc, createPath, createRect, frame } from '../model/factory';
import type { Id } from '../model/ids';
import { findObj } from '../model/tree';
import type { Arrow, Figure, Obj } from '../model/types';
import {
  arrowEndAt,
  attachArrowEnd,
  neighbourOf,
  pagePoints,
  pointDragTarget,
  snap45,
  usesPointHandles,
} from './arrowEnds';
import { type Edit, addObjects } from './edits';
import { moveNodePart } from './nodes';

const run = (f: Figure, e: Edit): Figure => reconcileBindings(f, e.apply(f));
const get = (f: Figure, id: Id): Obj => {
  const o = f.doc.pages[0] ? findObj(f.doc.pages[0], id) : undefined;
  if (!o) throw new Error('missing');
  return o;
};

describe('usesPointHandles', () => {
  it('is true for open straight lines and arrows, polylines included', () => {
    expect(
      usesPointHandles(
        createPath(
          [
            { x: 0, y: 0 },
            { x: 10, y: 5 },
          ],
          false,
        ),
      ),
    ).toBe(true);
    expect(
      usesPointHandles(
        createArrow([
          { x: 0, y: 0 },
          { x: 10, y: 5 },
          { x: 20, y: 0 },
        ]),
      ),
    ).toBe(true);
  });
  it('is false for closed paths, curved paths and other objects', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ];
    expect(usesPointHandles(createPath(tri, true))).toBe(false);
    expect(
      usesPointHandles(
        createPath(
          [
            { x: 0, y: 0, out: { x: 3, y: 5 } },
            { x: 10, y: 0 },
          ],
          false,
        ),
      ),
    ).toBe(false);
    expect(usesPointHandles(createRect(frame(0, 0, 10, 10)))).toBe(false);
  });
});

describe('point drag geometry', () => {
  it('lists page points, neighbours and arrow ends', () => {
    const a = createArrow([
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 25, y: 9 },
    ]);
    const pts = pagePoints(a);
    expect(pts.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [5, 5],
      [15, 5],
      [25, 9],
    ]);
    expect(neighbourOf(pts, 0)).toEqual(pts[1]);
    expect(neighbourOf(pts, 2)).toEqual(pts[1]);
    expect([0, 1, 2].map((i) => arrowEndAt(a, i))).toEqual(['start', undefined, 'end']);
  });
  it('moves by the pointer delta, or snaps to 45 degrees off the neighbour with Shift', () => {
    expect(pointDragTarget({ x: 10, y: 10 }, { x: 3, y: 4 }, undefined, false)).toEqual({
      x: 13,
      y: 14,
    });
    const t = pointDragTarget({ x: 10, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }, true);
    expect(t.x).toBeCloseTo(10.05, 1);
    expect(t.y).toBeCloseTo(0, 6);
    const d = snap45({ x: 0, y: 0 }, { x: 10, y: 9 });
    expect(d.x).toBeCloseTo(d.y, 9);
  });
});

describe('dragging an arrow end', () => {
  const setup = () => {
    const box = createRect(frame(100, 0, 40, 40));
    const arrow = createArrow([
      { x: 0, y: 20 },
      { x: 60, y: 20 },
    ]);
    let f: Figure = { doc: createDoc(), assets: {} };
    const pid = f.doc.pages[0]?.id;
    if (!pid) throw new Error('no page');
    f = run(f, addObjects(pid, [box, arrow]));
    return { f, pid, box, arrow };
  };
  it('detaches in empty space and attaches on release over an object, in one coalesced result', () => {
    const { f, pid, box, arrow } = setup();
    const moved = run(f, moveNodePart(pid, arrow.id, { index: 1, part: 'node' }, 20, 0));
    expect((get(moved, arrow.id) as Arrow).bind).toBeUndefined();
    const t = get(moved, box.id);
    const bound = run(moved, attachArrowEnd(pid, arrow.id, 'end', box.id, t));
    const a = get(bound, arrow.id) as Arrow;
    expect(a.bind?.end?.id).toBe(box.id);
    const end = pagePoints(a)[1];
    expect(end?.x).toBeCloseTo(100 - BIND_GAP, 3);
  });
});
