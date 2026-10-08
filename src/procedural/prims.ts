/**
 * Drawing primitives of procedural kinds (note 04): paths made of
 * subpaths (merged per colour, so 5,000 lipid heads are one `<path>`) and
 * text labels. Render turns them into SvgNodes; "Convert to shapes" turns
 * them into plain objects. Both read the same data, so they agree.
 */
import type { PathNode, Vec2 } from '@/core/model/types';
import { num } from '@/render/svgNode';

export type Sub =
  | { readonly t: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly t: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly rx: number;
    }
  /** Corners and cubics; `in`/`out` are absolute handle positions, as in `PathNode`. */
  | { readonly t: 'poly'; readonly nodes: readonly PathNode[]; readonly closed: boolean };

export interface PathPrim {
  readonly kind: 'path';
  readonly subs: readonly Sub[];
  readonly fill: string | null;
  readonly stroke: string | null;
  readonly sw: number;
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'miter' | 'round' | 'bevel';
}

export interface TextPrim {
  readonly kind: 'text';
  readonly text: string;
  /** The anchor point. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly anchor: 'start' | 'middle' | 'end';
  /** Which part of the text sits on `y`. */
  readonly baseline: 'middle' | 'alphabetic' | 'top';
  readonly bold?: boolean;
  readonly italic?: boolean;
  /** Degrees about the anchor, clockwise. */
  readonly rotation?: number;
}

export type Prim = PathPrim | TextPrim;

export interface Style {
  readonly fill?: string | null;
  readonly stroke?: string | null;
  readonly sw?: number;
  readonly cap?: PathPrim['cap'];
  readonly join?: PathPrim['join'];
}

/** A path primitive, or nothing when it has no subpaths. */
export function pathPrim(subs: readonly Sub[], s: Style): PathPrim[] {
  if (subs.length === 0) return [];
  return [
    {
      kind: 'path',
      subs,
      fill: s.fill ?? null,
      stroke: s.stroke ?? null,
      sw: s.sw ?? 0,
      ...(s.cap ? { cap: s.cap } : {}),
      ...(s.join ? { join: s.join } : {}),
    },
  ];
}

export const circle = (cx: number, cy: number, r: number): Sub => ({ t: 'circle', cx, cy, r });
export const rect = (x: number, y: number, w: number, h: number, rx = 0): Sub => ({
  t: 'rect',
  x,
  y,
  w,
  h,
  rx,
});
export const poly = (pts: readonly Vec2[], closed = false): Sub => ({
  t: 'poly',
  nodes: pts.map((p) => ({ x: p.x, y: p.y })),
  closed,
});
export const line = (a: Vec2, b: Vec2): Sub => poly([a, b]);

/** Cubic handle factor for a quarter circle. */
const KAPPA = 0.5522847498;

/**
 * Circular arc from angle a0 to a1 (radians, clockwise on screen from +x)
 * as path nodes with cubic handles, at most 90° per segment.
 */
export function arcNodes(cx: number, cy: number, r: number, a0: number, a1: number): PathNode[] {
  const span = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9));
  const step = span / n;
  const k = (4 / 3) * Math.tan(step / 4) * r;
  const at = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const out: PathNode[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + step * i;
    const p = at(a);
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    out.push({
      ...p,
      ...(i > 0 ? { in: { x: p.x - tx * k, y: p.y - ty * k } } : {}),
      ...(i < n ? { out: { x: p.x + tx * k, y: p.y + ty * k } } : {}),
    });
  }
  return out;
}

/** Joins node runs into one: where a run starts at the previous run's end, the two nodes merge. */
export function joinNodes(...runs: readonly (readonly PathNode[])[]): PathNode[] {
  const out: PathNode[] = [];
  for (const run of runs)
    run.forEach((n, i) => {
      const prev = out[out.length - 1];
      if (i === 0 && prev && Math.abs(prev.x - n.x) < 1e-6 && Math.abs(prev.y - n.y) < 1e-6) {
        out[out.length - 1] = {
          x: prev.x,
          y: prev.y,
          ...(prev.in ? { in: prev.in } : {}),
          ...(n.out ? { out: n.out } : {}),
        };
      } else out.push(n);
    });
  return out;
}

/** An ellipse as four cubics (for rotated or squashed ovals). */
export function ellipseNodes(cx: number, cy: number, rx: number, ry: number, rot = 0): PathNode[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const tf = (x: number, y: number) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { ...tf(rx, 0), in: tf(rx, -ky), out: tf(rx, ky) },
    { ...tf(0, ry), in: tf(kx, ry), out: tf(-kx, ry) },
    { ...tf(-rx, 0), in: tf(-rx, ky), out: tf(-rx, -ky) },
    { ...tf(0, -ry), in: tf(-kx, -ry), out: tf(kx, -ry) },
  ];
}

const pt = (x: number, y: number): string => `${num(x)} ${num(y)}`;

function polyData(nodes: readonly PathNode[], closed: boolean): string {
  const first = nodes[0];
  if (!first) return '';
  let d = `M${pt(first.x, first.y)}`;
  const seg = (a: PathNode, b: PathNode) =>
    !a.out && !b.in
      ? `L${pt(b.x, b.y)}`
      : `C${pt((a.out ?? a).x, (a.out ?? a).y)} ${pt((b.in ?? b).x, (b.in ?? b).y)} ${pt(b.x, b.y)}`;
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1];
    const b = nodes[i];
    if (a && b) d += seg(a, b);
  }
  const last = nodes[nodes.length - 1];
  if (closed && last && nodes.length > 1) d += `${last.out || first.in ? seg(last, first) : ''}Z`;
  return d;
}

function subData(s: Sub): string {
  switch (s.t) {
    case 'circle': {
      const r = num(s.r);
      return `M${pt(s.cx - s.r, s.cy)}A${r} ${r} 0 1 0 ${pt(s.cx + s.r, s.cy)}A${r} ${r} 0 1 0 ${pt(s.cx - s.r, s.cy)}Z`;
    }
    case 'rect': {
      const rx = Math.min(s.rx, s.w / 2, s.h / 2);
      if (rx <= 0) return `M${pt(s.x, s.y)}H${num(s.x + s.w)}V${num(s.y + s.h)}H${num(s.x)}Z`;
      const r = num(rx);
      const a = `A${r} ${r} 0 0 1 `;
      return (
        `M${pt(s.x + rx, s.y)}H${num(s.x + s.w - rx)}${a}${pt(s.x + s.w, s.y + rx)}` +
        `V${num(s.y + s.h - rx)}${a}${pt(s.x + s.w - rx, s.y + s.h)}H${num(s.x + rx)}` +
        `${a}${pt(s.x, s.y + s.h - rx)}V${num(s.y + rx)}${a}${pt(s.x + rx, s.y)}Z`
      );
    }
    case 'poly':
      return polyData(s.nodes, s.closed);
  }
}

/** SVG path data of a path primitive (absolute commands only). */
export const primData = (p: PathPrim): string => p.subs.map(subData).join('');

/** Every point a primitive touches (subpath points, handles, circle extremes, text anchors). */
export function* primPoints(p: Prim): Generator<Vec2> {
  if (p.kind === 'text') {
    yield { x: p.x, y: p.y };
    return;
  }
  for (const s of p.subs) {
    if (s.t === 'circle') {
      yield { x: s.cx - s.r, y: s.cy - s.r };
      yield { x: s.cx + s.r, y: s.cy + s.r };
    } else if (s.t === 'rect') {
      yield { x: s.x, y: s.y };
      yield { x: s.x + s.w, y: s.y + s.h };
    } else
      for (const n of s.nodes) {
        yield n;
        if (n.in) yield n.in;
        if (n.out) yield n.out;
      }
  }
}
