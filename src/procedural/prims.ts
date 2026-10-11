/**
 * Drawing primitives of procedural kinds (note 04): paths made of
 * subpaths (merged per colour, so 5,000 lipid heads are one `<path>`) and
 * text labels. Render turns them into SvgNodes; "Convert to shapes" turns
 * them into plain objects. Both read the same data, so they agree.
 */
import { oklchToRgb, parseHex, rgbToOklch, toHex } from '@/core/color/color';
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
  /** The bundled monospace face (Cousine) instead of the default sans, for aligned columns. */
  readonly mono?: boolean;
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
 * as path nodes with cubic handles, at most 45° per segment (so handles
 * stay within 3.5% of the radius).
 */
export function arcNodes(cx: number, cy: number, r: number, a0: number, a1: number): PathNode[] {
  const span = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 4) - 1e-9));
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

// Styles (note 58): how a kind draws, as opposed to what. A kind lists the styles it supports;
// its render asks the look for each part's colours and weights instead of branching on the
// style itself. Everything stays in the export subset: flat fills and strokes, no gradients,
// filters or opacity. A new style is one entry in `STYLE_IDS` and `LOOKS`.

/** Every style, in menu order. */
export const STYLE_IDS = ['flat', 'line-art', 'cartoon'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface LookSpec {
  readonly label: string;
  /** Fills: the part's own colour, white paper (line art), or a more saturated version. */
  readonly fill: 'keep' | 'paper' | 'vivid';
  /** Outlines and lines: their own colour, the one ink colour, or a dark shade of the part. */
  readonly edge: 'keep' | 'ink' | 'dark';
  /** Parts whose colour is data (bands, painted wells, marker colonies): kept, ink tints, vivid. */
  readonly mark: 'keep' | 'tint' | 'vivid';
  /** Body outline width as a multiple of the kind's line weight; 0 keeps the kind's own. */
  readonly outline: number;
  /** Outline of fill-only details, × the line weight; 0 leaves them as drawn. */
  readonly detail: number;
  /** Stroke-only parts' width factor. */
  readonly lines: number;
  /** The widest a stroke-only part may be, × the line weight; 0 for no limit. */
  readonly maxLine: number;
  /** Inward edge wobble, as a fraction of the part's half-size; 0 keeps exact geometry. */
  readonly wobble: number;
  /** Decorative part counts are divided by this, their sizes multiplied by `bigger`. */
  readonly fewer: number;
  readonly bigger: number;
  /** A small light arc on the main parts. */
  readonly highlight: boolean;
}

export const LOOKS: Readonly<Record<StyleId, LookSpec>> = {
  flat: {
    label: 'Flat',
    fill: 'keep',
    edge: 'keep',
    mark: 'keep',
    outline: 0,
    detail: 0,
    lines: 1,
    maxLine: 0,
    wobble: 0,
    fewer: 1,
    bigger: 1,
    highlight: false,
  },
  'line-art': {
    label: 'Line art',
    fill: 'paper',
    edge: 'ink',
    mark: 'tint',
    outline: 1,
    detail: 0.6,
    lines: 1,
    maxLine: 1.2,
    wobble: 0,
    fewer: 1,
    bigger: 1,
    highlight: false,
  },
  cartoon: {
    label: 'Cartoon',
    fill: 'vivid',
    edge: 'dark',
    mark: 'vivid',
    outline: 2,
    detail: 0.9,
    lines: 1.5,
    maxLine: 0,
    wobble: 0.035,
    fewer: 3,
    bigger: 1.35,
    highlight: true,
  },
};

/** The one ink colour of line art, and the paper it is drawn on. */
export const INK = '#1a1a1a';
export const PAPER = '#ffffff';

const oklchOf = (hex: string) => {
  const rgb = parseHex(hex);
  return rgb ? rgbToOklch(rgb) : null;
};

/** More saturated, same lightness and hue. */
function vivid(hex: string): string {
  const o = oklchOf(hex);
  if (!o || o.c < 0.02) return hex;
  return toHex(oklchToRgb({ ...o, c: Math.min(0.3, o.c * 1.4 + 0.02) }));
}

/** A dark shade of the colour, for cartoon outlines. */
function dark(hex: string): string {
  const o = oklchOf(hex);
  if (!o) return INK;
  return toHex(oklchToRgb({ l: Math.min(0.4, o.l * 0.5), c: Math.min(0.12, o.c * 0.9), h: o.h }));
}

/** An ink tint as light as the colour: monochrome keeps the order of light and dark. */
function tint(hex: string): string {
  const o = oklchOf(hex);
  return o ? inkAt(Math.min(0.92, Math.max(0, (o.l - 0.3) / 0.65))) : INK;
}

/** Ink thinned towards paper by `t` (0 = ink, 1 = paper). */
function inkAt(t: number): string {
  const ink = parseHex(INK) ?? { r: 0, g: 0, b: 0 };
  return toHex({
    r: ink.r + (1 - ink.r) * t,
    g: ink.g + (1 - ink.g) * t,
    b: ink.b + (1 - ink.b) * t,
  });
}

export interface Look {
  readonly id: StyleId;
  /** Drawn in ink on white paper: a kind with a dark ground (a stained gel) turns it light. */
  readonly onPaper: boolean;
  /** Every part is outlined, even where the kind's own option leaves outlines off. */
  readonly outlines: boolean;
  /** A plain fill's colour (paper in line art). */
  fill(colour: string): string;
  /** A filled part with an outline (a cell, a dish, a nucleus); with no fill, just the outline. */
  body(s: Style): Style;
  /** A small fill-only part (a nucleolus, ribosomes): line art outlines it. */
  detail(s: Style): Style;
  /** A part whose colour is data (a band, a painted well): line art keeps it as an ink tint. */
  mark(s: Style): Style;
  /**
   * Several data colours at once (a plate map): line art spreads the distinct colours evenly
   * over ink tints in their order of lightness, so two colours of equal lightness stay apart.
   */
  marks(colours: readonly string[]): (colour: string) => string;
  /** A stroke-only part (ER, spindle fibres, flagella). */
  line(s: Style): Style;
  text(colour: string): string;
  /** How many of a decorative part to draw (cartoon draws fewer). */
  parts(n: number): number;
  /** Their size factor (cartoon draws them bigger). */
  readonly bigger: number;
  /** The subpath with an organic edge, never outside its own bounds; others unchanged. */
  organic(sub: Sub, seed: number): Sub;
  /** A small light arc inside the upper left of an ellipse, or nothing. */
  highlight(cx: number, cy: number, rx: number, ry: number, fill: string): PathPrim[];
}

const isStyle = (v: unknown): v is StyleId => STYLE_IDS.some((s) => s === v);

/** An ellipse arc as nodes: the unit-circle arc stretched to `rx` × `ry`. */
function ellipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
): PathNode[] {
  const tf = (v: Vec2): Vec2 => ({ x: cx + v.x * rx, y: cy + v.y * ry });
  return arcNodes(0, 0, 1, a0, a1).map((n) => ({
    ...tf(n),
    ...(n.in ? { in: tf(n.in) } : {}),
    ...(n.out ? { out: tf(n.out) } : {}),
  }));
}

/**
 * The look of a style, for a kind whose body outlines are `lw` points wide. An unknown style
 * (or none, as in old objects) is flat, which leaves every part exactly as the kind drew it.
 */
export function lookOf(style: unknown, lw: number): Look {
  const id = isStyle(style) ? style : 'flat';
  const L = LOOKS[id];
  const w = Math.max(0.1, lw);
  const fillOf = (c: string | null | undefined): string | null =>
    c == null ? null : L.fill === 'paper' ? PAPER : L.fill === 'vivid' ? vivid(c) : c;
  const edgeOf = (c: string): string => (L.edge === 'ink' ? INK : L.edge === 'dark' ? dark(c) : c);
  return {
    id,
    onPaper: L.fill === 'paper',
    outlines: L.outline > 0,
    fill: (c) => fillOf(c) ?? c,
    body: (s) => {
      if (L.outline === 0) return s;
      return {
        ...s,
        fill: fillOf(s.fill),
        stroke: edgeOf(s.fill ?? s.stroke ?? INK),
        sw: Math.max(s.sw ?? 0, w) * L.outline,
        join: 'round',
      };
    },
    detail: (s) => {
      if (L.detail === 0) return s;
      return {
        ...s,
        fill: fillOf(s.fill),
        stroke: edgeOf(s.fill ?? s.stroke ?? INK),
        sw: w * L.detail,
      };
    },
    mark: (s) => {
      if (L.mark === 'keep') return s;
      if (L.mark === 'vivid' && s.stroke != null && s.fill != null)
        return {
          ...s,
          fill: vivid(s.fill),
          stroke: dark(s.fill),
          sw: Math.max(s.sw ?? 0, w * L.detail),
        };
      const map = L.mark === 'tint' ? tint : vivid;
      return {
        ...s,
        fill: s.fill == null ? null : map(s.fill),
        stroke: s.stroke == null ? null : map(s.stroke),
      };
    },
    marks: (colours) => {
      if (L.mark === 'keep') return (c) => c;
      if (L.mark === 'vivid') return vivid;
      const distinct = [...new Set(colours)];
      if (distinct.length < 2) return tint;
      const light = (c: string) => oklchOf(c)?.l ?? 0;
      distinct.sort((a, b) => light(b) - light(a) || (a < b ? -1 : 1));
      const at = new Map(distinct.map((c, i) => [c, inkAt(0.7 * (1 - i / (distinct.length - 1)))]));
      return (c) => at.get(c) ?? tint(c);
    },
    line: (s) =>
      L.edge === 'keep' && L.lines === 1
        ? s
        : {
            ...s,
            stroke: s.stroke == null ? null : L.edge === 'ink' ? INK : vivid(s.stroke),
            sw:
              L.maxLine > 0
                ? Math.min((s.sw ?? 0) * L.lines, w * L.maxLine)
                : (s.sw ?? 0) * L.lines,
            cap: 'round',
            join: 'round',
          },
    text: (c) => (L.edge === 'ink' ? INK : c),
    parts: (n) => (L.fewer === 1 || n <= 0 ? n : Math.max(Math.min(n, 2), Math.round(n / L.fewer))),
    bigger: L.bigger,
    // Big parts wobble by at most about an outline's width: hand-drawn, not crumpled.
    organic: (sub, seed) => (L.wobble > 0 ? wobble(sub, L.wobble, seed, w * 1.2) : sub),
    highlight: (cx, cy, rx, ry, fill) => {
      if (!L.highlight || !(rx > 1 && ry > 1)) return [];
      const o = oklchOf(fill);
      const light =
        o === null
          ? PAPER
          : toHex(oklchToRgb({ l: Math.min(0.98, o.l + (1 - o.l) * 0.75), c: o.c * 0.3, h: o.h }));
      const k = 0.7;
      return pathPrim(
        [
          {
            t: 'poly',
            nodes: ellipseArc(cx, cy, rx * k, ry * k, Math.PI * 1.08, Math.PI * 1.4),
            closed: false,
          },
        ],
        { stroke: light, sw: Math.min(rx, ry) * 0.1, cap: 'round' },
      );
    },
  };
}

/** Points along a closed subpath's outline, about `n` per curved segment. */
function outlinePoints(s: Sub, n: number): Vec2[] {
  if (s.t === 'circle') {
    const out: Vec2[] = [];
    for (let i = 0; i < n * 4; i += 1) {
      const a = (i / (n * 4)) * 2 * Math.PI;
      out.push({ x: s.cx + Math.cos(a) * s.r, y: s.cy + Math.sin(a) * s.r });
    }
    return out;
  }
  let nodes: readonly PathNode[];
  if (s.t === 'rect') {
    const r = Math.min(s.rx, s.w / 2, s.h / 2);
    const [x0, y0, x1, y1] = [s.x, s.y, s.x + s.w, s.y + s.h];
    const q = Math.PI / 2;
    nodes =
      r <= 0
        ? [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ]
        : joinNodes(
            arcNodes(x1 - r, y0 + r, r, -q, 0),
            arcNodes(x1 - r, y1 - r, r, 0, q),
            arcNodes(x0 + r, y1 - r, r, q, 2 * q),
            arcNodes(x0 + r, y0 + r, r, 2 * q, 3 * q),
          );
  } else nodes = s.nodes;
  const out: Vec2[] = [];
  const m = nodes.length;
  for (let i = 0; i < m; i += 1) {
    const a = nodes[i];
    const b = nodes[(i + 1) % m];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const p1 = a.out ?? a;
    const p2 = b.in ?? b;
    // Straight sides get points too, so a rectangle can wobble.
    const k = a.out !== undefined || b.in !== undefined ? n : Math.max(2, Math.round(n / 2));
    for (let j = 0; j < k; j += 1) {
      const t = j / k;
      const u = 1 - t;
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
      });
    }
  }
  return out;
}

/** A smooth closed curve through the points (Catmull-Rom as cubics). */
export function smoothLoop(pts: readonly Vec2[]): PathNode[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n] ?? p;
    const b = pts[(i + 1) % n] ?? p;
    const tx = (b.x - a.x) / 6;
    const ty = (b.y - a.y) / 6;
    return { x: p.x, y: p.y, in: { x: p.x - tx, y: p.y - ty }, out: { x: p.x + tx, y: p.y + ty } };
  });
}

/** A seeded phase in 0..2π. */
const phase = (seed: number, k: number): number => {
  const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 * Math.PI;
};

/**
 * A closed subpath with an organic edge: each outline point pulled in towards the centre by up
 * to twice `amount` of the half-size (and twice `most` points), by a few smooth seeded waves of the angle (so concentric parts
 * with one seed wobble alike), then clamped to the original bounds, so it never reaches further
 * than the exact shape. Open or tiny subpaths are kept as they are.
 */
export function wobble(s: Sub, amount: number, seed: number, most = Infinity): Sub {
  if (s.t === 'poly' && (!s.closed || s.nodes.length < 2)) return s;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of primPoints({ kind: 'path', subs: [s], fill: null, stroke: null, sw: 0 })) {
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  const half = Math.min(x1 - x0, y1 - y0) / 2;
  if (!Number.isFinite(half) || half < 1) return s;
  const pts = outlinePoints(s, 6);
  if (pts.length < 6) return s;
  const cx = pts.reduce((v, q) => v + q.x, 0) / pts.length;
  const cy = pts.reduce((v, q) => v + q.y, 0) / pts.length;
  const p1 = phase(seed, 1);
  const p2 = phase(seed, 2);
  const amp = Math.min(half * amount, most);
  const moved = pts.map((q) => {
    const dx = q.x - cx;
    const dy = q.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return q;
    const a = Math.atan2(dy, dx);
    const k = amp * (1 + 0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(5 * a + p2));
    const f = Math.max(0, d - k) / d;
    return { x: cx + dx * f, y: cy + dy * f };
  });
  const cl = (q: Vec2): Vec2 => ({
    x: Math.min(x1, Math.max(x0, q.x)),
    y: Math.min(y1, Math.max(y0, q.y)),
  });
  const nodes = smoothLoop(moved).map((n): PathNode => ({
    ...cl(n),
    ...(n.in ? { in: cl(n.in) } : {}),
    ...(n.out ? { out: cl(n.out) } : {}),
  }));
  return { t: 'poly', nodes, closed: true };
}
