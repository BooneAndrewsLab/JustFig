import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type Pt,
  type Region,
  type Ring,
  clipLines,
  clipRing,
  contains,
  makeRegion,
  ringsInside,
  segmentSpans,
  windingAt,
} from './clipRegion';

const circle = (cx: number, cy: number, r: number, n = 48): Pt[] =>
  Array.from({ length: n }, (_, i) => [
    cx + r * Math.cos((2 * Math.PI * i) / n),
    cy + r * Math.sin((2 * Math.PI * i) / n),
  ]);
const square = (x: number, y: number, s: number): Pt[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

function distToEdges(p: Pt, rings: readonly Ring[]): number {
  let d = Infinity;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i] ?? [0, 0];
      const b = r[(i + 1) % r.length] ?? a;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = dx * dx + dy * dy;
      const t =
        l === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
      d = Math.min(d, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
    }
  return d;
}

/** Winding numbers of the cut ring equal the ring's inside the region, 0 outside. */
function checkWinding(ring: Ring, region: Region, samples: readonly Pt[]) {
  const out = clipRing(ring, region);
  for (const p of samples) {
    if (distToEdges(p, [ring, ...region.rings, ...out]) < 1e-6) continue;
    const want = contains(region, p) ? windingAt(p, [ring]) : 0;
    expect(windingAt(p, out), `at ${String(p)}`).toBe(want);
  }
}

const coord = fc.integer({ min: 0, max: 100 });
const pt = fc.tuple(coord, coord) as fc.Arbitrary<Pt>;
const ring = fc.array(pt, { minLength: 3, maxLength: 9 });
const grid: Pt[] = [];
for (let x = 0.5; x < 100; x += 3.7) for (let y = 0.3; y < 100; y += 3.3) grid.push([x, y]);

describe('clip regions', () => {
  it('knows a convex region from any other', () => {
    expect(makeRegion([circle(50, 50, 20)], false)?.convex).not.toBeNull();
    expect(makeRegion([square(0, 0, 10)], true)?.convex).not.toBeNull();
    const star = Array.from({ length: 10 }, (_, i): Pt => {
      const r = i % 2 ? 10 : 25;
      return [50 + r * Math.cos((i * Math.PI) / 5), 50 + r * Math.sin((i * Math.PI) / 5)];
    });
    expect(makeRegion([star], false)?.convex).toBeNull();
    expect(makeRegion([circle(50, 50, 20), circle(50, 50, 10)], true)?.convex).toBeNull();
    expect(
      makeRegion(
        [
          [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
        ],
        false,
      ),
    ).toBeNull(); // no area
  });

  it('keeps winding numbers inside a convex region (Sutherland–Hodgman)', () => {
    const region = makeRegion([circle(50, 50, 30)], false);
    if (!region) throw new Error('empty');
    fc.assert(
      fc.property(ring, (r) => {
        checkWinding(r, region, grid);
      }),
    );
  });

  it('keeps winding numbers inside any region, either fill rule (sweep)', () => {
    fc.assert(
      fc.property(
        ring,
        fc.array(ring, { minLength: 1, maxLength: 3 }),
        fc.boolean(),
        (r, rings, evenOdd) => {
          const region = makeRegion(rings, evenOdd);
          if (!region) return;
          checkWinding(r, region, grid);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('cuts a ring to a ring (a donut) into whole polygons, not slivers', () => {
    const donut = makeRegion([circle(50, 50, 40), circle(50, 50, 20)], true);
    if (!donut) throw new Error('empty');
    const band: Pt[] = [
      [0, 45],
      [100, 45],
      [100, 55],
      [0, 55],
    ];
    const out = clipRing(band, donut);
    // The band across the donut: a piece either side of the hole.
    expect(out.length).toBe(2);
    checkWinding(band, donut, grid);
    // Under the hole the two sides join: one piece cannot continue as two.
    expect(clipRing(square(0, 40, 100), donut).length).toBe(3);
    // A square inside the hole is gone; one around it all becomes the donut.
    expect(clipRing(square(45, 45, 10), donut)).toEqual([]);
    const all = clipRing(square(0, 0, 100), donut);
    for (const p of grid)
      if (distToEdges(p, donut.rings) > 1e-6)
        expect(windingAt(p, all) !== 0).toBe(contains(donut, p));
  });

  it('cuts lines into the pieces inside, keeping a line drawn on the edge', () => {
    const region = makeRegion([circle(50, 50, 30, 64)], false);
    if (!region) throw new Error('empty');
    const pieces = clipLines(
      [
        [0, 50],
        [100, 50],
      ],
      region,
    );
    expect(pieces.length).toBe(1);
    expect(pieces[0]?.[0]?.[0]).toBeCloseTo(20, 1);
    expect(pieces[0]?.[1]?.[0]).toBeCloseTo(80, 1);
    // The region's own outline, a little off it, is kept whole with a tolerance.
    const rim = circle(50, 50, 30.05, 100);
    expect(ringsInside([rim], region, 0.5)).toBe(true);
    expect(ringsInside([rim], region)).toBe(false);
    fc.assert(
      fc.property(fc.array(pt, { minLength: 2, maxLength: 8 }), (line) => {
        const cut = clipLines(line, region);
        for (const piece of cut)
          for (let i = 1; i < piece.length; i++) {
            const a = piece[i - 1] ?? [0, 0];
            const b = piece[i] ?? a;
            const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            if (distToEdges(m, region.rings) > 1e-6) expect(contains(region, m)).toBe(true);
          }
        // What was inside is kept: the total length inside matches.
        let inside = 0;
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1] ?? [0, 0];
          const b = line[i] ?? a;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (const [t0, t1] of segmentSpans(a, b, region)) inside += (t1 - t0) * len;
        }
        let kept = 0;
        for (const piece of cut)
          for (let i = 1; i < piece.length; i++) {
            const a = piece[i - 1] ?? [0, 0];
            const b = piece[i] ?? a;
            kept += Math.hypot(b[0] - a[0], b[1] - a[1]);
          }
        expect(kept).toBeCloseTo(inside, 6);
      }),
    );
  });
});
