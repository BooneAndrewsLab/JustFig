/**
 * Resizing an imported plot without scaling its text, line widths and tick
 * lengths (note 17, issue 3). Works on a stored `svgImport` asset as
 * rendering parses it, with the roles of `plotParts` (note 16).
 *
 * The plot's **area** (the box of its axis lines, frames and panel
 * backgrounds) absorbs the whole change in size: its top-left stays and it
 * scales by (sx, sy), so the margins around it, where labels and ticks live,
 * keep their size. Elements inside the area that are not ticks or markers
 * have their coordinates scaled (stroke widths and dashes stay); everything
 * else moves rigidly, by how far a chosen **anchor** point moves:
 * - a tick and its label: the tick's base on its axis;
 * - a marker (a small closed shape inside the area): its centre;
 * - a legend (labels with keys, and its frame) as one block: the edge of the
 *   area it is nearest to, or its centre when it is centred;
 * - other labels (axis titles, titles, annotations) and drawn pieces outside
 *   the area (glyph outlines), clustered with what touches them: per axis,
 *   the area edge they lie beyond or are aligned with, else their centre.
 * An anchor at `a` moves by `(a − area.x0)(sx − 1)` across x, and likewise
 * across y, which is exactly where the area's scaling takes that point.
 */
import { type SvgNode, el } from '@/render/svgNode';

import {
  type Matrix,
  IDENTITY,
  angleOf,
  apply,
  fmt,
  invert,
  isAxisAligned,
  matrixString,
  multiply,
  parseTransform,
} from './matrix';
import { type Seg, parsePath, pathRect, pathString, transformPath } from './pathData';
import { type DrawnLeaf, type ViewBox, drawnLeaves, len, numList } from './plotCleanup';
import { type PlotParts, replaceAt } from './plotRoles';

type Box = readonly [number, number, number, number];

/** What resizing does to one element. */
export type Action =
  { readonly kind: 'scale' } | { readonly kind: 'move'; readonly at: readonly [number, number] };

export interface PlotLayout {
  /** The plot area, [x0, y0, x1, y1] in root user units. */
  readonly area: Box;
  /** Per element (child indices joined by "."). */
  readonly actions: ReadonlyMap<string, Action>;
  /** The leaves, for applying the actions. */
  readonly leaves: readonly DrawnLeaf[];
}

/** Shapes at least this share of the viewBox in both directions are panels or frames. */
const LONG = 0.3;
/** A marker is at most this share of the area's smaller side. */
const MARKER = 0.04;
/** …or at most this many times its median text size. */
const MARKER_EM = 1.5;
/** The area may shrink to this share of its size; past that, text shrinks too. */
export const MIN_GROWTH = 0.05;

const key = (p: readonly number[]): string => p.join('.');
const w = (b: Box): number => b[2] - b[0];
const h = (b: Box): number => b[3] - b[1];
const union = (a: Box | null, b: Box): Box =>
  a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b;
/** The gap between two boxes (0 when they overlap). */
const gap = (a: Box, b: Box): number =>
  Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const inside = (b: Box, outer: Box, tol: number): boolean =>
  b[0] >= outer[0] - tol &&
  b[1] >= outer[1] - tol &&
  b[2] <= outer[2] + tol &&
  b[3] <= outer[3] + tol;

/** A closed shape: something that reads as a marker when small (not a line). */
function closed(n: SvgNode): boolean {
  switch (n.tag) {
    case 'circle':
    case 'ellipse':
    case 'polygon':
      return true;
    case 'rect': {
      // Only square ones: a small bar must still scale with its neighbours.
      const rw = len(n.attrs['width']) ?? 0;
      const rh = len(n.attrs['height']) ?? 0;
      return Math.abs(rw - rh) <= 0.1 * Math.max(rw, rh);
    }
    case 'path': {
      const segs = parsePath(String(n.attrs['d'] ?? ''));
      if (!segs) return false;
      // A trailing moveto (cairo writes `Z M x y`) draws nothing.
      while (segs.length > 1 && segs[segs.length - 1]?.c === 'M') segs.pop();
      const first = segs[0];
      const last = segs[segs.length - 1];
      const shut =
        last?.c === 'Z' ||
        (first?.c === 'M' &&
          last !== undefined &&
          Math.hypot(
            (last.p[last.p.length - 2] ?? 0) - first.p[0],
            (last.p[last.p.length - 1] ?? 0) - first.p[1],
          ) < 1e-3);
      if (!shut) return false;
      const r = pathRect(segs);
      return !r || Math.abs(r.w - r.h) <= 0.1 * Math.max(r.w, r.h);
    }
    default:
      return false;
  }
}

class Sets {
  private readonly up: number[];
  constructor(n: number) {
    this.up = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let r = i;
    while (this.up[r] !== r) r = this.up[r] ?? r;
    this.up[i] = r;
    return r;
  }
  join(a: number, b: number): void {
    this.up[this.find(a)] = this.find(b);
  }
}

/**
 * Where an item spanning [lo, hi] along one axis is pinned, for an area
 * spanning [a, b]: beyond or aligned with an edge, that edge; else its centre,
 * or for a legend the nearer edge unless it is centred.
 */
function anchor(lo: number, hi: number, a: number, b: number, legend: boolean): number {
  const tol = 0.02 * (b - a);
  if (hi <= a + tol || Math.abs(lo - a) <= tol) return a;
  if (lo >= b - tol || Math.abs(hi - b) <= tol) return b;
  const c = (lo + hi) / 2;
  if (!legend) return c;
  const dl = lo - a;
  const dh = b - hi;
  if (Math.abs(dl - dh) <= 0.1 * (b - a)) return c;
  return dl < dh ? a : b;
}

const anchorOf = (box: Box, area: Box, legend: boolean): [number, number] => [
  anchor(box[0], box[2], area[0], area[2], legend),
  anchor(box[1], box[3], area[1], area[3], legend),
];

/** How each element of the plot behaves when it is resized; null when nothing can scale. */
export function plotLayout(root: SvgNode, vb: ViewBox, parts: PlotParts): PlotLayout | null {
  const leaves = drawnLeaves(root, vb);
  const texts = new Map(parts.texts.map((t) => [key(t.path), t]));
  const strokes = new Map(parts.strokes.map((s) => [key(s.path), s]));
  const k = (l: DrawnLeaf): string => key(l.path);
  const isText = (l: DrawnLeaf): boolean => l.node.tag === 'text';
  const tickBase = (l: DrawnLeaf) => (isText(l) ? texts.get(k(l))?.tick : strokes.get(k(l))?.base);
  const shapes = leaves.filter((l) => !isText(l) && strokes.get(k(l))?.role !== 'tick');
  const big = (b: Box): boolean => w(b) >= LONG * vb[2] && h(b) >= LONG * vb[3];
  /** A panel background or frame: a large axis-aligned rectangle. */
  const panel = (l: DrawnLeaf): boolean => {
    if (!big(l.box)) return false;
    if (l.node.tag === 'rect') return true;
    const segs = l.node.tag === 'path' ? segsOf(l.node) : null;
    return segs !== null && pathRect(segs) !== null;
  };

  // The legends first: their frames and keys must not count as the plot area.
  const em = (l: DrawnLeaf): number => texts.get(k(l))?.size ?? h(l.box) / 1.3;
  const labels = leaves.filter((l) => isText(l) && texts.get(k(l))?.role === 'label');
  const keyed: { label: DrawnLeaf; keys: DrawnLeaf[]; box: Box }[] = [];
  for (const lb of labels) {
    const e = em(lb);
    const keys = shapes.filter((s) => {
      const b = s.box;
      if (strokes.get(k(s))?.role === 'axis' || panel(s)) return false;
      if (Math.max(w(b), h(b)) > 3 * e) return false;
      const before = lb.box[0] - b[2];
      const cy = (b[1] + b[3]) / 2;
      return before >= -0.3 * e && before <= 2.5 * e && cy >= lb.box[1] && cy <= lb.box[3];
    });
    if (keys.length > 0)
      keyed.push({ label: lb, keys, box: keys.reduce<Box>((a, s) => union(a, s.box), lb.box) });
  }
  const sets = new Sets(keyed.length);
  keyed.forEach((a, i) => {
    keyed.forEach((b, j) => {
      if (j > i && gap(a.box, b.box) <= 1.5 * Math.max(em(a.label), em(b.label))) sets.join(i, j);
    });
  });
  const groups = new Map<number, typeof keyed>();
  keyed.forEach((x, i) => {
    const r = sets.find(i);
    groups.set(r, [...(groups.get(r) ?? []), x]);
  });
  const inLegend = new Map<string, Box>();
  for (const g of groups.values()) {
    let box = g.reduce<Box | null>((a, x) => union(a, x.box), null);
    if (!box) continue;
    const e = Math.max(...g.map((x) => em(x.label)));
    const members = new Set<DrawnLeaf>(g.flatMap((x) => [x.label, ...x.keys]));
    // A title just above the entries.
    for (const lb of labels)
      if (
        !members.has(lb) &&
        gap(lb.box, box) <= 0.6 * Math.max(e, em(lb)) &&
        lb.box[3] <= box[1] + 0.3 * e &&
        Math.min(lb.box[2], box[2]) > Math.max(lb.box[0], box[0])
      ) {
        members.add(lb);
        box = union(box, lb.box);
      }
    const c = box;
    // Its frame: the smallest shape around it that is not the whole plot.
    const frames = shapes.filter(
      (s) =>
        !members.has(s) &&
        s.box[0] <= c[0] + 0.5 * e &&
        s.box[1] <= c[1] + 0.5 * e &&
        s.box[2] >= c[2] - 1.5 * e &&
        s.box[3] >= c[3] - 0.5 * e &&
        w(s.box) <= w(c) + 6 * e &&
        h(s.box) <= h(c) + 6 * e,
    );
    const frame = frames.sort((a, b) => w(a.box) * h(a.box) - w(b.box) * h(b.box))[0];
    if (g.length < 2 && !frame) continue;
    const outer = frame ? union(frame.box, c) : c;
    // A legend is drawn over the data: what comes before its frame is data behind it.
    const from = frame ? leaves.indexOf(frame) : 0;
    for (const m of members) if (leaves.indexOf(m) < from) members.delete(m);
    for (const l of leaves.slice(from)) {
      if (tickBase(l)) continue;
      const cx = (l.box[0] + l.box[2]) / 2;
      const cy = (l.box[1] + l.box[3]) / 2;
      const within = frame
        ? cx >= outer[0] && cx <= outer[2] && cy >= outer[1] && cy <= outer[3]
        : members.has(l) ||
          (!isText(l) && inside(l.box, c, 0.2 * e) && Math.max(w(l.box), h(l.box)) <= 3 * e);
      if (within) members.add(l);
    }
    for (const m of members) inLegend.set(k(m), outer);
  }

  // The area: axis lines, frames and panels; without any, everything else drawn.
  // Geometry only: a stroke's width does not scale, so it is not part of the area.
  const inner = (l: DrawnLeaf): Box => {
    const p = Math.min(l.pad, w(l.box) / 2, h(l.box) / 2);
    return [l.box[0] + p, l.box[1] + p, l.box[2] - p, l.box[3] - p];
  };
  let area: Box | null = null;
  for (const s of shapes)
    if (!inLegend.has(k(s)) && (strokes.get(k(s))?.role === 'axis' || panel(s)))
      area = union(area, inner(s));
  if (!area) for (const s of shapes) if (!inLegend.has(k(s))) area = union(area, inner(s));
  if (!area || w(area) <= 0 || h(area) <= 0) return null;
  const A = area;

  const actions = new Map<string, Action>();
  const outside = (b: Box): boolean => b[2] <= A[0] || b[0] >= A[2] || b[3] <= A[1] || b[1] >= A[3];
  // Markers are small next to the plot's text (its glyph outlines when it has no text).
  const median = (v: number[]): number | undefined =>
    v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const plotEm =
    median(parts.texts.map((t) => t.size)) ??
    median(shapes.filter((l) => outside(l.box)).map((l) => Math.max(w(l.box), h(l.box))));
  const marker = Math.max(MARKER * Math.min(w(A), h(A)), MARKER_EM * (plotEm ?? 0));
  const legendAnchors = new Map<Box, [number, number]>();
  const loose: DrawnLeaf[] = [];
  for (const l of leaves) {
    const id = k(l);
    const lg = inLegend.get(id);
    const base = tickBase(l);
    if (lg) {
      let at = legendAnchors.get(lg);
      if (!at) {
        at = anchorOf(lg, A, true);
        legendAnchors.set(lg, at);
      }
      actions.set(id, { kind: 'move', at });
    } else if (base && !isText(l)) actions.set(id, { kind: 'move', at: base });
    else if (!isText(l) && (strokes.get(id)?.role === 'axis' || panel(l)))
      actions.set(id, { kind: 'scale' });
    else if (isText(l) || outside(l.box)) loose.push(l);
    else if (Math.max(w(l.box), h(l.box)) <= marker && closed(l.node))
      actions.set(id, {
        kind: 'move',
        at: [(l.box[0] + l.box[2]) / 2, (l.box[1] + l.box[3]) / 2],
      });
    else actions.set(id, { kind: 'scale' });
  }

  // Labels and pieces outside the area move together with what touches them.
  const size = (l: DrawnLeaf): number => (isText(l) ? em(l) : Math.max(w(l.box), h(l.box)));
  const angle = (l: DrawnLeaf): number => angleOf(multiply(l.parent, own(l.node)));
  const origin = (l: DrawnLeaf): [number, number] =>
    apply(
      multiply(l.parent, own(l.node)),
      numList(l.node.attrs['x'])?.[0] ?? 0,
      numList(l.node.attrs['y'])?.[0] ?? 0,
    );
  const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
    (Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1e-9, Math.min(a1 - a0, b1 - b0));
  /** Side by side along one line (pieces of one label), not stacked lines. */
  const together = (a: DrawnLeaf, b: DrawnLeaf): boolean => {
    const d = gap(a.box, b.box) / Math.max(size(a), size(b));
    if (d > 0.6) return false;
    const ox = overlap(a.box[0], a.box[2], b.box[0], b.box[2]);
    const oy = overlap(a.box[1], a.box[3], b.box[1], b.box[3]);
    const t = isText(a) ? a : isText(b) ? b : null;
    // Glyph outlines: words on a row (spaces included), letters of a column only.
    if (!t) return oy >= 0.5 || (ox >= 0.5 && d <= 0.3);
    if (d > 0.3) return false;
    const ta = angle(t);
    return Math.abs(Math.sin((ta * Math.PI) / 180)) > 0.7 ? ox >= 0.5 : oy >= 0.5;
  };
  /** Two runs of one line of text: same angle and baseline, close along it. */
  const sameLine = (a: DrawnLeaf, b: DrawnLeaf): boolean => {
    const ta = angle(a);
    if (Math.abs(((angle(b) - ta + 540) % 360) - 180) > 1) return false;
    const e = Math.max(em(a), em(b));
    if (gap(a.box, b.box) > e) return false;
    const [ax, ay] = origin(a);
    const [bx, by] = origin(b);
    const th = (ta * Math.PI) / 180;
    // Distance across the baseline.
    return Math.abs((bx - ax) * Math.sin(th) - (by - ay) * Math.cos(th)) <= 0.2 * e;
  };
  const near = new Sets(loose.length);
  loose.forEach((a, i) => {
    loose.forEach((b, j) => {
      if (j > i && (isText(a) && isText(b) ? sameLine(a, b) : together(a, b))) near.join(i, j);
    });
  });
  const clusters = new Map<number, DrawnLeaf[]>();
  loose.forEach((l, i) => {
    const r = near.find(i);
    clusters.set(r, [...(clusters.get(r) ?? []), l]);
  });
  for (const c of clusters.values()) {
    const ticked = c.map(tickBase).find((b) => b !== undefined);
    const box = c.reduce<Box | null>((a, l) => union(a, l.box), null) ?? A;
    const at = ticked ?? anchorOf(box, A, false);
    for (const l of c) actions.set(k(l), { kind: 'move', at: tickBase(l) ?? at });
  }
  return { area: A, actions, leaves };
}

/**
 * The area's growth that gives the plot a viewBox of `vw × vh` (its margins
 * fixed), never below `MIN_GROWTH`.
 */
export function growthFor(
  vb: ViewBox,
  area: Box,
  vw: number,
  vh: number,
): readonly [number, number] {
  return [
    Math.max(MIN_GROWTH, (vw - (vb[2] - w(area))) / w(area)),
    Math.max(MIN_GROWTH, (vh - (vb[3] - h(area))) / h(area)),
  ];
}

const own = (n: SvgNode): Matrix => {
  const t = n.attrs['transform'];
  return (t === undefined ? null : parseTransform(String(t))) ?? IDENTITY;
};

type Attrs = Record<string, string | number | undefined>;

/** Parsed path data per element: a drag redraws the same stored plot at every step. */
const parsedPaths = new WeakMap<SvgNode, Seg[] | null>();
function segsOf(n: SvgNode): Seg[] | null {
  let segs = parsedPaths.get(n);
  if (segs === undefined) {
    segs = parsePath(String(n.attrs['d'] ?? ''));
    parsedPaths.set(n, segs);
  }
  return segs;
}

/**
 * The element with an axis-aligned map `m` (scale and translate only) baked
 * into its coordinates; its stroke width and dashes are not touched. Null
 * when it has coordinates that cannot be mapped (percentages, bad data).
 */
function mapLocal(n: SvgNode, m: Matrix): SvgNode | null {
  const [a, , , d, e, f] = m;
  const X = (v: number): string => fmt(a * v + e);
  const Y = (v: number): string => fmt(d * v + f);
  const g = (name: string): number | null => (n.attrs[name] === undefined ? 0 : len(n.attrs[name]));
  const set = (attrs: Attrs): SvgNode => el(n.tag, { ...n.attrs, ...attrs }, n.children);
  const lists = (node: SvgNode): SvgNode => {
    const attrs: Attrs = { ...node.attrs };
    const xs = node.attrs['x'] === undefined ? null : numList(node.attrs['x']);
    const ys = node.attrs['y'] === undefined ? null : numList(node.attrs['y']);
    if (xs?.length) attrs['x'] = xs.map(X).join(' ');
    if (ys?.length) attrs['y'] = ys.map(Y).join(' ');
    return el(
      node.tag,
      attrs,
      node.children.map((c) => (typeof c === 'string' ? c : lists(c))),
    );
  };
  switch (n.tag) {
    case 'text':
      return lists(n);
    case 'path': {
      const segs = segsOf(n);
      return segs ? set({ d: pathString(transformPath(segs, m)) }) : null;
    }
    case 'rect': {
      const [x, y, rw, rh, rx, ry] = ['x', 'y', 'width', 'height', 'rx', 'ry'].map(g);
      if ([x, y, rw, rh, rx, ry].some((v) => v === null)) return null;
      return set({
        x: X(x ?? 0),
        y: Y(y ?? 0),
        width: fmt((rw ?? 0) * a),
        height: fmt((rh ?? 0) * d),
        ...(n.attrs['rx'] !== undefined ? { rx: fmt((rx ?? 0) * a) } : {}),
        ...(n.attrs['ry'] !== undefined ? { ry: fmt((ry ?? 0) * d) } : {}),
      });
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [g('cx'), g('cy')];
      const rx = n.tag === 'circle' ? g('r') : g('rx');
      const ry = n.tag === 'circle' ? g('r') : g('ry');
      if (cx === null || cy === null || rx === null || ry === null) return null;
      if (n.tag === 'circle' && Math.abs(a - d) <= 1e-9 * Math.max(1, a))
        return set({ cx: X(cx), cy: Y(cy), r: fmt(rx * a) });
      const { r: _r, ...rest } = n.attrs;
      return el(
        'ellipse',
        { ...rest, cx: X(cx), cy: Y(cy), rx: fmt(rx * a), ry: fmt(ry * d) },
        n.children,
      );
    }
    case 'line': {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(g);
      if ([x1, y1, x2, y2].some((v) => v === null)) return null;
      return set({ x1: X(x1 ?? 0), y1: Y(y1 ?? 0), x2: X(x2 ?? 0), y2: Y(y2 ?? 0) });
    }
    case 'polyline':
    case 'polygon': {
      const v = numList(n.attrs['points']);
      if (!v) return null;
      return set({ points: v.map((c, i) => (i % 2 === 0 ? X(c) : Y(c))).join(' ') });
    }
    default:
      return null;
  }
}

/**
 * The plot with its area grown by (sx, sy) about its top-left and every
 * other element moved by its anchor (see the module comment), and its new
 * viewBox. The viewBox keeps its origin; the margins keep their size.
 */
export function resizePlot(
  root: SvgNode,
  vb: ViewBox,
  layout: PlotLayout,
  sx: number,
  sy: number,
): { root: SvgNode; viewBox: ViewBox } {
  const [gx, gy] = layout.area;
  const A: Matrix = [sx, 0, 0, sy, gx - gx * sx, gy - gy * sy];
  const edits = new Map<string, (n: SvgNode) => SvgNode>();
  for (const l of layout.leaves) {
    const act = layout.actions.get(key(l.path));
    if (!act) continue;
    let map: Matrix;
    if (act.kind === 'scale') map = A;
    else {
      const dx = (act.at[0] - gx) * (sx - 1);
      const dy = (act.at[1] - gy) * (sy - 1);
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
      map = [1, 0, 0, 1, dx, dy];
    }
    edits.set(key(l.path), (n) => {
      const m = multiply(l.parent, own(n));
      // The same map in the element's own coordinates.
      const local = multiply(invert(m), multiply(map, m));
      const baked = isAxisAligned(local) ? mapLocal(n, local) : null;
      if (baked) return baked;
      // Rotated or skewed geometry: the map goes on its transform (its stroke scales with it).
      const t = multiply(invert(l.parent), multiply(map, m));
      return el(n.tag, { ...n.attrs, transform: matrixString(t) }, n.children);
    });
  }
  const out = edits.size === 0 ? root : replaceAt(root, edits);
  const viewBox: ViewBox = [
    vb[0],
    vb[1],
    Number(fmt(vb[2] + w(layout.area) * (sx - 1))),
    Number(fmt(vb[3] + h(layout.area) * (sy - 1))),
  ];
  return {
    root: el(out.tag, { ...out.attrs, viewBox: viewBox.map(fmt).join(' ') }, out.children),
    viewBox,
  };
}
