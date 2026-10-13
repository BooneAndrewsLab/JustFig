import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { attachArrowEnd } from '../edits/arrowEnds';
import {
  type Edit,
  addObjects,
  deleteObjects,
  flipObjects,
  groupObjects,
  moveObjects,
  resizeObjects,
  rotateObjects,
  updateObjects,
} from '../edits/edits';
import { corners } from '../geometry/matrix';
import { objBounds } from '../geometry/transform';
import {
  BIND_GAP,
  BIND_SITES,
  bendOf,
  bentNodes,
  endPoint,
  nearestSite,
  outline,
  reconcileBindings,
  siteExit,
  sitePoint,
  targetCentre,
} from './binding';
import { cloneObjects } from './clone';
import { createArrow, createDoc, createEllipse, createPath, createRect, frame } from './factory';
import type { Id } from './ids';
import { findObj } from './tree';
import type { Arrow, ArrowBinding, BindSite, Figure, Obj, Vec2 } from './types';

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
      ...(bind.start === true ? { start: { id: a.id } } : {}),
      ...(bind.end === true ? { end: { id: b.id } } : {}),
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
    expect(arrow.bind).toEqual({ start: { id: a.id }, end: { id: b.id } });
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
    expect(arrowOf(fig, arrow.id).bind).toEqual({ start: { id: a.id }, end: { id: b.id } });
    fig = run(fig, moveObjects(pageId(fig), [b.id], 0, 80));
    arrow = arrowOf(fig, arrow.id);
    expect(bendOf(arrow.nodes)).toBeCloseTo(0.3, 6);
    expect(arrow.bind).toEqual({ start: { id: a.id }, end: { id: b.id } });
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
    expect(arrowOf(together, arrow.id).bind).toEqual({ start: { id: a.id }, end: { id: b.id } });
    expect(endPoint(arrowOf(together, arrow.id), 'start')?.y).toBeCloseTo(120);
  });

  it('drops a binding whose target is deleted, leaving the arrow where it was', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const b = createRect(frame(200, 0, 40, 40));
    const { fig, arrow } = bound(a, b);
    const next = run(fig, deleteObjects(pageId(fig), [b.id]));
    expect(arrowOf(next, arrow.id).bind).toEqual({ start: { id: a.id } });
    expect(arrowOf(next, arrow.id).nodes).toEqual(arrow.nodes);
  });

  it('never binds to a panel, another arrow or itself', () => {
    const a = createRect(frame(0, 0, 40, 40));
    const other = createArrow([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const { fig, arrow } = bound(a, other);
    expect(arrowOf(fig, arrow.id).bind).toEqual({ start: { id: a.id } });
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
    expect(carrow.bind).toEqual({ start: { id: ca.id } });
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

/** An arrow from `a` to `b` with the given bindings, added as the store would. */
function boundTo(
  a: Obj,
  b: Obj,
  start: Omit<ArrowBinding, 'id'> | null,
  end: Omit<ArrowBinding, 'id'> | null,
  nodes: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
): { fig: Figure; arrow: Arrow } {
  const arrow: Arrow = {
    ...createArrow(nodes),
    bind: {
      ...(start ? { start: { id: a.id, ...start } } : {}),
      ...(end ? { end: { id: b.id, ...end } } : {}),
    },
  };
  let fig = blank();
  fig = run(fig, addObjects(pageId(fig), [a, b]));
  fig = run(fig, addObjects(pageId(fig), [arrow]));
  return { fig, arrow: arrowOf(fig, arrow.id) };
}

const near = (p: Vec2 | undefined, q: Vec2, tol = 1e-6): boolean =>
  p !== undefined && Math.hypot(p.x - q.x, p.y - q.y) <= tol;

/**
 * Where an end at `site` should be, worked out from the frame's corners (independently
 * of `sitePoint`): an edge midpoint pushed `BIND_GAP` out from the centre, or the centre.
 */
function expectedSite(o: Obj, site: BindSite): Vec2 {
  const [tl, tr, br, bl] = corners(o.frame);
  if (!tl || !tr || !br || !bl) throw new Error('no corners');
  const mid = (p: Vec2, q: Vec2): Vec2 => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const c = mid(tl, br);
  const m = { top: mid(tl, tr), right: mid(tr, br), bottom: mid(br, bl), left: mid(bl, tl) };
  if (site === 'center') return c;
  const e = m[site];
  const l = Math.hypot(e.x - c.x, e.y - c.y);
  return { x: e.x + ((e.x - c.x) / l) * BIND_GAP, y: e.y + ((e.y - c.y) / l) * BIND_GAP };
}

describe('connection sites (issue 98, note 06)', () => {
  const box = () => createRect(frame(100, 100, 80, 40));

  it('puts the sites at the edge midpoints, a gap out, and the centre', () => {
    const r = box();
    expect(sitePoint(r, 'top')).toEqual({ x: 140, y: 100 - BIND_GAP });
    expect(sitePoint(r, 'right').x).toBeCloseTo(180 + BIND_GAP);
    expect(sitePoint(r, 'right').y).toBeCloseTo(120);
    expect(sitePoint(r, 'bottom').y).toBeCloseTo(140 + BIND_GAP);
    expect(sitePoint(r, 'left').x).toBeCloseTo(100 - BIND_GAP);
    expect(sitePoint(r, 'center')).toEqual({ x: 140, y: 120 });
    const e = createEllipse(frame(100, 100, 80, 40));
    expect(sitePoint(e, 'right').x).toBeCloseTo(180 + BIND_GAP);
  });

  it('gives each edge site an outward exit direction that turns and flips with the object', () => {
    const r = box();
    expect(siteExit(r, 'top')?.y).toBeCloseTo(-1);
    expect(siteExit(r, 'right')?.x).toBeCloseTo(1);
    expect(siteExit(r, 'center')).toBeUndefined();
    const turned = createRect(frame(100, 100, 80, 40, 90));
    expect(siteExit(turned, 'top')?.x).toBeCloseTo(1);
    const flipped = { ...r, frame: { ...r.frame, flipY: true } };
    expect(siteExit(flipped, 'top')?.y).toBeCloseTo(1);
  });

  it('snaps to the nearest site within the radius only', () => {
    const r = box();
    expect(nearestSite(r, { x: 143, y: 97 }, 6)).toBe('top');
    expect(nearestSite(r, { x: 141, y: 121 }, 6)).toBe('center');
    expect(nearestSite(r, { x: 120, y: 97 }, 6)).toBeUndefined();
  });

  it('places a site-bound end on its site and keeps it there as the target moves, resizes and turns', () => {
    const a = box();
    const b = createRect(frame(400, 300, 40, 40));
    let { fig, arrow } = boundTo(a, b, { site: 'bottom' }, { site: 'left' });
    expect(near(endPoint(arrow, 'start'), sitePoint(a, 'bottom'))).toBe(true);
    expect(near(endPoint(arrow, 'end'), sitePoint(b, 'left'))).toBe(true);
    const pid = pageId(fig);
    fig = run(fig, moveObjects(pid, [a.id], 30, -20));
    fig = run(
      fig,
      resizeObjects(pid, [a.id], objBounds(get(fig, a.id)), { x: 0, y: 0, w: 50, h: 90 }),
    );
    fig = run(fig, rotateObjects(pid, [b.id], { x: 420, y: 320 }, 30));
    fig = run(fig, flipObjects(pid, [a.id], 'y', [get(fig, a.id)]));
    arrow = arrowOf(fig, arrow.id);
    expect(near(endPoint(arrow, 'start'), sitePoint(get(fig, a.id), 'bottom'), 1e-4)).toBe(true);
    expect(near(endPoint(arrow, 'end'), sitePoint(get(fig, b.id), 'left'), 1e-4)).toBe(true);
    expect(arrow.bind).toEqual({
      start: { id: a.id, site: 'bottom' },
      end: { id: b.id, site: 'left' },
    });
  });

  it('aims a sliding end at the other end’s site', () => {
    const a = box();
    const b = createRect(frame(400, 300, 40, 40));
    const { arrow } = boundTo(a, b, { site: 'right' }, {});
    const s = sitePoint(a, 'right');
    const e = endPoint(arrow, 'end');
    if (!e) throw new Error('no end');
    expect(onOutline(e, b)).toBe(true);
    // On the ray from b's centre towards the start's site.
    const c = targetCentre(b);
    const cross = (e.x - c.x) * (s.y - c.y) - (e.y - c.y) * (s.x - c.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it('moves the middle points of a polyline not at all, only its bound end', () => {
    const a = box();
    const b = createRect(frame(400, 300, 40, 40));
    const nodes = [
      { x: 0, y: 0 },
      { x: 250, y: 50 },
      { x: 300, y: 300 },
    ];
    const { arrow } = boundTo(a, b, { site: 'top' }, null, nodes);
    expect(near(endPoint(arrow, 'start'), sitePoint(a, 'top'))).toBe(true);
    expect(near(endPoint(arrow, 'end'), { x: 300, y: 300 })).toBe(true);
  });

  it('attaches an end to a site, and moves it to another site of the same target', () => {
    const a = box();
    const b = createRect(frame(400, 300, 40, 40));
    let { fig, arrow } = boundTo(a, b, {}, null);
    const pid = pageId(fig);
    fig = run(fig, attachArrowEnd(pid, arrow.id, 'end', b.id, b, 'top'));
    arrow = arrowOf(fig, arrow.id);
    expect(arrow.bind?.end).toEqual({ id: b.id, site: 'top' });
    expect(near(endPoint(arrow, 'end'), sitePoint(b, 'top'))).toBe(true);
    fig = run(fig, attachArrowEnd(pid, arrow.id, 'end', b.id, b, 'center'));
    expect(near(endPoint(arrowOf(fig, arrow.id), 'end'), targetCentre(b))).toBe(true);
    fig = run(fig, attachArrowEnd(pid, arrow.id, 'end', b.id, b));
    arrow = arrowOf(fig, arrow.id);
    expect(arrow.bind?.end).toEqual({ id: b.id });
    expect(onOutline(endPoint(arrow, 'end'), b)).toBe(true);
  });

  it('re-solving an unchanged figure is a no-op', () => {
    const a = box();
    const b = createEllipse(frame(400, 300, 40, 60, 20));
    const { fig } = boundTo(a, b, { site: 'left' }, { site: 'bottom' });
    expect(reconcileBindings(fig, fig)).toBe(fig);
    const touched = run(fig, moveObjects(pageId(fig), [a.id], 5, 5));
    expect(reconcileBindings(fig, touched)).toEqual(touched);
  });

  it('detaches a site-bound end the user drags away from an unchanged target', () => {
    const a = box();
    const b = createRect(frame(400, 300, 40, 40));
    const { fig, arrow } = boundTo(a, b, { site: 'top' }, { site: 'top' });
    const next = run(fig, moveObjects(pageId(fig), [arrow.id], 10, 0));
    expect(arrowOf(next, arrow.id).bind).toBeUndefined();
  });

  it('copies keep the site when they remap the binding', () => {
    const a = box();
    const b = createRect(frame(400, 300, 40, 40));
    const { arrow } = boundTo(a, b, { site: 'right' }, { site: 'center' });
    const [ca, carrow] = cloneObjects([a, arrow], 10, 10);
    if (!ca || carrow?.type !== 'arrow') throw new Error('bad clone');
    expect(carrow.bind).toEqual({ start: { id: ca.id, site: 'right' } });
  });

  it('keeps a site-bound end at its site for any target, site and transform (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: -300, max: 300, noNaN: true }),
          y: fc.double({ min: -300, max: 300, noNaN: true }),
          w: fc.double({ min: 2, max: 200, noNaN: true }),
          h: fc.double({ min: 2, max: 200, noNaN: true }),
          rot: fc.double({ min: -180, max: 180, noNaN: true }),
          ellipse: fc.boolean(),
          site: fc.constantFrom(...BIND_SITES),
          dx: fc.double({ min: -300, max: 300, noNaN: true }),
          dy: fc.double({ min: -300, max: 300, noNaN: true }),
          sw: fc.double({ min: 2, max: 200, noNaN: true }),
          sh: fc.double({ min: 2, max: 200, noNaN: true }),
          turn: fc.double({ min: -180, max: 180, noNaN: true }),
          flip: fc.constantFrom(null, 'x' as const, 'y' as const),
        }),
        (r) => {
          const f = frame(r.x, r.y, r.w, r.h, r.rot);
          const t = r.ellipse ? createEllipse(f) : createRect(f);
          const far = createRect(frame(r.x + 600, r.y + 400, 10, 10));
          let { fig, arrow } = boundTo(t, far, { site: r.site }, {});
          const pid = pageId(fig);
          fig = run(fig, moveObjects(pid, [t.id], r.dx, r.dy));
          const o = get(fig, t.id).frame;
          fig = run(
            fig,
            resizeObjects(pid, [t.id], objBounds(get(fig, t.id)), {
              x: o.x,
              y: o.y,
              w: r.sw,
              h: r.sh,
            }),
          );
          fig = run(fig, rotateObjects(pid, [t.id], { x: 0, y: 0 }, r.turn));
          if (r.flip) fig = run(fig, flipObjects(pid, [t.id], r.flip, [get(fig, t.id)]));
          arrow = arrowOf(fig, arrow.id);
          return near(endPoint(arrow, 'start'), expectedSite(get(fig, t.id), r.site), 0.5);
        },
      ),
      { numRuns: 200 },
    );
  });
});
