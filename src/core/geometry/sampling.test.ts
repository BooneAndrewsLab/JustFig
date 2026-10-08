import { describe, expect, it } from 'vitest';

import { ellipseNodes } from '@/procedural/prims';

import { flatten, offsetPt, pointAt, sampleEvery } from './sampling';

describe('path sampling', () => {
  it('measures a straight line and samples it evenly, centred', () => {
    const pl = flatten(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
    );
    expect(pl.length).toBeCloseTo(100);
    const s = sampleEvery(pl, 10);
    expect(s).toHaveLength(10);
    expect(s[0]?.x).toBeCloseTo(5);
    expect(s[9]?.x).toBeCloseTo(95);
    expect(s.every((p) => p.tx === 1 && p.ty === 0)).toBe(true);
    // The normal of a left-to-right path points down the page.
    expect(offsetPt(s[0]!, 3)).toEqual({ x: 5, y: 3 });
  });

  it('fits a whole number of units round a closed path (no seam)', () => {
    const pl = flatten(ellipseNodes(50, 50, 40, 40), true, 0.25);
    expect(pl.length).toBeCloseTo(2 * Math.PI * 40, 0);
    const s = sampleEvery(pl, 10);
    expect(s).toHaveLength(Math.round(pl.length / 10));
    const gaps = s.slice(1).map((p, i) => p.s - (s[i]?.s ?? 0));
    for (const g of gaps) expect(g).toBeCloseTo(pl.length / s.length);
    for (const p of s) expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(40, 0);
  });

  it('caps the number of samples', () => {
    const pl = flatten(
      [
        { x: 0, y: 0 },
        { x: 1e6, y: 0 },
      ],
      false,
    );
    expect(sampleEvery(pl, 0.01, 500)).toHaveLength(500);
  });

  it('finds the point at an arc length', () => {
    const pl = flatten(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      false,
    );
    const p = pointAt(pl, 15);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(5);
    expect(p.ty).toBeCloseTo(1);
  });

  it('copes with degenerate paths', () => {
    expect(sampleEvery(flatten([], false), 5)).toEqual([]);
    expect(
      sampleEvery(
        flatten(
          [
            { x: 1, y: 1 },
            { x: 1, y: 1 },
          ],
          false,
        ),
        5,
      ),
    ).toEqual([]);
  });
});
