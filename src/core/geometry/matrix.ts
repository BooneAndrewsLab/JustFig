/**
 * 2D affine matrices `[a b c d e f]` (SVG order: x' = a x + c y + e,
 * y' = b x + d y + f), frames and bounds.
 */
import type { Frame, Vec2 } from '../model/types';

export type Mat = readonly [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m ∘ n: apply n first, then m. */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number = sx): Mat => [sx, 0, 0, sy, 0, 0];
export function rotate(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function apply(m: Mat, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) return IDENTITY;
  const [a, b, c, d, e, f] = m;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export const center = (f: Frame): Vec2 => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

/** Frame-local (0..w, 0..h) to page coordinates. */
export function frameMatrix(f: Frame): Mat {
  const c = center(f);
  return mul(
    mul(mul(translate(c.x, c.y), rotate(f.rotation)), scale(f.flipX ? -1 : 1, f.flipY ? -1 : 1)),
    translate(-f.w / 2, -f.h / 2),
  );
}

export const isPlain = (f: Frame): boolean =>
  f.rotation % 360 === 0 && f.flipX !== true && f.flipY !== true;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function boxOfPoints(ps: readonly Vec2[]): Box {
  if (ps.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of ps) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const corners = (f: Frame): Vec2[] => {
  const m = frameMatrix(f);
  return [
    { x: 0, y: 0 },
    { x: f.w, y: 0 },
    { x: f.w, y: f.h },
    { x: 0, y: f.h },
  ].map((p) => apply(m, p));
};

/** Axis-aligned page bounds of a frame. */
export const frameBounds = (f: Frame): Box => boxOfPoints(corners(f));

export function unionBoxes(boxes: readonly Box[]): Box {
  return boxOfPoints(
    boxes.flatMap((b) => [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
    ]),
  );
}

export const boxesIntersect = (a: Box, b: Box): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

export const boxContains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;
