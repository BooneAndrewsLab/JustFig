import { describe, expect, it } from 'vitest';

import { snapBox, snapPoint } from './snap';

describe('snapping', () => {
  const page = { x: 0, y: 0, w: 200, h: 100 };
  it('snaps the nearest edge or centre within the threshold, with a guide', () => {
    const r = snapBox({ x: 97, y: 10, w: 10, h: 10 }, [page, { x: 50, y: 60, w: 60, h: 20 }], 4);
    // Moving centre 102 vs page centre 100 (d=-2), moving right 107 vs other right 110 (d=3): page centre wins.
    expect(r.dx).toBe(-2);
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 100 });
    expect(r.dy).toBe(0);
  });
  it('leaves a box alone when nothing is near', () => {
    expect(snapBox({ x: 30, y: 30, w: 10, h: 10 }, [page], 2)).toEqual({
      dx: 0,
      dy: 0,
      guides: [],
    });
    expect(snapPoint({ x: 199, y: 51 }, [page], 2).p).toEqual({ x: 200, y: 50 });
  });
});
