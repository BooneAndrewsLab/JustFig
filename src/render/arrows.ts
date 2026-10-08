/**
 * Arrowheads as explicit path geometry (note 03: never `<marker>`). Head
 * length = max(3, size × strokeWidth); the line is shortened under heads
 * whose tip would otherwise show the line's end.
 */
import type { Head, PathNode, Vec2 } from '@/core/model/types';

import { num } from './svgNode';

export interface HeadShape {
  /** Path data, filled with the stroke colour unless `stroked`. */
  readonly d: string;
  /** Drawn as a stroke (open chevron, bar) rather than a fill. */
  readonly stroked: boolean;
}

export const headLength = (h: Head, strokeWidth: number): number =>
  Math.max(3, h.size * Math.max(strokeWidth, 0.25));

/** How far the line is pulled back from the tip under this head. */
export function inset(h: Head, len: number, strokeWidth: number): number {
  switch (h.kind) {
    case 'triangle':
      return len * 0.9;
    case 'stealth':
      return len * 0.55;
    case 'diamond':
      return len;
    case 'circle':
      return len * 0.5;
    case 'open':
      return strokeWidth * 0.5;
    case 'bar':
    case 'none':
      return 0;
  }
}

const p = (v: Vec2): string => `${num(v.x)} ${num(v.y)}`;

/** The head shape with its tip at `tip`, pointing along unit `dir`. */
export function headShape(h: Head, tip: Vec2, dir: Vec2, strokeWidth: number): HeadShape | null {
  const len = headLength(h, strokeWidth);
  const half = len * 0.45;
  const nx = -dir.y;
  const ny = dir.x;
  const at = (back: number, side: number): Vec2 => ({
    x: tip.x - dir.x * back + nx * side,
    y: tip.y - dir.y * back + ny * side,
  });
  switch (h.kind) {
    case 'none':
      return null;
    case 'triangle':
      return { d: `M${p(tip)}L${p(at(len, half))}L${p(at(len, -half))}Z`, stroked: false };
    case 'stealth':
      return {
        d: `M${p(tip)}L${p(at(len, half))}L${p(at(len * 0.6, 0))}L${p(at(len, -half))}Z`,
        stroked: false,
      };
    case 'open':
      return { d: `M${p(at(len, half))}L${p(tip)}L${p(at(len, -half))}`, stroked: true };
    case 'diamond':
      return {
        d: `M${p(tip)}L${p(at(len / 2, half * 0.8))}L${p(at(len, 0))}L${p(at(len / 2, -half * 0.8))}Z`,
        stroked: false,
      };
    case 'circle': {
      const r = len / 2;
      const c = at(r, 0);
      // Two arcs: plain path data, which svg2pdf and every editor read.
      return {
        d: `M${p({ x: c.x - r, y: c.y })}A${num(r)} ${num(r)} 0 1 0 ${p({ x: c.x + r, y: c.y })}A${num(r)} ${num(r)} 0 1 0 ${p({ x: c.x - r, y: c.y })}Z`,
        stroked: false,
      };
    }
    case 'bar': {
      const w = Math.max(len * 0.8, strokeWidth * 3);
      return { d: `M${p(at(0, w))}L${p(at(0, -w))}`, stroked: true };
    }
  }
}

function unit(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l === 0 ? { x: 1, y: 0 } : { x: v.x / l, y: v.y / l };
}

/** Direction the path arrives at its last node (tangent), and leaves its first (reversed). */
export function endDirections(nodes: readonly PathNode[]): { start: Vec2; end: Vec2 } {
  const n = nodes.length;
  const a = nodes[0];
  const b = nodes[1];
  const y = nodes[n - 2];
  const z = nodes[n - 1];
  if (!a || !b || !y || !z) return { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } };
  const fromStart = a.out ?? b.in ?? b;
  const intoEnd = z.in ?? y.out ?? y;
  return {
    start: unit({ x: a.x - fromStart.x, y: a.y - fromStart.y }),
    end: unit({ x: z.x - intoEnd.x, y: z.y - intoEnd.y }),
  };
}

/** The nodes with the first/last pulled back along the end directions. */
export function shortened(
  nodes: readonly PathNode[],
  startBy: number,
  endBy: number,
  dirs: { start: Vec2; end: Vec2 },
): PathNode[] {
  const out = nodes.slice();
  const move = (i: number, by: number, dir: Vec2) => {
    const nd = out[i];
    if (!nd || by === 0) return;
    const dx = -dir.x * by;
    const dy = -dir.y * by;
    out[i] = {
      x: nd.x + dx,
      y: nd.y + dy,
      ...(nd.in ? { in: { x: nd.in.x + dx, y: nd.in.y + dy } } : {}),
      ...(nd.out ? { out: { x: nd.out.x + dx, y: nd.out.y + dy } } : {}),
    };
  };
  move(0, startBy, dirs.start);
  move(out.length - 1, endBy, dirs.end);
  return out;
}
