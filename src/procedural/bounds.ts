/**
 * What a procedural object draws, as a box (issue 44). Some kinds draw past
 * their frame (`overhang`): gel lane labels above a photo, a scale bar's
 * label, a bilayer's heads along a path. The frame stays the object's
 * geometry (resizing, binding, the Inspector's X/Y/W/H); these bounds are
 * what alignment, distribution, grid layout, the selection's drawn outline
 * and the saved snapshot use, so the hanging parts count where they show.
 */
import {
  type Box,
  apply,
  boxOfPoints,
  frameBounds,
  frameMatrix,
  unionBoxes,
} from '@/core/geometry/matrix';
import { objBounds } from '@/core/geometry/transform';
import type { Obj, Procedural, Swatch } from '@/core/model/types';

import { type Prim, primPoints } from './prims';
import { proceduralPrims } from './registry';
import { textPrimObj } from './shapes';

const local = new WeakMap<readonly Prim[], Box | null>();

function primsBox(prims: readonly Prim[]): Box | null {
  if (local.has(prims)) return local.get(prims) ?? null;
  const boxes: Box[] = [];
  for (const p of prims) {
    if (p.kind === 'text') {
      if (p.text.trim() !== '') boxes.push(frameBounds(textPrimObj(p).frame));
      continue;
    }
    const pts = [...primPoints(p)];
    if (pts.length === 0) continue;
    const b = boxOfPoints(pts);
    const pad = p.stroke !== null && p.sw > 0 ? p.sw / 2 : 0;
    boxes.push({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });
  }
  const box = boxes.length > 0 ? unionBoxes(boxes) : null;
  local.set(prims, box);
  return box;
}

/**
 * Frame-local box of the object's frame and everything it draws, or null
 * when its kind is unknown here. Labels need the fonts loaded (they are, in
 * the app, before any figure opens).
 */
export function drawnLocalBox(o: Procedural, palette: readonly Swatch[]): Box | null {
  const prims = proceduralPrims(o, palette);
  if (!prims) return null;
  const frameBox = { x: 0, y: 0, w: o.frame.w, h: o.frame.h };
  const b = primsBox(prims);
  return b ? unionBoxes([frameBox, b]) : frameBox;
}

/**
 * Page bounds of what an object draws: its frame, plus whatever a procedural
 * object (also inside a group) draws past it. Everything else is `objBounds`.
 */
export function drawnBounds(o: Obj, palette: readonly Swatch[]): Box {
  if (o.type === 'group' && o.children.length > 0)
    return unionBoxes(o.children.map((c) => drawnBounds(c, palette)));
  if (o.type !== 'procedural') return objBounds(o);
  const b = drawnLocalBox(o, palette);
  if (!b) return objBounds(o);
  const m = frameMatrix(o.frame);
  return boxOfPoints(
    [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
    ].map((p) => apply(m, p)),
  );
}

/** `drawnBounds` with the palette bound, for the edits that take a box function. */
export const drawnBoundsIn =
  (palette: readonly Swatch[]) =>
  (o: Obj): Box =>
    drawnBounds(o, palette);
