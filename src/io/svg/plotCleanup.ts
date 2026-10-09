/**
 * Cleaning up imported plots (note 12), on a tree the sanitiser already
 * brought into the export subset. Plotting libraries write SVG for
 * viewers, not editors; this makes it a tidy drawing:
 *
 * 1. Transforms are pushed down and baked into the geometry (points, radii,
 *    stroke widths and font sizes), and groups left with nothing to do are
 *    dissolved. What cannot be baked exactly (a skewed stroke, mirrored
 *    text) keeps a `matrix()` on that one element.
 * 2. Leading full-page white rectangles (the figure background) go.
 * 3. Neighbouring `<text>` pieces on one baseline with the same style are
 *    merged into one editable label, and the runs of a mathtext or mixed-style
 *    label flow on as tspans of one (see `mergeTexts`); labels get the
 *    alignment the plot gave them (`anchorLabels`).
 * 4. The viewBox is cropped to the drawn content.
 *
 * Embedded pictures are taken out after step 2 (`plotImages.ts`, issue 24)
 * and returned, to be placed as pictures of their own under the plot; the
 * crop keeps room for them.
 *
 * Text and strokes stay separate elements with their own attributes, so
 * later passes (matching fonts, resizing a plot without scaling its text)
 * can find them.
 */
import { type SvgNode, el } from '@/render/svgNode';

import {
  type Matrix,
  IDENTITY,
  angleOf,
  apply,
  determinant,
  fmt,
  isAxisAligned,
  isIdentity,
  isSimilarity,
  matrixString,
  multiply,
  parseTransform,
  scaleOf,
} from './matrix';
import { parsePath, pathPoints, pathRect, pathString, transformPath } from './pathData';
import { bundledFont, isBold } from './plotFonts';
import { type PlotImage, takeImages } from './plotImages';
import { CLIP_ATTR, type ReadClips, clipShape } from './svgClip';

export type ViewBox = readonly [number, number, number, number];

/**
 * The run's advance width in em of its font size, as the source laid it out,
 * carried from the importer to plot cleanup (which infers label alignment
 * from it, note 15) and dropped there: never stored.
 */
export const ADVANCE_ATTR = 'data-advance';

/** Inherited presentation values in effect, starting from SVG's initial values. */
type Inherited = Readonly<Record<string, string>>;

const ROOT_INHERITED: Inherited = {
  fill: '#000000',
  'fill-opacity': '1',
  'fill-rule': 'nonzero',
  stroke: 'none',
  'stroke-width': '1',
  'stroke-opacity': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0',
  'font-family': '',
  'font-size': '16',
  'font-weight': 'normal',
  'font-style': 'normal',
  'text-anchor': 'start',
};
const INHERITABLE = Object.keys(ROOT_INHERITED);

function inherit(inh: Inherited, a: SvgNode['attrs']): Inherited {
  const out: Record<string, string> = { ...inh };
  for (const k of INHERITABLE) {
    const v = a[k];
    if (v !== undefined) out[k] = String(v);
  }
  return out;
}

const get = (inh: Inherited, k: string): string => inh[k] ?? ROOT_INHERITED[k] ?? '';

/** Attributes without the inherited values they merely repeat. */
function pruned(a: SvgNode['attrs'], parent: Inherited): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(a))
    if (v !== undefined && !(INHERITABLE.includes(k) && String(v) === parent[k])) out[k] = v;
  return out;
}

/** A length in user units (unitless, px or pt), or null. */
export function len(v: string | number | undefined): number | null {
  if (v === undefined) return null;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(px|pt)?\s*$/i.exec(String(v));
  if (!m) return null;
  return Number(m[1]) * (m[2]?.toLowerCase() === 'pt' ? 4 / 3 : 1);
}

export const numList = (v: string | number | undefined): number[] | null => {
  if (v === undefined) return [];
  const parts = String(v)
    .trim()
    .split(/[\s,]+/)
    .filter((t) => t !== '');
  const out = parts.map(len);
  return out.some((x) => x === null) ? null : (out as number[]);
};

const without = (a: SvgNode['attrs'], ...keys: string[]): Record<string, string | number> => {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(a)) if (v !== undefined && !keys.includes(k)) out[k] = v;
  return out;
};

const ownTransform = (n: SvgNode): Matrix => {
  const t = n.attrs['transform'];
  return (t === undefined ? null : parseTransform(String(t))) ?? IDENTITY;
};

// ---- 1. Flattening -------------------------------------------------------

/** Keeps the element as it is, with the whole matrix on it. */
const keep = (n: SvgNode, m: Matrix): SvgNode =>
  el(
    n.tag,
    { ...without(n.attrs, 'transform'), ...(isIdentity(m) ? {} : { transform: matrixString(m) }) },
    n.children,
  );

/** Stroke width and dashes scaled by `s`, or null when they are not plain numbers. */
function scaledStroke(inh: Inherited, s: number): Record<string, string> | null {
  if (get(inh, 'stroke') === 'none' || Math.abs(s - 1) < 1e-9) return {};
  const sw = len(get(inh, 'stroke-width'));
  if (sw === null) return null;
  const out: Record<string, string> = { 'stroke-width': fmt(sw * s) };
  if (get(inh, 'stroke-dasharray') !== 'none') {
    const d = numList(get(inh, 'stroke-dasharray'));
    if (!d) return null;
    out['stroke-dasharray'] = d.map((v) => fmt(v * s)).join(' ');
  }
  if (get(inh, 'stroke-dashoffset') !== '0') {
    const o = len(get(inh, 'stroke-dashoffset'));
    if (o === null) return null;
    out['stroke-dashoffset'] = fmt(o * s);
  }
  return out;
}

const pointsString = (pts: readonly [number, number][]): string =>
  pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');

function bakeText(n: SvgNode, m: Matrix, inh: Inherited): SvgNode {
  const s = scaleOf(m);
  const fs = len(get(inh, 'font-size'));
  const stroke = scaledStroke(inh, s);
  if (fs === null || !stroke || !isSimilarity(m) || determinant(m) < 0) return keep(n, m);
  const base = { ...without(n.attrs, 'transform'), ...stroke };
  if (Math.abs(s - 1) > 1e-9) base['font-size'] = fmt(fs * s);
  // Every x and y (lists included) maps on its own: through `m` when it only translates and
  // scales, else relative to the text's first position, which carries `rotate(angle x y)`.
  const xs = numList(n.attrs['x']);
  const ys = numList(n.attrs['y']);
  if (!xs || !ys) return keep(n, m);
  const aligned = isAxisAligned(m) && m[0] > 0;
  const [x0, y0] = [xs[0] ?? 0, ys[0] ?? 0];
  const [ax, ay] = apply(m, x0, y0);
  const fx = (x: number): number => (aligned ? m[0] * x + m[4] : ax + s * (x - x0));
  const fy = (y: number): number => (aligned ? m[3] * y + m[5] : ay + s * (y - y0));
  const mapPos = (node: SvgNode, top: boolean): SvgNode | null => {
    const nx = numList(node.attrs['x']);
    const ny = numList(node.attrs['y']);
    const ndy = numList(node.attrs['dy']);
    if (!nx || !ny || !ndy) return null;
    const attrs: Record<string, string | number> = top ? { ...base } : without(node.attrs);
    if (nx.length || top) attrs['x'] = (nx.length ? nx : [0]).map((x) => fmt(fx(x))).join(' ');
    if (ny.length || top) attrs['y'] = (ny.length ? ny : [0]).map((y) => fmt(fy(y))).join(' ');
    if (ndy.length) attrs['dy'] = ndy.map((d) => fmt(d * s)).join(' ');
    if (!top && node.attrs['font-size'] !== undefined) {
      const f = len(node.attrs['font-size']);
      if (f === null) return null;
      attrs['font-size'] = fmt(f * s);
    }
    const kids: (SvgNode | string)[] = [];
    for (const c of node.children) {
      if (typeof c === 'string') kids.push(c);
      else {
        const k = mapPos(c, false);
        if (!k) return null;
        kids.push(k);
      }
    }
    return el(node.tag, attrs, kids);
  };
  const out = mapPos(n, true);
  if (!out) return keep(n, m);
  if (aligned) return out;
  return el(
    'text',
    { ...out.attrs, transform: `rotate(${fmt(angleOf(m))} ${fmt(ax)} ${fmt(ay)})` },
    out.children,
  );
}

function bakeLeaf(n: SvgNode, m: Matrix, inh: Inherited): SvgNode {
  if (isIdentity(m)) return keep(n, m);
  if (n.tag === 'text') return bakeText(n, m, inh);
  const a = without(n.attrs, 'transform');
  const sim = isSimilarity(m);
  const s = scaleOf(m);
  // An uneven scale would make a stroke thicker one way than the other.
  const stroke = sim ? scaledStroke(inh, s) : get(inh, 'stroke') === 'none' ? {} : null;
  if (!stroke) return keep(n, m);
  const g = (k: string): number | null => (a[k] === undefined ? 0 : len(a[k]));
  switch (n.tag) {
    case 'path': {
      const segs = parsePath(String(a['d'] ?? ''));
      if (!segs) return keep(n, m);
      return el('path', { ...a, ...stroke, d: pathString(transformPath(segs, m)) });
    }
    case 'line': {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(g);
      if ([x1, y1, x2, y2].some((v) => v === null)) return keep(n, m);
      const p = apply(m, x1 ?? 0, y1 ?? 0);
      const q = apply(m, x2 ?? 0, y2 ?? 0);
      return el('line', {
        ...a,
        ...stroke,
        x1: fmt(p[0]),
        y1: fmt(p[1]),
        x2: fmt(q[0]),
        y2: fmt(q[1]),
      });
    }
    case 'polyline':
    case 'polygon': {
      const v = numList(a['points']);
      if (!v || v.length % 2) return keep(n, m);
      const pts: [number, number][] = [];
      for (let i = 0; i < v.length; i += 2) pts.push(apply(m, v[i] ?? 0, v[i + 1] ?? 0));
      return el(n.tag, { ...a, ...stroke, points: pointsString(pts) });
    }
    case 'rect': {
      const x = g('x');
      const y = g('y');
      const w = g('width');
      const h = g('height');
      if (x === null || y === null || w === null || h === null) return keep(n, m);
      const rounded = a['rx'] !== undefined || a['ry'] !== undefined;
      if (isAxisAligned(m)) {
        const p = apply(m, x, y);
        const q = apply(m, x + w, y + h);
        const out: Record<string, string | number> = {
          ...a,
          ...stroke,
          x: fmt(Math.min(p[0], q[0])),
          y: fmt(Math.min(p[1], q[1])),
          width: fmt(Math.abs(q[0] - p[0])),
          height: fmt(Math.abs(q[1] - p[1])),
        };
        if (rounded) {
          const rx = len(a['rx'] ?? a['ry']);
          const ry = len(a['ry'] ?? a['rx']);
          if (rx === null || ry === null) return keep(n, m);
          out['rx'] = fmt(rx * Math.abs(m[0]));
          out['ry'] = fmt(ry * Math.abs(m[3]));
        }
        return el('rect', out);
      }
      if (rounded) return keep(n, m);
      const corners: [number, number][] = [
        apply(m, x, y),
        apply(m, x + w, y),
        apply(m, x + w, y + h),
        apply(m, x, y + h),
      ];
      const rest = without(a, 'x', 'y', 'width', 'height');
      return el('path', {
        ...rest,
        ...stroke,
        d: `M${corners.map(([px, py]) => `${fmt(px)} ${fmt(py)}`).join('L')}Z`,
      });
    }
    case 'circle':
    case 'ellipse': {
      const cx = g('cx');
      const cy = g('cy');
      const rx = len(n.tag === 'circle' ? a['r'] : a['rx']);
      const ry = len(n.tag === 'circle' ? a['r'] : a['ry']);
      if (cx === null || cy === null || rx === null || ry === null) return keep(n, m);
      const [px, py] = apply(m, cx, cy);
      const rest = without(a, 'cx', 'cy', 'r', 'rx', 'ry');
      if (n.tag === 'circle' && sim)
        return el('circle', { ...rest, ...stroke, cx: fmt(px), cy: fmt(py), r: fmt(rx * s) });
      if (!isAxisAligned(m)) return keep(n, m);
      return el('ellipse', {
        ...rest,
        ...stroke,
        cx: fmt(px),
        cy: fmt(py),
        rx: fmt(rx * Math.abs(m[0])),
        ry: fmt(ry * Math.abs(m[3])),
      });
    }
    default:
      return keep(n, m);
  }
}

/** What cutting shapes to their clips needs while flattening (one per plot). */
interface Cutting {
  readonly warn: (message: string) => void;
  readonly memo: Map<string, ReadClips | null>;
}

function flatten(n: SvgNode, m: Matrix, inh: Inherited, cut: Cutting): SvgNode[] {
  const mm = multiply(m, ownTransform(n));
  const here = inherit(inh, n.attrs);
  if (n.tag !== 'g' && n.tag !== 'image' && n.attrs[CLIP_ATTR] !== undefined) {
    // Cut to its clip paths in its own space (issue 41); the pieces are then baked as usual.
    const paint = { fill: get(here, 'fill') !== 'none', stroke: get(here, 'stroke') !== 'none' };
    return clipShape(n, paint, mm, cut.warn, cut.memo).flatMap((p) => flatten(p, m, inh, cut));
  }
  if (n.tag !== 'g') {
    const b = bakeLeaf(n, mm, here);
    // A text's tspans drop what they repeat from it too (e.g. a `*` CSS rule's values).
    const prune = (c: SvgNode | string, ctx: Inherited): SvgNode | string =>
      typeof c === 'string'
        ? c
        : el(
            c.tag,
            pruned(c.attrs, ctx),
            c.children.map((k) => prune(k, inherit(ctx, c.attrs))),
          );
    const ctx = inherit(inh, b.attrs);
    return [
      el(
        b.tag,
        pruned(b.attrs, inh),
        b.children.map((c) => prune(c, ctx)),
      ),
    ];
  }
  const kids = n.children.flatMap((c) => (typeof c === 'string' ? [] : flatten(c, mm, here, cut)));
  const attrs = pruned(without(n.attrs, 'transform'), inh);
  if (kids.length === 0) return [];
  if (Object.keys(attrs).length === 0) return kids;
  const only = kids.length === 1 ? kids[0] : undefined;
  if (only) {
    // One child: the group's attributes move onto it (its own win; opacities multiply).
    const op = (v: string | number | undefined): number => (v === undefined ? 1 : Number(v));
    const opacity = op(attrs['opacity']) * op(only.attrs['opacity']);
    const merged = { ...without(attrs, 'opacity'), ...without(only.attrs, 'opacity') };
    return [
      el(
        only.tag,
        {
          ...merged,
          ...(Number.isFinite(opacity) && opacity !== 1 ? { opacity: fmt(opacity) } : {}),
        },
        only.children,
      ),
    ];
  }
  return [el('g', attrs, kids)];
}

// ---- 2. Background -------------------------------------------------------

const PAPER = new Set(['#ffffff', 'none']);

function coversPage(n: SvgNode, vb: ViewBox): boolean {
  if (n.attrs['transform'] !== undefined) return false;
  let box: { x: number; y: number; w: number; h: number } | null = null;
  if (n.tag === 'rect') {
    const pct = (v: string | number | undefined, full: number, origin: number): number | null => {
      if (typeof v === 'string' && v.trim().endsWith('%'))
        return origin + (Number(v.trim().slice(0, -1)) / 100) * full;
      return v === undefined ? origin : len(v);
    };
    const x = pct(n.attrs['x'], vb[2], 0);
    const y = pct(n.attrs['y'], vb[3], 0);
    const w = pct(n.attrs['width'], vb[2], 0);
    const h = pct(n.attrs['height'], vb[3], 0);
    // A percentage x is measured from the viewBox origin; plain numbers are user units.
    if (x !== null && y !== null && w !== null && h !== null) {
      const ox = typeof n.attrs['x'] === 'string' && n.attrs['x'].includes('%') ? vb[0] : 0;
      const oy = typeof n.attrs['y'] === 'string' && n.attrs['y'].includes('%') ? vb[1] : 0;
      box = { x: x + ox, y: y + oy, w, h };
    }
  } else if (n.tag === 'path') {
    const segs = parsePath(String(n.attrs['d'] ?? ''));
    box = segs ? pathRect(segs) : null;
  }
  if (!box) return false;
  const tol = 0.01 * Math.max(vb[2], vb[3]);
  return (
    box.x <= vb[0] + tol &&
    box.y <= vb[1] + tol &&
    box.x + box.w >= vb[0] + vb[2] - tol &&
    box.y + box.h >= vb[1] + vb[3] - tol
  );
}

/** A full-page shape painted only in white (fill, stroke or both). */
function isBackground(n: SvgNode, inh: Inherited, vb: ViewBox): boolean {
  const fill = get(inh, 'fill').toLowerCase();
  const stroke = get(inh, 'stroke').toLowerCase();
  if (!PAPER.has(fill) || !PAPER.has(stroke) || (fill === 'none' && stroke === 'none'))
    return false;
  return coversPage(n, vb);
}

/** Drops the white page rectangles drawn before anything else. */
function dropBackground(root: SvgNode, vb: ViewBox): SvgNode {
  let done = false;
  const visit = (n: SvgNode, inh: Inherited): SvgNode | null => {
    if (done) return n;
    const here = inherit(inh, n.attrs);
    if (n.tag === 'g' || n.tag === 'svg') {
      const kids: SvgNode[] = [];
      for (const c of n.children) {
        if (typeof c === 'string') continue;
        const k = visit(c, here);
        if (k) kids.push(k);
      }
      return kids.length === 0 && n.tag === 'g' ? null : el(n.tag, n.attrs, kids);
    }
    if (isBackground(n, here, vb)) return null;
    done = true;
    return n;
  };
  return visit(root, ROOT_INHERITED) ?? el('svg', root.attrs, []);
}

// ---- 3. Text -------------------------------------------------------------

/** Helvetica/Arial advance widths (1/1000 em) for ASCII 32–126. */
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/**
 * Estimated advance width of `s`, user units. Plot fonts are rarely
 * available here, so this is Helvetica's metrics, widened for DejaVu /
 * Verdana (matplotlib's default) and narrowed for serifs; monospace is
 * 0.6 em. Only used to judge gaps between text pieces and to crop.
 */
export function approxTextWidth(s: string, fontSize: number, family = '', bold = false): number {
  const f = family.toLowerCase();
  if (/mono|courier|cousine/.test(f)) return Array.from(s).length * 0.6 * fontSize;
  let em = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    em += (c >= 32 && c <= 126 ? (WIDTHS[c - 32] ?? 556) : 556) / 1000;
  }
  const k = /dejavu|verdana|bitstream/.test(f)
    ? 1.12
    : /serif|times|tinos|roman/.test(f) && !f.includes('sans')
      ? 0.9
      : 1;
  return em * fontSize * k * (bold ? 1.06 : 1);
}

/** Merge a gap of up to this many em; insert a space above `SPACE_GAP`. */
export const MAX_GAP = 0.6;
export const SPACE_GAP = 0.15;
const BASELINE_TOL = 0.1;
const OVERLAP_TOL = 0.3;

interface Piece {
  readonly node: SvgNode;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly text: string;
  readonly key: string;
}

/** The angle of a text's `rotate(angle x y)` about its own position (0 without one), or null. */
function rotation(n: SvgNode, x: number, y: number): number | null {
  const t = n.attrs['transform'];
  if (t === undefined) return 0;
  const r = /^rotate\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)$/.exec(String(t));
  if (!r || Number(r[2]) !== Number(fmt(x)) || Number(r[3]) !== Number(fmt(y))) return null;
  return Number(r[1]);
}

/** A plain one-line text piece (no tspans, start-anchored), or null. */
function piece(n: SvgNode, inh: Inherited): Piece | null {
  if (n.tag !== 'text' || n.children.some((c) => typeof c !== 'string')) return null;
  if (get(inherit(inh, n.attrs), 'text-anchor') !== 'start') return null;
  const x = len(n.attrs['x'] ?? 0);
  const y = len(n.attrs['y'] ?? 0);
  if (x === null || y === null) return null;
  const angle = rotation(n, x, y);
  if (angle === null) return null;
  const text = n.children.filter((c) => typeof c === 'string').join('');
  if (text.trim() === '') return null;
  return {
    node: n,
    x,
    y,
    angle,
    text,
    key: JSON.stringify([without(n.attrs, 'x', 'y', 'transform', ADVANCE_ATTR), angle]),
  };
}

// ---- 3a. Runs of one label (note 15) --------------------------------------

/** The font attributes the runs of one label may differ in. */
const RUN_FONT = ['font-family', 'font-size', 'font-style', 'font-weight'] as const;
/** What the runs of one label may differ in: the font, and the colour (issue 38). */
const RUN_STYLE = [...RUN_FONT, 'fill'] as const;
/** A smaller run (a script) may sit this many em of the label's size off its baseline. */
const SCRIPT_SHIFT = 0.6;

/** One run of a label, in the frame of its first run (user units, down is +v). */
interface Run {
  readonly u: number;
  readonly v: number;
  readonly font: Inherited;
  readonly fs: number;
  readonly text: string;
  /** Estimated advance width. */
  readonly w: number;
}

function makeRun(u: number, v: number, font: Inherited, text: string): Run {
  const fs = len(get(font, 'font-size')) ?? 16;
  const bold = /bold|[6-9]00/.test(get(font, 'font-weight'));
  return { u, v, font, fs, text, w: approxTextWidth(text, fs, get(font, 'font-family'), bold) };
}

/** The run that sets the label's size and baseline: the first of the largest. */
function baseRun(runs: readonly Run[]): Run | null {
  const max = Math.max(...runs.map((r) => r.fs));
  return runs.find((r) => r.fs >= 0.99 * max) ?? null;
}

/**
 * Whether runs read as one line of one label: in order along it, each
 * starting between `OVERLAP_TOL` em before and `MAX_GAP` em after the
 * estimated end of the previous one, full-size runs on the base baseline
 * (within `BASELINE_TOL` em) and smaller ones raised or lowered off it (scripts,
 * by more than that and at most `SCRIPT_SHIFT` em); em of the largest run.
 */
function oneLine(runs: readonly Run[]): boolean {
  const b = baseRun(runs);
  if (!b) return false;
  const em = b.fs;
  let end: number | null = null;
  for (const r of runs) {
    const off = Math.abs(r.v - b.v);
    const full = r.fs >= 0.99 * em;
    if (full ? off > BASELINE_TOL * em : off <= BASELINE_TOL * em || off > SCRIPT_SHIFT * em)
      return false;
    if (end !== null && (r.u - end < -OVERLAP_TOL * em || r.u - end > MAX_GAP * em)) return false;
    end = r.u + r.w;
  }
  return true;
}

/**
 * Each run's text, followed by a space where the gap to the next is wider
 * than `SPACE_GAP` em; never next to a script (the estimate is no judge of the
 * small gaps around one).
 */
function spacedTexts(runs: readonly Run[]): string[] {
  const em = baseRun(runs)?.fs ?? 16;
  const out: string[] = [];
  runs.forEach((r, i) => {
    const prev = runs[i - 1];
    const before = out[i - 1];
    if (
      prev &&
      before !== undefined &&
      Math.abs(r.v - prev.v) <= BASELINE_TOL * em &&
      r.u - (prev.u + prev.w) > SPACE_GAP * em &&
      !/\s$/.test(before) &&
      !/^\s/.test(r.text)
    )
      out[i - 1] = `${before} `;
    out.push(r.text);
  });
  return out;
}

/**
 * One `<text>` for the runs of a label (valid per `oneLine`): at the first
 * run's start on the base run's baseline (`origin` is the first run's start
 * on the page, `angle` the label's), later runs flowing on as tspans with the
 * font attributes and fill that differ from the base run's and a `dy` where the
 * baseline moves, so the label stays joined up and can be anchored as one
 * chunk in any font. `attrs` resolve to the base run's font; `srcEnd` is the
 * source's own extent from the first run's start, when known.
 */
function flowText(
  attrs: Record<string, string | number>,
  runs: readonly Run[],
  origin: readonly [number, number],
  angle: number,
  srcEnd: number | null,
): SvgNode {
  const b = baseRun(runs) ?? runs[0];
  if (!b) return el('text', attrs, []);
  const texts = spacedTexts(runs);
  const kids: (SvgNode | string)[] = [];
  let shift = 0;
  runs.forEach((r, i) => {
    const t = texts[i] ?? r.text;
    const font: Record<string, string> = {};
    for (const k of RUN_STYLE) if (get(r.font, k) !== get(b.font, k)) font[k] = get(r.font, k);
    const off = Number(fmt(r.v - b.v));
    const dy = Number(fmt(off - shift));
    shift = off;
    const last = kids[kids.length - 1];
    if (dy === 0 && Object.keys(font).length === 0 && off === 0) {
      if (typeof last === 'string') kids[kids.length - 1] = last + t;
      else kids.push(t);
      return;
    }
    if (
      dy === 0 &&
      last !== undefined &&
      typeof last !== 'string' &&
      JSON.stringify(without(last.attrs, 'dy')) === JSON.stringify(font)
    ) {
      kids[kids.length - 1] = el('tspan', last.attrs, [...last.children, t]);
      return;
    }
    kids.push(el('tspan', { ...font, ...(dy !== 0 ? { dy: fmt(dy) } : {}) }, [t]));
  });
  const a = (angle * Math.PI) / 180;
  const x = fmt(origin[0] - b.v * Math.sin(a));
  const y = fmt(origin[1] + b.v * Math.cos(a));
  const out: Record<string, string | number> = { ...attrs, x, y };
  if (srcEnd !== null) out[ADVANCE_ATTR] = fmt(srcEnd / b.fs);
  if (angle !== 0) out['transform'] = `rotate(${fmt(angle)} ${x} ${y})`;
  return el('text', out, kids);
}

const POSITIONED_RUN = new Set<string>(['x', 'y', ...RUN_STYLE]);

/**
 * A start-anchored label written as tspans at their own positions (matplotlib
 * mathtext rebuilt from glyph outlines) as one flowing `<text>`, or null when
 * its runs do not read as one line.
 */
function flowPositioned(n: SvgNode, inh: Inherited): SvgNode | null {
  const own = inherit(inh, n.attrs);
  if (get(own, 'text-anchor') !== 'start') return null;
  const tx = len(n.attrs['x'] ?? 0);
  const ty = len(n.attrs['y'] ?? 0);
  if (tx === null || ty === null) return null;
  const angle = rotation(n, tx, ty);
  if (angle === null) return null;
  const spans = n.children.filter((c) => typeof c !== 'string' || c.trim() !== '');
  if (spans.length < 2) return null;
  const runs: Run[] = [];
  let first: readonly [number, number] | null = null;
  for (const c of spans) {
    if (typeof c === 'string' || c.tag !== 'tspan') return null;
    if (c.children.some((k) => typeof k !== 'string')) return null;
    if (Object.keys(c.attrs).some((k) => !POSITIONED_RUN.has(k))) return null;
    const x = len(c.attrs['x']);
    const y = len(c.attrs['y']);
    const text = c.children.filter((k) => typeof k === 'string').join('');
    if (x === null || y === null || text === '') return null;
    first ??= [x, y];
    runs.push(makeRun(x - first[0], y - first[1], inherit(own, c.attrs), text));
  }
  const b = baseRun(runs);
  if (!first || !b || !oneLine(runs)) return null;
  const a = (angle * Math.PI) / 180;
  const [dx, dy] = [first[0] - tx, first[1] - ty];
  const origin = [
    tx + dx * Math.cos(a) - dy * Math.sin(a),
    ty + dx * Math.sin(a) + dy * Math.cos(a),
  ] as const;
  const adv = len(n.attrs[ADVANCE_ATTR]);
  const fs = len(get(own, 'font-size'));
  const srcEnd = adv !== null && fs !== null ? adv * fs - dx : null;
  const attrs = without(n.attrs, 'x', 'y', 'transform', ADVANCE_ATTR);
  for (const k of RUN_STYLE) if (get(b.font, k) !== get(own, k)) attrs[k] = get(b.font, k);
  return flowText(attrs, runs, origin, angle, srcEnd);
}

/**
 * Merges runs of consecutive sibling text pieces that continue one another
 * (`oneLine`): same attributes and angle, apart from a run's font and fill. Pieces
 * of one style become one plain label (a gap wider than `SPACE_GAP` em becomes
 * a space); mixed styles and scripts (a PDF's mathtext) become one flowing
 * label with tspans (`flowText`), as do labels written as positioned tspans.
 * The merged label starts at the first piece's position.
 */
function mergeTexts(n: SvgNode, inh: Inherited): SvgNode {
  if (n.tag !== 'g' && n.tag !== 'svg') return n;
  const here = inherit(inh, n.attrs);
  const out: SvgNode[] = [];
  let run: { readonly p: Piece; readonly r: Run; readonly adv: number | null }[] = [];
  let group = '';
  const flush = (): void => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first && last && run.length === 1) out.push(first.p.node);
    else if (first && last) {
      const runs = run.map((q) => q.r);
      const srcEnd = run.every((q) => q.adv !== null)
        ? last.r.u + (last.adv ?? 0) * last.r.fs
        : null;
      if (run.every((q) => q.p.key === first.p.key)) {
        const attrs = without(first.p.node.attrs, ADVANCE_ATTR);
        if (srcEnd !== null) attrs[ADVANCE_ATTR] = fmt(srcEnd / first.r.fs);
        out.push(el('text', attrs, [spacedTexts(runs).join('')]));
      } else {
        const b = baseRun(runs);
        const base = run.find((q) => q.r === b) ?? first;
        const attrs = without(base.p.node.attrs, 'x', 'y', 'transform', ADVANCE_ATTR);
        out.push(flowText(attrs, runs, [first.p.x, first.p.y], first.p.angle, srcEnd));
      }
    }
    run = [];
  };
  for (const c of n.children) {
    if (typeof c === 'string') continue;
    const p = piece(c, here);
    if (!p) {
      flush();
      out.push((c.tag === 'text' ? flowPositioned(c, here) : null) ?? mergeTexts(c, here));
      continue;
    }
    const font = inherit(here, p.node.attrs);
    const adv = len(p.node.attrs[ADVANCE_ATTR]);
    const g = JSON.stringify([
      without(p.node.attrs, 'x', 'y', 'transform', ADVANCE_ATTR, ...RUN_STYLE),
      p.angle,
    ]);
    const first = run[0];
    if (first && g === group) {
      const a = (first.p.angle * Math.PI) / 180;
      const dx = p.x - first.p.x;
      const dy = p.y - first.p.y;
      const r = makeRun(
        dx * Math.cos(a) + dy * Math.sin(a),
        -dx * Math.sin(a) + dy * Math.cos(a),
        font,
        p.text,
      );
      if (oneLine([...run.map((q) => q.r), r])) {
        run.push({ p, r, adv });
        continue;
      }
    }
    flush();
    run = [{ p, r: makeRun(0, 0, font, p.text), adv }];
    group = g;
  }
  flush();
  return el(n.tag, n.attrs, out);
}

// ---- 3b. Label alignment (note 15) ---------------------------------------

/*
 * matplotlib's path-glyph SVGs and every PDF write labels start-anchored at
 * the left end of the run, so a label drawn in a narrower font (note 14) or
 * restyled loses the centring or right alignment the plot gave it. Each
 * start-anchored label at 0°/90°/180°/270° (`labelText`) is set in its own frame
 * (along the baseline from its start, and up across it, in em) against the
 * straight axis-aligned lines and the shapes around it:
 *
 * - centred: a perpendicular line (a tick) ends within `NEAR` em above or
 *   below the label with its axis at the label's centre, or a parallel
 *   line at least 1.2× as long (a spine, an axis, a bar top, a bracket)
 *   lies within `AXIS_GAP` em above or below with its midpoint there;
 * - right-aligned: a line at the label's height (a tick, a gridline, a
 *   spine) starts within `NEAR` em after its end;
 * - kept start when something drawn at its height ends within `NEAR` em
 *   before its start (a legend handle, a bar, a tick on its left), when both
 *   or neither of the above hold, or when a label kept at start within 3 em
 *   above or below starts where it does but ends elsewhere (a left-aligned
 *   column, such as a legend whose handles are markers).
 *
 * "At the centre/end" allows `TOL` em with the source's exact width (PDF
 * runs and matplotlib glyph positions carry it as `ADVANCE_ATTR`), plus 3 %
 * of the width when only an estimate is known. A centred label is anchored
 * on the line it centres on, a right-aligned one at its source end. The lines
 * of a label of several lines are decided together (`blocks`, `blockAnchors`).
 */
const NEAR = 1.5;
const AXIS_GAP = 6;
const TOL = 0.1;
/** The label's extent across its baseline, in em: descender to cap height. */
const DESC = 0.25;
const ASC = 0.75;
/** The band across the baseline that "at the label's height" means, in em. */
const BAND: readonly [number, number] = [0.1, 0.6];

type Seg2 = readonly [number, number, number, number];

/** Straight edges of a drawn leaf, page coordinates, axis-aligned ones only. */
function straightEdges(n: SvgNode, inh: Inherited): Seg2[] {
  if (get(inh, 'fill') === 'none' && get(inh, 'stroke') === 'none') return [];
  const raw: [number, number, number, number][] = [];
  const chain = (v: readonly number[], closed: boolean): void => {
    for (let i = 0; i + 3 < v.length; i += 2)
      raw.push([v[i] ?? 0, v[i + 1] ?? 0, v[i + 2] ?? 0, v[i + 3] ?? 0]);
    if (closed && v.length >= 6)
      raw.push([v[v.length - 2] ?? 0, v[v.length - 1] ?? 0, v[0] ?? 0, v[1] ?? 0]);
  };
  const g = (k: string): number | null => len(n.attrs[k] ?? 0);
  switch (n.tag) {
    case 'path': {
      let cur: readonly [number, number] | null = null;
      let start: readonly [number, number] | null = null;
      for (const s of parsePath(String(n.attrs['d'] ?? '')) ?? []) {
        if (s.c === 'M') start = cur = [s.p[0], s.p[1]];
        else if (s.c === 'L') {
          if (cur) raw.push([cur[0], cur[1], s.p[0], s.p[1]]);
          cur = [s.p[0], s.p[1]];
        } else if (s.c === 'Z') {
          if (cur && start) raw.push([cur[0], cur[1], start[0], start[1]]);
          cur = start;
        } else cur = [s.p[s.p.length - 2] ?? 0, s.p[s.p.length - 1] ?? 0];
      }
      break;
    }
    case 'line': {
      const [x1, y1, x2, y2] = [g('x1'), g('y1'), g('x2'), g('y2')];
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) raw.push([x1, y1, x2, y2]);
      break;
    }
    case 'polyline':
    case 'polygon':
      chain(numList(n.attrs['points']) ?? [], n.tag === 'polygon');
      break;
    case 'rect': {
      const [x, y, w, h] = [g('x'), g('y'), g('width'), g('height')];
      if (x !== null && y !== null && w !== null && h !== null)
        chain([x, y, x + w, y, x + w, y + h, x, y + h], true);
      break;
    }
    default:
  }
  const m = ownTransform(n);
  const out: Seg2[] = [];
  for (const [a, b, c, d] of raw) {
    const [x0, y0] = apply(m, a, b);
    const [x1, y1] = apply(m, c, d);
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l > 1e-6 && (Math.abs(x1 - x0) < 1e-3 * l || Math.abs(y1 - y0) < 1e-3 * l))
      out.push([x0, y0, x1, y1]);
  }
  return out;
}

interface Label {
  readonly node: SvgNode;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly fs: number;
  /** Width as the source drew it, user units. */
  readonly w: number;
  readonly tol: number;
  /** Font family, style and weight: lines of one label share them (not the colour, issue 38). */
  readonly style: string;
}

const ALONG = (l: Label): readonly [number, number] => {
  const a = (l.angle * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};

/** Page point → [along, up] in the label's frame. */
function local(l: Label, px: number, py: number): [number, number] {
  const [ux, uy] = ALONG(l);
  const dx = px - l.x;
  const dy = py - l.y;
  return [dx * ux + dy * uy, dx * uy - dy * ux];
}

type Anchor = { readonly anchor: 'middle' | 'end'; readonly at: number } | null;

/** An anchor, `'start'` on evidence for start, or `null` when unsure. */
function inferAnchor(l: Label, edges: readonly Seg2[], boxes: readonly Box[]): Anchor | 'start' {
  const { fs, w, tol } = l;
  const mid = w / 2;
  const band = (q0: number, q1: number): boolean => q0 < BAND[1] * fs && q1 > BAND[0] * fs;
  const before = (a: number): boolean => a <= tol && a >= -NEAR * fs;
  // Something drawn at its height ending just before it: a start-anchored label.
  for (const b of boxes) {
    const c = [local(l, b[0], b[1]), local(l, b[2], b[3]), local(l, b[0], b[3])];
    const a1 = Math.max(...c.map((p) => p[0]));
    const q0 = Math.min(...c.map((p) => p[1]));
    const q1 = Math.max(...c.map((p) => p[1]));
    if (band(q0, q1) && before(a1)) return 'start';
  }
  /** Where lines say the centre is, within `tol` of the label's own. */
  const centres: number[] = [];
  let end = false;
  const centreAt = (a: number): void => {
    if (Math.abs(a - mid) <= tol) centres.push(a);
  };
  for (const e of edges) {
    const [p0, p1] = [local(l, e[0], e[1]), local(l, e[2], e[3])];
    const [a0, a1] = [Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0])];
    const [q0, q1] = [Math.min(p0[1], p1[1]), Math.max(p0[1], p1[1])];
    if (q1 - q0 < a1 - a0) {
      // Parallel to the baseline.
      if (band(q0, q1)) {
        if (before(a1)) return 'start';
        if (a0 >= w - tol && a0 <= w + NEAR * fs) end = true;
      } else {
        const gap = q0 >= ASC * fs ? q0 - ASC * fs : -DESC * fs - q0;
        if (gap >= 0 && gap <= AXIS_GAP * fs && a1 - a0 >= 1.2 * w) centreAt((a0 + a1) / 2);
      }
    } else if (band(q0, q1)) {
      // Perpendicular, through the label's height.
      if (before(a0)) return 'start';
      if (a0 >= w - tol && a0 <= w + NEAR * fs) end = true;
    } else {
      // Perpendicular, ending above or below the label: a tick.
      const gap = q0 >= BAND[1] * fs ? q0 - ASC * fs : -DESC * fs - q1;
      if (gap <= NEAR * fs) centreAt(a0);
    }
  }
  // The closest to the label's centre; the first of equals (document order).
  const centre = centres.reduce<number | null>(
    (best, a) => (best === null || Math.abs(a - mid) < Math.abs(best - mid) ? a : best),
    null,
  );
  if (centre !== null && !end) return { anchor: 'middle', at: centre };
  if (end && centre === null) return { anchor: 'end', at: w };
  return null;
}

/**
 * A label stacked above or below `l`, kept at start itself, that starts
 * where `l` does but ends elsewhere: `l` is in a left-aligned column.
 */
function leftColumn(l: Label, all: readonly Label[], kept: ReadonlySet<Label>): boolean {
  return all.some((o) => {
    if (o === l || !kept.has(o) || o.angle !== l.angle || Math.abs(o.fs - l.fs) > 0.01 * l.fs)
      return false;
    const [a, q] = local(l, o.x, o.y);
    const tol = Math.max(l.tol, o.tol);
    return Math.abs(a) <= tol && Math.abs(q) <= 3 * l.fs && Math.abs(o.w - l.w) > 2 * tol;
  });
}

/** Line pitch of a label of several lines, in em: ggplot2's 0.9 to matplotlib's and R's 1.2 and a little more. */
const PITCH: readonly [number, number] = [0.8, 1.45];

/** `b` is the next line of the label `a` ends with: below it, on a pitch, overlapping it. */
function nextLine(a: Label, b: Label): boolean {
  if (a.angle !== b.angle || a.style !== b.style || Math.abs(a.fs - b.fs) > 0.01 * a.fs)
    return false;
  const [along, up] = local(a, b.x, b.y);
  return -up >= PITCH[0] * a.fs && -up <= PITCH[1] * a.fs && along < a.w && along + b.w > 0;
}

/**
 * Labels of several lines (issue 33): runs of consecutive labels (document
 * order), each the next line of the one before.
 */
function blocks(labels: readonly Label[]): Label[][] {
  const out: Label[][] = [];
  for (const l of labels) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && nextLine(prev, l)) last.push(l);
    else out.push([l]);
  }
  return out;
}

const REF = { start: 0, middle: 0.5, end: 1 } as const;

/** The lines' starts, centres or ends line up, within their tolerance. */
function shared(block: readonly Label[], kind: keyof typeof REF): boolean {
  const first = block[0];
  if (!first) return false;
  const at = block.map((l) => {
    const [ux, uy] = ALONG(l);
    const r = REF[kind] * l.w;
    return local(first, l.x + ux * r, l.y + uy * r)[0];
  });
  const tol = kind === 'start' ? TOL * first.fs : Math.max(...block.map((l) => l.tol));
  return Math.max(...at) - Math.min(...at) <= tol;
}

/**
 * One alignment for the lines of a label: start on any line's start evidence;
 * else the one anchor its decided lines agree on when the lines' centres (or
 * ends) line up, on the first decided line's anchor point; start when they
 * line up at their starts instead; otherwise each line as decided alone.
 */
function blockAnchors(block: readonly Label[], own: readonly (Anchor | 'start')[]): Anchor[] {
  const alone = own.map((a) => (a === 'start' ? null : a));
  if (block.length < 2) return alone;
  if (own.includes('start')) return block.map(() => null);
  const decided = own.flatMap((a, i) => (a && a !== 'start' ? [{ a, l: block[i] }] : []));
  const first = decided[0];
  if (!first?.l) return alone;
  const kind = first.a.anchor;
  if (decided.some((d) => d.a.anchor !== kind)) return block.map(() => null);
  if (!shared(block, kind)) return shared(block, 'start') ? block.map(() => null) : alone;
  const [ux, uy] = ALONG(first.l);
  const px = first.l.x + ux * first.a.at;
  const py = first.l.y + uy * first.a.at;
  return block.map((l) => ({ anchor: kind, at: local(l, px, py)[0] }));
}

const FLOW_RUN = new Set<string>(['dy', ...RUN_STYLE]);

/**
 * A start-anchored one-line label at 0° or a `rotate(angle x y)` about its
 * start: plain text, or runs flowing on as tspans that change only the font
 * and the baseline (`flowText`); with the estimate of its width.
 */
function labelText(
  n: SvgNode,
  inh: Inherited,
): { x: number; y: number; angle: number; est: number } | null {
  const own = inherit(inh, n.attrs);
  const width = (s: string, f: Inherited): number =>
    approxTextWidth(
      s,
      len(get(f, 'font-size')) ?? 16,
      get(f, 'font-family'),
      isBold(get(f, 'font-weight')),
    );
  const p = piece(n, inh);
  if (p) return { x: p.x, y: p.y, angle: p.angle, est: width(p.text.trim(), own) };
  if (n.tag !== 'text' || get(own, 'text-anchor') !== 'start') return null;
  const x = len(n.attrs['x'] ?? 0);
  const y = len(n.attrs['y'] ?? 0);
  if (x === null || y === null) return null;
  const angle = rotation(n, x, y);
  if (angle === null) return null;
  let est = 0;
  let text = '';
  for (const c of n.children) {
    if (typeof c === 'string') {
      est += width(c, own);
      text += c;
      continue;
    }
    if (c.tag !== 'tspan' || c.children.some((k) => typeof k !== 'string')) return null;
    if (Object.keys(c.attrs).some((k) => !FLOW_RUN.has(k))) return null;
    const t = c.children.filter((k) => typeof k === 'string').join('');
    est += width(t, inherit(own, c.attrs));
    text += t;
  }
  return text.trim() === '' ? null : { x, y, angle, est };
}

/**
 * Gives plain start-anchored labels the `text-anchor` (and anchor point) the
 * plot laid them out with, and drops the transient `ADVANCE_ATTR`.
 */
function anchorLabels(root: SvgNode, vb: ViewBox): SvgNode {
  const edges: Seg2[] = [];
  const boxes: Box[] = [];
  const labels: Label[] = [];
  const collect = (n: SvgNode, inh: Inherited): void => {
    const here = inherit(inh, n.attrs);
    if (n.tag === 'g' || n.tag === 'svg') {
      for (const c of n.children)
        if (typeof c !== 'string') {
          const p = c.tag === 'text' ? labelText(c, here) : null;
          if (p) {
            const own = inherit(here, c.attrs);
            const fs = len(get(own, 'font-size'));
            const angle = (((Math.round(p.angle * 1000) / 1000) % 360) + 360) % 360;
            if (fs === null || fs <= 0 || angle % 90 !== 0) continue;
            const adv = len(c.attrs[ADVANCE_ATTR]);
            const est = p.est;
            const w = adv !== null && adv > 0 ? adv * fs : est;
            const tol = TOL * fs + (adv !== null && adv > 0 ? 0 : 0.03 * w);
            const style = ['font-family', 'font-style', 'font-weight']
              .map((k) => get(own, k))
              .join('|');
            labels.push({ node: c, x: p.x, y: p.y, angle, fs, w, tol, style });
          } else collect(c, here);
        }
      return;
    }
    if (n.tag === 'text') return;
    edges.push(...straightEdges(n, here));
    const b = leafBox(n, here, vb);
    if (b?.every(Number.isFinite)) boxes.push(b);
  };
  collect(root, ROOT_INHERITED);
  const inferred = labels.map((l) => inferAnchor(l, edges, boxes));
  const kept = new Set(labels.filter((_, i) => typeof inferred[i] !== 'object'));
  const own = new Map(
    labels.map((l, i) => {
      const f = inferred[i] ?? null;
      return [l, f && f !== 'start' && leftColumn(l, labels, kept) ? null : f] as const;
    }),
  );
  const found = new Map<Label, Anchor>();
  for (const b of blocks(labels)) {
    const anchors = blockAnchors(
      b,
      b.map((l) => own.get(l) ?? null),
    );
    for (const [i, l] of b.entries()) found.set(l, anchors[i] ?? null);
  }
  const decided = new Map<SvgNode, SvgNode>();
  for (const l of labels) {
    const f = found.get(l);
    const attrs = without(l.node.attrs, ADVANCE_ATTR);
    if (f) {
      const [ux, uy] = ALONG(l);
      const x = fmt(l.x + ux * f.at);
      const y = fmt(l.y + uy * f.at);
      attrs['x'] = x;
      attrs['y'] = y;
      attrs['text-anchor'] = f.anchor;
      if (attrs['transform'] !== undefined)
        attrs['transform'] = `rotate(${fmt(l.angle > 180 ? l.angle - 360 : l.angle)} ${x} ${y})`;
    }
    decided.set(l.node, el('text', attrs, l.node.children));
  }
  const rebuild = (n: SvgNode): SvgNode => {
    const d = decided.get(n);
    if (d) return d;
    if (n.tag === 'text' && n.attrs[ADVANCE_ATTR] !== undefined)
      return el('text', without(n.attrs, ADVANCE_ATTR), n.children);
    if (!n.children.some((c) => typeof c !== 'string')) return n;
    return el(
      n.tag,
      n.attrs,
      n.children.map((c) => (typeof c === 'string' ? c : rebuild(c))),
    );
  };
  return rebuild(root);
}

// ---- 4. Cropping ---------------------------------------------------------

type Box = [number, number, number, number];

function leafBox(n: SvgNode, inh: Inherited, vb: ViewBox): Box | null {
  const pts: [number, number][] = [];
  const g = (k: string): number => len(n.attrs[k]) ?? 0;
  const stroked = get(inh, 'stroke') !== 'none';
  if (n.tag === 'text') {
    if (get(inh, 'fill') === 'none' && !stroked) return null;
    const fs = len(get(inh, 'font-size')) ?? 16;
    const text = n.children
      .map((c) =>
        typeof c === 'string' ? c : c.children.filter((k) => typeof k === 'string').join(''),
      )
      .join('');
    const w =
      // Measured as drawn: in the bundled font the family maps to (note 14).
      approxTextWidth(
        text,
        fs,
        bundledFont(get(inh, 'font-family')),
        isBold(get(inh, 'font-weight')),
      ) * 1.1;
    const x = numList(n.attrs['x'])?.[0] ?? 0;
    const y = numList(n.attrs['y'])?.[0] ?? 0;
    const x0 =
      get(inh, 'text-anchor') === 'middle'
        ? x - w / 2
        : get(inh, 'text-anchor') === 'end'
          ? x - w
          : x;
    pts.push([x0, y - fs], [x0 + w, y - fs], [x0, y + 0.3 * fs], [x0 + w, y + 0.3 * fs]);
    // Positioned tspans (lists or children) extend the box from their own points.
    for (const c of n.children)
      if (typeof c !== 'string') {
        const xs = numList(c.attrs['x']) ?? [];
        const ys = numList(c.attrs['y']) ?? [];
        for (const tx of xs.length ? xs : [x])
          for (const ty of ys.length ? ys : [y])
            pts.push([tx - w, ty - fs], [tx + w, ty + 0.3 * fs]);
      }
  } else {
    if (get(inh, 'fill') === 'none' && !stroked) return null;
    switch (n.tag) {
      case 'path': {
        const segs = parsePath(String(n.attrs['d'] ?? ''));
        if (segs) pts.push(...pathPoints(segs));
        break;
      }
      case 'rect': {
        const pct = (k: string, full: number): number => {
          const v = n.attrs[k];
          return typeof v === 'string' && v.trim().endsWith('%')
            ? (Number(v.trim().slice(0, -1)) / 100) * full
            : g(k);
        };
        const x = pct('x', vb[2]);
        const y = pct('y', vb[3]);
        pts.push([x, y], [x + pct('width', vb[2]), y + pct('height', vb[3])]);
        break;
      }
      case 'circle':
      case 'ellipse': {
        const rx = n.tag === 'circle' ? g('r') : g('rx');
        const ry = n.tag === 'circle' ? g('r') : g('ry');
        pts.push([g('cx') - rx, g('cy') - ry], [g('cx') + rx, g('cy') + ry]);
        break;
      }
      case 'line':
        pts.push([g('x1'), g('y1')], [g('x2'), g('y2')]);
        break;
      case 'polyline':
      case 'polygon': {
        const v = numList(n.attrs['points']) ?? [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i] ?? 0, v[i + 1] ?? 0]);
        break;
      }
      default:
        return null;
    }
  }
  if (pts.length === 0) return null;
  const pad = stroked && n.tag !== 'text' ? (len(get(inh, 'stroke-width')) ?? 1) : 0;
  const m = ownTransform(n);
  const mapped = pts.flatMap(([x, y]) =>
    [
      [x - pad, y - pad],
      [x + pad, y + pad],
      [x - pad, y + pad],
      [x + pad, y - pad],
    ].map(([px, py]) => apply(m, px ?? 0, py ?? 0)),
  );
  const xs = mapped.map((p) => p[0]);
  const ys = mapped.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Bounds of everything drawn, [x0, y0, x1, y1], or null when nothing is. */
export function contentBounds(root: SvgNode, vb: ViewBox): Box | null {
  let box: Box | null = null;
  const visit = (n: SvgNode, inh: Inherited): void => {
    const here = inherit(inh, n.attrs);
    if (n.tag === 'g' || n.tag === 'svg') {
      for (const c of n.children) if (typeof c !== 'string') visit(c, here);
      return;
    }
    const b = leafBox(n, here, vb);
    if (!b?.every(Number.isFinite)) return;
    box = box
      ? [
          Math.min(box[0], b[0]),
          Math.min(box[1], b[1]),
          Math.max(box[2], b[2]),
          Math.max(box[3], b[3]),
        ]
      : b;
  };
  visit(root, ROOT_INHERITED);
  return box;
}

/** A drawn leaf of a plot: its path of child indices, its ancestors' matrix and its box. */
export interface DrawnLeaf {
  readonly path: readonly number[];
  readonly node: SvgNode;
  /** The accumulated transform of its ancestors (not its own). */
  readonly parent: Matrix;
  /** [x0, y0, x1, y1] in root user units, as cropping measures it (strokes padded). */
  readonly box: readonly [number, number, number, number];
  /** How far the box is padded for its stroke, root user units. */
  readonly pad: number;
}

const GROUPS = new Set(['g', 'svg', 'a', 'switch']);

/** Every leaf that draws something, with its box (ancestor transforms included). */
export function drawnLeaves(
  root: SvgNode,
  vb: ViewBox,
  only?: (n: SvgNode) => boolean,
): DrawnLeaf[] {
  const out: DrawnLeaf[] = [];
  const visit = (n: SvgNode, inh: Inherited, path: readonly number[], m: Matrix): void => {
    n.children.forEach((c, i) => {
      if (typeof c === 'string') return;
      const here = inherit(inh, c.attrs);
      const p = [...path, i];
      if (GROUPS.has(c.tag)) {
        visit(c, here, p, multiply(m, ownTransform(c)));
        return;
      }
      if (only && !only(c)) return;
      const b = leafBox(c, here, vb);
      if (!b?.every(Number.isFinite)) return;
      const corners = [
        apply(m, b[0], b[1]),
        apply(m, b[2], b[1]),
        apply(m, b[0], b[3]),
        apply(m, b[2], b[3]),
      ];
      const xs = corners.map((q) => q[0]);
      const ys = corners.map((q) => q[1]);
      const stroked = c.tag !== 'text' && get(here, 'stroke') !== 'none';
      out.push({
        path: p,
        node: c,
        parent: m,
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        pad: stroked
          ? (len(get(here, 'stroke-width')) ?? 1) * scaleOf(multiply(m, ownTransform(c)))
          : 0,
      });
    });
  };
  visit(root, inherit(ROOT_INHERITED, root.attrs), [], IDENTITY);
  return out;
}

/**
 * The viewBox grown to hold every label (issue 30): restyled or fixed-size
 * text can reach past the margins the plot was cropped to. Never shrinks.
 */
export function viewBoxAroundText(root: SvgNode, vb: ViewBox): ViewBox {
  let [x0, y0, x1, y1] = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
  // Past an edge by more than rounding (cropping rounds boxes out to 0.01).
  const TOL = 0.05;
  for (const l of drawnLeaves(root, vb, (n) => n.tag === 'text')) {
    if (l.box[0] < vb[0] - TOL) x0 = Math.min(x0, Math.floor(l.box[0] * 100) / 100);
    if (l.box[1] < vb[1] - TOL) y0 = Math.min(y0, Math.floor(l.box[1] * 100) / 100);
    if (l.box[2] > vb[0] + vb[2] + TOL) x1 = Math.max(x1, Math.ceil(l.box[2] * 100) / 100);
    if (l.box[3] > vb[1] + vb[3] + TOL) y1 = Math.max(y1, Math.ceil(l.box[3] * 100) / 100);
  }
  if (x0 === vb[0] && y0 === vb[1] && x1 === vb[0] + vb[2] && y1 === vb[1] + vb[3]) return vb;
  return [x0, y0, Number(fmt(x1 - x0)), Number(fmt(y1 - y0))];
}

function crop(root: SvgNode, vb: ViewBox, extra: readonly Box[] = []): ViewBox {
  const b = [contentBounds(root, vb), ...extra].reduce<Box | null>(
    (a, x) =>
      !x
        ? a
        : !a
          ? x
          : [
              Math.min(a[0], x[0]),
              Math.min(a[1], x[1]),
              Math.max(a[2], x[2]),
              Math.max(a[3], x[3]),
            ],
    null,
  );
  if (!b) return vb;
  const x0 = Math.max(vb[0], Math.floor(b[0] * 100) / 100);
  const y0 = Math.max(vb[1], Math.floor(b[1] * 100) / 100);
  const x1 = Math.min(vb[0] + vb[2], Math.ceil(b[2] * 100) / 100);
  const y1 = Math.min(vb[1] + vb[3], Math.ceil(b[3] * 100) / 100);
  if (x1 - x0 < 1 || y1 - y0 < 1) return vb;
  return [x0, y0, Number(fmt(x1 - x0)), Number(fmt(y1 - y0))];
}

// ---- All together --------------------------------------------------------

export function cleanupPlot(
  root: SvgNode,
  viewBox: ViewBox,
  warn?: (message: string) => void,
): { root: SvgNode; viewBox: ViewBox; images: PlotImage[] } {
  const rootInh = inherit(ROOT_INHERITED, root.attrs);
  const cutting: Cutting = { warn: warn ?? (() => undefined), memo: new Map() };
  const flat = el(
    'svg',
    root.attrs,
    root.children.flatMap((c) =>
      typeof c === 'string' ? [] : flatten(c, IDENTITY, rootInh, cutting),
    ),
  );
  const bare = dropBackground(flat, viewBox);
  const boxes = new Map(drawnLeaves(bare, viewBox).map((l) => [l.path.join('.'), l.box]));
  const { root: drawing, images } = takeImages(bare, boxes, warn);
  const merged = anchorLabels(mergeTexts(drawing, ROOT_INHERITED), viewBox);
  const corners = images.map((p): Box => {
    const q = [
      apply(p.matrix, 0, 0),
      apply(p.matrix, 1, 0),
      apply(p.matrix, 0, 1),
      apply(p.matrix, 1, 1),
    ];
    const xs = q.map((c) => c[0]);
    const ys = q.map((c) => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const vb = crop(merged, viewBox, corners);
  return {
    root: el('svg', { ...merged.attrs, viewBox: vb.map(fmt).join(' ') }, merged.children),
    viewBox: vb,
    images,
  };
}
