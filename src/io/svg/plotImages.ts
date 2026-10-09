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
 * A see-through picture (alpha, or drawn at partial opacity) gets a
 * **backdrop** (issue 35): what the plot drew under it, inside its box (the
 * background's colour, the pieces of straight lines, shapes wholly inside),
 * as a small vector picture placed right under it. With that, it hides what
 * was under it like an opaque one, so the plot is cut the same way and its
 * clear pixels show the panel colour and the grid lines beneath, not the
 * page. A turned picture (issue 40) is cut along its own edges and its
 * backdrop is drawn in its own frame, turned with it. Where a picture
 * overlaps an earlier one, its backdrop leaves that part out (it would cover
 * the earlier picture) and what the plot drew there stays over it. Holes
 * cut for several pictures in one background never overlap. A slanted
 * picture (placed without its slant) hides nothing. Curves and fills only
 * partly under a picture stay over it.
 */
import { type AttrValue, type SvgNode, el } from '@/render/svgNode';

type Attrs = Readonly<Record<string, AttrValue | undefined>>;

import {
  IDENTITY,
  type Matrix,
  apply,
  fmt,
  invert,
  isAxisAligned,
  isIdentity,
  multiply,
  matrixString,
  parseTransform,
} from './matrix';
import { parsePath, pathRect } from './pathData';
import { type Pt, clipRing, makeRegion } from './clipRegion';
import { CLIP_ATTR, readClips } from './svgClip';
import { boxRing, clipPicture, clipsNothing } from '../pictureClip';
import {
  base64,
  decodePng,
  encodePngSync,
  fromBase64,
  hasClearPixels,
  imageSize,
  isOpaqueImage,
} from '../png';

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
   * What the plot drew under a see-through picture, inside `box`: drawn
   * right under it. Upright, `box` is the picture's own box in plot units;
   * `turned` (issue 40), it is `[0, 0, w, h]` in the picture's own frame
   * (the nodes carry the turn), to be placed with the picture's frame.
   */
  readonly backdrop?: {
    readonly box: Box;
    readonly nodes: readonly SvgNode[];
    readonly turned?: true;
  };
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

type Picture = Pick<PlotImage, 'mime' | 'dataBase64' | 'width' | 'height'> & {
  opaque: boolean;
};

function readPicture(href: string): Picture {
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

const within = (b: Box, outer: Box, tol: number): boolean =>
  b[0] >= outer[0] - tol &&
  b[1] >= outer[1] - tol &&
  b[2] <= outer[2] + tol &&
  b[3] <= outer[3] + tol;

/**
 * Where a picture covers the plot: its quad, and a frame in which it is the
 * box `lbox` (plot units themselves when it is upright; otherwise turned,
 * still in plot-sized units, so tolerances hold).
 */
interface Cover {
  readonly quad: readonly Pt[];
  /** Plot units → the frame `lbox` is in. */
  readonly toLocal: Matrix;
  readonly lbox: Box;
  readonly upright: boolean;
  /** Its sides are not at right angles: it is placed without its slant and hides nothing. */
  readonly slanted: boolean;
}

function coverOf(m: Matrix, quad: readonly Pt[], pb: Box): Cover {
  const upright = isAxisAligned(m);
  const w = Math.hypot(m[0], m[1]);
  const h = Math.hypot(m[2], m[3]);
  const slanted = Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-3 * w * h;
  if (upright || slanted || w === 0 || h === 0)
    return { quad, toLocal: IDENTITY, lbox: pb, upright, slanted };
  const turn = multiply(m, [1 / w, 0, 0, 1 / h, 0, 0]);
  return { quad, toLocal: invert(turn), lbox: [0, 0, w, h], upright, slanted };
}

const mapLine = (m: Matrix, l: Line): Line => [...apply(m, l[0], l[1]), ...apply(m, l[2], l[3])];

/** The part of a straight piece over a picture, as [t0, t1], or null. */
const spanOver = (l: Line, c: Cover): [number, number] | null =>
  clipT(isIdentity(c.toLocal) ? l : mapLine(c.toLocal, l), c.lbox);

/** The parts of a straight piece over the picture `c` but not over any of `others`, in order. */
function spansUnder(l: Line, c: Cover, others: readonly Cover[]): [number, number][] {
  const s = spanOver(l, c);
  if (!s) return [];
  let out: [number, number][] = [s];
  for (const o of others) {
    const e = spanOver(l, o);
    if (!e) continue;
    out = out.flatMap(([a, b]): [number, number][] =>
      (
        [
          [a, Math.min(b, e[0])],
          [Math.max(a, e[1]), b],
        ] as [number, number][]
      ).filter(([x, y]) => y - x > 1e-9),
    );
  }
  return out;
}

const piece = (l: Line, a: number, b: number): Line => {
  const at = (t: number): [number, number] =>
    t === 0 ? [l[0], l[1]] : t === 1 ? [l[2], l[3]] : pointAt(l, t);
  return [...at(a), ...at(b)];
};

/** The parts of a straight piece under the picture `c` and clear of `others`. */
const piecesIn = (l: Line, c: Cover, others: readonly Cover[]): Line[] =>
  spansUnder(l, c, others).map(([a, b]) => piece(l, a, b));

/** The rest of a straight piece. */
function piecesOut(l: Line, c: Cover, others: readonly Cover[]): Line[] {
  const parts: Line[] = [];
  let cur = 0;
  for (const [a, b] of spansUnder(l, c, others)) {
    if (a - cur > 1e-9) parts.push(piece(l, cur, a));
    cur = b;
  }
  if (1 - cur > 1e-9) parts.push(piece(l, cur, 1));
  return parts;
}

/** Whether a box (plot units) lies within a picture, give or take `tol`. */
function insideCover(b: Box, c: Cover, tol: number): boolean {
  if (isIdentity(c.toLocal)) return within(b, c.lbox, tol);
  const pts = boxRing(b).map(([x, y]) => apply(c.toLocal, x, y));
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return within([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], c.lbox, tol);
}

/** Whether two convex polygons are apart, or overlap by no more than `tol` (separating axes). */
function apart(a: readonly Pt[], b: readonly Pt[], tol: number): boolean {
  for (const poly of [a, b])
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k];
      const q = poly[(k + 1) % poly.length];
      if (!p || !q) continue;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const len = Math.hypot(nx, ny);
      if (len === 0) continue;
      const pa = a.map(([x, y]) => (x * nx + y * ny) / len);
      const pb = b.map(([x, y]) => (x * nx + y * ny) / len);
      if (Math.max(...pa) <= Math.min(...pb) + tol || Math.max(...pb) <= Math.min(...pa) + tol)
        return true;
    }
  return false;
}

/** A picture's quad less those of `others`, as rings each winding once. */
function quadLess(c: Cover, others: readonly Cover[]): Pt[][] {
  let rings: Pt[][] = [[...c.quad]];
  const xs = c.quad.map((q) => q[0]);
  const ys = c.quad.map((q) => q[1]);
  const big = boxRing([
    Math.min(...xs) - 1,
    Math.min(...ys) - 1,
    Math.max(...xs) + 1,
    Math.max(...ys) + 1,
  ]);
  for (const o of others) {
    const region = makeRegion([big, o.quad], true);
    if (region) rings = rings.flatMap((r) => clipRing(r, region));
  }
  return rings;
}

const ringsPath = (rings: readonly (readonly Pt[])[]): string =>
  rings.map((pts) => `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L')} Z`).join(' ');

/**
 * A picture cut to its SVG clip paths (issue 36): `space` maps the image's
 * user space (where its clips are) to the plot's, `matrix` its unit square.
 * Only an embedded PNG this can decode is cut (a JPEG is placed whole, with
 * a warning); null when the clip leaves nothing of it.
 */
function clipImage(
  attr: string,
  space: Matrix,
  pic: Picture,
  matrix: Matrix,
  warn: (message: string) => void,
): { pic: Picture; matrix: Matrix } | null {
  const clips = readClips(attr, space);
  if (!clips) return { pic, matrix };
  const { box, regions } = clips;
  if (clipsNothing(matrix, box, regions)) return { pic, matrix };
  const px =
    pic.mime === 'image/png' ? decodePng(fromBase64(pic.dataBase64.replace(/=+$/, ''))) : null;
  if (!px) {
    warn('A clipped picture in a format that cannot be cut here was placed whole.');
    return { pic, matrix };
  }
  const cut = clipPicture(px, matrix, box, regions);
  if (!cut) return null;
  if (cut.px === px) return { pic, matrix: cut.m };
  return {
    pic: readPicture(`data:image/png;base64,${base64(encodePngSync(cut.px))}`),
    matrix: cut.m,
  };
}

/**
 * The plot without its pictures, and the pictures; `boxes` gives each drawn
 * leaf's box in root units by its path of child indices (`drawnLeaves`).
 * Run on the flattened tree, before text merging (paths still match).
 */
export function takeImages(
  root: SvgNode,
  boxes: ReadonlyMap<string, Box>,
  warn: (message: string) => void = () => undefined,
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
      const read = readPicture(String(c.attrs['href'] ?? ''));
      const r = placedRect(c, read.width, read.height);
      if (r.w <= 0 || r.h <= 0 || read.dataBase64 === '') return;
      const space = multiply(m, own(c));
      const clips = c.attrs[CLIP_ATTR];
      const cut =
        clips === undefined
          ? { pic: read, matrix: multiply(space, [r.w, 0, 0, r.h, r.x, r.y]) }
          : clipImage(
              String(clips),
              space,
              read,
              multiply(space, [r.w, 0, 0, r.h, r.x, r.y]),
              warn,
            );
      if (!cut) return;
      const { pic, matrix } = cut;
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
  /** Per leaf: dropped, holes to cut into its fill (and by which pictures), or what is left of its lines. */
  const fate = new Map<
    string,
    { drop: boolean; holes: (readonly Pt[])[]; holedBy: number[]; lines?: readonly Line[] }
  >();
  const picBoxes = pics.map((pic): Box => {
    const xs = pic.quad.map((q) => q[0]);
    const ys = pic.quad.map((q) => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const covers = pics.map((pic, i) =>
    coverOf(pic.image.matrix, pic.quad, picBoxes[i] ?? [0, 0, 0, 0]),
  );
  const meet = (i: number, j: number): boolean =>
    !apart(covers[i]?.quad ?? [], covers[j]?.quad ?? [], EDGE_TOL);
  const backdrops = new Map<number, { nodes: SvgNode[]; turned: boolean }>();
  pics.forEach((pic, i) => {
    const pb = picBoxes[i] ?? [0, 0, 0, 0];
    const c = covers[i];
    if (!c) return;
    // A see-through picture gets a backdrop (issue 35), turned too (issue 40). Where it
    // overlaps an earlier picture the backdrop would cover that one: it leaves those parts
    // out, and what the plot drew there stays over it, as before.
    const see = !pic.opaque && !c.slanted;
    const hides = (pic.opaque && !c.slanted) || see;
    const earlier = covers.slice(0, i).filter((_, j) => meet(i, j));
    const others = see ? earlier : [];
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
      const f = fate.get(k) ?? { drop: false, holes: [], holedBy: [] };
      const rect = l.fill !== 'none' && isIdentity(l.matrix) ? rectOf(l.node) : null;
      if (rect && within(pb, rect, EDGE_TOL)) {
        // A background around the picture: cut it out (or drop the fill it hides entirely).
        // Holes stay apart (even-odd would fill where two overlap).
        const holed = see ? others : f.holedBy.filter((j) => meet(i, j)).map((j) => covers[j]);
        const rings =
          holed.length === 0
            ? [c.quad]
            : quadLess(
                c,
                holed.filter((o) => o !== undefined),
              );
        if (hides && others.length === 0 && insideCover(rect, c, EDGE_TOL)) f.drop = true;
        else f.holes.push(...rings);
        f.holedBy.push(i);
        if (see && rings.length > 0) {
          const rest = Object.fromEntries(
            Object.entries(l.node.attrs).filter(
              ([a]) => !['x', 'y', 'width', 'height', 'rx', 'ry', 'd', 'transform'].includes(a),
            ),
          );
          if (c.upright && others.length === 0) {
            const box = { x: fmt(pb[0]), y: fmt(pb[1]), width: fmt(pb[2] - pb[0]) };
            under.push(
              el('rect', {
                ...copy(l, rest).attrs,
                ...box,
                height: fmt(pb[3] - pb[1]),
                stroke: 'none',
              }),
            );
          } else
            under.push(el('path', { ...copy(l, rest).attrs, d: ringsPath(rings), stroke: 'none' }));
        }
      } else if (hides && l.node.tag !== 'text') {
        const b = boxes.get(k);
        if (b && insideCover(b, c, EDGE_TOL) && others.every((o) => apart(boxRing(b), o.quad, 0))) {
          f.drop = true;
          if (see) under.push(copy(l, l.node.attrs));
        } else if (b && l.fill === 'none' && isIdentity(l.matrix)) {
          // A line partly under it (a grid line): the part under it is hidden.
          const all = straightPieces(l.node);
          const lines = f.lines ?? all;
          if (lines) f.lines = lines.flatMap((x) => piecesOut(x, c, others));
          const ins = see ? (all ?? []).flatMap((x) => piecesIn(x, c, others)) : [];
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
    if (under.length > 0) backdrops.set(i, { nodes: under, turned: !c.upright });
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
    const d = ringsPath([boxRing(r), ...f.holes]);
    const geometry = ['x', 'y', 'width', 'height', 'rx', 'ry', 'd'];
    const rest = Object.fromEntries(Object.entries(n.attrs).filter(([a]) => !geometry.includes(a)));
    const filled = el('path', { ...rest, d, 'fill-rule': 'evenodd', stroke: 'none' });
    return stroked ? [filled, el(n.tag, { ...n.attrs, fill: 'none' }, n.children)] : [filled];
  };
  const [out] = rebuild(root, []);
  return {
    root: out ?? root,
    images: pics.map((p, i) => {
      const back = backdrops.get(i);
      const c = covers[i];
      if (!back || !c) return p.image;
      if (!back.turned) return { ...p.image, backdrop: { box: c.lbox, nodes: back.nodes } };
      // In the picture's own frame, so it can be placed with the picture's frame.
      const nodes = [el('g', { transform: matrixString(c.toLocal) }, back.nodes)];
      return { ...p.image, backdrop: { box: c.lbox, nodes, turned: true as const } };
    }),
  };
}
