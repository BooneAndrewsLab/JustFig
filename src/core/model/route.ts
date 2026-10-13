/**
 * Arrow routing (issue 99, note 06), pure: an elbow (90° corners) or a curve from two
 * ends, each a point with an optional exit direction (the way the arrow leaves it, from
 * `siteExit`) and an optional box to keep clear (its target's bounds). An end without a
 * direction (free, sliding before it is placed, or a centre site) has one inferred from the
 * other end. The result depends only on the inputs, so re-routing an unchanged arrow is a no-op.
 */
import type { Box } from '../geometry/matrix';
import type { ElbowLeg, PathNode, Vec2 } from './types';

/** How far an elbow runs straight out of an end before it may turn, and its clearance, points. */
export const ELBOW_STUB = 12;

/** What routing an end takes: where it is, which way it leaves, what to keep clear. */
export interface RouteEnd {
  readonly at: Vec2;
  readonly exit?: Vec2 | undefined;
  readonly box?: Box | undefined;
}

/**
 * The draggable middle segment of an elbow: `points[index]`→`points[index + 1]`, lying at
 * coordinate `axis`. A `span` middle sits between the ends (`a + mid·(b − a)`); a `reach`
 * middle lies beyond both, a U's loop (`base + sign·mid·scale`).
 */
export type MidHandle =
  | {
      readonly index: number;
      readonly axis: 'x' | 'y';
      readonly kind: 'span';
      readonly a: number;
      readonly b: number;
      /** The mid the router's own placement corresponds to (used when `mid` is absent). */
      readonly dflt: number;
    }
  | {
      readonly index: number;
      readonly axis: 'x' | 'y';
      readonly kind: 'reach';
      readonly base: number;
      readonly sign: 1 | -1;
      readonly scale: number;
      readonly dflt: 0;
    };

export interface ElbowRoute {
  readonly points: Vec2[];
  readonly handle?: MidHandle;
}

const EPS = 1e-6;
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const len = (a: Vec2): number => Math.hypot(a.x, a.y);
const unit = (a: Vec2): Vec2 | undefined => {
  const l = len(a);
  return l < EPS ? undefined : mul(a, 1 / l);
};
const same = (a: Vec2, b: Vec2): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** A direction snapped to the nearest axis (ties go horizontal). */
export function toAxis(d: Vec2): Vec2 {
  return Math.abs(d.x) >= Math.abs(d.y)
    ? { x: Math.sign(d.x) || 1, y: 0 }
    : { x: 0, y: Math.sign(d.y) };
}

const horizontal = (d: Vec2): boolean => d.y === 0;
/** The axis unit perpendicular to an axis unit, the + way. */
const across = (d: Vec2): Vec2 => (horizontal(d) ? { x: 0, y: 1 } : { x: 1, y: 0 });

/**
 * The way an end at `q` leaves when the other end, at `p`, leaves along `dp`: towards p
 * across dp when q is ahead of p (one bend, an L), along dp when q is behind (a U), and
 * straight back at p when p is dead ahead.
 */
function inferExit(q: Vec2, p: Vec2, dp: Vec2): Vec2 {
  const v = sub(p, q);
  const n = across(dp);
  const side = dot(v, n);
  const ahead = dot(sub(q, p), dp) > EPS;
  if (Math.abs(side) < EPS) return ahead ? mul(dp, -1) : n;
  if (!ahead) return dp;
  return mul(n, Math.sign(side));
}

/** Both ends' exit directions on the axes, inferring the missing ones. */
export function elbowExits(s: RouteEnd, e: RouteEnd, firstLeg?: ElbowLeg): { dp: Vec2; dq: Vec2 } {
  const p = s.at;
  const q = e.at;
  if (s.exit && e.exit) return { dp: toAxis(s.exit), dq: toAxis(e.exit) };
  if (s.exit) {
    const dp = toAxis(s.exit);
    return { dp, dq: inferExit(q, p, dp) };
  }
  if (e.exit) {
    const dq = toAxis(e.exit);
    return { dp: inferExit(p, q, dq), dq };
  }
  const d = sub(q, p);
  const h = firstLeg ? firstLeg === 'horizontal' : Math.abs(d.x) >= Math.abs(d.y);
  const dp = h ? { x: Math.sign(d.x) || 1, y: 0 } : { x: 0, y: Math.sign(d.y) || 1 };
  return { dp, dq: inferExit(q, p, dp) };
}

/** Zero-length and straight-through points dropped. */
function simplify(pts: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && same(last, p)) continue;
    const prev = out[out.length - 2];
    if (prev && last) {
      const a = sub(last, prev);
      const b = sub(p, last);
      if (Math.abs(a.x * b.y - a.y * b.x) < EPS && dot(a, b) > 0) out.pop();
    }
    out.push(p);
  }
  return out;
}

/** Whether the axis-aligned segment a–b passes through the box's interior. */
function crosses(a: Vec2, b: Vec2, box: Box): boolean {
  const m = 0.5;
  const x0 = box.x + m;
  const x1 = box.x + box.w - m;
  const y0 = box.y + m;
  const y1 = box.y + box.h - m;
  if (x0 >= x1 || y0 >= y1) return false;
  const lx = Math.min(a.x, b.x);
  const hx = Math.max(a.x, b.x);
  const ly = Math.min(a.y, b.y);
  const hy = Math.max(a.y, b.y);
  return hx > x0 && lx < x1 && hy > y0 && ly < y1;
}

/** A candidate's cost: length, a bend penalty, a large one per box crossed; null if unusable. */
function cost(pts: readonly Vec2[], dp: Vec2, dq: Vec2, s: RouteEnd, e: RouteEnd): number | null {
  if (pts.length < 2) return null;
  let total = 0;
  let prev: Vec2 | undefined;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) return null;
    const d = sub(b, a);
    if (Math.abs(d.x) > EPS && Math.abs(d.y) > EPS) return null; // not orthogonal
    if (prev) {
      if (dot(prev, d) < -EPS) return null; // doubles back on itself
      total += 2 * ELBOW_STUB;
    }
    prev = d;
    total += len(d);
    // The first segment leaves the source box and the last enters the target's: not crossings.
    if (s.box && i > 0 && crosses(a, b, s.box)) total += 1e6;
    if (e.box && i + 2 < pts.length && crosses(a, b, e.box)) total += 1e6;
  }
  const [p0, p1] = pts;
  const [q1, q0] = pts.slice(-2);
  if (!p0 || !p1 || !q0 || !q1) return null;
  const first = unit(sub(p1, p0));
  const last = unit(sub(q0, q1));
  if (!first || !last || dot(first, dp) < 1 - 1e-9 || dot(last, dq) > -1 + 1e-9) return null;
  return total;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The middle segment of a route with an odd number (3 or more) of segments, if any. */
function middleOf(pts: readonly Vec2[], p: Vec2, q: Vec2): MidHandle | undefined {
  const n = pts.length - 1;
  if (n < 3 || n % 2 === 0) return undefined;
  const index = (n - 1) / 2;
  const a0 = pts[index];
  const b0 = pts[index + 1];
  if (!a0 || !b0) return undefined;
  const axis = Math.abs(a0.x - b0.x) < EPS ? 'x' : 'y';
  const m0 = a0[axis];
  const a = p[axis];
  const b = q[axis];
  if (m0 > Math.min(a, b) + EPS && m0 < Math.max(a, b) - EPS)
    return { index, axis, kind: 'span', a, b, dflt: (m0 - a) / (b - a) };
  return {
    index,
    axis,
    kind: 'reach',
    base: m0,
    sign: m0 >= (a + b) / 2 ? 1 : -1,
    scale: Math.max(len(sub(q, p)), ELBOW_STUB),
    dflt: 0,
  };
}

/** Where a handle puts its middle segment for a given `mid` (absent: the default). */
export function midCoordinate(h: MidHandle, mid: number | undefined): number {
  if (h.kind === 'span') return lerp(h.a, h.b, Math.min(1, Math.max(0, mid ?? h.dflt)));
  return h.base + h.sign * Math.max(0, mid ?? 0) * h.scale;
}

/** The `mid` that puts a handle's middle segment through page point `pt`. */
export function midAt(h: MidHandle, pt: Vec2): number {
  const m = pt[h.axis];
  if (h.kind === 'span')
    return Math.abs(h.b - h.a) < EPS ? h.dflt : Math.min(1, Math.max(0, (m - h.a) / (h.b - h.a)));
  return Math.max(0, ((m - h.base) * h.sign) / h.scale);
}

/**
 * An orthogonal route from `s` to `e`: the cheapest of a few candidate shapes (an L, a Z, a U,
 * and paths through stubs `ELBOW_STUB` out of each end turning once or twice), preferring
 * ones that keep out of the end boxes. A route of 3 or 5 segments has a middle segment the
 * user can slide (`mid`); its kind is fixed by the default route, so `mid` never changes the shape.
 */
export function routeElbow(
  s: RouteEnd,
  e: RouteEnd,
  opts: { readonly mid?: number | undefined; readonly firstLeg?: ElbowLeg | undefined } = {},
): ElbowRoute {
  const p = s.at;
  const q = e.at;
  if (same(p, q)) return { points: [p, q] };
  const { dp, dq } = elbowExits(s, e, opts.firstLeg);
  const P1 = add(p, mul(dp, ELBOW_STUB));
  const Q1 = add(q, mul(dq, ELBOW_STUB));
  const cands: Vec2[][] = [];
  const hp = horizontal(dp);
  // Direct shapes first (a tie keeps the earlier one).
  if (dot(dp, dq) === 0) cands.push([p, hp ? { x: q.x, y: p.y } : { x: p.x, y: q.y }, q]);
  if (dot(dp, dq) < 0) {
    const m = hp ? (p.x + q.x) / 2 : (p.y + q.y) / 2;
    cands.push(
      hp ? [p, { x: m, y: p.y }, { x: m, y: q.y }, q] : [p, { x: p.x, y: m }, { x: q.x, y: m }, q],
    );
  }
  if (dot(dp, dq) > 0) {
    const m = hp
      ? dp.x > 0
        ? Math.max(P1.x, Q1.x)
        : Math.min(P1.x, Q1.x)
      : dp.y > 0
        ? Math.max(P1.y, Q1.y)
        : Math.min(P1.y, Q1.y);
    cands.push(
      hp ? [p, { x: m, y: p.y }, { x: m, y: q.y }, q] : [p, { x: p.x, y: m }, { x: q.x, y: m }, q],
    );
  }
  // Through the stubs: one corner, or a middle line at a midpoint or clear of a box.
  cands.push([p, P1, { x: P1.x, y: Q1.y }, Q1, q], [p, P1, { x: Q1.x, y: P1.y }, Q1, q]);
  const xs = [(P1.x + Q1.x) / 2];
  const ys = [(P1.y + Q1.y) / 2];
  for (const b of [s.box, e.box]) {
    if (!b) continue;
    xs.push(b.x - ELBOW_STUB, b.x + b.w + ELBOW_STUB);
    ys.push(b.y - ELBOW_STUB, b.y + b.h + ELBOW_STUB);
  }
  if (s.box && e.box) {
    const [l, r] = s.box.x <= e.box.x ? [s.box, e.box] : [e.box, s.box];
    if (l.x + l.w < r.x) xs.push((l.x + l.w + r.x) / 2);
    const [t, u] = s.box.y <= e.box.y ? [s.box, e.box] : [e.box, s.box];
    if (t.y + t.h < u.y) ys.push((t.y + t.h + u.y) / 2);
  }
  for (const m of xs) cands.push([p, P1, { x: m, y: P1.y }, { x: m, y: Q1.y }, Q1, q]);
  for (const m of ys) cands.push([p, P1, { x: P1.x, y: m }, { x: Q1.x, y: m }, Q1, q]);
  let best: Vec2[] | null = null;
  let bestCost = Infinity;
  for (const c of cands) {
    const pts = simplify(c);
    const k = cost(pts, dp, dq, s, e);
    if (k !== null && k < bestCost - 1e-9) {
      best = pts;
      bestCost = k;
    }
  }
  const points = best ?? simplify([p, P1, { x: P1.x, y: Q1.y }, Q1, q]);
  const handle = middleOf(points, p, q);
  if (!handle || opts.mid === undefined) return handle ? { points, handle } : { points };
  const m = midCoordinate(handle, opts.mid);
  const moved = points.map((pt, i) =>
    i === handle.index || i === handle.index + 1 ? { ...pt, [handle.axis]: m } : pt,
  );
  return { points: moved, handle };
}

/**
 * A curve from `s` to `e`: one cubic Bézier whose tangents leave each end along its exit
 * direction (or, without one, towards the other end's control point), the handles 0.4 of
 * the distance long. Two ends without directions give a straight line.
 */
export function routeCurve(s: RouteEnd, e: RouteEnd): PathNode[] {
  const p = s.at;
  const q = e.at;
  const k = len(sub(q, p)) * 0.4;
  if (k < EPS || (!s.exit && !e.exit)) return [{ ...p }, { ...q }];
  // An end without a direction aims at the other end's control point.
  const towards = (from: Vec2, other: Vec2, d: Vec2 | undefined): Vec2 | undefined =>
    unit(sub(d ? add(other, mul(d, k)) : other, from));
  const dp = s.exit ? unit(s.exit) : towards(p, q, e.exit && unit(e.exit));
  const dq = e.exit ? unit(e.exit) : towards(q, p, dp);
  if (!dp || !dq) return [{ ...p }, { ...q }];
  return [
    { x: p.x, y: p.y, out: add(p, mul(dp, k)) },
    { x: q.x, y: q.y, in: add(q, mul(dq, k)) },
  ];
}
