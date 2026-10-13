import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { attachArrowEnd, setArrowMid, setArrowRoute } from '../edits/arrowEnds';
import { type Edit, addObjects, moveObjects, resizeObjects } from '../edits/edits';
import { apply, frameMatrix } from '../geometry/matrix';
import {
  elbowRoute,
  endPoint,
  endTargets,
  reconcileBindings,
  sitePoint,
  solveArrow,
} from './binding';
import { createArrow, createDoc, createRect, frame } from './factory';
import type { Id } from './ids';
import { ELBOW_STUB, midAt, routeCurve, routeElbow } from './route';
import { findObj } from './tree';
import type { Arrow, BindSite, Figure, Vec2 } from './types';

const R = (x: number, y: number) => ({ x, y });
/** An arrow's points on the page, rounded to 1e-6 (for exact comparisons). */
const pageNodesOf = (a: Arrow): Vec2[] =>
  a.nodes.map((n) => {
    const p = apply(frameMatrix(a.frame), n);
    return { x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 };
  });
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
const N = { x: 0, y: -1 };
const S = { x: 0, y: 1 };

/** Every segment horizontal or vertical. */
const orthogonal = (pts: readonly Vec2[]) =>
  pts.every((p, i) => {
    const q = pts[i + 1];
    return !q || Math.abs(p.x - q.x) < 1e-9 || Math.abs(p.y - q.y) < 1e-9;
  });

describe('routeElbow (issue 99)', () => {
  it('bends once between perpendicular exits', () => {
    const r = routeElbow({ at: R(0, 0), exit: E }, { at: R(100, 80), exit: N });
    expect(r.points).toEqual([R(0, 0), R(100, 0), R(100, 80)]);
    expect(r.handle).toBeUndefined(); // no handle on a one-bend elbow
  });

  it('makes a centred Z between facing parallel exits, with a span handle', () => {
    const r = routeElbow({ at: R(0, 0), exit: E }, { at: R(100, 40), exit: W });
    expect(r.points).toEqual([R(0, 0), R(50, 0), R(50, 40), R(100, 40)]);
    expect(r.handle).toMatchObject({ kind: 'span', axis: 'x', index: 1, dflt: 0.5 });
    const moved = routeElbow({ at: R(0, 0), exit: E }, { at: R(100, 40), exit: W }, { mid: 0.2 });
    expect(moved.points).toEqual([R(0, 0), R(20, 0), R(20, 40), R(100, 40)]);
  });

  it('is a straight line between aligned facing exits', () => {
    const r = routeElbow({ at: R(0, 10), exit: E }, { at: R(90, 10), exit: W });
    expect(r.points).toEqual([R(0, 10), R(90, 10)]);
  });

  it('loops a U out past both ends for same-way exits, the handle setting its reach', () => {
    // Two stacked boxes, both right sites: a feedback loop on the right.
    const s = { at: R(102, 20), exit: E, box: box(0, 0, 100, 40) };
    const e = { at: R(102, 120), exit: E, box: box(0, 100, 100, 40) };
    const r = routeElbow(s, e);
    const x = 102 + ELBOW_STUB;
    expect(r.points).toEqual([R(102, 20), R(x, 20), R(x, 120), R(102, 120)]);
    expect(r.handle).toMatchObject({ kind: 'reach', axis: 'x', base: x, sign: 1 });
    const far = routeElbow(s, e, { mid: 0.5 });
    expect(far.points[1]?.x).toBeCloseTo(x + 50);
    // The handle maps a dragged point back to that mid.
    if (r.handle) expect(midAt(r.handle, R(x + 50, 70))).toBeCloseTo(0.5);
  });

  it('keeps out of the target box when the route must come round it', () => {
    // Exit right; the target's top site faces up from a box right of the source.
    const s = { at: R(42, 20), exit: E, box: box(0, 0, 40, 40) };
    const e = { at: R(150, 98), exit: N, box: box(100, 100, 100, 40) };
    const r = routeElbow(s, e);
    expect(r.points).toEqual([R(42, 20), R(150, 20), R(150, 98)]);
    // Same target, but the source is below it: the elbow comes over the top, clear of the box.
    const low = routeElbow({ at: R(42, 220), exit: E, box: box(0, 200, 40, 40) }, e);
    expect(orthogonal(low.points)).toBe(true);
    for (const [a, b] of low.points.slice(0, -2).map((p, i) => [p, low.points[i + 1]] as const)) {
      const inside =
        b &&
        Math.max(a.x, b.x) > 100.5 &&
        Math.min(a.x, b.x) < 199.5 &&
        Math.max(a.y, b.y) > 100.5 &&
        Math.min(a.y, b.y) < 139.5;
      expect(inside).toBe(false);
    }
    expect(low.points[low.points.length - 2]?.y).toBeLessThan(98);
  });

  it('infers a free end’s direction: an L towards a fixed end, an L for two free ends', () => {
    expect(routeElbow({ at: R(0, 0), exit: E }, { at: R(80, 60) }).points).toEqual([
      R(0, 0),
      R(80, 0),
      R(80, 60),
    ]);
    expect(routeElbow({ at: R(0, 0) }, { at: R(80, 60) }).points).toEqual([
      R(0, 0),
      R(80, 0),
      R(80, 60),
    ]);
    // The first-leg toggle turns it vertical first.
    expect(routeElbow({ at: R(0, 0) }, { at: R(80, 60) }, { firstLeg: 'vertical' }).points).toEqual(
      [R(0, 0), R(0, 60), R(80, 60)],
    );
    // A free start behind a fixed end's exit: a U round to it.
    const u = routeElbow({ at: R(0, 100) }, { at: R(50, 50), exit: N });
    expect(u.points[0]).toEqual(R(0, 100));
    expect(u.points[u.points.length - 1]).toEqual(R(50, 50));
    expect(orthogonal(u.points)).toBe(true);
    expect(Math.min(...u.points.map((p) => p.y))).toBeCloseTo(50 - ELBOW_STUB);
  });

  it('always gives an orthogonal route between its ends, leaving and arriving the right way (property)', () => {
    const dir = fc.constantFrom(E, W, N, S, undefined);
    const pt = fc.record({
      x: fc.integer({ min: -200, max: 200 }),
      y: fc.integer({ min: -200, max: 200 }),
    });
    fc.assert(
      fc.property(
        pt,
        dir,
        pt,
        dir,
        fc.option(fc.double({ min: 0, max: 2, noNaN: true })),
        (p, dp, q, dq, mid) => {
          const r = routeElbow({ at: p, exit: dp }, { at: q, exit: dq }, { mid: mid ?? undefined });
          expect(r.points[0]).toEqual(p);
          expect(r.points[r.points.length - 1]).toEqual(q);
          expect(orthogonal(r.points)).toBe(true);
          // The same inputs give the same route.
          expect(
            routeElbow({ at: p, exit: dp }, { at: q, exit: dq }, { mid: mid ?? undefined }),
          ).toEqual(r);
        },
      ),
    );
  });
});

describe('routeCurve (issue 99)', () => {
  it('leaves and enters along the exit directions', () => {
    const [a, b] = routeCurve({ at: R(0, 0), exit: E }, { at: R(100, 0), exit: S });
    expect(a?.out).toEqual({ x: 40, y: 0 });
    expect(b?.in?.x).toBeCloseTo(100);
    expect(b?.in?.y).toBeCloseTo(40);
  });

  it('is straight between two free ends', () => {
    expect(routeCurve({ at: R(0, 0) }, { at: R(10, 10) })).toEqual([R(0, 0), R(10, 10)]);
  });
});

// --- through reconcileBindings -----------------------------------------------------

const blank = (): Figure => ({ doc: createDoc(), assets: {} });
const pageId = (f: Figure): Id => f.doc.pages[0]?.id ?? ('' as Id);
const run = (f: Figure, e: Edit): Figure => reconcileBindings(f, e.apply(f));
const arrowOf = (f: Figure, id: Id): Arrow => {
  const p = f.doc.pages[0];
  const o = p ? findObj(p, id) : undefined;
  if (o?.type !== 'arrow') throw new Error(`no arrow ${id}`);
  return o;
};

function routed(
  s: BindSite | undefined,
  e: BindSite | undefined,
  route: 'elbow' | 'curve' = 'elbow',
) {
  const a = createRect(frame(0, 0, 80, 40));
  const b = createRect(frame(200, 120, 80, 40));
  const arrow: Arrow = {
    ...createArrow([R(0, 0), R(10, 10)]),
    bind: {
      start: { id: a.id, ...(s ? { site: s } : {}) },
      end: { id: b.id, ...(e ? { site: e } : {}) },
    },
  };
  let fig = blank();
  fig = run(fig, addObjects(pageId(fig), [a, b, arrow]));
  fig = run(fig, setArrowRoute(pageId(fig), [arrow.id], route));
  return { fig, a, b, id: arrow.id };
}

describe('routed arrows in the document (issue 99)', () => {
  it('routes an elbow between bound sites and follows a moved target', () => {
    const { fig, a, b, id } = routed('right', 'left');
    const arr = arrowOf(fig, id);
    expect(pageNodesOf(arr)).toEqual([R(82, 20), R(140, 20), R(140, 140), R(198, 140)]);
    const moved = run(fig, moveObjects(pageId(fig), [b.id], 0, 40));
    expect(pageNodesOf(arrowOf(moved, id)).at(-1)).toEqual(R(198, 180));
    expect(sitePoint(a, 'right')).toEqual(endPoint(arrowOf(moved, id), 'start'));
  });

  it('re-solving is a no-op: same figure back, and solveArrow returns the same arrow', () => {
    for (const route of ['elbow', 'curve'] as const) {
      const { fig, id } = routed('bottom', undefined, route);
      expect(reconcileBindings(fig, fig)).toBe(fig);
      const arr = arrowOf(fig, id);
      const page = fig.doc.pages[0];
      if (!page) throw new Error('no page');
      expect(solveArrow(arr, endTargets(page, arr))).toBe(arr);
      // A no-op edit on the arrow (restyle) leaves its nodes alone.
      const restyled = run(fig, setArrowMid(pageId(fig), [id], undefined));
      expect(arrowOf(restyled, id).nodes).toEqual(arr.nodes);
    }
  });

  it('keeps the middle segment’s fraction when the ends move or a target resizes', () => {
    const { b, id, ...r0 } = routed('right', 'left');
    let fig = r0.fig;
    fig = run(fig, setArrowMid(pageId(fig), [id], 0.25));
    const x = (f: Figure) => pageNodesOf(arrowOf(f, id))[1]?.x ?? NaN;
    expect(x(fig)).toBeCloseTo(82 + 0.25 * (198 - 82));
    fig = run(fig, moveObjects(pageId(fig), [b.id], 100, 0));
    expect(x(fig)).toBeCloseTo(82 + 0.25 * (298 - 82));
    fig = run(
      fig,
      resizeObjects(pageId(fig), [b.id], frame(300, 120, 80, 40), frame(300, 120, 200, 80)),
    );
    expect(arrowOf(fig, id).mid).toBe(0.25);
    expect(x(fig)).toBeCloseTo(82 + 0.25 * (298 - 82));
    const page = fig.doc.pages[0];
    const h = page ? elbowRoute(page, arrowOf(fig, id))?.handle : undefined;
    expect(h?.kind).toBe('span');
  });

  it('gives a sliding end the side facing the other end', () => {
    const { fig, id } = routed(undefined, undefined);
    const pts = pageNodesOf(arrowOf(fig, id));
    // The centre-to-centre ray leaves the source through its bottom and enters the target's top.
    expect(pts[0]).toEqual(R(40, 42));
    expect(pts.at(-1)).toEqual(R(240, 118));
    expect(orthogonal(pts)).toBe(true);
  });

  it('setting back to straight keeps the routed nodes; a free elbow end drags and re-routes', () => {
    const { a, id, ...r1 } = routed('right', 'left');
    let fig = r1.fig;
    const before = arrowOf(fig, id).nodes;
    fig = run(fig, setArrowRoute(pageId(fig), [id], 'straight'));
    expect(arrowOf(fig, id).route).toBeUndefined();
    expect(arrowOf(fig, id).nodes).toEqual(before);
    fig = run(fig, setArrowRoute(pageId(fig), [id], 'elbow'));
    fig = run(fig, attachArrowEnd(pageId(fig), id, 'start', a.id, a, 'bottom'));
    const pts = pageNodesOf(arrowOf(fig, id));
    expect(pts[0]).toEqual(R(40, 42));
    expect(pts[1]?.x).toBe(40); // leaves downward
  });
});
