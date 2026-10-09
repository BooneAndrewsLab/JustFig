/**
 * Editing a path's points after drawing (note 28): move a node or one of
 * its Bézier handles, add a point on a segment, delete one, switch a point
 * between corner and smooth. Works on paths, arrows and the guide path of
 * path-following procedural objects (`Procedural.path`, note 04) through
 * one accessor; the frame is refitted to the nodes keeping its rotation.
 */
import { apply, frameMatrix, invert } from '../geometry/matrix';
import type { Id } from '../model/ids';
import type { Frame, Obj, PathNode, Vec2 } from '../model/types';
import { type Unit, formatLength } from '../units';
import { type Edit, EditError, updateObjects } from './edits';

export type NodePart = 'node' | 'in' | 'out';

export interface NodeRef {
  readonly index: number;
  readonly part: NodePart;
}

export interface EditableNodes {
  readonly nodes: readonly PathNode[];
  readonly closed: boolean;
}

/** The nodes point editing works on, or null when the object has none to edit. */
export function editableNodes(o: Obj): EditableNodes | null {
  if (o.locked === true) return null;
  if (o.type === 'path') return { nodes: o.nodes, closed: o.closed };
  if (o.type === 'arrow') return { nodes: o.nodes, closed: false };
  if (o.type === 'procedural' && o.path && o.path.length >= 2) {
    const p = o.params;
    const closed =
      typeof p === 'object' && p !== null && (p as Record<string, unknown>)['closed'] === true;
    return { nodes: o.path, closed };
  }
  return null;
}

/** The points Tab walks through: each node, with its handles around it, in path order. */
export function nodeRefs(nodes: readonly PathNode[]): NodeRef[] {
  const out: NodeRef[] = [];
  nodes.forEach((n, index) => {
    if (n.in) out.push({ index, part: 'in' });
    out.push({ index, part: 'node' });
    if (n.out) out.push({ index, part: 'out' });
  });
  return out;
}

/** Where a point is, frame-local; undefined when that handle does not exist. */
export function partAt(nodes: readonly PathNode[], ref: NodeRef): Vec2 | undefined {
  const n = nodes[ref.index];
  if (!n) return undefined;
  return ref.part === 'node' ? n : n[ref.part];
}

/** The object with these nodes, its frame refitted (see note 28). */
function withNodes(o: Obj, nodes: readonly PathNode[]): Obj {
  const old = editableNodes(o);
  if (!old) return o;
  const before = boundsOf(old.nodes);
  const after = boundsOf(nodes);
  const f = o.frame;
  // The margins the frame had around its nodes (none for a path; a path-following object's reach).
  const mL = Math.max(0, before.x0);
  const mT = Math.max(0, before.y0);
  const mR = Math.max(0, f.w - before.x1);
  const mB = Math.max(0, f.h - before.y1);
  const x0 = after.x0 - mL;
  const y0 = after.y0 - mT;
  const w = after.x1 + mR - x0;
  const h = after.y1 + mB - y0;
  // The new box's centre, in the old frame's local coordinates, taken to the page: every
  // node that did not change stays exactly where it was, rotated or flipped.
  const c = apply(frameMatrix(f), { x: x0 + w / 2, y: y0 + h / 2 });
  const frame: Frame = { ...f, x: c.x - w / 2, y: c.y - h / 2, w, h };
  const shift = (p: Vec2): Vec2 => ({ x: p.x - x0, y: p.y - y0 });
  const local = nodes.map((n) => ({
    ...shift(n),
    ...(n.in ? { in: shift(n.in) } : {}),
    ...(n.out ? { out: shift(n.out) } : {}),
  }));
  if (o.type === 'path' || o.type === 'arrow') return { ...o, frame, nodes: local };
  if (o.type === 'procedural') return { ...o, frame, path: local };
  return o;
}

function boundsOf(nodes: readonly PathNode[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes)
    for (const p of [n, n.in, n.out]) {
      if (!p) continue;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return { x0, y0, x1, y1 };
}

/** A page-space offset in the frame's own axes (undoing its rotation and flip). */
export function toLocalDelta(f: Frame, dx: number, dy: number): Vec2 {
  const r = (-f.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return { x: f.flipX ? -x : x, y: f.flipY ? -y : y };
}

const add = (p: Vec2, d: Vec2): Vec2 => ({ x: p.x + d.x, y: p.y + d.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec2): number => Math.hypot(v.x, v.y);
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Both handles present and pointing opposite ways along one line. */
export function isSmooth(n: PathNode): boolean {
  if (!n.in || !n.out) return n.in !== undefined || n.out !== undefined;
  const a = sub(n.in, n);
  const b = sub(n.out, n);
  const la = len(a);
  const lb = len(b);
  if (la < 1e-9 || lb < 1e-9) return true;
  return (a.x * b.x + a.y * b.y) / (la * lb) < -0.999;
}

function editNodes(
  pageId: Id,
  id: Id,
  label: string,
  fn: (e: EditableNodes) => readonly PathNode[],
): Edit {
  return updateObjects(pageId, [id], label, (o) => {
    const e = editableNodes(o);
    if (!e) return o;
    return withNodes(o, fn(e));
  });
}

const replaceAt = (nodes: readonly PathNode[], i: number, n: PathNode): PathNode[] =>
  nodes.map((m, j) => (j === i ? n : m));

/**
 * Moves a node (with its handles) or one handle by a page-space offset. A
 * drag passes the whole offset from its start each time, applied to the
 * figure it started from.
 */
export function moveNodePart(pageId: Id, id: Id, ref: NodeRef, dx: number, dy: number): Edit {
  return updateObjects(pageId, [id], ref.part === 'node' ? 'Move point' : 'Move handle', (o) => {
    const e = editableNodes(o);
    const n = e?.nodes[ref.index];
    if (!e || !n) return o;
    const d = toLocalDelta(o.frame, dx, dy);
    if (ref.part === 'node') {
      const moved: PathNode = {
        ...add(n, d),
        ...(n.in ? { in: add(n.in, d) } : {}),
        ...(n.out ? { out: add(n.out, d) } : {}),
      };
      return withNodes(o, replaceAt(e.nodes, ref.index, moved));
    }
    const h = n[ref.part];
    if (!h) return o;
    const nh = add(h, d);
    const otherPart = ref.part === 'in' ? 'out' : 'in';
    const other = n[otherPart];
    let moved: PathNode = { ...n, [ref.part]: nh };
    if (other && isSmooth(n)) {
      // A smooth point stays smooth: the other handle turns to stay opposite, keeping its length.
      const v = sub(nh, n);
      const lv = len(v);
      if (lv > 1e-9) {
        const k = len(sub(other, n)) / lv;
        moved = { ...moved, [otherPart]: { x: n.x - v.x * k, y: n.y - v.y * k } };
      }
    }
    return withNodes(o, replaceAt(e.nodes, ref.index, moved));
  });
}

/**
 * Splits segment `seg` (from node `seg` to the next, or the last back to the
 * first on a closed path) at `t` in 0..1: the shape does not change.
 */
export function insertNode(pageId: Id, id: Id, seg: number, t: number): Edit {
  return editNodes(pageId, id, 'Add point', ({ nodes, closed }) => {
    const n = nodes.length;
    const segs = closed ? n : n - 1;
    if (seg < 0 || seg >= segs) throw new EditError('There is no segment there to add a point to.');
    const tt = Math.min(0.999, Math.max(0.001, t));
    const a = nodes[seg];
    const b = nodes[(seg + 1) % n];
    if (!a || !b) return nodes;
    let na: PathNode = a;
    let nb: PathNode = b;
    let mid: PathNode;
    if (!a.out && !b.in) {
      mid = lerp(a, b, tt);
    } else {
      // de Casteljau.
      const p1 = a.out ?? a;
      const p2 = b.in ?? b;
      const q0 = lerp(a, p1, tt);
      const q1 = lerp(p1, p2, tt);
      const q2 = lerp(p2, b, tt);
      const r0 = lerp(q0, q1, tt);
      const r1 = lerp(q1, q2, tt);
      const s = lerp(r0, r1, tt);
      na = { ...a, out: q0 };
      nb = { ...b, in: q2 };
      mid = { ...s, in: r0, out: r1 };
    }
    const out = nodes.map((m, j) => (j === seg ? na : j === (seg + 1) % n ? nb : m));
    out.splice(seg + 1, 0, mid);
    return out;
  });
}

/** Deletes a node (never leaving fewer than two), or removes one handle (that side becomes a corner). */
export function deleteNodePart(pageId: Id, id: Id, ref: NodeRef): Edit {
  if (ref.part !== 'node')
    return editNodes(pageId, id, 'Remove handle', ({ nodes }) => {
      const n = nodes[ref.index];
      if (!n) return nodes;
      const { in: inn, out } = n;
      const kept: PathNode = {
        x: n.x,
        y: n.y,
        ...(inn && ref.part !== 'in' ? { in: inn } : {}),
        ...(out && ref.part !== 'out' ? { out } : {}),
      };
      return replaceAt(nodes, ref.index, kept);
    });
  return editNodes(pageId, id, 'Delete point', ({ nodes }) => {
    if (nodes.length <= 2) throw new EditError('A path needs at least two points.');
    return nodes.filter((_, j) => j !== ref.index);
  });
}

/** Makes a point smooth (handles along its neighbours' line, a third of the way to each) or a corner. */
export function setSmooth(pageId: Id, id: Id, index: number, smooth: boolean): Edit {
  const label = smooth ? 'Make point smooth' : 'Make point a corner';
  return editNodes(pageId, id, label, ({ nodes, closed }) => {
    const n = nodes[index];
    if (!n) return nodes;
    if (!smooth) return replaceAt(nodes, index, { x: n.x, y: n.y });
    const count = nodes.length;
    const prev = index > 0 ? nodes[index - 1] : closed ? nodes[count - 1] : undefined;
    const next = index < count - 1 ? nodes[index + 1] : closed ? nodes[0] : undefined;
    const dir = sub(next ?? n, prev ?? n);
    const ld = len(dir);
    if (ld < 1e-9) return nodes;
    const along = (to: Vec2, sign: number): Vec2 => {
      const k = (sign * len(sub(to, n))) / 3 / ld;
      return { x: n.x + dir.x * k, y: n.y + dir.y * k };
    };
    return replaceAt(nodes, index, {
      x: n.x,
      y: n.y,
      ...(prev ? { in: along(prev, -1) } : {}),
      ...(next ? { out: along(next, 1) } : {}),
    });
  });
}

/** A point on segment `seg` at `t`: straight segments by length, curves as cubics. */
export function segmentAt(nodes: readonly PathNode[], seg: number, t: number): Vec2 | undefined {
  const a = nodes[seg];
  const b = nodes[(seg + 1) % nodes.length];
  if (!a || !b) return undefined;
  if (!a.out && !b.in) return lerp(a, b, t);
  const p1 = a.out ?? a;
  const p2 = b.in ?? b;
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
  };
}

/**
 * The segment nearest `p` (frame-local) and the `t` on it, for a click on a
 * segment; sampled finely enough for a pointer.
 */
export function nearestOnPath(
  nodes: readonly PathNode[],
  closed: boolean,
  p: Vec2,
  steps = 64,
): { seg: number; t: number; d: number } {
  const n = nodes.length;
  const segs = closed ? n : n - 1;
  let best = { seg: 0, t: 0.5, d: Infinity };
  for (let i = 0; i < segs; i += 1)
    for (let k = 1; k < steps; k += 1) {
      const q = segmentAt(nodes, i, k / steps);
      if (!q) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best.d) best = { seg: i, t: k / steps, d };
    }
  return best;
}

/** A page point in the object's own (frame-local) coordinates. */
export function toLocalPoint(o: Obj, p: Vec2): Vec2 {
  return apply(invert(frameMatrix(o.frame)), p);
}

/** What the live line says about the current point: "Point 2 of 5, smooth, X 12 mm, Y 4.5 mm". */
export function describePoint(o: Obj, ref: NodeRef, units: Unit): string {
  const ed = editableNodes(o);
  const n = ed?.nodes[ref.index];
  const at = ed ? partAt(ed.nodes, ref) : undefined;
  if (!ed || !n || !at) return '';
  const p = apply(frameMatrix(o.frame), at);
  const where = `X ${formatLength(p.x, units)} ${units}, Y ${formatLength(p.y, units)} ${units}`;
  const which = `Point ${String(ref.index + 1)} of ${String(ed.nodes.length)}`;
  if (ref.part !== 'node')
    return `${which}, ${ref.part === 'in' ? 'incoming' : 'outgoing'} handle, ${where}`;
  return `${which}, ${n.in || n.out ? 'smooth' : 'corner'}, ${where}`;
}
