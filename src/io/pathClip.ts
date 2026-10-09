/**
 * Cutting vector paths to a clip (notes 12 and 13). The export subset has no
 * `clipPath`, so what an imported plot clips is cut in its geometry: a
 * rectangular clip is a box (Sutherland–Hodgman for fills, Liang–Barsky
 * for strokes), any other clip shape a `Region` (`./svg/clipRegion`).
 * Subpaths inside the clip are kept as they are, outside ones dropped,
 * straddling ones flattened and cut. Shared by PDF import (issue 25) and
 * SVG clip paths (issue 41).
 */
import {
  type Pt,
  type Region,
  clipLines,
  clipRing,
  curveSteps,
  ringsInside,
} from './svg/clipRegion';
import type { Seg } from './svg/pathData';

export type Box = readonly [number, number, number, number]; // x0 y0 x1 y1

/** Segments a straddling curve is cut into before clipping. */
const CURVE_STEPS = 16;
const TOL = 1e-3;

/** Subpaths: each starts with M (a missing one is supplied from the last point). */
export function subpaths(segs: readonly Seg[]): Seg[][] {
  const out: Seg[][] = [];
  let cur: Seg[] = [];
  let last: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  for (const s of segs) {
    if (s.c === 'M') {
      if (cur.length > 0) out.push(cur);
      cur = [s];
      start = [s.p[0], s.p[1]];
      last = start;
      continue;
    }
    if (cur.length === 0) cur = [{ c: 'M', p: last }];
    cur.push(s);
    if (s.c === 'Z') last = start;
    else last = [s.p[s.p.length - 2] ?? 0, s.p[s.p.length - 1] ?? 0];
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

export function segsBox(segs: readonly Seg[]): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of segs) {
    if (s.c === 'Z') continue;
    for (let i = 0; i < s.p.length; i += 2) {
      const x = s.p[i] ?? 0;
      const y = s.p[i + 1] ?? 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

const boxRing = (b: Box): Pt[] => [
  [b[0], b[1]],
  [b[2], b[1]],
  [b[2], b[3]],
  [b[0], b[3]],
];

export const inside = (b: Box, c: Box): boolean =>
  b[0] >= c[0] - TOL && b[1] >= c[1] - TOL && b[2] <= c[2] + TOL && b[3] <= c[3] + TOL;
export const disjoint = (b: Box, c: Box): boolean =>
  b[2] < c[0] - TOL || b[0] > c[2] + TOL || b[3] < c[1] - TOL || b[1] > c[3] + TOL;
export const intersect = (a: Box, b: Box): Box => [
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
  Math.min(a[2], b[2]),
  Math.min(a[3], b[3]),
];

/**
 * A subpath as a polyline (curves cut into straight steps: `CURVE_STEPS`, or
 * by their size when `fine`); `closed` when it ends in Z.
 */
export function polyline(
  sub: readonly Seg[],
  fine = false,
): { pts: [number, number][]; closed: boolean } {
  const pts: [number, number][] = [];
  let closed = false;
  for (const s of sub) {
    if (s.c === 'Z') {
      closed = true;
      continue;
    }
    if (s.c === 'M' || s.c === 'L') {
      pts.push([s.p[0], s.p[1]]);
      continue;
    }
    const [x0, y0] = pts[pts.length - 1] ?? [0, 0];
    let steps = CURVE_STEPS;
    if (fine) {
      let len = 0;
      for (let i = 0, px = x0, py = y0; i < s.p.length; i += 2) {
        len += Math.hypot((s.p[i] ?? 0) - px, (s.p[i + 1] ?? 0) - py);
        px = s.p[i] ?? 0;
        py = s.p[i + 1] ?? 0;
      }
      steps = curveSteps(len);
    }
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      if (s.c === 'C') {
        const [ax, ay, bx, by, cx, cy] = s.p;
        pts.push([
          u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * cx,
          u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * cy,
        ]);
      } else {
        const [ax = 0, ay = 0, cx = 0, cy = 0] = s.p;
        pts.push([
          u * u * x0 + 2 * u * t * ax + t * t * cx,
          u * u * y0 + 2 * u * t * ay + t * t * cy,
        ]);
      }
    }
  }
  return { pts, closed };
}

/** Sutherland–Hodgman: a closed ring cut to a rectangle (exact for fills: the rect is convex). */
export function clipRingToBox(pts: readonly [number, number][], c: Box): [number, number][] {
  let ring = [...pts];
  const edges: [
    (p: [number, number]) => boolean,
    (a: [number, number], b: [number, number]) => [number, number],
  ][] = [
    [(p) => p[0] >= c[0], (a, b) => [c[0], a[1] + ((b[1] - a[1]) * (c[0] - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= c[2], (a, b) => [c[2], a[1] + ((b[1] - a[1]) * (c[2] - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= c[1], (a, b) => [a[0] + ((b[0] - a[0]) * (c[1] - a[1])) / (b[1] - a[1]), c[1]]],
    [(p) => p[1] <= c[3], (a, b) => [a[0] + ((b[0] - a[0]) * (c[3] - a[1])) / (b[1] - a[1]), c[3]]],
  ];
  for (const [isIn, cut] of edges) {
    if (ring.length === 0) break;
    const next: [number, number][] = [];
    for (let i = 0; i < ring.length; i++) {
      const cur = ring[i] ?? [0, 0];
      const prev = ring[(i + ring.length - 1) % ring.length] ?? cur;
      if (isIn(cur)) {
        if (!isIn(prev)) next.push(cut(prev, cur));
        next.push(cur);
      } else if (isIn(prev)) next.push(cut(prev, cur));
    }
    ring = next;
  }
  return ring;
}

/** Liang–Barsky: an open polyline cut to a rectangle, as the visible pieces. */
export function clipPolyline(pts: readonly [number, number][], c: Box): [number, number][][] {
  const pieces: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1] ?? [0, 0];
    const [bx, by] = pts[i] ?? [ax, ay];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let visible = true;
    for (const [p, q] of [
      [-dx, ax - c[0]],
      [dx, c[2] - ax],
      [-dy, ay - c[1]],
      [dy, c[3] - ay],
    ] as const) {
      if (p === 0) {
        if (q < 0) visible = false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!visible || t0 > t1) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      continue;
    }
    const s: [number, number] = [ax + t0 * dx, ay + t0 * dy];
    const e: [number, number] = [ax + t1 * dx, ay + t1 * dy];
    const last = cur[cur.length - 1];
    if (!last || t0 > 0 || Math.abs(last[0] - s[0]) > 1e-9 || Math.abs(last[1] - s[1]) > 1e-9) {
      if (cur.length > 1) pieces.push(cur);
      cur = [s];
    }
    cur.push(e);
    if (t1 < 1) {
      pieces.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

export const polyToSegs = (pts: readonly [number, number][], close: boolean): Seg[] => [
  ...pts.map((p, i): Seg => ({ c: i === 0 ? 'M' : 'L', p })),
  ...(close ? [{ c: 'Z' } as Seg] : []),
];

/** Strokes this close (px) to a clip shape's edge count as inside (a grid circle on the rim). */
export const LINE_TOL = 0.5;
/** Fills this close to it are kept whole. */
export const FILL_TOL = 0.1;
export const ringSegs = (ring: readonly Pt[], close: boolean): Seg[] =>
  polyToSegs(
    ring.map((p): [number, number] => [p[0], p[1]]),
    close,
  );

/** Fill subpaths cut to clip shapes, ring by ring (each keeps its winding, so the fill rule holds). */
export function cutFill(subs: readonly Seg[][], regions: readonly Region[]): Seg[] {
  const kept: Seg[] = [];
  for (const sub of subs) {
    const b = segsBox(sub);
    if (!b || regions.some((r) => disjoint(b, r.box))) continue;
    const ring = polyline(sub, true).pts;
    if (regions.every((r) => ringsInside([ring], r, FILL_TOL))) {
      kept.push(...sub);
      continue;
    }
    let rings: Pt[][] = [ring];
    for (const r of regions) rings = rings.flatMap((x) => clipRing(x, r));
    for (const x of rings) kept.push(...ringSegs(x, true));
  }
  return kept;
}

/** Stroke subpaths cut to clip shapes: whole when inside, else the pieces inside. */
export function cutStroke(
  subs: readonly Seg[][],
  regions: readonly Region[],
  tol = LINE_TOL,
): Seg[] {
  const kept: Seg[] = [];
  for (const sub of subs) {
    const b = segsBox(sub);
    if (!b || regions.some((r) => disjoint(b, r.box))) continue;
    const { pts, closed } = polyline(sub, true);
    const first = pts[0];
    if (closed && first) pts.push(first);
    if (regions.every((r) => ringsInside([pts], r, tol))) {
      kept.push(...sub);
      continue;
    }
    let pieces: Pt[][] = [pts];
    for (const r of regions) pieces = pieces.flatMap((x) => clipLines(x, r, tol));
    for (const x of pieces) kept.push(...ringSegs(x, false));
  }
  return kept;
}

/**
 * A path cut to a clip box (null: none) and clip shapes, as what is left of
 * its fill (rings, each keeping its winding) and of its stroke (open
 * pieces; a closed subpath is opened where the clip cuts it), each only when
 * asked for (`paint`). Null when the path is inside the clip and is kept as
 * it is; empty lists when nothing of it is inside. `tol` (in the path's
 * units) keeps strokes that close to a clip shape's edge whole.
 */
export function cutPath(
  segs: readonly Seg[],
  clip: Box | null,
  regions: readonly Region[],
  paint: { readonly fill: boolean; readonly stroke: boolean },
  tol = LINE_TOL,
): { fill: Seg[]; stroke: Seg[] } | null {
  const box = segsBox(segs);
  if (!box) return { fill: [], stroke: [] };
  if (clip && disjoint(box, clip)) return { fill: [], stroke: [] };
  const boxed = !clip || inside(box, clip);
  if (boxed && regions.every((r) => ringsInside([boxRing(box)], r, FILL_TOL))) return null;
  const subs = subpaths(segs);
  let fill: Seg[] = [];
  let stroke: Seg[] = [];
  if (boxed) {
    if (paint.fill) fill = segs.slice();
    if (paint.stroke) stroke = segs.slice();
  } else
    for (const sub of subs) {
      const b = segsBox(sub);
      if (!b || disjoint(b, clip)) continue;
      if (inside(b, clip)) {
        if (paint.fill) fill.push(...sub);
        if (paint.stroke) stroke.push(...sub);
        continue;
      }
      if (paint.fill) {
        const ring = clipRingToBox(polyline(sub).pts, clip);
        if (ring.length >= 3) fill.push(...polyToSegs(ring, true));
      }
      if (paint.stroke) {
        const { pts, closed } = polyline(sub);
        const first = pts[0];
        if (closed && first) pts.push(first);
        for (const piece of clipPolyline(pts, clip)) stroke.push(...polyToSegs(piece, false));
      }
    }
  if (regions.length > 0) {
    if (paint.fill) fill = cutFill(subpaths(fill), regions);
    if (paint.stroke) stroke = cutStroke(subpaths(stroke), regions, tol);
  }
  return { fill, stroke };
}
