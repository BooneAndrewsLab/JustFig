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
  /**
   * Fill and stroke opacity below 1 (glow, sheen, translucent colonies): exported as plain
   * `fill-opacity` / `stroke-opacity` presentation attributes, never as group opacity.
   */
  readonly alpha?: number;
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
  readonly alpha?: number;
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
      ...(s.alpha !== undefined && s.alpha < 1 ? { alpha: Math.max(0, s.alpha) } : {}),
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
// filters or masks; translucency only as plain fill/stroke opacity. A new style is one entry in
// `STYLE_IDS` and `LOOKS`.

/** Every style, in menu order. The three micrographs are one family of separate styles. */
export const STYLE_IDS = [
  'flat',
  'line-art',
  'cartoon',
  'textbook',
  'fluorescence',
  'em',
  'brightfield',
  'photo',
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface LookSpec {
  readonly label: string;
  /**
   * Fills: the part's own colour, white paper (line art), more saturated (cartoon), a faint
   * tint on black (fluorescence), grey (EM), or nearly the ground's colour (brightfield).
   */
  readonly fill: 'keep' | 'paper' | 'vivid' | 'dim' | 'grey' | 'pale';
  /**
   * Outlines and lines: their own colour, the one ink colour, a dark shade of the part, a
   * shade darker (textbook), a bright channel colour (fluorescence), EM's dark grey, or a thin
   * brightfield edge.
   */
  readonly edge: 'keep' | 'ink' | 'dark' | 'shade' | 'channel' | 'grey' | 'pale';
  /** Parts whose colour is data (bands, painted wells, marker colonies): kept, ink tints, vivid, … */
  readonly mark: 'keep' | 'tint' | 'vivid' | 'channel' | 'grey' | 'pale';
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
  /** Tone bands (the house icons' offsets: a shade −0.08 and a light +0.10) inside filled parts. */
  readonly tones: boolean;
  /** Body outlines drawn as two lines (a light line down the middle of a wider dark one). */
  readonly double: boolean;
  /** Glow rings round each part (concentric strokes at falling opacity); 0 for none. */
  readonly glow: number;
  /** A light halo just outside each body's edge (brightfield). */
  readonly halo: boolean;
  /** The imaging ground behind the object (micrographs), or null for none. */
  readonly ground: string | null;
  /** The colour DNA is drawn in (DAPI blue in fluorescence), or null for the part's own. */
  readonly dna: string | null;
  /** The kind imitates a photograph of the real thing (petri dish, gel). */
  readonly photo: boolean;
}

const PLAIN = {
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
  tones: false,
  double: false,
  glow: 0,
  halo: false,
  ground: null,
  dna: null,
  photo: false,
} as const satisfies Omit<LookSpec, 'label'>;

export const LOOKS: Readonly<Record<StyleId, LookSpec>> = {
  flat: { ...PLAIN, label: 'Flat' },
  'line-art': {
    ...PLAIN,
    label: 'Line art',
    fill: 'paper',
    edge: 'ink',
    mark: 'tint',
    outline: 1,
    detail: 0.6,
    maxLine: 1.2,
  },
  cartoon: {
    ...PLAIN,
    label: 'Cartoon',
    fill: 'vivid',
    edge: 'dark',
    mark: 'vivid',
    outline: 2,
    detail: 0.9,
    lines: 1.5,
    wobble: 0.035,
    fewer: 3,
    bigger: 1.35,
    highlight: true,
  },
  textbook: {
    ...PLAIN,
    label: 'Textbook',
    edge: 'shade',
    outline: 1.6,
    detail: 0.5,
    lines: 1.1,
    wobble: 0.02,
    tones: true,
    double: true,
  },
  fluorescence: {
    ...PLAIN,
    label: 'Fluorescence micrograph',
    fill: 'dim',
    edge: 'channel',
    mark: 'channel',
    outline: 1,
    glow: 3,
    ground: '#050608',
    dna: '#4f86ff',
  },
  em: {
    ...PLAIN,
    label: 'EM micrograph',
    fill: 'grey',
    edge: 'grey',
    mark: 'grey',
    outline: 1.4,
    detail: 0.5,
    wobble: 0.015,
    double: true,
    ground: '#d6d6d2',
    dna: '#7b7b78',
  },
  brightfield: {
    ...PLAIN,
    label: 'Brightfield micrograph',
    fill: 'pale',
    edge: 'pale',
    mark: 'pale',
    outline: 0.8,
    detail: 0.4,
    lines: 0.8,
    wobble: 0.01,
    halo: true,
    ground: '#e8e4d9',
    dna: '#c9c0c4',
  },
  photo: { ...PLAIN, label: 'Photo', photo: true },
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

/** OKLCH lightness moved by `dl`, hue and chroma kept. */
function shade(hex: string, dl: number): string {
  const o = oklchOf(hex);
  if (!o) return hex;
  return toHex(oklchToRgb({ ...o, l: Math.min(1, Math.max(0, o.l + dl)) }));
}

/** A fluorophore's emission: the colour's hue, bright and saturated (grey stays a bright grey). */
function channel(hex: string): string {
  const o = oklchOf(hex);
  if (!o) return '#e0e0e0';
  if (o.c < 0.03) return toHex(oklchToRgb({ l: 0.86, c: 0, h: 0 }));
  return toHex(oklchToRgb({ l: 0.8, c: 0.19, h: o.h }));
}

/** Out-of-focus background stain on black: the hue, barely there. */
function dim(hex: string): string {
  const o = oklchOf(hex);
  if (!o) return '#101010';
  return toHex(oklchToRgb({ l: 0.2, c: Math.min(0.045, o.c * 0.5), h: o.h }));
}

/** EM contrast: a grey as light as the colour, squeezed into the stained range. */
function grey(hex: string): string {
  const o = oklchOf(hex);
  const l = 0.4 + 0.45 * (o?.l ?? 0.5);
  return toHex(oklchToRgb({ l, c: 0, h: 0 }));
}

const EM_EDGE = '#2e2e2c';
const BF_EDGE = '#6f6a5e';

/** Linear mix of two hex colours. */
function blend(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Brightfield: unstained cells are nearly the ground, a little of their own colour in grey. */
function pale(ground: string, k: number) {
  return (hex: string): string => {
    const o = oklchOf(hex);
    const g = o ? toHex(oklchToRgb({ l: o.l * 0.7, c: o.c * 0.35, h: o.h })) : hex;
    return blend(ground, g, k);
  };
}

/**
 * What a part is, for the styles that draw parts differently: an envelope or compartment
 * (`body`: faint in fluorescence, its edge stained), a stained structure (`organelle`: bright in
 * fluorescence, else a body), a small fill-only part, a data colour, or a stroke-only part.
 */
export type PartRole = 'body' | 'organelle' | 'detail' | 'mark' | 'line';

export interface Look {
  readonly id: StyleId;
  /** Drawn in ink on white paper: a kind with a dark ground (a stained gel) turns it light. */
  readonly onPaper: boolean;
  /** Every part is outlined, even where the kind's own option leaves outlines off. */
  readonly outlines: boolean;
  /** Imitates a photograph (petri dish, gel): the kind draws its photographed look. */
  readonly photo: boolean;
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
  /**
   * A part drawn whole in this style: its colours (as `body`, `detail`, … give them) plus what
   * the style adds round it: tone bands and a double membrane (textbook), glow (fluorescence),
   * a halo (brightfield). `dna` draws it in the style's DNA colour (DAPI blue in fluorescence).
   * Flat, line art and cartoon add nothing: it is `pathPrim(subs, look[role](s))`.
   */
  paint(role: PartRole, subs: readonly Sub[], s: Style, dna?: boolean): PathPrim[];
  /**
   * Just the tone bands (textbook) inside filled subpaths already drawn in `fill`, for parts
   * a kind fills itself (wells); nothing in the other styles.
   */
  tones(subs: readonly Sub[], fill: string, over?: boolean): PathPrim[];
  /** The imaging ground behind the whole object (micrographs), or nothing. */
  ground(w: number, h: number): PathPrim[];
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
export function ellipseArc(
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

/** A subpath's bounding box (of its points and handles). */
function subBox(s: Sub): { x0: number; y0: number; x1: number; y1: number } {
  if (s.t === 'circle') return { x0: s.cx - s.r, y0: s.cy - s.r, x1: s.cx + s.r, y1: s.cy + s.r };
  if (s.t === 'rect') return { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
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
  return { x0, y0, x1, y1 };
}

/**
 * The subpath shrunk by `k` towards the point at (`u`, `v`) of its box (−1..1 from the centre):
 * inside the original for any shape that is convex or star-shaped about that point.
 */
export function shrink(s: Sub, k: number, u: number, v: number): Sub {
  const b = subBox(s);
  const ax = (b.x0 + b.x1) / 2 + (u * (b.x1 - b.x0)) / 2;
  const ay = (b.y0 + b.y1) / 2 + (v * (b.y1 - b.y0)) / 2;
  const tf = (q: Vec2): Vec2 => ({ x: ax + (q.x - ax) * k, y: ay + (q.y - ay) * k });
  if (s.t === 'circle') {
    const c = tf({ x: s.cx, y: s.cy });
    return { t: 'circle', cx: c.x, cy: c.y, r: s.r * k };
  }
  if (s.t === 'rect') {
    const c = tf({ x: s.x, y: s.y });
    return { t: 'rect', x: c.x, y: c.y, w: s.w * k, h: s.h * k, rx: s.rx * k };
  }
  return {
    t: 'poly',
    closed: s.closed,
    nodes: s.nodes.map((n) => ({
      ...tf(n),
      ...(n.in ? { in: tf(n.in) } : {}),
      ...(n.out ? { out: tf(n.out) } : {}),
    })),
  };
}

/**
 * A closed, rounded subpath: tone bands in a square-cornered box would read as a patch. A path
 * counts as rounded when it fills clearly less of its box than a rectangle (an ellipse: 79%).
 */
function closedSub(s: Sub): boolean {
  if (s.t === 'circle') return true;
  if (s.t === 'rect') return s.rx >= Math.min(s.w, s.h) * 0.2;
  if (!s.closed || s.nodes.length < 3) return false;
  const pts = outlinePoints(s, 6);
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a && b) area += a.x * b.y - b.x * a.y;
  }
  const b = subBox(s);
  const box = (b.x1 - b.x0) * (b.y1 - b.y0);
  return box > 0 && Math.abs(area) / 2 < box * 0.9;
}

/**
 * Glow: the subpaths stroked `rings` times, each wider and fainter than the last (widest
 * first), `step` points wider per ring. Plain strokes at falling `stroke-opacity`, so the export
 * stays in the subset where a blur filter would not.
 */
export function glowRings(
  subs: readonly Sub[],
  colour: string,
  sw: number,
  rings: number,
  step: number,
  strength = 1,
): PathPrim[] {
  const out: PathPrim[] = [];
  for (let i = rings; i >= 1; i -= 1)
    out.push(
      ...pathPrim(subs, {
        stroke: colour,
        sw: sw + 2 * i * step,
        alpha: Math.min(1, (0.34 / (i + 0.4)) * strength),
        join: 'round',
        cap: 'round',
      }),
    );
  return out;
}

/** More subpaths than this in one part get no glow, bands or halo: the render stays bounded. */
const DECOR_MAX = 400;

/**
 * The look of a style, for a kind whose body outlines are `lw` points wide. An unknown style
 * (or none, as in old objects) is flat, which leaves every part exactly as the kind drew it.
 */
export function lookOf(style: unknown, lw: number): Look {
  const id = isStyle(style) ? style : 'flat';
  const L = LOOKS[id];
  const w = Math.max(0.1, lw);
  const ground = L.ground ?? PAPER;
  const fillMap = (c: string): string => {
    switch (L.fill) {
      case 'paper':
        return PAPER;
      case 'vivid':
        return vivid(c);
      case 'dim':
        return dim(c);
      case 'grey':
        return grey(c);
      case 'pale':
        return pale(ground, 0.22)(c);
      case 'keep':
        return c;
    }
  };
  const fillOf = (c: string | null | undefined): string | null => (c == null ? null : fillMap(c));
  const edgeOf = (c: string): string => {
    switch (L.edge) {
      case 'ink':
        return INK;
      case 'dark':
        return dark(c);
      case 'shade':
        return shade(c, -0.12);
      case 'channel':
        return channel(c);
      case 'grey':
        return EM_EDGE;
      case 'pale':
        return BF_EDGE;
      case 'keep':
        return c;
    }
  };
  const markOf = (c: string): string => {
    switch (L.mark) {
      case 'tint':
        return tint(c);
      case 'vivid':
        return vivid(c);
      case 'channel':
        return channel(c);
      case 'grey':
        return shade(grey(c), -0.18);
      case 'pale':
        return pale(ground, 0.5)(c);
      case 'keep':
        return c;
    }
  };
  const body = (s: Style): Style => {
    if (L.outline === 0) return s;
    return {
      ...s,
      fill: fillOf(s.fill),
      // Line art and cartoon edge a part in its own fill's colour; the others keep its outline's.
      stroke: edgeOf(
        L.edge === 'ink' || L.edge === 'dark'
          ? (s.fill ?? s.stroke ?? INK)
          : (s.stroke ?? s.fill ?? INK),
      ),
      sw: Math.max(s.sw ?? 0, w) * L.outline,
      join: 'round',
    };
  };
  /** A stained structure: bright in fluorescence, a darker grey in EM, else a body. */
  function organelle(s: Style): Style {
    if (L.fill === 'dim') {
      const c = s.fill ?? s.stroke ?? '#999999';
      return { ...s, fill: s.fill == null ? null : channel(c), stroke: null, sw: 0 };
    }
    if (L.fill === 'grey') {
      const b = body(s);
      return { ...b, fill: b.fill == null ? null : shade(b.fill, -0.12) };
    }
    if (L.fill === 'pale') {
      const b = body(s);
      return { ...b, fill: s.fill == null ? null : pale(ground, 0.4)(s.fill) };
    }
    return body(s);
  }
  const detail = (s: Style): Style => {
    // Small parts are stained structures in fluorescence: bright on the black.
    if (L.fill === 'dim') return organelle(s);
    if (L.detail === 0) return s;
    return {
      ...s,
      fill: fillOf(s.fill),
      stroke: edgeOf(s.fill ?? s.stroke ?? INK),
      sw: w * L.detail,
    };
  };
  const mark = (s: Style): Style => {
    if (L.mark === 'keep') return s;
    if (L.mark === 'vivid' && s.stroke != null && s.fill != null)
      return {
        ...s,
        fill: vivid(s.fill),
        stroke: dark(s.fill),
        sw: Math.max(s.sw ?? 0, w * L.detail),
      };
    return {
      ...s,
      fill: s.fill == null ? null : markOf(s.fill),
      stroke: s.stroke == null ? null : markOf(s.stroke),
    };
  };
  const line = (s: Style): Style => {
    if (L.edge === 'keep' && L.lines === 1) return s;
    const stroke =
      s.stroke == null
        ? null
        : L.edge === 'ink'
          ? INK
          : L.edge === 'dark'
            ? vivid(s.stroke)
            : L.edge === 'shade'
              ? s.stroke
              : L.edge === 'channel'
                ? channel(s.stroke)
                : L.edge === 'grey'
                  ? shade(grey(s.stroke), -0.25)
                  : pale(ground, 0.55)(s.stroke);
    return {
      ...s,
      stroke,
      sw: L.maxLine > 0 ? Math.min((s.sw ?? 0) * L.lines, w * L.maxLine) : (s.sw ?? 0) * L.lines,
      cap: 'round',
      join: 'round',
    };
  };
  const mapped = (role: PartRole, s: Style): Style =>
    role === 'body'
      ? body(s)
      : role === 'organelle'
        ? organelle(s)
        : role === 'detail'
          ? detail(s)
          : role === 'mark'
            ? mark(s)
            : line(s);
  /** The base tone and a light band over a shade (the part itself drawn a shade darker). */
  const bands = (subs: readonly Sub[], f: string): PathPrim[] => {
    const closed = subs.filter(closedSub);
    return [
      ...pathPrim(
        closed.map((x) => shrink(x, 0.86, -0.45, -0.5)),
        { fill: f },
      ),
      ...pathPrim(
        closed.map((x) => shrink(x, 0.42, -0.62, -0.68)),
        { fill: shade(f, 0.1) },
      ),
    ];
  };
  const plain = !L.tones && !L.double && L.glow === 0 && !L.halo && L.dna === null;
  const paint = (role: PartRole, subs: readonly Sub[], s: Style, dna = false): PathPrim[] => {
    if (subs.length === 0) return [];
    if (plain) return pathPrim(subs, mapped(role, s));
    let m = mapped(role, s);
    if (dna && L.dna !== null) {
      const d = L.dna;
      const glowing = L.fill === 'dim';
      m = {
        ...m,
        fill: m.fill == null ? null : d,
        stroke:
          m.stroke == null
            ? null
            : role === 'line'
              ? glowing
                ? channel(d)
                : shade(d, -0.2)
              : glowing
                ? null
                : m.stroke,
      };
    }
    const few = subs.length <= DECOR_MAX;
    const out: PathPrim[] = [];
    const stroked = m.stroke != null && (m.sw ?? 0) > 0;
    // Before: glow round bright parts, a halo round brightfield edges.
    if (L.glow > 0 && few) {
      const c = stroked ? m.stroke : m.fill;
      const isLine = role === 'line';
      if (c != null && (stroked || role !== 'body' || dna))
        out.push(
          ...glowRings(
            subs,
            c,
            stroked ? (m.sw ?? 0) : 0,
            isLine ? 2 : L.glow,
            Math.max(w * 0.9, (m.sw ?? 0) * 0.8),
            isLine ? 0.6 : 1,
          ),
        );
    }
    if (L.halo && few && stroked && role !== 'line' && role !== 'mark')
      out.push(
        ...pathPrim(subs, { stroke: PAPER, sw: (m.sw ?? 0) * 4, alpha: 0.55, join: 'round' }),
      );
    // Tone bands sit between the fill and the outline, so the outline stays whole on top.
    const banded =
      L.tones &&
      few &&
      m.fill != null &&
      role !== 'line' &&
      role !== 'mark' &&
      subs.every(closedSub);
    if (!banded) out.push(...pathPrim(subs, m));
    else {
      const f = m.fill ?? PAPER;
      out.push(...pathPrim(subs, { ...m, fill: shade(f, -0.08), stroke: null, sw: 0 }));
      out.push(...bands(subs, f));
      if (stroked) out.push(...pathPrim(subs, { ...m, fill: null }));
    }
    // After: the light line down the middle of a double membrane.
    if (L.double && few && stroked && role === 'body') {
      const base = m.fill ?? s.stroke ?? PAPER;
      out.push(
        ...pathPrim(subs, {
          stroke: L.fill === 'grey' ? shade(base, 0.12) : shade(base, 0.06),
          sw: (m.sw ?? 0) * 0.34,
          join: 'round',
        }),
      );
    }
    return out;
  };
  return {
    id,
    onPaper: L.fill === 'paper',
    outlines: L.outline > 0,
    photo: L.photo,
    fill: (c) => fillOf(c) ?? c,
    body,
    detail,
    mark,
    marks: (colours) => {
      if (L.mark === 'keep') return (c) => c;
      if (L.mark !== 'tint') return markOf;
      const distinct = [...new Set(colours)];
      if (distinct.length < 2) return tint;
      const light = (c: string) => oklchOf(c)?.l ?? 0;
      distinct.sort((a, b) => light(b) - light(a) || (a < b ? -1 : 1));
      const at = new Map(distinct.map((c, i) => [c, inkAt(0.7 * (1 - i / (distinct.length - 1)))]));
      return (c) => at.get(c) ?? tint(c);
    },
    line,
    text: (c) => (L.edge === 'ink' ? INK : L.fill === 'dim' ? '#e8e8e8' : c),
    paint,
    // `over`: only the bands, over a part already drawn (and outlined) in `fill`.
    tones: (subs, f, over = false) => {
      const first = subs[0];
      if (!L.tones || !first || subs.length > (over ? DECOR_MAX : 2000)) return [];
      // One kind of part at a time: the first says whether it is rounded enough for bands.
      if (!closedSub(first)) return [];
      return over
        ? bands(subs, f)
        : [...pathPrim(subs, { fill: shade(f, -0.08) }), ...bands(subs, f)];
    },
    ground: (gw, gh) =>
      L.ground === null || !(gw > 0 && gh > 0)
        ? []
        : pathPrim([rect(0, 0, gw, gh)], { fill: L.ground }),
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
