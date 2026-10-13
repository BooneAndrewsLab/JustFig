/**
 * Arrow binding (note 06): an arrow end attached to an object follows it.
 * `reconcileBindings(before, after)` runs after every edit and re-solves
 * the ends whose target changed, drops bindings whose target is gone or
 * whose end the user moved away, and leaves everything else untouched
 * (same object identity), so it is cheap and never drifts.
 */
import { flatten } from '../geometry/sampling';
import { type Box, apply, center, corners, frameMatrix } from '../geometry/matrix';
import { objBounds } from '../geometry/transform';
import { localise } from './factory';
import { remapInset, reconcileInsets } from './inset';
import type { Id } from './ids';
import { remapStep, reconcileSteps } from './steps';
import { hasChildren, mapPageObjs, pageObjects } from './tree';
import type { Arrow, Figure, Obj, Page, PathNode, Vec2 } from './types';

/** How far outside its target's outline a bound end sits, points. */
export const BIND_GAP = 2;

export type ArrowEnd = 'start' | 'end';

/** Whether an arrow may be bound to this object. */
export const bindable = (o: Obj, arrowId?: Id): boolean =>
  o.type !== 'panel' && o.type !== 'arrow' && o.id !== arrowId && o.hidden !== true;

// --- geometry --------------------------------------------------------------------

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const mulv = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const len = (a: Vec2): number => Math.hypot(a.x, a.y);
const rot = (d: Vec2, rad: number): Vec2 => ({
  x: d.x * Math.cos(rad) - d.y * Math.sin(rad),
  y: d.x * Math.sin(rad) + d.y * Math.cos(rad),
});
/** d turned +90° (the Inspector's "Curve %" normal). */
const perp = (d: Vec2): Vec2 => ({ x: -d.y, y: d.x });

const boxCorners = (b: Box): Vec2[] => [
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y },
  { x: b.x + b.w, y: b.y + b.h },
  { x: b.x, y: b.y + b.h },
];

/** The target's outline as a closed polygon in page coordinates. */
export function outline(o: Obj): Vec2[] {
  const m = frameMatrix(o.frame);
  if (o.type === 'ellipse') {
    const { w, h } = o.frame;
    const pts: Vec2[] = [];
    for (let i = 0; i < 64; i += 1) {
      const t = (i / 64) * Math.PI * 2;
      pts.push(apply(m, { x: w / 2 + (w / 2) * Math.cos(t), y: h / 2 + (h / 2) * Math.sin(t) }));
    }
    return pts;
  }
  if (o.type === 'path' && o.closed && o.nodes.length > 2)
    return flatten(o.nodes, true).pts.map((p) => apply(m, p));
  if (o.type === 'group') return boxCorners(objBounds(o));
  return corners(o.frame);
}

/** Where the rays to a target's outline start: its centre. */
export function targetCentre(o: Obj): Vec2 {
  return o.type === 'group' ? center(objBounds(o)) : center(o.frame);
}

/**
 * Where an end bound to `target` goes: on the ray from its centre in
 * direction `dir`, at the outline crossing nearest `reach` along the ray
 * (the outer edge of a concave outline), plus the gap. Null when the ray
 * has no direction or never crosses.
 */
export function clipToOutline(target: Obj, dir: Vec2, reach = Infinity): Vec2 | null {
  const c = targetCentre(target);
  const l = len(dir);
  if (l < 1e-9) return null;
  const d = mulv(dir, 1 / l);
  const poly = outline(target);
  let best: number | null = null;
  let nearest: number | null = null;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    const e = sub(b, a);
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-12) continue;
    const ac = sub(a, c);
    const t = (ac.x * e.y - ac.y * e.x) / den;
    const u = (ac.x * d.y - ac.y * d.x) / den;
    if (t < -1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
    if (t <= reach && (best === null || t > best)) best = t;
    if (nearest === null || t < nearest) nearest = t;
  }
  const t = best ?? nearest;
  return t === null ? null : add(c, mulv(d, t + BIND_GAP));
}

// --- arrows in page space --------------------------------------------------------

function pageNodes(a: Arrow): PathNode[] {
  const m = frameMatrix(a.frame);
  return a.nodes.map((n) => ({
    ...apply(m, n),
    ...(n.in ? { in: apply(m, n.in) } : {}),
    ...(n.out ? { out: apply(m, n.out) } : {}),
  }));
}

export function endPoint(a: Arrow, end: ArrowEnd): Vec2 | undefined {
  const n = end === 'start' ? a.nodes[0] : a.nodes[a.nodes.length - 1];
  return n ? apply(frameMatrix(a.frame), n) : undefined;
}

/** The bend fraction of a two-node arrow (the Inspector's Curve % / 100). */
export function bendOf(nodes: readonly PathNode[]): number {
  const [p, q] = nodes;
  if (nodes.length !== 2 || !p || !q || !p.out) return 0;
  const d = sub(q, p);
  const l2 = d.x * d.x + d.y * d.y;
  if (l2 < 1e-12) return 0;
  const o = sub(p.out, add(p, mulv(d, 1 / 3)));
  return (o.x * -d.y + o.y * d.x) / l2;
}

/** A two-node arrow from p to q with bend b. */
export function bentNodes(p: Vec2, q: Vec2, b: number): PathNode[] {
  if (Math.abs(b) < 1e-9) return [{ ...p }, { ...q }];
  const d = sub(q, p);
  const n = mulv(perp(d), b);
  return [
    { x: p.x, y: p.y, out: add(add(p, mulv(d, 1 / 3)), n) },
    { x: q.x, y: q.y, in: add(add(p, mulv(d, 2 / 3)), n) },
  ];
}

const close = (a: Vec2 | undefined, b: Vec2 | undefined): boolean =>
  a !== undefined && b !== undefined && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** The arrow with its bound ends placed on their targets. */
export function solveArrow(
  a: Arrow,
  targets: { readonly start?: Obj | undefined; readonly end?: Obj | undefined },
): Arrow {
  const nodes = pageNodes(a);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last || nodes.length < 2) return a;
  const ts = targets.start;
  const te = targets.end;
  let out: PathNode[];
  if (nodes.length === 2) {
    const b = bendOf(nodes);
    const theta = Math.atan(3 * b);
    let p: Vec2 = first;
    let q: Vec2 = last;
    if (ts) {
      const aim = te ? targetCentre(te) : q;
      const c = targetCentre(ts);
      p = clipToOutline(ts, rot(sub(aim, c), theta), len(sub(aim, c))) ?? p;
    }
    if (te) {
      const aim = ts ? targetCentre(ts) : p;
      const c = targetCentre(te);
      q = clipToOutline(te, rot(sub(aim, c), -theta), len(sub(aim, c))) ?? q;
    }
    if (close(p, first) && close(q, last)) return a;
    out = bentNodes(p, q, b);
  } else {
    out = [...nodes];
    const move = (i: number, target: Obj, neighbour: PathNode | undefined) => {
      const n = out[i];
      if (!n || !neighbour) return;
      const c = targetCentre(target);
      const to = clipToOutline(target, sub(neighbour, c), len(sub(neighbour, c)));
      if (!to) return;
      const dd = sub(to, n);
      out[i] = {
        x: to.x,
        y: to.y,
        ...(n.in ? { in: add(n.in, dd) } : {}),
        ...(n.out ? { out: add(n.out, dd) } : {}),
      };
    };
    if (ts) move(0, ts, nodes[1]);
    if (te) move(out.length - 1, te, nodes[nodes.length - 2]);
    if (close(out[0], first) && close(out[out.length - 1], last)) return a;
  }
  const { f, local } = localise(out);
  return { ...a, frame: f, nodes: local };
}

// --- reconciling after an edit ---------------------------------------------------

function index(page: Page | undefined): Map<Id, Obj> {
  const m = new Map<Id, Obj>();
  if (page) for (const o of pageObjects(page)) m.set(o.id, o);
  return m;
}

function reconcilePage(before: Page | undefined, page: Page): Page {
  let any = false;
  for (const o of pageObjects(page))
    if (o.type === 'arrow' && o.bind) {
      any = true;
      break;
    }
  if (!any) return page;
  const now = index(page);
  const was = index(before);
  const changed = new Set<Obj>();
  const next = mapPageObjs(page, (o) => {
    if (o.type === 'group' && o.children.some((c) => changed.has(c))) {
      const b = objBounds(o);
      return { ...o, frame: { x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0 } };
    }
    if (o.type !== 'arrow' || !o.bind) return o;
    const old = was.get(o.id);
    const oldArrow = old?.type === 'arrow' ? old : undefined;
    const bind: { start?: Id; end?: Id } = {};
    const targets: { start?: Obj; end?: Obj } = {};
    let resolve = oldArrow === undefined;
    for (const end of ['start', 'end'] as const) {
      const id = o.bind[end];
      if (id === undefined) continue;
      const t = now.get(id);
      if (!t || !bindable(t, o.id)) continue;
      const tWas = was.get(id);
      // An end newly attached by this edit (released on an object) is placed on it.
      const fresh = oldArrow !== undefined && oldArrow !== o && oldArrow.bind?.[end] !== id;
      if (fresh) resolve = true;
      if (
        !fresh &&
        oldArrow &&
        oldArrow !== o &&
        tWas === t &&
        !close(endPoint(oldArrow, end), endPoint(o, end))
      )
        continue; // the user moved this end away from an unchanged target
      if (tWas !== t) resolve = true;
      // A new curve aims the ends along its new tangents.
      if (oldArrow && oldArrow !== o && Math.abs(bendOf(oldArrow.nodes) - bendOf(o.nodes)) > 1e-9)
        resolve = true;
      bind[end] = id;
      targets[end] = t;
    }
    const kept = Object.keys(bind).length > 0;
    const sameBind = o.bind.start === bind.start && o.bind.end === bind.end;
    let r: Arrow = o;
    if (!sameBind) {
      const { bind: _drop, ...rest } = o;
      r = kept ? { ...rest, bind } : rest;
    }
    if (kept && resolve) r = solveArrow(r, targets);
    if (r !== o) changed.add(r);
    return r;
  });
  return next;
}

/**
 * Re-solves bound objects after an edit turned `before` into `after`: first
 * magnified insets' boxes and lines (note 44), then step badges (note 48), then
 * bound arrows (note 06), so an arrow bound to an inset, its box or a badge follows them too.
 */
export function reconcileBindings(before: Figure, edited: Figure): Figure {
  const after = reconcileSteps(before, reconcileInsets(before, edited));
  const pages = after.doc.pages.map((p) =>
    reconcilePage(
      before.doc.pages.find((q) => q.id === p.id),
      p,
    ),
  );
  if (pages.every((p, i) => p === after.doc.pages[i])) return after;
  return { ...after, doc: { ...after.doc, pages } };
}

/**
 * Bindings remapped to copies (paste, duplicate); a binding to an object not
 * copied is dropped, as is an inset link whose source or box was not copied (note 44)
 * and a step badge's link to a target not copied (note 48).
 */
export function remapBindings(objs: readonly Obj[], ids: ReadonlyMap<Id, Id>): Obj[] {
  const fix = (o: Obj): Obj => {
    if (hasChildren(o)) return { ...o, children: o.children.map(fix) };
    if (o.type === 'image') return remapInset(o, ids);
    if (o.type === 'text') return remapStep(o, ids);
    if (o.type !== 'arrow' || !o.bind) return o;
    const bind: { start?: Id; end?: Id } = {};
    for (const end of ['start', 'end'] as const) {
      const id = o.bind[end];
      const to = id === undefined ? undefined : ids.get(id);
      if (to !== undefined) bind[end] = to;
    }
    const { bind: _drop, ...rest } = o;
    return Object.keys(bind).length > 0 ? { ...rest, bind } : rest;
  };
  return objs.map(fix);
}
