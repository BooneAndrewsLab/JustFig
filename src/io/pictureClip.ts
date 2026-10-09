/**
 * Cutting a picture's pixels to a clip (issues 25 and 36, notes 12 and 13).
 * The export subset has no `clipPath`, so a picture an imported plot clips
 * is cut in its pixels: to whole pixels when the clip is a rectangle along
 * the picture's axes, else by making the pixels whose centre is outside
 * see-through. Shared by PDF import (pdf.js hands over pixels) and SVG
 * import (an embedded PNG under a `clipPath`, decoded first).
 */
import type { Pixels } from './png';
import { type Pt, type Region, makeRegion, ringsInside, segmentSpans } from './svg/clipRegion';
import { type Matrix, apply, determinant, invert, isAxisAligned, multiply } from './svg/matrix';

export type Box = readonly [number, number, number, number]; // x0 y0 x1 y1

const TOL = 1e-3;

const inside = (b: Box, c: Box): boolean =>
  b[0] >= c[0] - TOL && b[1] >= c[1] - TOL && b[2] <= c[2] + TOL && b[3] <= c[3] + TOL;
const disjoint = (b: Box, c: Box): boolean =>
  b[2] < c[0] - TOL || b[0] > c[2] + TOL || b[3] < c[1] - TOL || b[1] > c[3] + TOL;

export const boxRing = (b: Box): Pt[] => [
  [b[0], b[1]],
  [b[2], b[1]],
  [b[2], b[3]],
  [b[0], b[3]],
];

/** Columns [x0, x1) and rows [y0, y1) of the pixels. */
export function cropPixels(px: Pixels, x0: number, y0: number, x1: number, y1: number): Pixels {
  const ch = px.channels;
  const w = x1 - x0;
  const out = new Uint8Array(w * (y1 - y0) * ch);
  for (let y = y0; y < y1; y++)
    out.set(
      px.data.subarray((y * px.width + x0) * ch, (y * px.width + x1) * ch),
      (y - y0) * w * ch,
    );
  return { width: w, height: y1 - y0, channels: ch, data: out };
}

/**
 * Pixels whose centre is outside any of the regions made see-through; `m`
 * maps the picture's unit square (rows down) to the regions' space. The
 * pixels unchanged when all are inside, null when none is.
 */
export function maskPixels(px: Pixels, m: Matrix, regions: readonly Region[]): Pixels | null {
  const { width: w, height: h, channels: ch } = px;
  const out = new Uint8Array(w * h * 4);
  let kept = 0;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const a = apply(m, 0, v);
    const b = apply(m, 1, v);
    // The row's centre line inside every region, as intervals of u.
    let spans: [number, number][] = [[0, 1]];
    for (const r of regions) {
      const next: [number, number][] = [];
      for (const [s0, s1] of segmentSpans(a, b, r))
        for (const [p0, p1] of spans) {
          const lo = Math.max(s0, p0);
          const hi = Math.min(s1, p1);
          if (lo < hi) next.push([lo, hi]);
        }
      spans = next;
    }
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const i = (y * w + x) * ch;
      const o = (y * w + x) * 4;
      out[o] = px.data[i] ?? 0;
      out[o + 1] = px.data[i + 1] ?? 0;
      out[o + 2] = px.data[i + 2] ?? 0;
      const visible = spans.some(([lo, hi]) => u >= lo && u <= hi);
      out[o + 3] = visible ? (ch === 4 ? (px.data[i + 3] ?? 255) : 255) : 0;
      if (visible) kept++;
    }
  }
  if (kept === 0) return null;
  return kept === w * h ? px : { width: w, height: h, channels: 4, data: out };
}

/** The corners of a picture whose unit square `m` maps out. */
export const pictureCorners = (m: Matrix): Pt[] => [
  apply(m, 0, 0),
  apply(m, 1, 0),
  apply(m, 1, 1),
  apply(m, 0, 1),
];

/** Whether a clip (box and shapes, in the space `m` maps to) leaves the picture as it is. */
export function clipsNothing(m: Matrix, clip: Box | null, regions: readonly Region[]): boolean {
  const corners = pictureCorners(m);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return (clip === null || inside(box, clip)) && regions.every((r) => ringsInside([corners], r));
}

/**
 * A picture cut to a clip: `m` maps its unit square (u right, v down, row 0
 * at v = 0) to the clip's space, `clip` is a rectangle there (or null) and
 * `regions` are clip shapes. An axis-aligned picture is cropped to whole
 * pixels of the rectangle; pixels outside a shape (or the rectangle, when
 * the picture is turned) become see-through. Null when nothing is left;
 * the same pixels and matrix when nothing is cut.
 */
export function clipPicture(
  px: Pixels,
  m: Matrix,
  clip: Box | null,
  regions: readonly Region[],
): { px: Pixels; m: Matrix } | null {
  const corners = pictureCorners(m);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  if (clip && disjoint(box, clip)) return null;
  // Clip shapes the picture is not inside of: its pixels outside become see-through.
  const masks = regions.filter((r) => !ringsInside([corners], r));
  let out = px;
  let mm = m;
  if (clip && !inside(box, clip)) {
    if (isAxisAligned(m) && determinant(m) !== 0) {
      const inv = invert(m);
      const [u0, v0] = apply(inv, clip[0], clip[1]);
      const [u1, v1] = apply(inv, clip[2], clip[3]);
      const cut = (a: number, b: number, n: number): [number, number] => [
        Math.max(0, Math.round(Math.min(a, b) * n)),
        Math.min(n, Math.round(Math.max(a, b) * n)),
      ];
      const [x0, x1] = cut(u0, u1, px.width);
      const [y0, y1] = cut(v0, v1, px.height);
      if (x1 <= x0 || y1 <= y0) return null;
      mm = multiply(m, [
        (x1 - x0) / px.width,
        0,
        0,
        (y1 - y0) / px.height,
        x0 / px.width,
        y0 / px.height,
      ]);
      out = cropPixels(px, x0, y0, x1, y1);
    } else {
      const r = makeRegion([boxRing(clip)], false);
      if (r) masks.push(r);
    }
  }
  if (masks.length > 0) {
    const masked = maskPixels(out, mm, masks);
    if (!masked) return null;
    out = masked;
  }
  return { px: out, m: mm };
}
