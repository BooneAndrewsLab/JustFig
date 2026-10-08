import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type Edit,
  addObjects,
  deleteObjects,
  groupObjects,
  moveObjects,
  resizeObjects,
  rotateObjects,
  updateObjects,
} from '../edits/edits';
import {
  BIND_GAP,
  bendOf,
  bentNodes,
  endPoint,
  outline,
  reconcileBindings,
  targetCentre,
} from './binding';
import { cloneObjects } from './clone';
import { createArrow, createDoc, createEllipse, createPath, createRect, frame } from './factory';
import type { Id } from './ids';
import { findObj } from './tree';
import type { Arrow, Figure, Obj, Vec2 } from './types';

const blank = (): Figure => ({ doc: createDoc(), assets: {} });
const pageId = (f: Figure): Id => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p.id;
};
/** An edit as the store applies it. */
const run = (f: Figure, e: Edit): Figure => reconcileBindings(f, e.apply(f));
const get = (f: Figure, id: Id): Obj => {
  const p = f.doc.pages[0];
  const o = p ? findObj(p, id) : undefined;
  if (!o) throw new Error(`no ${id}`);
  return o;
};
const arrowOf = (f: Figure, id: Id): Arrow => get(f, id) as Arrow;

/** Distance from a point to a closed polygon's edges. */
function distToPoly(p: Vec2, poly: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * ex), p.y - (a.y + t * ey)));
  }
  return best;
}

/** That a bound end is BIND_GAP beyond the outline along its ray from the target's centre. */
function onOutline(end: Vec2 | undefined, target: Obj): boolean {
  if (!end) return false;
  const c = targetCentre(target);
  const l = Math.hypot(end.x - c.x, end.y - c.y);
  if (l < BIND_GAP) return false;
  const k = (l - BIND_GAP) / l;
  const q = { x: c.x + (end.x - c.x) * k, y: c.y + (end.y - c.y) * k };
  return distToPoly(q, outline(target)) < 0.01;
}

function bound(
  a: Obj,
  b: Obj,
  bind: { start?: boolean; end?: boolean } = { start: true, end: true },
): { fig: Figure; arrow: Arrow } {
  const arrow: Arrow = {
    ...createArrow([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]),
    bind: {
      ...(bind.start === true ? { start: a.id } : {}),
      ...(bind.end === true ? { end: b.id } : {}),
    },
  };
  let fig = blank();
  fig = run(fig, addObjects(pageId(fig), [a, b]));
  fig = run(fig, addObjects(pageId(fig), [arrow]));
  return { fig, arrow: arrowOf(fig, arrow.id) };
}

describe('arrow binding (note 06)', () => {
  it('puts both ends on the targets’ outlines, a gap outside, centre to centre', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createRect(frame(200, 0, 40, 40));
    const { arrow } = bound(a, b);
    const s = endPoint(arrow, 'start');
    const e = endPoint(arrow, 'end');
    expect(s?.x).toBeCloseTo(40 + BIND_GAP);
    expect(s?.y).toBeCloseTo(20);
    expect(e?.x).toBeCloseTo(200 - BIND_GAP);
    expect(e?.y).toBeCloseTo(20);
  });

  it('follows a target that moves, resizes or rotates', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createEllipse(frame(200, 100, 60, 30));
    let { fig, arrow } = bound(a, b);
    const pid = pageId(fig);
    fig = run(fig, moveObjects(pid, [b.id], 0, 50));
    let e = endPoint(arrowOf(fig, arrow.id), 'end');
    if (!e) throw new Error('no end');
    expect(onOutline(e, get(fig, b.id))).toBe(true);
    fig = run(
      fig,
      resizeObjects(pid, [a.id], { x: 0, y: 0, w: 40, h: 40 }, { x: 0, y: 0, w: 80, h: 120 }),
    );
    const s = endPoint(arrowOf(fig, arrow.id), 'start');
    if (!s) throw new Error('no start');
    expect(onOutline(s, get(fig, a.id))).toBe(true);
    fig = run(fig, rotateObjects(pid, [b.id], { x: 230, y: 165 }, 30));
    arrow = arrowOf(fig, arrow.id);
    e = endPoint(arrow, 'end');
    if (!e) throw new Error('no end');
    expect(onOutline(e, get(fig, b.id))).toBe(true);
    expect(arrow.bind).toEqual({ start: a.id, end: b.id });
  });

  it('works on a closed path outline', () => {
    const tri = createPath(
      [
        { x: 100, y: 0 },
        { x: 160, y: 100 },
        { x: 40, y: 100 },
      ],
      true,
    );
    const a = createRect(frame(-200, 40, 20, 20));
    const { fig, arrow } = bound(a, tri);
    const e = endPoint(arrow, 'end');
    const t = get(fig, tri.id);
    expect(onOutline(e, t)).toBe(true);
  });

  it('keeps a curved arrow’s bend', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createRect(frame(200, 0, 40, 40));
    let { fig, arrow } = bound(a, b);
    const p = endPoint(arrow, 'start');
    const q = endPoint(arrow, 'end');
    if (!p || !q) throw new Error('no ends');
    const c = createArrow(bentNodes(p, q, 0.3));
    fig = run(
      fig,
      updateObjects(
        pageId(fig),
        [arrow.id],
        'Curve',
        (o) => ({ ...o, frame: c.frame, nodes: c.nodes }) as Obj,
      ),
    );
    expect(arrowOf(fig, arrow.id).bind).toEqual({ start: a.id, end: b.id });
    fig = run(fig, moveObjects(pageId(fig), [b.id], 0, 80));
    arrow = arrowOf(fig, arrow.id);
    expect(bendOf(arrow.nodes)).toBeCloseTo(0.3, 6);
    expect(arrow.bind).toEqual({ start: a.id, end: b.id });
  });

  it('re-solving an unchanged figure changes nothing, and restyling never moves the arrow', () => {
    const { fig, arrow } = bound(
      createRect(frame(0, 0, 40, 40)),
      createRect(frame(90, 70, 30, 20)),
    );
    expect(reconcileBindings(fig, fig)).toBe(fig);
    const next = run(
      fig,
      updateObjects(pageId(fig), [arrow.id], 'Restyle', (o) =>
        o.type === 'arrow' ? { ...o, style: { ...o.style, strokeWidth: 3 } } : o,
      ),
    );
    expect(arrowOf(next, arrow.id).nodes).toEqual(arrow.nodes);
    expect(arrowOf(next, arrow.id).bind).toEqual(arrow.bind);
  });

  it('detaches the ends the user drags away, and keeps them when the targets come along', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createRect(frame(200, 0, 40, 40));
    const { fig, arrow } = bound(a, b);
    const pid = pageId(fig);
    const alone = run(fig, moveObjects(pid, [arrow.id], 0, 100));
    expect(arrowOf(alone, arrow.id).bind).toBeUndefined();
    const together = run(fig, moveObjects(pid, [arrow.id, a.id, b.id], 0, 100));
    expect(arrowOf(together, arrow.id).bind).toEqual({ start: a.id, end: b.id });
    expect(endPoint(arrowOf(together, arrow.id), 'start')?.y).toBeCloseTo(120);
  });

  it('drops a binding whose target is deleted, leaving the arrow where it was', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createRect(frame(200, 0, 40, 40));
    const { fig, arrow } = bound(a, b);
    const next = run(fig, deleteObjects(pageId(fig), [b.id]));
    expect(arrowOf(next, arrow.id).bind).toEqual({ start: a.id });
    expect(arrowOf(next, arrow.id).nodes).toEqual(arrow.nodes);
  });

  it('never binds to a panel, another arrow or itself', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const other = createArrow([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const { fig, arrow } = bound(a, other);
    expect(arrowOf(fig, arrow.id).bind).toEqual({ start: a.id });
  });

  it('follows a target inside a group, and refits a group holding the arrow', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createRect(frame(200, 0, 40, 40));
    let { fig, arrow } = bound(a, b);
    const g = 'o_group' as Id;
    fig = run(fig, groupObjects(pageId(fig), [arrow.id, b.id], g));
    fig = run(fig, moveObjects(pageId(fig), [a.id], 0, -100));
    arrow = arrowOf(fig, arrow.id);
    expect(endPoint(arrow, 'start')?.y).toBeLessThan(0);
    const group = get(fig, g);
    expect(group.frame.y).toBeLessThan(0);
  });

  it('copies remap a binding to the copied target and drop one to a target left behind', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createRect(frame(200, 0, 40, 40));
    const { arrow } = bound(a, b);
    const [ca, carrow] = cloneObjects([a, arrow], 10, 10);
    if (!ca || carrow?.type !== 'arrow') throw new Error('bad clone');
    expect(carrow.bind).toEqual({ start: ca.id });
  });

  it('keeps a bound end on the outline for any target and move (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: -300, max: 300, noNaN: true }),
          y: fc.double({ min: -300, max: 300, noNaN: true }),
          w: fc.double({ min: 2, max: 200, noNaN: true }),
          h: fc.double({ min: 2, max: 200, noNaN: true }),
          rot: fc.double({ min: -180, max: 180, noNaN: true }),
          ellipse: fc.boolean(),
          dx: fc.double({ min: -300, max: 300, noNaN: true }),
          dy: fc.double({ min: -300, max: 300, noNaN: true }),
        }),
        (r) => {
          const f = frame(r.x, r.y, r.w, r.h, r.rot);
          const t = r.ellipse ? createEllipse(f) : createRect(f);
          const far = createRect(frame(r.x + 600, r.y + 400, 10, 10));
          let { fig, arrow } = bound(t, far);
          fig = run(fig, moveObjects(pageId(fig), [t.id], r.dx, r.dy));
          arrow = arrowOf(fig, arrow.id);
          const s = endPoint(arrow, 'start');
          if (!s) return false;
          return onOutline(s, get(fig, t.id));
        },
      ),
      { numRuns: 200 },
    );
  });
});
