/**
 * SVG `clipPath` for a plot's embedded pictures (issue 36, note 12). The
 * sanitiser drops clip paths (the export subset has none), so a picture
 * matplotlib writes whole under the axes' clip (`interpolation='none'` with
 * zoomed limits) or under a circle would overflow. While sanitising, each
 * clip path that applies to an `<image>` (its own or an ancestor's) is read
 * here into path segments in the image's own user space (the space its
 * x/y/width/height are in) and travels on it as `data-clip`; plot cleanup
 * maps them with the image's matrix and cuts its pixels (`plotImages.ts`).
 */
import type { AttrValue, SvgNode } from '@/render/svgNode';

import { type Pt, type Ring, curveSteps } from './clipRegion';
import { IDENTITY, type Matrix, determinant, invert, multiply, parseTransform } from './matrix';
import { type Seg, parsePath, transformPath } from './pathData';

/** The attribute carrying an image's clips between sanitising and plot cleanup. */
export const CLIP_ATTR = 'data-clip';

/** One clip: its outline (absolute segments) and fill rule. Several clips intersect. */
export interface PictureClip {
  readonly segs: readonly Seg[];
  readonly evenOdd: boolean;
}

const num = (v: AttrValue | undefined): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

/** A declaration from `style=` or the attribute of that name. */
function prop(n: SvgNode, name: string): string | undefined {
  const style = String(n.attrs['style'] ?? '');
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style);
  const v = m?.[1] ?? n.attrs[name];
  return v === undefined ? undefined : String(v).trim();
}

/** The transform an element sets up for its children (and its own geometry). */
function local(n: SvgNode): Matrix {
  const t = n.attrs['transform'];
  let m = (typeof t === 'string' ? parseTransform(t) : null) ?? IDENTITY;
  if ((n.tag === 'use' || n.tag === 'svg') && (n.attrs['x'] || n.attrs['y']))
    m = multiply(m, [1, 0, 0, 1, num(n.attrs['x']), num(n.attrs['y'])]);
  return m;
}

/** A basic shape (or path) as path data in its own user space, or null. */
export function shapeSegs(n: SvgNode): Seg[] | null {
  const a = n.attrs;
  switch (n.tag) {
    case 'path':
      return parsePath(String(a['d'] ?? ''));
    case 'rect': {
      const w = num(a['width']);
      const h = num(a['height']);
      if (!(w > 0 && h > 0)) return null;
      return parsePath(`M${num(a['x'])} ${num(a['y'])}h${w}v${h}h${-w}Z`);
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(a['cx']);
      const cy = num(a['cy']);
      const rx = num(n.tag === 'circle' ? a['r'] : a['rx']);
      const ry = num(n.tag === 'circle' ? a['r'] : a['ry']);
      if (!(rx > 0 && ry > 0)) return null;
      return parsePath(
        `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`,
      );
    }
    case 'polygon': {
      const p = String(a['points'] ?? '').trim();
      return p ? parsePath(`M${p}Z`) : null;
    }
    default:
      return null;
  }
}

/**
 * The clips applying to the last element of `chain` (the root first, the
 * image last; `use` and nested `svg` included), in the image's user space,
 * or null when there are none. A clip it cannot read (in bounding-box
 * units, of several shapes, of text) is skipped, with `skipped` called.
 */
export function imageClips(
  chain: readonly SvgNode[],
  ids: ReadonlyMap<string, SvgNode>,
  skipped: () => void,
): PictureClip[] | null {
  const out: PictureClip[] = [];
  chain.forEach((n, k) => {
    const ref = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(prop(n, 'clip-path') ?? '');
    if (!ref) return;
    const cp = ids.get(ref[1] ?? '');
    if (cp?.tag !== 'clipPath') return;
    const shapes = cp.children.filter((c): c is SvgNode => typeof c !== 'string');
    const only = shapes.length === 1 ? shapes[0] : undefined;
    const segs = only ? shapeSegs(only) : null;
    if (!only || !segs || String(cp.attrs['clipPathUnits'] ?? '') === 'objectBoundingBox') {
      skipped();
      return;
    }
    // The clip is in the user space of the element referring to it (after its transform).
    let below = IDENTITY;
    for (let j = k + 1; j < chain.length; j++) {
      const e = chain[j];
      if (e) below = multiply(below, local(e));
    }
    if (determinant(below) === 0) {
      skipped();
      return;
    }
    const toImage = multiply(multiply(invert(below), local(cp)), local({ ...only, tag: 'path' }));
    const rule = prop(only, 'clip-rule') ?? prop(cp, 'clip-rule') ?? 'nonzero';
    out.push({ segs: transformPath(segs, toImage), evenOdd: rule === 'evenodd' });
  });
  return out.length > 0 ? out : null;
}

/** Path segments as closed rings, curves cut by their size (`curveSteps`). */
export function segsRings(segs: readonly Seg[]): Ring[] {
  const rings: Pt[][] = [];
  let cur: Pt[] = [];
  const end = () => {
    if (cur.length >= 3) rings.push(cur);
    cur = [];
  };
  for (const s of segs) {
    if (s.c === 'Z') {
      const first = cur[0];
      end();
      if (first) cur = [first];
      continue;
    }
    if (s.c === 'M') {
      end();
      cur = [[s.p[0], s.p[1]]];
      continue;
    }
    if (s.c === 'L') {
      cur.push([s.p[0], s.p[1]]);
      continue;
    }
    const [x0, y0] = cur[cur.length - 1] ?? [0, 0];
    let len = 0;
    for (let i = 0, px = x0, py = y0; i < s.p.length; i += 2) {
      len += Math.hypot((s.p[i] ?? 0) - px, (s.p[i + 1] ?? 0) - py);
      px = s.p[i] ?? 0;
      py = s.p[i + 1] ?? 0;
    }
    const steps = curveSteps(len);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      if (s.c === 'C') {
        const [ax, ay, bx, by, cx, cy] = s.p;
        cur.push([
          u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * cx,
          u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * cy,
        ]);
      } else {
        const [ax = 0, ay = 0, cx = 0, cy = 0] = s.p;
        cur.push([
          u * u * x0 + 2 * u * t * ax + t * t * cx,
          u * u * y0 + 2 * u * t * ay + t * t * cy,
        ]);
      }
    }
  }
  end();
  return rings;
}
