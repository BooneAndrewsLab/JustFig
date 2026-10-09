/**
 * SVG `clipPath` in imported plots (issues 36 and 41, note 12). The
 * sanitiser drops clip paths (the export subset has none), so a picture
 * matplotlib writes whole under the axes' clip (`interpolation='none'` with
 * zoomed limits), or a line running past zoomed axes, would overflow. While
 * sanitising, each clip path that applies to an `<image>` or a shape (its
 * own or an ancestor's) is read here into path segments in the element's
 * own user space (the space its x/y/width/height or `d` are in) and travels
 * on it as `data-clip`. Plot cleanup cuts a shape's geometry to them in
 * that space before baking its transform (`clipShape`, with the PDF
 * importer's cutter, `../pathClip`), and maps a picture's with its matrix
 * to cut its pixels (`plotImages.ts`).
 */
import { type AttrValue, type SvgNode, el } from '@/render/svgNode';

import { type Pt, type Region, type Ring, curveSteps, makeRegion } from './clipRegion';
import {
  IDENTITY,
  type Matrix,
  determinant,
  invert,
  multiply,
  parseTransform,
  scaleOf,
} from './matrix';
import { type Seg, parsePath, pathRect, pathString, transformPath } from './pathData';
import { type Box, LINE_TOL, cutPath, intersect } from '../pathClip';

/** The attribute carrying an element's clips between sanitising and plot cleanup. */
export const CLIP_ATTR = 'data-clip';
/** A clip shape of more points than this is taken as its box (as in PDF import). */
const MAX_CLIP_POINTS = 20000;
/**
 * A path cut to a clip shape costs its points times the shape's: beyond this
 * it is cut to the shape's box instead (a rectangle costs its points only).
 */
const MAX_CUT_WORK = 20_000_000;

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
 * element last; `use` and nested `svg` included), in the element's user
 * space, as `CLIP_ATTR`'s value (JSON of `PictureClip[]`), or null when
 * there are none. A clip it cannot read (in bounding-box units, of several
 * shapes, of text) is skipped, with `skipped` called. `memo` (one per file)
 * hands every element under the same clips in the same space one string:
 * a plot's thousands of markers share their axes' clip.
 */
export function clipsOf(
  chain: readonly SvgNode[],
  ids: ReadonlyMap<string, SvgNode>,
  skipped: () => void,
  memo = new Map<string, string>(),
): string | null {
  const found: { cp: SvgNode; only: SvgNode; toOwn: Matrix; key: string }[] = [];
  chain.forEach((n, k) => {
    const ref = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(prop(n, 'clip-path') ?? '');
    if (!ref) return;
    const cp = ids.get(ref[1] ?? '');
    if (cp?.tag !== 'clipPath') return;
    const shapes = cp.children.filter((c): c is SvgNode => typeof c !== 'string');
    const only = shapes.length === 1 ? shapes[0] : undefined;
    if (!only || String(cp.attrs['clipPathUnits'] ?? '') === 'objectBoundingBox') {
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
    const toOwn = multiply(multiply(invert(below), local(cp)), local({ ...only, tag: 'path' }));
    found.push({ cp, only, toOwn, key: `${ref[1] ?? ''} ${toOwn.join(' ')}` });
  });
  if (found.length === 0) return null;
  const key = found.map((f) => f.key).join('|');
  const known = memo.get(key);
  if (known !== undefined) return known === '' ? null : known;
  const out: PictureClip[] = [];
  for (const { cp, only, toOwn } of found) {
    const segs = shapeSegs(only);
    if (!segs) {
      skipped();
      continue;
    }
    const rule = prop(only, 'clip-rule') ?? prop(cp, 'clip-rule') ?? 'nonzero';
    out.push({ segs: transformPath(segs, toOwn), evenOdd: rule === 'evenodd' });
  }
  const json = out.length > 0 ? JSON.stringify(out) : '';
  memo.set(key, json);
  return json === '' ? null : json;
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

export interface ReadClips {
  readonly box: Box | null;
  readonly regions: readonly Region[];
}

/**
 * An element's clips (`CLIP_ATTR`) mapped by `space`, as a box (the
 * rectangles among them, intersected; null: none) and clip shapes; null
 * when the attribute cannot be read. A shape of more than `MAX_CLIP_POINTS`
 * points narrows the box only.
 */
export function readClips(attr: string, space: Matrix): ReadClips | null {
  let clips: PictureClip[];
  try {
    clips = JSON.parse(attr) as PictureClip[];
  } catch {
    return null;
  }
  if (!Array.isArray(clips)) return null;
  let box: Box | null = null;
  const regions: Region[] = [];
  const narrow = (b: Box) => {
    box = box ? intersect(box, b) : b;
  };
  for (const clip of clips) {
    const segs = transformPath(clip.segs, space);
    const rect = pathRect(segs);
    if (rect) {
      narrow([rect.x, rect.y, rect.x + rect.w, rect.y + rect.h]);
      continue;
    }
    const rings = segsRings(segs);
    const region =
      rings.reduce((n, r) => n + r.length, 0) > MAX_CLIP_POINTS
        ? null
        : makeRegion(rings, clip.evenOdd);
    if (region) regions.push(region);
    else {
      const pts = rings.flat();
      if (pts.length === 0) narrow([0, 0, 0, 0]);
      else
        narrow([
          Math.min(...pts.map((p) => p[0])),
          Math.min(...pts.map((p) => p[1])),
          Math.max(...pts.map((p) => p[0])),
          Math.max(...pts.map((p) => p[1])),
        ]);
    }
  }
  return { box, regions };
}

const GEOMETRY = new Set([
  'd',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
]);

/** A shape's outline as path data in its own user space (lines and polylines open). */
function leafSegs(n: SvgNode): Seg[] | null {
  const a = n.attrs;
  if (n.tag === 'line') {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => num(a[k]));
    return [
      { c: 'M', p: [x1 ?? 0, y1 ?? 0] },
      { c: 'L', p: [x2 ?? 0, y2 ?? 0] },
    ];
  }
  if (n.tag === 'polyline') {
    const p = String(a['points'] ?? '').trim();
    return p ? parsePath(`M${p}`) : null;
  }
  return shapeSegs(n);
}

/**
 * A shape cut to its clips (`CLIP_ATTR`, in its own user space) as the
 * elements left: itself without the attribute when the clips leave it
 * whole (or cannot be read), nothing when they hide it, else paths of what
 * is inside, one for its fill and one for its stroke (a cut stroke is open
 * where the clip cuts it). `paint` is its effective fill, stroke and fill
 * rule; `m` its transform to the page (for the stroke tolerance, in page
 * units). A path too large to cut to a clip shape is cut to the shape's box,
 * with `warn` called. `memo` (one per plot) reads each clip once.
 */
export function clipShape(
  n: SvgNode,
  paint: { readonly fill: boolean; readonly stroke: boolean },
  m: Matrix,
  warn: (message: string) => void,
  memo = new Map<string, ReadClips | null>(),
): SvgNode[] {
  const { [CLIP_ATTR]: attr, ...attrs } = n.attrs;
  const whole = [el(n.tag, attrs, n.children)];
  if (attr === undefined) return whole;
  const text = String(attr);
  let clips = memo.get(text);
  if (clips === undefined) {
    clips = readClips(text, IDENTITY);
    memo.set(text, clips);
  }
  if (!clips || !(paint.fill || paint.stroke)) return whole;
  const segs = leafSegs(n);
  if (!segs) return whole;
  let box = clips.box;
  let regions = clips.regions;
  // Points once flattened (`../pathClip` cuts a straddling curve into 16).
  const points = segs.reduce((k, x) => k + (x.c === 'C' || x.c === 'Q' ? 16 : 1), 0);
  const edges = regions.reduce((k, r) => k + r.rings.reduce((j, x) => j + x.length, 0), 0);
  if (regions.length > 0 && points * edges > MAX_CUT_WORK) {
    warn('A very detailed clipped line was cut to the box around its clip.');
    for (const r of regions) box = box ? intersect(box, r.box) : r.box;
    regions = [];
  }
  const scale = scaleOf(m);
  const tol = scale > 0 && Number.isFinite(scale) ? LINE_TOL / scale : LINE_TOL;
  const cut = cutPath(segs, box, regions, paint, tol);
  if (!cut) return whole;
  if (n.tag === 'rect' && (attrs['rx'] !== undefined || attrs['ry'] !== undefined)) {
    // Its outline here has square corners: only good for telling that it is inside.
    warn('A rounded rectangle cut by a clip was drawn whole.');
    return whole;
  }
  const rest = Object.fromEntries(Object.entries(attrs).filter(([k]) => !GEOMETRY.has(k)));
  const out: SvgNode[] = [];
  if (paint.fill && cut.fill.length > 0)
    out.push(el('path', { ...rest, stroke: 'none', d: pathString(cut.fill) }, []));
  if (paint.stroke && cut.stroke.length > 0)
    out.push(el('path', { ...rest, fill: 'none', d: pathString(cut.stroke) }, []));
  return out;
}
