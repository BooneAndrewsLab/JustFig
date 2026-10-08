/**
 * What the text and strokes inside an imported plot are (note 16), and
 * restyling them. Works on a stored `svgImport` asset as rendering parses it
 * (sanitised, cleaned up as a plot: note 12), so every label is a `<text>`
 * with its own position and every stroke is its own element.
 *
 * Roles, judged from geometry only (pure and deterministic):
 * - stroke `tick`: a short axis-aligned straight line, one of at least two of
 *   the same length spanning the same range across their axis, with one end on
 *   a long perpendicular edge (a spine, the panel or its background, a colour
 *   bar's frame);
 * - stroke `axis`: a long axis-aligned straight line (spine, grid line,
 *   reference line), at least 30 % of the plot's width or height, or along
 *   most of an edge of a panel (a rectangle over 10 % both ways: a subplot in
 *   a grid), or a large axis-aligned frame;
 * - stroke `data`: every other stroke (data lines, markers, error bars,
 *   legend frames and handles);
 * - text `tick`: the label nearest the free end of a tick, centred on its line;
 * - text `label`: every other label (axis titles, titles, legend entries).
 * Issue 3 (resizing a plot without scaling its text and ticks) reads the same
 * roles.
 */
import type { FontId } from '@/core/model/types';
import { type SvgNode, el } from '@/render/svgNode';

import {
  type Matrix,
  IDENTITY,
  angleOf,
  apply,
  fmt,
  multiply,
  parseTransform,
  scaleOf,
} from './matrix';
import { parsePath } from './pathData';
import { approxTextWidth, len, numList } from './plotCleanup';
import { bundledFont, isBold } from './plotFonts';

export type TextRole = 'tick' | 'label';
export type StrokeRole = 'tick' | 'axis' | 'data';

export const TEXT_ROLES: readonly TextRole[] = ['tick', 'label'];
export const STROKE_ROLES: readonly StrokeRole[] = ['tick', 'axis', 'data'];

interface Part {
  /** Child indices from the root. */
  readonly path: readonly number[];
  readonly node: SvgNode;
  /** Root user units per local unit of the element (its transforms' scale). */
  readonly scale: number;
}

/**
 * Which edge of a label stays put when its size changes: the one facing its
 * tick (the top of an x tick label under its axis, the middle of a y tick
 * label beside it), else the baseline.
 */
export type Keep = 'top' | 'middle' | 'baseline';

/** Cap height and half of it, em: how far the top and middle sit above the baseline. */
const KEEP_EM: Readonly<Record<Keep, number>> = { top: 0.72, middle: 0.36, baseline: 0 };

export interface PlotText extends Part {
  readonly role: TextRole;
  readonly keep: Keep;
  /** Font size in root user units. */
  readonly size: number;
  readonly font: FontId;
  /** A tick label's tick: where it meets its axis, root user units. */
  readonly tick?: readonly [number, number];
}

export interface PlotStroke extends Part {
  readonly role: StrokeRole;
  /** Stroke width in root user units. */
  readonly width: number;
  /** A tick's end on its axis (the other end is free), root user units. */
  readonly base?: readonly [number, number];
}

export interface PlotParts {
  readonly texts: readonly PlotText[];
  readonly strokes: readonly PlotStroke[];
}

/** The bundled family names written into a restyled label (plotFonts maps them to themselves). */
export const FAMILY: Readonly<Record<FontId, string>> = {
  arimo: 'Arimo',
  tinos: 'Tinos',
  cousine: 'Cousine',
};

type Inh = Readonly<Record<string, string>>;
const ROOT: Inh = {
  fill: '#000000',
  stroke: 'none',
  'stroke-width': '1',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0',
  'font-family': '',
  'font-size': '16',
  'font-weight': 'normal',
  'text-anchor': 'start',
};
const KEYS = Object.keys(ROOT);

function inherit(inh: Inh, a: SvgNode['attrs']): Inh {
  let out: Record<string, string> | null = null;
  for (const k of KEYS) {
    const v = a[k];
    if (v === undefined) continue;
    out ??= { ...inh };
    out[k] = String(v);
  }
  return out ?? inh;
}

const ownMatrix = (n: SvgNode): Matrix => {
  const t = n.attrs['transform'];
  return (t === undefined ? null : parseTransform(String(t))) ?? IDENTITY;
};

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

type Seg = readonly [number, number, number, number];

interface Leaf {
  readonly path: readonly number[];
  readonly node: SvgNode;
  readonly inh: Inh;
  readonly m: Matrix;
}

function leaves(root: SvgNode): Leaf[] {
  const out: Leaf[] = [];
  const visit = (n: SvgNode, path: number[], inh: Inh, m: Matrix): void => {
    n.children.forEach((c, i) => {
      if (typeof c === 'string') return;
      const ci = inherit(inh, c.attrs);
      const cm = multiply(m, ownMatrix(c));
      const p = [...path, i];
      if (c.tag === 'text' || SHAPES.has(c.tag)) out.push({ path: p, node: c, inh: ci, m: cm });
      else if (c.tag === 'g' || c.tag === 'svg') visit(c, p, ci, cm);
    });
  };
  visit(root, [], inherit(ROOT, root.attrs), IDENTITY);
  return out;
}

/** Straight segments of a shape in root coordinates, and whether it has nothing else. */
function geometry(n: SvgNode, m: Matrix): { segs: Seg[]; straight: boolean } {
  const raw: [number, number, number, number][] = [];
  let straight = true;
  const chain = (v: readonly number[], closed: boolean): void => {
    for (let i = 0; i + 3 < v.length; i += 2)
      raw.push([v[i] ?? 0, v[i + 1] ?? 0, v[i + 2] ?? 0, v[i + 3] ?? 0]);
    if (closed && v.length >= 6)
      raw.push([v[v.length - 2] ?? 0, v[v.length - 1] ?? 0, v[0] ?? 0, v[1] ?? 0]);
  };
  const g = (k: string): number => len(n.attrs[k] ?? 0) ?? 0;
  switch (n.tag) {
    case 'path': {
      let cur: readonly [number, number] | null = null;
      let start: readonly [number, number] | null = null;
      const segs = parsePath(String(n.attrs['d'] ?? ''));
      if (!segs) return { segs: [], straight: false };
      for (const s of segs) {
        if (s.c === 'M') start = cur = [s.p[0], s.p[1]];
        else if (s.c === 'L') {
          if (cur) raw.push([cur[0], cur[1], s.p[0], s.p[1]]);
          cur = [s.p[0], s.p[1]];
        } else if (s.c === 'Z') {
          if (cur && start && (cur[0] !== start[0] || cur[1] !== start[1]))
            raw.push([cur[0], cur[1], start[0], start[1]]);
          cur = start;
        } else {
          straight = false;
          cur = [s.p[s.p.length - 2] ?? 0, s.p[s.p.length - 1] ?? 0];
        }
      }
      break;
    }
    case 'line':
      raw.push([g('x1'), g('y1'), g('x2'), g('y2')]);
      break;
    case 'polyline':
    case 'polygon':
      chain(numList(n.attrs['points']) ?? [], n.tag === 'polygon');
      break;
    case 'rect': {
      const [x, y, w, h] = [g('x'), g('y'), g('width'), g('height')];
      if (g('rx') > 0 || g('ry') > 0) straight = false;
      chain([x, y, x + w, y, x + w, y + h, x, y + h], true);
      break;
    }
    default:
      straight = false;
  }
  const segs = raw.map(([a, b, c, d]): Seg => [...apply(m, a, b), ...apply(m, c, d)]);
  return { segs, straight };
}

const isH = (s: Seg): boolean =>
  Math.abs(s[3] - s[1]) <= 1e-3 * Math.hypot(s[2] - s[0], s[3] - s[1]);
const isV = (s: Seg): boolean =>
  Math.abs(s[2] - s[0]) <= 1e-3 * Math.hypot(s[2] - s[0], s[3] - s[1]);
const segLen = (s: Seg): number => Math.hypot(s[2] - s[0], s[3] - s[1]);

/** An axis-aligned straight line: orientation, position across, extent along. */
interface Line {
  readonly v: boolean;
  readonly at: number;
  readonly a: number;
  readonly b: number;
}

/** The element as one axis-aligned line, if all its segments lie on one. */
function asLine(segs: readonly Seg[]): Line | null {
  const real = segs.filter((s) => segLen(s) > 1e-6);
  const first = real[0];
  if (!first) return null;
  const v = isV(first);
  if (!v && !isH(first)) return null;
  const at = v ? first[0] : first[1];
  let a = Infinity;
  let b = -Infinity;
  for (const s of real) {
    if (v ? !isV(s) : !isH(s)) return null;
    const c0 = v ? s[0] : s[1];
    const c1 = v ? s[2] : s[3];
    if (Math.abs(c0 - at) > 0.01 || Math.abs(c1 - at) > 0.01) return null;
    const lo = Math.min(v ? s[1] : s[0], v ? s[3] : s[2]);
    const hi = Math.max(v ? s[1] : s[0], v ? s[3] : s[2]);
    a = Math.min(a, lo);
    b = Math.max(b, hi);
  }
  return { v, at, a, b };
}

/** All segments axis-aligned with every end on their bounding box: a frame. */
function frameBox(segs: readonly Seg[]): [number, number, number, number] | null {
  if (segs.length < 4 || !segs.every((s) => isH(s) || isV(s))) return null;
  const xs = segs.flatMap((s) => [s[0], s[2]]);
  const ys = segs.flatMap((s) => [s[1], s[3]]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const tol = 0.01 * Math.max(x1 - x0, y1 - y0);
  const onBorder = (x: number, y: number): boolean =>
    Math.abs(x - x0) <= tol ||
    Math.abs(x - x1) <= tol ||
    Math.abs(y - y0) <= tol ||
    Math.abs(y - y1) <= tol;
  return segs.every((s) => onBorder(s[0], s[1]) && onBorder(s[2], s[3])) ? [x0, y0, x1, y1] : null;
}

const LONG = 0.3;
const SHORT = 0.08;
/** A panel (a subplot's background or frame) is at least this share of the viewBox both ways. */
const PANEL = 0.1;

const textContent = (n: SvgNode): string =>
  n.children.map((c) => (typeof c === 'string' ? c : textContent(c))).join('');

/** The roles of a plot's text and strokes (see the module comment). */
export function plotParts(
  root: SvgNode,
  viewBox: readonly [number, number, number, number],
): PlotParts {
  const [, , vw, vh] = viewBox;
  const all = leaves(root);
  const shapes = all.filter((l) => l.node.tag !== 'text');
  const geo = new Map(shapes.map((l) => [l, geometry(l.node, l.m)]));

  // Long axis-aligned edges of anything drawn (stroked or filled): spines, frames, panels.
  const longEdges: Line[] = [];
  for (const l of shapes) {
    if (l.inh['fill'] === 'none' && l.inh['stroke'] === 'none') continue;
    for (const s of geo.get(l)?.segs ?? []) {
      const ln = asLine([s]);
      if (ln && ln.b - ln.a >= LONG * (ln.v ? vh : vw)) longEdges.push(ln);
    }
  }

  // Panels (note 17, issue 32): rectangles of a good size, such as each subplot's background.
  // Their edges are long edges and a straight stroke along one is an axis line, however small
  // the panel is next to the whole plot (a grid of subplots).
  // A colour bar's frame, thin but long, also has ticks on its edges.
  const frames = shapes.flatMap((l) => {
    if (l.inh['fill'] === 'none' && l.inh['stroke'] === 'none') return [];
    const f = frameBox(geo.get(l)?.segs ?? []);
    return f ? [f] : [];
  });
  const edgesOf = ([x0, y0, x1, y1]: readonly number[]): Line[] => [
    { v: false, at: y0 ?? 0, a: x0 ?? 0, b: x1 ?? 0 },
    { v: false, at: y1 ?? 0, a: x0 ?? 0, b: x1 ?? 0 },
    { v: true, at: x0 ?? 0, a: y0 ?? 0, b: y1 ?? 0 },
    { v: true, at: x1 ?? 0, a: y0 ?? 0, b: y1 ?? 0 },
  ];
  const panelEdges = frames
    .filter((f) => f[2] - f[0] >= PANEL * vw && f[3] - f[1] >= PANEL * vh)
    .flatMap(edgesOf);
  longEdges.push(
    ...frames
      .flatMap(edgesOf)
      .filter((e) => e.b - e.a >= PANEL * (e.v ? vh : vw) && e.b - e.a < LONG * (e.v ? vh : vw)),
  );
  const edgeTol = 0.005 * Math.max(vw, vh);
  const alongPanel = (ln: Line): boolean =>
    panelEdges.some(
      (e) =>
        e.v === ln.v &&
        Math.abs(e.at - ln.at) <= edgeTol &&
        ln.a <= e.a + 0.1 * (e.b - e.a) &&
        ln.b >= e.b - 0.1 * (e.b - e.a),
    );

  const stroked = shapes.filter((l) => {
    const w = len(l.inh['stroke-width']);
    return l.inh['stroke'] !== 'none' && w !== null && w > 0;
  });
  const roles = new Map<Leaf, StrokeRole>();
  const short: { leaf: Leaf; line: Line }[] = [];
  for (const l of stroked) {
    const g = geo.get(l);
    if (!g?.straight) continue;
    const ln = asLine(g.segs);
    const extent = ln?.v === true ? vh : vw;
    if (ln && (ln.b - ln.a >= LONG * extent || alongPanel(ln))) roles.set(l, 'axis');
    else if (ln && ln.b - ln.a > 0 && ln.b - ln.a <= SHORT * Math.max(vw, vh))
      short.push({ leaf: l, line: ln });
    else {
      const f = frameBox(g.segs);
      if (f && f[2] - f[0] >= LONG * vw && f[3] - f[1] >= LONG * vh) roles.set(l, 'axis');
    }
  }

  // Ticks: short lines sharing their range with another of the same orientation, one end on a
  // long perpendicular edge that passes there.
  const ticks: { leaf: Leaf; free: [number, number]; base: [number, number] }[] = [];
  const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
  for (const s of short) {
    const { v, at, a, b } = s.line;
    const tol = Math.max(0.05 * (b - a), 0.05);
    const twins = short.filter(
      (o) => o !== s && o.line.v === v && near(o.line.a, a, tol) && near(o.line.b, b, tol),
    );
    if (twins.length === 0) continue;
    const touches = (end: number): boolean =>
      longEdges.some(
        (e) => e.v !== v && near(e.at, end, tol + 0.5) && e.a - tol <= at && at <= e.b + tol,
      );
    const pt = (c: number): [number, number] => (v ? [at, c] : [c, at]);
    if (touches(a)) ticks.push({ leaf: s.leaf, base: pt(a), free: pt(b) });
    else if (touches(b)) ticks.push({ leaf: s.leaf, base: pt(b), free: pt(a) });
  }
  for (const t of ticks) roles.set(t.leaf, 'tick');

  // Labels: their box from the estimated width, in root coordinates.
  const texts = all.filter((l) => l.node.tag === 'text');
  const boxes = texts.map((l) => {
    const sz = (len(l.inh['font-size']) ?? 16) * scaleOf(l.m);
    const x = numList(l.node.attrs['x'])?.[0] ?? 0;
    const y = numList(l.node.attrs['y'])?.[0] ?? 0;
    const w = approxTextWidth(
      textContent(l.node).trim(),
      sz,
      l.inh['font-family'],
      isBold(l.inh['font-weight']),
    );
    const anchor = l.inh['text-anchor'];
    const off = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
    const [ox, oy] = apply(l.m, x, y);
    const th = (angleOf(l.m) * Math.PI) / 180;
    const u = [Math.cos(th), Math.sin(th)] as const;
    const up = [Math.sin(th), -Math.cos(th)] as const;
    const corners = [
      [off, -0.25 * sz],
      [off + w, -0.25 * sz],
      [off, 0.75 * sz],
      [off + w, 0.75 * sz],
    ].map(([al, ac]) => [
      ox + u[0] * (al ?? 0) + up[0] * (ac ?? 0),
      oy + u[1] * (al ?? 0) + up[1] * (ac ?? 0),
    ]);
    const xs = corners.map((c) => c[0] ?? 0);
    const ys = corners.map((c) => c[1] ?? 0);
    return {
      size: sz,
      u,
      up,
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const,
    };
  });
  /** Tick labels, which edge of each faces its tick, and the tick's base. */
  const tickLabels = new Map<number, { keep: Keep; base: [number, number] }>();
  for (const t of ticks) {
    const dx = t.free[0] - t.base[0];
    const dy = t.free[1] - t.base[1];
    const tickLen = Math.hypot(dx, dy);
    const v = Math.abs(dx) < Math.abs(dy);
    let best = -1;
    let bestD = Infinity;
    let keep: Keep = 'baseline';
    boxes.forEach(({ size, box, u, up }, i) => {
      const cx = (box[0] + box[2]) / 2;
      const cy = (box[1] + box[3]) / 2;
      // Centred on the tick's line, across the tick direction.
      const across = Math.max(0.5 * size, 0.5 * tickLen);
      if (Math.abs(v ? cx - t.free[0] : cy - t.free[1]) > across) return;
      // Beyond either end, away from the other one (ticks may point in or out); the limit
      // does not shrink with the label, so a restyled label keeps its role.
      for (const [end, sign] of [
        [t.free, 1],
        [t.base, -1],
      ] as const) {
        const along = v ? (cy - end[1]) * Math.sign(dy) : (cx - end[0]) * Math.sign(dx);
        if (along * sign <= 0) continue;
        const gx = Math.max(box[0] - end[0], 0, end[0] - box[2]);
        const gy = Math.max(box[1] - end[1], 0, end[1] - box[3]);
        const d = Math.hypot(gx, gy);
        if (d <= Math.max(1.5 * size, 3 * tickLen) && d < bestD) {
          bestD = d;
          best = i;
          const ru = (end[0] - cx) * up[0] + (end[1] - cy) * up[1];
          const ra = (end[0] - cx) * u[0] + (end[1] - cy) * u[1];
          keep = Math.abs(ra) > Math.abs(ru) ? 'middle' : ru > 0 ? 'top' : 'baseline';
        }
      }
    });
    if (best >= 0) tickLabels.set(best, { keep, base: t.base });
  }

  const bases = new Map(ticks.map((t) => [t.leaf, t.base]));
  return {
    texts: texts.map((l, i): PlotText => {
      const tl = tickLabels.get(i);
      return {
        path: l.path,
        node: l.node,
        scale: scaleOf(l.m),
        role: tickLabels.has(i) ? 'tick' : 'label',
        keep: tl?.keep ?? 'baseline',
        ...(tl ? { tick: tl.base } : {}),
        size: boxes[i]?.size ?? 16,
        font: bundledFont(l.inh['font-family']),
      };
    }),
    strokes: stroked.map((l): PlotStroke => {
      const base = bases.get(l);
      return {
        path: l.path,
        node: l.node,
        scale: scaleOf(l.m),
        role: roles.get(l) ?? 'data',
        width: (len(l.inh['stroke-width']) ?? 1) * scaleOf(l.m),
        ...(base ? { base } : {}),
      };
    }),
  };
}

/** New font and/or size (root user units) for one label; null leaves it. */
export type TextChange = (t: PlotText) => { readonly font?: FontId; readonly size?: number } | null;
/** New stroke width (root user units) for one stroke; null leaves it. */
export type StrokeChange = (s: PlotStroke) => number | null;

const scaledList = (v: string, k: number): string | null => {
  if (v === 'none') return null;
  const l = numList(v);
  return l && l.length > 0 ? l.map((x) => fmt(x * k)).join(' ') : null;
};

/** Removes `font-family` from tspans and scales their own `font-size` and `dy` by `k`. */
function restyleTspans(n: SvgNode, dropFamily: boolean, k: number): SvgNode {
  return el(
    n.tag,
    n.attrs,
    n.children.map((c) => {
      if (typeof c === 'string') return c;
      const attrs: Record<string, string | number | undefined> = { ...c.attrs };
      if (dropFamily) delete attrs['font-family'];
      const fs = len(attrs['font-size']);
      if (k !== 1 && fs !== null) attrs['font-size'] = fmt(fs * k);
      // A script's baseline shift scales with the text.
      const dy = attrs['dy'] === undefined ? null : scaledList(String(attrs['dy']), k);
      if (k !== 1 && dy !== null) attrs['dy'] = dy;
      return restyleTspans(el(c.tag, attrs, c.children), dropFamily, k);
    }),
  );
}

/** Moves a label's baselines down by `dy` (its own units): every `y` of it and its tspans. */
function shiftY(n: SvgNode, dy: number): SvgNode {
  const ys = n.attrs['y'] === undefined ? null : numList(n.attrs['y']);
  const attrs =
    ys && ys.length > 0 ? { ...n.attrs, y: ys.map((v) => fmt(v + dy)).join(' ') } : n.attrs;
  return el(
    n.tag,
    attrs,
    n.children.map((c) => (typeof c === 'string' ? c : shiftY(c, dy))),
  );
}

export function replaceAt(
  root: SvgNode,
  edits: ReadonlyMap<string, (n: SvgNode) => SvgNode>,
): SvgNode {
  const visit = (n: SvgNode, path: string): SvgNode => {
    const children = n.children.map((c, i) => {
      if (typeof c === 'string') return c;
      const p = path === '' ? String(i) : `${path}.${String(i)}`;
      const f = edits.get(p);
      return f ? f(c) : visit(c, p);
    });
    return children.some((c, i) => c !== n.children[i]) ? el(n.tag, n.attrs, children) : n;
  };
  return visit(root, '');
}

/**
 * The plot with labels and strokes restyled: sizes and widths are written on
 * each element in its own units (so its transforms are honoured), fonts as the
 * bundled family name. A stroke's own dash pattern scales with its width.
 */
export function restylePlot(
  root: SvgNode,
  parts: PlotParts,
  change: { readonly text?: TextChange; readonly stroke?: StrokeChange },
): SvgNode {
  const edits = new Map<string, (n: SvgNode) => SvgNode>();
  if (change.text)
    for (const t of parts.texts) {
      const c = change.text(t);
      if (!c) continue;
      const font = c.font !== undefined && c.font !== t.font ? c.font : undefined;
      const size = c.size !== undefined && Math.abs(c.size - t.size) > 1e-6 ? c.size : undefined;
      if (font === undefined && size === undefined) continue;
      edits.set(t.path.join('.'), (n) => {
        const attrs: Record<string, string | number | undefined> = { ...n.attrs };
        if (font !== undefined) attrs['font-family'] = FAMILY[font];
        if (size !== undefined) attrs['font-size'] = fmt(size / t.scale);
        const styled = restyleTspans(
          el(n.tag, attrs, n.children),
          font !== undefined,
          size === undefined ? 1 : size / t.size,
        );
        const dy = size === undefined ? 0 : ((size - t.size) / t.scale) * KEEP_EM[t.keep];
        return dy === 0 ? styled : shiftY(styled, dy);
      });
    }
  if (change.stroke)
    for (const s of parts.strokes) {
      const w = change.stroke(s);
      if (w === null || Math.abs(w - s.width) < 1e-6 || s.width <= 0) continue;
      edits.set(s.path.join('.'), (n) => {
        const k = w / s.width;
        const attrs: Record<string, string | number | undefined> = {
          ...n.attrs,
          'stroke-width': fmt(w / s.scale),
        };
        const dash = n.attrs['stroke-dasharray'];
        if (dash !== undefined) {
          const d = scaledList(String(dash), k);
          if (d !== null) attrs['stroke-dasharray'] = d;
        }
        return el(n.tag, attrs, n.children);
      });
    }
  return edits.size === 0 ? root : replaceAt(root, edits);
}
