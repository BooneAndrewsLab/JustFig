/**
 * What a picture shows and where (notes 20 and 44): its view (its pixels
 * turned by `turn`, then `crop` of those) and the frame that keeps its scale
 * when the view changes. Pure geometry, shared by the crop edit and the inset
 * binding (`model/inset.ts`), which must not import edits.
 */
import { apply as applyMat, frameMatrix } from './matrix';
import { normAngle } from './transform';
import { fromTurned, toTurned } from './turn';
import type { Frame, Image, Rect4 } from '../model/types';

/** All of a picture `w` × `h` pixels. */
export const fullCrop = (w: number, h: number): Rect4 => ({ x: 0, y: 0, w, h });

/** What a picture shows: its pixels turned by `turn` degrees, then `crop` of those. */
export interface View {
  readonly turn: number;
  readonly crop: Rect4;
}

/** What a picture shows, in pixels of its asset (turned by `o.turn`, if set). */
export const visibleRect = (o: Image, a: { meta: { width: number; height: number } }): Rect4 =>
  o.crop ?? fullCrop(a.meta.width, a.meta.height);

/** A picture's view: its turn (only with a crop) and what it shows. */
export const currentView = (o: Image, a: { meta: { width: number; height: number } }): View => ({
  turn: o.crop ? (o.turn ?? 0) : 0,
  crop: visibleRect(o, a),
});

/** −1 when a frame is mirrored one way (a turn of its pixels then reads the other way). */
export const flipSign = (f: Frame): 1 | -1 => ((f.flipX === true) !== (f.flipY === true) ? -1 : 1);

/** The angle a picture's pixels are at on the page: its frame's and its own turn. */
export const pageAngle = (o: Image): number =>
  normAngle(o.frame.rotation + flipSign(o.frame) * (o.crop ? (o.turn ?? 0) : 0));

/** A crop as whole pixels inside a `w` × `h` picture, at least one pixel each way. */
export function clampCrop(c: Rect4, w: number, h: number): Rect4 {
  const int = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  const x = int(c.x, 0, w - 1);
  const y = int(c.y, 0, h - 1);
  return { x, y, w: int(c.w, 1, w - x), h: int(c.h, 1, h - y) };
}

/**
 * The frame that shows `next` of a `size` picture now showing `was` in `f`:
 * same points per pixel, the same angle on the page for its pixels (so a
 * change of turn moves into the frame's rotation), same flips, the kept
 * pixels in place.
 */
export function viewFrame(f: Frame, size: { w: number; h: number }, was: View, next: View): Frame {
  const kx = was.crop.w > 0 ? f.w / was.crop.w : 0;
  const ky = was.crop.h > 0 ? f.h / was.crop.h : 0;
  const w = next.crop.w * kx;
  const h = next.crop.h * ky;
  // The new box's centre: in the picture's pixels, then where the old view puts them.
  const px = fromTurned(size.w, size.h, next.turn, {
    x: next.crop.x + next.crop.w / 2,
    y: next.crop.y + next.crop.h / 2,
  });
  const pv = toTurned(size.w, size.h, was.turn, px);
  const c = applyMat(frameMatrix(f), {
    x: (pv.x - was.crop.x) * kx,
    y: (pv.y - was.crop.y) * ky,
  });
  const rotation =
    was.turn === next.turn
      ? f.rotation
      : normAngle(f.rotation + flipSign(f) * (was.turn - next.turn));
  return { ...f, x: c.x - w / 2, y: c.y - h / 2, w, h, rotation };
}

/** Params with an `imageWidth` (pixels) scaled from `was` to `now` pixels shown. */
export function scaledWidth(params: unknown, was: number, now: number): unknown {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return params;
  const p = params as Record<string, unknown>;
  const iw = p['imageWidth'];
  if (typeof iw !== 'number' || !(was > 0) || was === now) return params;
  return { ...p, imageWidth: Math.max(1, Math.round((iw * now) / was)) };
}
