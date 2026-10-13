/**
 * Dragging the points of a selected line or arrow directly (note 28): which
 * objects show point handles, where a dragged point lands, and attaching an
 * arrow end where it was released (note 06).
 */
import { apply, frameMatrix } from '../geometry/matrix';
import type { Id } from '../model/ids';
import { bindable } from '../model/binding';
import type { BindSite, Obj, Vec2 } from '../model/types';
import { type Edit, updateObjects } from './edits';
import { editableNodes } from './nodes';

/** An open path or arrow without curve handles: it shows a handle on every point. */
export function usesPointHandles(o: Obj): boolean {
  if (o.type !== 'path' && o.type !== 'arrow') return false;
  const e = editableNodes(o);
  if (!e || e.closed || e.nodes.length < 2) return false;
  return e.nodes.every((n) => !n.in && !n.out);
}

/** The object's points on the page. */
export function pagePoints(o: Obj): Vec2[] {
  const e = editableNodes(o);
  if (!e) return [];
  const m = frameMatrix(o.frame);
  return e.nodes.map((n) => apply(m, n));
}

/** The point Shift snaps against: the previous point, or the next for the first. */
export function neighbourOf(points: readonly Vec2[], index: number): Vec2 | undefined {
  return points[index > 0 ? index - 1 : 1];
}

/** `b` turned about `a` to the nearest 45 degrees, keeping its distance. */
export function snap45(a: Vec2, b: Vec2): Vec2 {
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / step) * step;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

/**
 * Where the point lands, page coordinates: grabbed at `origin`, the pointer
 * moved by `delta`; Shift snaps its angle to 45 degrees from the neighbour,
 * otherwise `snap` (guides, grid) may adjust it.
 */
export function pointDragTarget(
  origin: Vec2,
  delta: Vec2,
  neighbour: Vec2 | undefined,
  shift: boolean,
  snap?: (p: Vec2) => Vec2,
): Vec2 {
  const p = { x: origin.x + delta.x, y: origin.y + delta.y };
  if (shift && neighbour) return snap45(neighbour, p);
  return snap ? snap(p) : p;
}

/** Which arrow end a point is, or undefined for a middle point or a non-arrow. */
export function arrowEndAt(o: Obj, index: number): 'start' | 'end' | undefined {
  if (o.type !== 'arrow') return undefined;
  if (index === 0) return 'start';
  return index === o.nodes.length - 1 ? 'end' : undefined;
}

/**
 * Attaches an arrow's end to `targetId`, at `site` when given (note 06), else sliding on
 * its outline; `reconcileBindings` places the end. Re-attaching to another site of the same
 * target is how the Inspector moves an end between sites.
 */
export function attachArrowEnd(
  pageId: Id,
  arrowId: Id,
  end: 'start' | 'end',
  targetId: Id,
  target: Obj,
  site?: BindSite,
): Edit {
  return updateObjects(pageId, [arrowId], 'Attach arrow end', (o) => {
    if (o.type !== 'arrow' || !bindable(target, o.id)) return o;
    // reconcileBindings places the freshly attached end on the target's outline or site.
    return { ...o, bind: { ...o.bind, [end]: { id: targetId, ...(site ? { site } : {}) } } };
  });
}
