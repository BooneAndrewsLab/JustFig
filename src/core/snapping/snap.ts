/**
 * Snapping with smart guides (note 01): a moving box (or a point being
 * drawn) snaps its edges and centre to the edges and centres of other
 * objects and of the page, within a threshold in points (the canvas
 * passes a fixed number of screen pixels divided by the zoom). Linear in
 * the number of objects; an rbush index is for when figures get large.
 */
import type { Box } from '../geometry/matrix';
import type { Vec2 } from '../model/types';

/** A guide line to draw: vertical at x (from y0 to y1) or horizontal at y. */
export type Guide =
  | { readonly axis: 'x'; readonly at: number; readonly from: number; readonly to: number }
  | { readonly axis: 'y'; readonly at: number; readonly from: number; readonly to: number };

const xs = (b: Box): number[] => [b.x, b.x + b.w / 2, b.x + b.w];
const ys = (b: Box): number[] => [b.y, b.y + b.h / 2, b.y + b.h];

interface Hit {
  readonly delta: number;
  readonly at: number;
  readonly target: Box;
}

function best(
  mine: readonly number[],
  targets: readonly Box[],
  of: (b: Box) => number[],
  threshold: number,
): Hit | null {
  let hit: Hit | null = null;
  for (const t of targets)
    for (const v of of(t))
      for (const m of mine) {
        const d = v - m;
        if (Math.abs(d) <= threshold && (hit === null || Math.abs(d) < Math.abs(hit.delta)))
          hit = { delta: d, at: v, target: t };
      }
  return hit;
}

export interface SnapResult {
  readonly dx: number;
  readonly dy: number;
  readonly guides: readonly Guide[];
}

/** How far to nudge a moving box so it lines up, and the guides to show. */
export function snapBox(moving: Box, targets: readonly Box[], threshold: number): SnapResult {
  const hx = best(xs(moving), targets, xs, threshold);
  const hy = best(ys(moving), targets, ys, threshold);
  const dx = hx?.delta ?? 0;
  const dy = hy?.delta ?? 0;
  const m = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  if (hx)
    guides.push({
      axis: 'x',
      at: hx.at,
      from: Math.min(m.y, hx.target.y),
      to: Math.max(m.y + m.h, hx.target.y + hx.target.h),
    });
  if (hy)
    guides.push({
      axis: 'y',
      at: hy.at,
      from: Math.min(m.x, hy.target.x),
      to: Math.max(m.x + m.w, hy.target.x + hy.target.w),
    });
  return { dx, dy, guides };
}

/** A point snapped to the nearest edge or centre lines. */
export function snapPoint(
  p: Vec2,
  targets: readonly Box[],
  threshold: number,
): { p: Vec2; guides: readonly Guide[] } {
  const r = snapBox({ x: p.x, y: p.y, w: 0, h: 0 }, targets, threshold);
  return { p: { x: p.x + r.dx, y: p.y + r.dy }, guides: r.guides };
}
