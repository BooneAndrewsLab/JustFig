/**
 * Moving, scaling, rotating and flipping objects (note 02). Group and
 * panel children are in page coordinates, so transforms recurse; a
 * group's frame is then recomputed from its children. Paths and arrows
 * bake a scale into their nodes; everything else scales its frame.
 */
import type { Frame, Obj, PathNode, Vec2 } from '../model/types';
import { localise } from '../model/factory';
import { type Box, apply, center, frameBounds, frameMatrix, unionBoxes } from './matrix';

export function objBounds(o: Obj): Box {
  if (o.type === 'group')
    return o.children.length > 0 ? unionBoxes(o.children.map(objBounds)) : frameBounds(o.frame);
  return frameBounds(o.frame);
}

export const boundsOf = (objs: readonly Obj[]): Box => unionBoxes(objs.map(objBounds));

/** A group's frame from its children's bounds. */
export function refit(o: Obj): Obj {
  if (o.type !== 'group' || o.children.length === 0) return o;
  const b = boundsOf(o.children);
  return { ...o, frame: { x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0 } };
}

export function translateObj(o: Obj, dx: number, dy: number): Obj {
  const frame = { ...o.frame, x: o.frame.x + dx, y: o.frame.y + dy };
  if (o.type === 'group' || o.type === 'panel')
    return { ...o, frame, children: o.children.map((c) => translateObj(c, dx, dy)) };
  return { ...o, frame };
}

const scaleNodes = (nodes: readonly PathNode[], kx: number, ky: number): PathNode[] =>
  nodes.map((n) => ({
    x: n.x * kx,
    y: n.y * ky,
    ...(n.in ? { in: { x: n.in.x * kx, y: n.in.y * ky } } : {}),
    ...(n.out ? { out: { x: n.out.x * kx, y: n.out.y * ky } } : {}),
  }));

/**
 * Scales an object about an anchor point by (sx, sy). Exact for unrotated
 * objects; a rotated object scales its centre and its own w/h (note 02).
 * Negative factors flip.
 */
export function scaleObj(o: Obj, anchor: Vec2, sx: number, sy: number): Obj {
  if (o.type === 'group')
    return refit({ ...o, children: o.children.map((c) => scaleObj(c, anchor, sx, sy)) });
  const f = o.frame;
  const c = center(f);
  const nc = { x: anchor.x + (c.x - anchor.x) * sx, y: anchor.y + (c.y - anchor.y) * sy };
  // Along the object's own axes: for a rotation near 90°, x and y swap.
  const r = (((f.rotation % 180) + 180) % 180) / 90;
  const swap = r > 0.5 && r < 1.5;
  const kx = Math.abs(swap ? sy : sx);
  const ky = Math.abs(swap ? sx : sy);
  const w = f.w * kx;
  const h = f.h * ky;
  const flipX = sx < 0 !== (f.flipX === true);
  const flipY = sy < 0 !== (f.flipY === true);
  const frame: Frame = {
    x: nc.x - w / 2,
    y: nc.y - h / 2,
    w,
    h,
    rotation: sx < 0 !== sy < 0 ? -f.rotation : f.rotation,
    ...(flipX ? { flipX: true } : {}),
    ...(flipY ? { flipY: true } : {}),
  };
  if (o.type === 'path' || o.type === 'arrow')
    return { ...o, frame, nodes: scaleNodes(o.nodes, kx, ky) };
  if (o.type === 'panel') {
    // A panel is a frame: its contents keep their size, and move with its top-left.
    return {
      ...o,
      frame: { ...frame, rotation: 0 },
      children: o.children.map((ch) => translateObj(ch, frame.x - f.x, frame.y - f.y)),
    };
  }
  return { ...o, frame };
}

const rot = (p: Vec2, about: Vec2, deg: number): Vec2 => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
};

export const normAngle = (deg: number): number => {
  const a = ((deg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
};

/** Rotates about a point; exact for every object kind (centres move, rotations add). Panels do not rotate. */
export function rotateObj(o: Obj, about: Vec2, deg: number): Obj {
  if (o.type === 'panel') return o;
  if (o.type === 'group')
    return refit({ ...o, children: o.children.map((c) => rotateObj(c, about, deg)) });
  const f = o.frame;
  const nc = rot(center(f), about, deg);
  return {
    ...o,
    frame: { ...f, x: nc.x - f.w / 2, y: nc.y - f.h / 2, rotation: normAngle(f.rotation + deg) },
  };
}

/** Mirrors about a vertical (`x`) or horizontal (`y`) line through `about`. */
export function flipObj(o: Obj, axis: 'x' | 'y', about: Vec2): Obj {
  if (o.type === 'panel') return o;
  if (o.type === 'group')
    return refit({ ...o, children: o.children.map((c) => flipObj(c, axis, about)) });
  const f = o.frame;
  const c = center(f);
  const nc = axis === 'x' ? { x: 2 * about.x - c.x, y: c.y } : { x: c.x, y: 2 * about.y - c.y };
  const key = axis === 'x' ? 'flipX' : 'flipY';
  const { flipX: _fx, flipY: _fy, ...rest } = f;
  const flips = { flipX: f.flipX === true, flipY: f.flipY === true };
  flips[key] = !flips[key];
  return {
    ...o,
    frame: {
      ...rest,
      x: nc.x - f.w / 2,
      y: nc.y - f.h / 2,
      rotation: normAngle(-f.rotation),
      ...(flips.flipX ? { flipX: true } : {}),
      ...(flips.flipY ? { flipY: true } : {}),
    },
  };
}

/**
 * A path or arrow whose nodes changed (or that is rotated/flipped) with its
 * nodes taken to page space and back: the frame fits the nodes again, and
 * any rotation or flip is baked into them (exact).
 */
export function rebase<T extends Extract<Obj, { type: 'path' | 'arrow' }>>(o: T): T {
  const m = frameMatrix(o.frame);
  const nodes = o.nodes.map((n) => ({
    ...apply(m, n),
    ...(n.in ? { in: apply(m, n.in) } : {}),
    ...(n.out ? { out: apply(m, n.out) } : {}),
  }));
  const { f, local } = localise(nodes);
  return { ...o, frame: f, nodes: local };
}
