/** Path nodes → SVG path data (note 02: cubic handles, absent = corner). */
import type { PathNode, Vec2 } from '@/core/model/types';

import { num } from './svgNode';

const pt = (p: Vec2): string => `${num(p.x)} ${num(p.y)}`;

function segment(a: PathNode, b: PathNode): string {
  if (!a.out && !b.in) return `L${pt(b)}`;
  return `C${pt(a.out ?? a)} ${pt(b.in ?? b)} ${pt(b)}`;
}

export function pathData(nodes: readonly PathNode[], closed: boolean): string {
  const first = nodes[0];
  if (!first) return '';
  let d = `M${pt(first)}`;
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1];
    const b = nodes[i];
    if (a && b) d += segment(a, b);
  }
  const last = nodes[nodes.length - 1];
  if (closed && last && nodes.length > 2)
    d += `${last.out || first.in ? segment(last, first) : ''}Z`;
  return d;
}

/** A point on a cubic at t. */
export function cubicAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Points along the path (corners exact, curves sampled), frame-local; for bounds and hit tests. */
export function samplePath(nodes: readonly PathNode[], closed: boolean, steps = 16): Vec2[] {
  const out: Vec2[] = [];
  const n = nodes.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i += 1) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    if (!a || !b) continue;
    if (i === 0) out.push({ x: a.x, y: a.y });
    if (!a.out && !b.in) {
      out.push({ x: b.x, y: b.y });
      continue;
    }
    for (let k = 1; k <= steps; k += 1) out.push(cubicAt(a, a.out ?? a, b.in ?? b, b, k / steps));
  }
  if (n === 1 && nodes[0]) out.push(nodes[0]);
  return out;
}
