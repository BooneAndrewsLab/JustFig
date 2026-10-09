/** Turning a picture's pixels for a level crop (#48). */
import { describe, expect, it } from 'vitest';

import { fromTurned, toTurned, turnedSize } from './turn';

describe('turn', () => {
  it('sizes the turned picture to its bounding box, exactly at quarter turns', () => {
    expect(turnedSize(200, 100, 0)).toEqual({ w: 200, h: 100 });
    expect(turnedSize(200, 100, 90)).toEqual({ w: 100, h: 200 });
    expect(turnedSize(200, 100, -180)).toEqual({ w: 200, h: 100 });
    expect(turnedSize(100, 100, 45)).toEqual({ w: 142, h: 142 });
  });

  it('maps pixels into the turned picture and back', () => {
    for (const deg of [0, 17, -63, 90, 135, 180]) {
      const p = { x: 31.5, y: 7.25 };
      const q = fromTurned(200, 100, deg, toTurned(200, 100, deg, p));
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
    // A quarter turn clockwise (y down): the top-left corner goes to the top-right.
    expect(toTurned(200, 100, 90, { x: 0, y: 0 })).toEqual({ x: 100, y: 0 });
  });
});
