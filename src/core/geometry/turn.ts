/**
 * Turning a picture's pixels (issue 48, note 20): a level crop of a turned
 * picture resamples it turned by its angle into its bounding box, at the same
 * pixel size. Degrees clockwise on the page (y down), about the centres.
 */

/** cos and sin of `deg`, exact at quarter turns (so those resample pixel for pixel). */
export function cosSin(deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const snap = (v: number) =>
    Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v;
  return [snap(Math.cos(r)), snap(Math.sin(r))];
}

/** The bounding box of a `w` × `h` picture turned by `deg`, in whole pixels (same pixel size). */
export function turnedSize(w: number, h: number, deg: number): { w: number; h: number } {
  if (deg === 0) return { w, h };
  const [c, s] = cosSin(deg);
  const side = (v: number) => Math.max(1, Math.ceil(v - 1e-6));
  return {
    w: side(w * Math.abs(c) + h * Math.abs(s)),
    h: side(w * Math.abs(s) + h * Math.abs(c)),
  };
}

interface Pt {
  x: number;
  y: number;
}

/** A point in pixels of a `w` × `h` picture, in pixels of it turned by `deg` (about the centres). */
export function toTurned(w: number, h: number, deg: number, p: Pt): Pt {
  if (deg === 0) return p;
  const t = turnedSize(w, h, deg);
  const [c, s] = cosSin(deg);
  const dx = p.x - w / 2;
  const dy = p.y - h / 2;
  return { x: t.w / 2 + c * dx - s * dy, y: t.h / 2 + s * dx + c * dy };
}

/** The inverse of `toTurned`. */
export function fromTurned(w: number, h: number, deg: number, p: Pt): Pt {
  if (deg === 0) return p;
  const t = turnedSize(w, h, deg);
  const [c, s] = cosSin(deg);
  const dx = p.x - t.w / 2;
  const dy = p.y - t.h / 2;
  return { x: w / 2 + c * dx + s * dy, y: h / 2 - s * dx + c * dy };
}
