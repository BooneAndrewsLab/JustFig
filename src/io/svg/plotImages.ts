/**
 * Pictures embedded in imported plots (issue 24, notes 12 and 13): an
 * interpolated heatmap, a scatter layer rasterized for size, a micrograph.
 * `<image>` is not in an `svgImport` asset's subset, so plot cleanup takes
 * each one out of the flattened tree here, with the matrix that maps its
 * unit square (first row at the top) to the plot's user units; import
 * places it as an `image` object of its own, under the plot, in one group.
 *
 * Under the plot is the only place it can go without splitting the plot in
 * two, and what plots draw over their pictures (contours, markers, labels,
 * spines) must stay on top. What they draw before a picture, and so under
 * it, is cut where the picture is instead:
 * - a filled rectangle around it (the axes background, a ggplot2 panel) gets
 *   a hole the picture's shape (an even-odd subpath), or goes when an opaque
 *   picture covers all of it (its stroke, if any, stays);
 * - anything else drawn before an opaque picture and wholly inside it is
 *   hidden by it, so it is dropped.
 * A see-through picture (alpha, or drawn at partial opacity) that is not
 * turned gets a **backdrop** (issue 35): what the plot drew under it, inside
 * its box (the background's colour, the pieces of straight lines, shapes
 * wholly inside), as a small vector picture placed right under it. With
 * that, it hides what was under it like an opaque one, so the plot is cut
 * the same way and its clear pixels show the panel colour and the grid lines
 * beneath, not the page. One that overlaps an earlier picture gets none (a
 * backdrop would cover it). Curves and fills only partly under a picture
 * stay over it.
 */
import { type AttrValue, type SvgNode, el } from '@/render/svgNode';

type Attrs = Readonly<Record<string, AttrValue | undefined>>;

import {
  IDENTITY,
  type Matrix,
  apply,
  fmt,
  isAxisAligned,
  isIdentity,
  multiply,
  matrixString,
  parseTransform,
} from './matrix';
import { parsePath, pathRect } from './pathData';
import { fromBase64, hasClearPixels, imageSize, isOpaqueImage } from '../png';

export type Box = readonly [number, number, number, number];

/** A picture taken out of a plot. */
export interface PlotImage {
  readonly mime: 'image/png' | 'image/jpeg';
  readonly dataBase64: string;
  /** Pixel size, or 0 when the header could not be read. */
  readonly width: number;
  readonly height: number;
  /** Its unit square (u right, v down, row 0 at v = 0) → the plot's user units. */
  readonly matrix: Matrix;
  readonly opacity: number;
  /**
   * What the plot drew under a see-through picture, inside `box` (plot
   * units, axis-aligned, the picture's own box): drawn right under it.
   */
  readonly backdrop?: { readonly box: Box; readonly nodes: readonly SvgNode[] };
}

/** How near (user units) a shape's edge must be to a picture's to count as the same edge. */
const EDGE_TOL = 0.5;

const num = (v: string | number | undefined, d = 0): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : d;
};

const own = (n: SvgNode): Matrix => {
  const t = n.attrs['transform'];
  return (t === undefined ? null : parseTransform(String(t))) ?? IDENTITY;
};

/**
 * The drawn rectangle of an `<image>` in its own units, for its
 * `preserveAspectRatio` (default `xMidYMid meet`) and the picture's size.
 */
function placedRect(
  n: SvgNode,
  pw: number,
  ph: number,
): { x: number; y: number; w: number; h: number } {
  const x = num(n.attrs['x']);
  const y = num(n.attrs['y']);
  const w = num(n.attrs['width']);
  const h = num(n.attrs['height']);
  const par = String(n.attrs['preserveAspectRatio'] ?? 'xMidYMid meet').trim();
  if (par.startsWith('none') || pw <= 0 || ph <= 0 || w <= 0 || h <= 0) return { x, y, w, h };
  const slice = par.includes('slice');
  const k = slice ? Math.max(w / pw, h / ph) : Math.min(w / pw, h / ph);
  const dw = pw * k;
  const dh = ph * k;
  const align = (/x(Min|Mid|Max)Y(Min|Mid|Max)/.exec(par) ?? ['', 'Mid', 'Mid']).slice(1);
  const f = (a: string | undefined): number => (a === 'Min' ? 0 : a === 'Max' ? 1 : 0.5);
  // `slice` overflows the viewport instead of clipping to it (the export subset has no clip).
  return { x: x + (w - dw) * f(align[0]), y: y + (h - dh) * f(align[1]), w: dw, h: dh };
}

function readPicture(href: string): Pick<PlotImage, 'mime' | 'dataBase64' | 'width' | 'height'> & {
  opaque: boolean;
} {
  const m = /^data:(image\/(?:png|jpeg));base64,(.*)$/s.exec(href);
  const mime = m?.[1] === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const dataBase64 = m?.[2] ?? '';
  // The header is enough (size, colour type, a transparency chunk before the data).
  let head: Uint8Array;
  try {
    head = fromBase64(
      dataBase64
        .slice(0, 1 << 16)
        .replace(/=+$/, '')
        .slice(0, 1 << 15),
    );
  } catch {
    head = new Uint8Array(0);
  }
  const size = imageSize(head);
  let opaque = isOpaqueImage(head);
  if (!opaque && mime === 'image/png') {
    // An alpha channel every pixel of which is opaque (matplotlib's heatmaps): opaque.
    try {
      opaque = !hasClearPixels(fromBase64(dataBase64.replace(/=+$/, '')));
    } catch {
      opaque = false;
    }
  }
  return {
    mime,
    dataBase64,
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    opaque,
  };
}

interface Leaf {
  readonly path: readonly number[];
  readonly node: SvgNode;
  readonly matrix: Matrix;
  readonly fill: string;
  readonly stroke: string;
  readonly opacity: number;
  /** Presentation attributes it inherits from its groups (not fill, stroke, opacity). */
  readonly inherited: Attrs;
}

/** Attributes a backdrop copy of a leaf does not take from its groups. */
const NOT_INHERITED = new Set([
  'transform',
  'opacity',
  'fill',
  'stroke',
  'id',
  'class',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'xmlns',
  'xmlns:xlink',
  'version',
  'preserveAspectRatio',
]);

const key = (p: readonly number[]): string => p.join('.');

/** The axis-aligned rectangle a filled shape is in its own units, or null. */
function rectOf(n: SvgNode): Box | null {
  if (n.attrs['transform'] !== undefined) return null;
  if (n.tag === 'rect') {
    if (num(n.attrs['rx']) > 0 || num(n.attrs['ry']) > 0) return null;
    const x = num(n.attrs['x']);
    const y = num(n.attrs['y']);
    return [x, y, x + num(n.attrs['width']), y + num(n.attrs['height'])];
  }
  if (n.tag !== 'path') return null;
  const segs = parsePath(String(n.attrs['d'] ?? ''));
  const r = segs ? pathRect(segs) : null;
  return r ? [r.x, r.y, r.x + r.w, r.y + r.h] : null;
}

type Line = readonly [number, number, number, number];

/** The straight pieces of an unfilled line, polyline or path of lines only, or null. */
function straightPieces(n: SvgNode): Line[] | null {
  if (n.attrs['transform'] !== undefined) return null;
  if (n.tag === 'line')
    return [[num(n.attrs['x1']), num(n.attrs['y1']), num(n.attrs['x2']), num(n.attrs['y2'])]];
  let pts: [number, number][][] = [];
  if (n.tag === 'polyline') {
    const v = String(n.attrs['points'] ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    const one: [number, number][] = [];
    for (let i = 0; i + 1 < v.length; i += 2) one.push([v[i] ?? 0, v[i + 1] ?? 0]);
    pts = [one];
  } else if (n.tag === 'path') {
    const segs = parsePath(String(n.attrs['d'] ?? ''));
    if (!segs || segs.some((g) => g.c === 'C' || g.c === 'Q')) return null;
    for (const g of segs) {
      if (g.c === 'M') pts.push([[g.p[0], g.p[1]]]);
      else if (g.c === 'L') pts[pts.length - 1]?.push([g.p[0], g.p[1]]);
      else {
        const sub = pts[pts.length - 1];
        const first = sub?.[0];
        if (sub && first) {
          sub.push(first);
          pts.push([first]);
        }
      }
    }
  } else return null;
  const out: Line[] = [];
  for (const sub of pts)
    for (let i = 1; i < sub.length; i++) {
      const a = sub[i - 1];
      const b = sub[i];
      if (a && b) out.push([a[0], a[1], b[0], b[1]]);
    }
  return out;
}

/** The part of a straight piece inside a box (Liang–Barsky), as [t0, t1], or null. */
function clipT(l: Line, b: Box): [number, number] | null {
  const [x0, y0] = l;
  const dx = l[2] - x0;
  const dy = l[3] - y0;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x0 - b[0]],
    [dx, b[2] - x0],
    [-dy, y0 - b[1]],
    [dy, b[3] - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 < t1 ? [t0, t1] : null;
}

const pointAt = (l: Line, t: number): [number, number] => [
  l[0] + (l[2] - l[0]) * t,
  l[1] + (l[3] - l[1]) * t,
];

/** The part of a straight piece inside a box, or null. */
function inside(l: Line, b: Box): Line | null {
  const t = clipT(l, b);
  return t ? [...pointAt(l, t[0]), ...pointAt(l, t[1])] : null;
}

/** The parts of a straight piece outside a box. */
function outside(l: Line, b: Box): Line[] {
  const t = clipT(l, b);
  if (!t) return [l];
  const [t0, t1] = t;
  const [x0, y0, x1, y1] = l;
  const at = (u: number): [number, number] => pointAt(l, u);
  const parts: Line[] = [];
  if (t0 > 1e-9) parts.push([x0, y0, ...at(t0)]);
  if (t1 < 1 - 1e-9) parts.push([...at(t1), x1, y1]);
  return parts;
}

const within = (b: Box, outer: Box, tol: number): boolean =>
  b[0] >= outer[0] - tol &&
  b[1] >= outer[1] - tol &&
  b[2] <= outer[2] + tol &&
  b[3] <= outer[3] + tol;

/**
 * The plot without its pictures, and the pictures; `boxes` gives each drawn
 * leaf's box in root units by its path of child indices (`drawnLeaves`).
 * Run on the flattened tree, before text merging (paths still match).
 */
export function takeImages(
  root: SvgNode,
  boxes: ReadonlyMap<string, Box>,
): { root: SvgNode; images: PlotImage[] } {
  const leaves: Leaf[] = [];
  const pics: {
    path: readonly number[];
    image: PlotImage;
    quad: [number, number][];
    opaque: boolean;
  }[] = [];
  const inheritable = (inh: Attrs, attrs: Attrs): Attrs => {
    const out: Record<string, AttrValue | undefined> = { ...inh };
    for (const [a, v] of Object.entries(attrs)) if (!NOT_INHERITED.has(a)) out[a] = v;
    return out;
  };
  const visit = (
    n: SvgNode,
    path: readonly number[],
    m: Matrix,
    fill: string,
    stroke: string,
    opacity: number,
    inh: Attrs,
  ): void => {
    n.children.forEach((c, i) => {
      if (typeof c === 'string') return;
      const p = [...path, i];
      const f = c.attrs['fill'] === undefined ? fill : String(c.attrs['fill']);
      const s = c.attrs['stroke'] === undefined ? stroke : String(c.attrs['stroke']);
      const op = opacity * num(c.attrs['opacity'], 1);
      if (c.tag === 'g') {
        visit(c, p, multiply(m, own(c)), f, s, op, inheritable(inh, c.attrs));
        return;
      }
      if (c.tag !== 'image') {
        leaves.push({
          path: p,
          node: c,
          matrix: m,
          fill: f,
          stroke: s,
          opacity: op,
          inherited: inh,
        });
        return;
      }
      const pic = readPicture(String(c.attrs['href'] ?? ''));
      const r = placedRect(c, pic.width, pic.height);
      if (r.w <= 0 || r.h <= 0 || pic.dataBase64 === '') return;
      const matrix = multiply(multiply(m, own(c)), [r.w, 0, 0, r.h, r.x, r.y]);
      const quad = [
        apply(matrix, 0, 0),
        apply(matrix, 1, 0),
        apply(matrix, 1, 1),
        apply(matrix, 0, 1),
      ];
      pics.push({
        path: p,
        image: {
          mime: pic.mime,
          dataBase64: pic.dataBase64,
          width: pic.width,
          height: pic.height,
          matrix,
          opacity: op,
        },
        quad,
        opaque: pic.opaque && op >= 1,
      });
    });
  };
  visit(root, [], IDENTITY, '#000000', 'none', 1, inheritable({}, root.attrs));
  if (pics.length === 0) return { root, images: [] };

  const before = (a: readonly number[], b: readonly number[]): boolean => {
    for (let i = 0; i < Math.min(a.length, b.length); i++)
      if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    return a.length < b.length;
  };
  /** Per leaf: dropped, holes to cut into its fill, or what is left of its lines. */
  const fate = new Map<
    string,
    { drop: boolean; holes: [number, number][][]; lines?: readonly Line[] }
  >();
  const picBoxes = pics.map((pic): Box => {
    const xs = pic.quad.map((q) => q[0]);
    const ys = pic.quad.map((q) => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const overlaps = (a: Box, b: Box): boolean =>
    a[0] < b[2] - EDGE_TOL &&
    b[0] < a[2] - EDGE_TOL &&
    a[1] < b[3] - EDGE_TOL &&
    b[1] < a[3] - EDGE_TOL;
  const backdrops = new Map<number, SvgNode[]>();
  pics.forEach((pic, i) => {
    const pb = picBoxes[i] ?? [0, 0, 0, 0];
    const m = pic.image.matrix;
    const square = isAxisAligned(m);
    // A see-through picture that is not turned, clear of earlier ones, gets a backdrop.
    const see =
      !pic.opaque && square && m[0] > 0 && !picBoxes.slice(0, i).some((b) => overlaps(b, pb));
    const hides = (pic.opaque && square) || see;
    const under: SvgNode[] = [];
    /** A copy of a leaf for the backdrop, with what it inherits made its own. */
    const copy = (l: Leaf, attrs: Attrs, n = l.node): SvgNode => {
      const node = el(
        n.tag,
        { ...l.inherited, ...attrs, fill: l.fill, stroke: l.stroke, opacity: fmt(l.opacity) },
        n.children,
      );
      return isIdentity(l.matrix) ? node : el('g', { transform: matrixString(l.matrix) }, [node]);
    };
    for (const l of leaves) {
      if (!before(l.path, pic.path)) continue;
      const k = key(l.path);
      const f = fate.get(k) ?? { drop: false, holes: [] };
      const rect = l.fill !== 'none' && isIdentity(l.matrix) ? rectOf(l.node) : null;
      if (rect && within(pb, rect, EDGE_TOL)) {
        // A background around the picture: cut it out (or drop the fill it hides entirely).
        if (hides && within(rect, pb, EDGE_TOL)) f.drop = true;
        else f.holes.push(pic.quad);
        if (see) {
          const rest = Object.fromEntries(
            Object.entries(l.node.attrs).filter(
              ([a]) => !['x', 'y', 'width', 'height', 'rx', 'ry', 'd', 'transform'].includes(a),
            ),
          );
          const box = { x: fmt(pb[0]), y: fmt(pb[1]), width: fmt(pb[2] - pb[0]) };
          under.push(
            el('rect', {
              ...copy(l, rest).attrs,
              ...box,
              height: fmt(pb[3] - pb[1]),
              stroke: 'none',
            }),
          );
        }
      } else if (hides && l.node.tag !== 'text') {
        const b = boxes.get(k);
        if (b && within(b, pb, EDGE_TOL)) {
          f.drop = true;
          if (see) under.push(copy(l, l.node.attrs));
        } else if (b && l.fill === 'none' && isIdentity(l.matrix)) {
          // A line partly under it (a grid line): the part under it is hidden.
          const all = straightPieces(l.node);
          const lines = f.lines ?? all;
          if (lines) f.lines = lines.flatMap((x) => outside(x, pb));
          const ins = see
            ? (all ?? []).flatMap((x) => {
                const piece = inside(x, pb);
                return piece ? [piece] : [];
              })
            : [];
          if (ins.length > 0) {
            const geometry = ['x1', 'y1', 'x2', 'y2', 'points', 'd'];
            const rest = Object.fromEntries(
              Object.entries(l.node.attrs).filter(([a]) => !geometry.includes(a)),
            );
            const d = ins
              .map(([x0, y0, x1, y1]) => `M${fmt(x0)} ${fmt(y0)}L${fmt(x1)} ${fmt(y1)}`)
              .join('');
            under.push(copy(l, { ...rest, d }, el('path', {})));
          }
        }
      }
      fate.set(k, f);
    }
    if (under.length > 0) backdrops.set(i, under);
  });

  const byKey = new Map(leaves.map((l) => [key(l.path), l]));
  const rebuild = (n: SvgNode, path: readonly number[]): SvgNode[] => {
    const k = key(path);
    if (n.tag === 'image') return [];
    if (n.tag === 'g' || path.length === 0) {
      const kids = n.children.flatMap((c, i): (SvgNode | string)[] =>
        typeof c === 'string' ? [c] : rebuild(c, [...path, i]),
      );
      if (path.length > 0 && kids.every((c) => typeof c === 'string')) return [];
      return [el(n.tag, n.attrs, kids)];
    }
    const f = fate.get(k);
    if (!f) return [n];
    const leaf = byKey.get(k);
    const stroked = leaf !== undefined && leaf.stroke !== 'none';
    if (f.drop) {
      // A background a picture covers entirely: its outline (if any) still shows.
      const rect = leaf && leaf.fill !== 'none' && isIdentity(leaf.matrix) ? rectOf(n) : null;
      return rect && stroked ? [el(n.tag, { ...n.attrs, fill: 'none' }, n.children)] : [];
    }
    if (f.lines) {
      if (f.lines.length === 0) return [];
      const d = f.lines
        .map(([x0, y0, x1, y1]) => `M${fmt(x0)} ${fmt(y0)}L${fmt(x1)} ${fmt(y1)}`)
        .join('');
      const geometry = ['x1', 'y1', 'x2', 'y2', 'points', 'd'];
      const rest = Object.fromEntries(
        Object.entries(n.attrs).filter(([a]) => !geometry.includes(a)),
      );
      return [el('path', { ...rest, d })];
    }
    if (f.holes.length === 0) return [n];
    const r = rectOf(n);
    if (!r) return [n];
    const ring = (pts: readonly [number, number][]): string =>
      `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L')} Z`;
    const outer: [number, number][] = [
      [r[0], r[1]],
      [r[2], r[1]],
      [r[2], r[3]],
      [r[0], r[3]],
    ];
    const d = [outer, ...f.holes].map(ring).join(' ');
    const geometry = ['x', 'y', 'width', 'height', 'rx', 'ry', 'd'];
    const rest = Object.fromEntries(Object.entries(n.attrs).filter(([a]) => !geometry.includes(a)));
    const filled = el('path', { ...rest, d, 'fill-rule': 'evenodd', stroke: 'none' });
    return stroked ? [filled, el(n.tag, { ...n.attrs, fill: 'none' }, n.children)] : [filled];
  };
  const [out] = rebuild(root, []);
  return {
    root: out ?? root,
    images: pics.map((p, i) => {
      const nodes = backdrops.get(i);
      const box = picBoxes[i];
      return nodes && box ? { ...p.image, backdrop: { box, nodes } } : p.image;
    }),
  };
}
