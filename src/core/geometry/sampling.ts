/**
 * Arc-length sampling of a path (note 04): path-following procedural kinds
 * (bilayer, helix, receptors) put a unit every `spacing` points along the
 * path, oriented by the tangent there.
 */
import type { PathNode, Vec2 } from '../model/types';

export interface Polyline {
  readonly pts: readonly Vec2[];
  /** Cumulative length at each point. */
  readonly cum: readonly number[];
  readonly length: number;
  readonly closed: boolean;
}

export interface PathSample {
  readonly x: number;
  readonly y: number;
  /** Unit tangent. The normal is (−ty, tx): below the path when it runs left to right. */
  readonly tx: number;
  readonly ty: number;
  /** Arc length from the start. */
  readonly s: number;
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

function cubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** The path as a polyline: corners exact, curves cut into pieces of about `tol` points. */
export function flatten(nodes: readonly PathNode[], closed: boolean, tol = 1): Polyline {
  const pts: Vec2[] = [];
  const n = nodes.length;
  const first = nodes[0];
  if (first) pts.push({ x: first.x, y: first.y });
  const segs = closed && n > 2 ? n : n - 1;
  for (let i = 0; i < segs; i += 1) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    if (!a || !b) continue;
    if (!a.out && !b.in) {
      pts.push({ x: b.x, y: b.y });
      continue;
    }
    const c1 = a.out ?? a;
    const c2 = b.in ?? b;
    const hull = dist(a, c1) + dist(c1, c2) + dist(c2, b);
    const steps = Math.min(256, Math.max(4, Math.ceil(hull / Math.max(0.05, tol))));
    for (let k = 1; k <= steps; k += 1) pts.push(cubic(a, c1, c2, b, k / steps));
  }
  // Drop zero-length steps, so every segment has a direction.
  const clean: Vec2[] = [];
  for (const p of pts) {
    const last = clean[clean.length - 1];
    if (!last || dist(last, p) > 1e-9) clean.push(p);
  }
  const cum: number[] = [];
  let len = 0;
  clean.forEach((p, i) => {
    const prev = clean[i - 1];
    if (prev) len += dist(prev, p);
    cum.push(len);
  });
  return { pts: clean, cum, length: len, closed: closed && n > 2 };
}

/** Samples every `spacing` along the path, starting `spacing / 2` in. At most `max` samples. */
export function sampleEvery(poly: Polyline, spacing: number, max = 20000): PathSample[] {
  const L = poly.length;
  if (L <= 0 || poly.pts.length < 2 || !(spacing > 0)) return [];
  // A closed path fits a whole number of units, so there is no seam.
  let count = poly.closed ? Math.max(1, Math.round(L / spacing)) : Math.floor(L / spacing);
  if (!poly.closed && count === 0) count = 1;
  count = Math.min(count, max);
  const step = poly.closed ? L / count : spacing;
  const start = poly.closed ? step / 2 : (L - step * (count - 1)) / 2;
  const out: PathSample[] = [];
  let seg = 1;
  for (let i = 0; i < count; i += 1) {
    const s = Math.min(L, Math.max(0, start + step * i));
    while (seg < poly.pts.length - 1 && (poly.cum[seg] ?? 0) < s) seg += 1;
    out.push(at(poly, seg, s));
  }
  return out;
}

function at(poly: Polyline, seg: number, s: number): PathSample {
  const a = poly.pts[seg - 1] ?? { x: 0, y: 0 };
  const b = poly.pts[seg] ?? a;
  const s0 = poly.cum[seg - 1] ?? 0;
  const d = dist(a, b);
  const t = d > 0 ? (s - s0) / d : 0;
  const tx = d > 0 ? (b.x - a.x) / d : 1;
  const ty = d > 0 ? (b.y - a.y) / d : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx, ty, s };
}

/** The point and tangent at arc length `s` (clamped). */
export function pointAt(poly: Polyline, s: number): PathSample {
  const L = poly.length;
  const c = Math.min(L, Math.max(0, s));
  let lo = 1;
  let hi = poly.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((poly.cum[mid] ?? 0) < c) lo = mid + 1;
    else hi = mid;
  }
  return at(poly, Math.max(1, lo), c);
}

/** A sample moved `d` along its normal. */
export const offsetPt = (p: PathSample, d: number): Vec2 => ({
  x: p.x - p.ty * d,
  y: p.y + p.tx * d,
});
