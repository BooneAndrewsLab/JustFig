/**
 * One PDF page → SVG text (note 13), by walking pdf.js's operator list the
 * way its canvas renderer does, but writing elements instead of pixels. The
 * result goes through the same sanitiser and plot cleanup as an SVG file
 * (`importSvgText`), so PDF and SVG plots end up as the same kind of tree.
 *
 * - Paths keep their curves; colours, alpha, widths, caps, joins and dashes
 *   are carried over. Coordinates are baked when the transform is a
 *   similarity; otherwise the element keeps `matrix()` and plot cleanup
 *   decides (a stroked path under a non-uniform scale keeps it).
 * - Clipping is geometric, because the export subset has no `clipPath`:
 *   a rectangular clip (what plots use) is a box; any other clip shape (a
 *   polar plot's circle, a rotated rectangle) is also a `Region`
 *   (`../svg/clipRegion`, issue 25). Subpaths inside the clip are kept as
 *   they are, outside ones dropped, straddling ones flattened and cut.
 * - Text becomes `<text>` with the font's family, weight and style, one
 *   element per run, split where the PDF leaves a gap of more than
 *   `SPLIT_GAP` em (plot cleanup then merges what belongs together); a
 *   smaller gap over `WORD_GAP` em becomes a space. A run
 *   with a glyph that has no Unicode meaning (no ToUnicode entry, private
 *   use, control codes) is drawn as glyph outlines instead, so nothing is
 *   replaced by the wrong letters. Invisible text (OCR layers) is skipped.
 * - Images: a small block image (a heatmap at data resolution, a colour
 *   bar) becomes filled rectangles; any other is written as an `<image>`
 *   whose `href` is `pdf-image:N`, N indexing the returned pixels, which the
 *   caller encodes as PNG (issue 24); import then places it as a picture of
 *   its own under the plot. A rectangular clip crops its pixels; pixels
 *   outside any other clip become see-through. Image masks are left out
 *   and tiling patterns (hatching) become grey, each reported in the warnings.
 * - Shadings (`sh`, and shading patterns as fills; issue 25): axial and
 *   radial ones become bands of flat colour, mesh ones (matplotlib's Gouraud
 *   shading) flat triangles grouped by colour, cut to the clip like paths.
 *
 * Pure: pdf.js is not imported here (it is loaded lazily in `loadPdf.ts`),
 * so the operator codes come in with the input.
 */
import {
  IDENTITY,
  type Matrix,
  apply,
  determinant,
  fmt,
  isAxisAligned,
  isSimilarity,
  matrixString,
  multiply,
  scaleOf,
} from '../svg/matrix';
import {
  type Pt,
  type Region,
  clipLines,
  clipRing as clipRingToRegion,
  curveSteps,
  makeRegion,
  ringsInside,
} from '../svg/clipRegion';
import { fontFromPsName } from '../svg/glyphText';
import { pathRect } from '../svg/pathData';
import { type Shading, averageColour, rasterMesh, readShading, shadingBands } from './shading';
import { ADVANCE_ATTR } from '../svg/plotCleanup';
import type { Pixels } from '../png';
import { boxRing, clipPicture } from '../pictureClip';

export interface PdfOpList {
  readonly fnArray: ArrayLike<number>;
  readonly argsArray: readonly unknown[];
}

/** The parts of a pdf.js font object this module reads. */
export interface PdfFont {
  readonly name?: string | undefined;
  readonly loadedName?: string | undefined;
  readonly fallbackName?: string | undefined;
  readonly bold?: boolean | undefined;
  readonly black?: boolean | undefined;
  readonly italic?: boolean | undefined;
  readonly isType3Font?: boolean | undefined;
  readonly missingFile?: boolean | undefined;
  readonly vertical?: boolean | undefined;
  readonly fontMatrix?: ArrayLike<number> | undefined;
  readonly charProcOperatorList?: ReadonlyMap<string, PdfOpList> | undefined;
}

export interface PdfGlyph {
  readonly unicode: string;
  readonly fontChar: string;
  readonly width: number;
  readonly isSpace: boolean;
  readonly isInFont?: boolean;
  readonly operatorListId?: string | undefined;
  readonly accent?: { fontChar: string; offset: { x: number; y: number } } | null | undefined;
}

export interface PdfPageInput {
  readonly ops: PdfOpList;
  /** pdf.js's `OPS` table: name → code. */
  readonly OPS: Readonly<Record<string, number>>;
  /** Viewport size and transform (PDF user space → SVG user units, y down). */
  readonly width: number;
  readonly height: number;
  readonly viewport: Matrix;
  readonly font: (id: string) => PdfFont | null;
  /** A glyph's outline in em units, y up, as pdf.js draw ops; null when the font has none. */
  readonly glyphPath: (font: PdfFont, fontChar: string) => ArrayLike<number> | null;
  /** A decoded image XObject by id; null when it is not available as pixels. */
  readonly image?: (id: string) => PdfImage | null;
  /** A shading's pdf.js IR (`['RadialAxial', …]`, `['Mesh', …]`) by pattern id. */
  readonly pattern?: (id: string) => unknown;
}

/**
 * pdf.js image data, rows top first: kind 1 is 1 bit grey (rows padded to a
 * byte, a set bit is white), 2 is RGB, 3 is RGBA, 8 bits per channel.
 */
export interface PdfImage {
  readonly width: number;
  readonly height: number;
  readonly kind: number;
  readonly data: ArrayLike<number>;
  /** The PDF asks for smoothing when it is enlarged (`/Interpolate`). */
  readonly interpolate?: boolean | undefined;
}

export interface PdfPageSvg {
  readonly svg: string;
  /** The pictures `<image href="pdf-image:N">` stands for, by N. */
  readonly images: readonly Pixels[];
  /** Where each came from (issue 36): the image's own pixel size, and whether it is all of it. */
  readonly sources: readonly PictureSource[];
  readonly warnings: readonly string[];
}

/** The PDF image a picture was made from: its size, and whether nothing was cut or reduced. */
export interface PictureSource {
  readonly width: number;
  readonly height: number;
  readonly whole: boolean;
}

/** The `href` an `<image>` of `pageToSvg` carries until its pixels are encoded. */
export const PDF_IMAGE_HREF = 'pdf-image:';

/** A gap in a text run wider than this (em) starts a new `<text>`. */
export const SPLIT_GAP = 0.3;
/** …and one wider than this (em) inside a run reads as a space between words. */
export const WORD_GAP = 0.15;
/** Line width 0 means "thinnest possible" in PDF; this is what it becomes, in SVG units. */
const HAIRLINE = 0.33;
/** Images with more pixels than this are not turned into rectangles. */
export const MAX_IMAGE_PIXELS = 512 * 512;
/**
 * …nor are those whose rectangles are smaller than this on average, in
 * square SVG units ((1.5 pt)²): a picture or a layer rasterized at a print
 * resolution, which would become thousands of pixel-sized shapes.
 */
export const MIN_BLOCK_AREA = 4;
/** Pictures with more pixels than this are reduced (a whole-number factor) before storing. */
export const MAX_PICTURE_PIXELS = 2048 * 2048;
/** …nor are those that need more rectangles than this (photographs, smooth gradients). */
export const MAX_IMAGE_RECTS = 4000;
/** A clip shape of more points than this (text outlines…) is taken as its box. */
export const MAX_CLIP_POINTS = 20000;
/** Segments a straddling curve is cut into before clipping. */
const CURVE_STEPS = 16;
const TOL = 1e-3;

type Box = readonly [number, number, number, number]; // x0 y0 x1 y1

interface State {
  ctm: Matrix;
  fill: string;
  stroke: string;
  fillAlpha: number;
  strokeAlpha: number;
  lineWidth: number;
  lineCap: number;
  lineJoin: number;
  miterLimit: number;
  dash: readonly number[];
  dashPhase: number;
  clip: Box | null;
  /** Clip shapes that are not rectangles (all inside `clip`, which is their box). */
  regions: readonly Region[];
  /** The space shading patterns are in: the page's, or a form XObject's. */
  baseCtm: Matrix;
  /** A shading as the fill, in the space `m` maps to the page (`fill` is then its average colour). */
  fillShading: { sh: Shading; m: Matrix } | null;
  font: PdfFont | null;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  renderMode: number;
  textMatrix: Matrix;
  x: number;
  y: number;
  lineX: number;
  lineY: number;
  /** Inside a Type 3 glyph declared with d1: colour operators are ignored. */
  colourLocked: boolean;
}

/** Path segments in absolute coordinates (like pathData's Seg, mutable-free). */
type Seg =
  | { c: 'M' | 'L'; p: [number, number] }
  | { c: 'C'; p: [number, number, number, number, number, number] }
  | { c: 'Q'; p: [number, number, number, number] }
  | { c: 'Z' };

const CAPS = ['butt', 'round', 'square'];
const JOINS = ['miter', 'round', 'bevel'];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** pdf.js draw ops (moveTo 0, lineTo 1, curveTo 2, quadraticCurveTo 3, closePath 4) → segments. */
export function drawOpsToSegs(data: ArrayLike<number>, m: Matrix): Seg[] {
  const out: Seg[] = [];
  const pt = (i: number): [number, number] => apply(m, data[i] ?? 0, data[i + 1] ?? 0);
  for (let i = 0; i < data.length;) {
    switch (data[i++]) {
      case 0:
        out.push({ c: 'M', p: pt(i) });
        i += 2;
        break;
      case 1:
        out.push({ c: 'L', p: pt(i) });
        i += 2;
        break;
      case 2:
        out.push({ c: 'C', p: [...pt(i), ...pt(i + 2), ...pt(i + 4)] });
        i += 6;
        break;
      case 3:
        out.push({ c: 'Q', p: [...pt(i), ...pt(i + 2)] });
        i += 4;
        break;
      case 4:
        out.push({ c: 'Z' });
        break;
      case undefined:
      default:
        return out; // unknown op: stop rather than misread the rest
    }
  }
  return out;
}

const segsToD = (segs: readonly Seg[]): string =>
  segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${s.p.map(fmt).join(' ')}`)).join('');

/** Subpaths: each starts with M (a missing one is supplied from the last point). */
function subpaths(segs: readonly Seg[]): Seg[][] {
  const out: Seg[][] = [];
  let cur: Seg[] = [];
  let last: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  for (const s of segs) {
    if (s.c === 'M') {
      if (cur.length > 0) out.push(cur);
      cur = [s];
      start = s.p;
      last = s.p;
      continue;
    }
    if (cur.length === 0) cur = [{ c: 'M', p: last }];
    cur.push(s);
    if (s.c === 'Z') last = start;
    else last = [s.p[s.p.length - 2] ?? 0, s.p[s.p.length - 1] ?? 0];
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

function segsBox(segs: readonly Seg[]): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of segs) {
    if (s.c === 'Z') continue;
    for (let i = 0; i < s.p.length; i += 2) {
      const x = s.p[i] ?? 0;
      const y = s.p[i + 1] ?? 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

const inside = (b: Box, c: Box): boolean =>
  b[0] >= c[0] - TOL && b[1] >= c[1] - TOL && b[2] <= c[2] + TOL && b[3] <= c[3] + TOL;
const disjoint = (b: Box, c: Box): boolean =>
  b[2] < c[0] - TOL || b[0] > c[2] + TOL || b[3] < c[1] - TOL || b[1] > c[3] + TOL;
const intersect = (a: Box, b: Box): Box => [
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
  Math.min(a[2], b[2]),
  Math.min(a[3], b[3]),
];

/**
 * A subpath as a polyline (curves cut into straight steps: `CURVE_STEPS`, or
 * by their size when `fine`); `closed` when it ends in Z.
 */
function polyline(sub: readonly Seg[], fine = false): { pts: [number, number][]; closed: boolean } {
  const pts: [number, number][] = [];
  let closed = false;
  for (const s of sub) {
    if (s.c === 'Z') {
      closed = true;
      continue;
    }
    if (s.c === 'M' || s.c === 'L') {
      pts.push(s.p);
      continue;
    }
    const [x0, y0] = pts[pts.length - 1] ?? [0, 0];
    let steps = CURVE_STEPS;
    if (fine) {
      let len = 0;
      for (let i = 0, px = x0, py = y0; i < s.p.length; i += 2) {
        len += Math.hypot((s.p[i] ?? 0) - px, (s.p[i + 1] ?? 0) - py);
        px = s.p[i] ?? 0;
        py = s.p[i + 1] ?? 0;
      }
      steps = curveSteps(len);
    }
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      if (s.c === 'C') {
        const [ax, ay, bx, by, cx, cy] = s.p;
        pts.push([
          u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * cx,
          u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * cy,
        ]);
      } else {
        const [ax = 0, ay = 0, cx = 0, cy = 0] = s.p;
        pts.push([
          u * u * x0 + 2 * u * t * ax + t * t * cx,
          u * u * y0 + 2 * u * t * ay + t * t * cy,
        ]);
      }
    }
  }
  return { pts, closed };
}

/** Sutherland–Hodgman: a closed ring cut to a rectangle (exact for fills: the rect is convex). */
export function clipRing(pts: readonly [number, number][], c: Box): [number, number][] {
  let ring = [...pts];
  const edges: [
    (p: [number, number]) => boolean,
    (a: [number, number], b: [number, number]) => [number, number],
  ][] = [
    [(p) => p[0] >= c[0], (a, b) => [c[0], a[1] + ((b[1] - a[1]) * (c[0] - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= c[2], (a, b) => [c[2], a[1] + ((b[1] - a[1]) * (c[2] - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= c[1], (a, b) => [a[0] + ((b[0] - a[0]) * (c[1] - a[1])) / (b[1] - a[1]), c[1]]],
    [(p) => p[1] <= c[3], (a, b) => [a[0] + ((b[0] - a[0]) * (c[3] - a[1])) / (b[1] - a[1]), c[3]]],
  ];
  for (const [isIn, cut] of edges) {
    if (ring.length === 0) break;
    const next: [number, number][] = [];
    for (let i = 0; i < ring.length; i++) {
      const cur = ring[i] ?? [0, 0];
      const prev = ring[(i + ring.length - 1) % ring.length] ?? cur;
      if (isIn(cur)) {
        if (!isIn(prev)) next.push(cut(prev, cur));
        next.push(cur);
      } else if (isIn(prev)) next.push(cut(prev, cur));
    }
    ring = next;
  }
  return ring;
}

/** Liang–Barsky: an open polyline cut to a rectangle, as the visible pieces. */
export function clipPolyline(pts: readonly [number, number][], c: Box): [number, number][][] {
  const pieces: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1] ?? [0, 0];
    const [bx, by] = pts[i] ?? [ax, ay];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let visible = true;
    for (const [p, q] of [
      [-dx, ax - c[0]],
      [dx, c[2] - ax],
      [-dy, ay - c[1]],
      [dy, c[3] - ay],
    ] as const) {
      if (p === 0) {
        if (q < 0) visible = false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!visible || t0 > t1) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      continue;
    }
    const s: [number, number] = [ax + t0 * dx, ay + t0 * dy];
    const e: [number, number] = [ax + t1 * dx, ay + t1 * dy];
    const last = cur[cur.length - 1];
    if (!last || t0 > 0 || Math.abs(last[0] - s[0]) > 1e-9 || Math.abs(last[1] - s[1]) > 1e-9) {
      if (cur.length > 1) pieces.push(cur);
      cur = [s];
    }
    cur.push(e);
    if (t1 < 1) {
      pieces.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

const polyToSegs = (pts: readonly [number, number][], close: boolean): Seg[] => [
  ...pts.map((p, i): Seg => ({ c: i === 0 ? 'M' : 'L', p })),
  ...(close ? [{ c: 'Z' } as Seg] : []),
];

/** Strokes this close (px) to a clip shape's edge count as inside (a grid circle on the rim). */
const LINE_TOL = 0.5;
/** Fills this close to it are kept whole. */
const FILL_TOL = 0.1;

const ringSegs = (ring: readonly Pt[], close: boolean): Seg[] =>
  polyToSegs(
    ring.map((p): [number, number] => [p[0], p[1]]),
    close,
  );

/** Fill subpaths cut to clip shapes, ring by ring (each keeps its winding, so the fill rule holds). */
function cutFill(subs: readonly Seg[][], regions: readonly Region[]): Seg[] {
  const kept: Seg[] = [];
  for (const sub of subs) {
    const b = segsBox(sub);
    if (!b || regions.some((r) => disjoint(b, r.box))) continue;
    const ring = polyline(sub, true).pts;
    if (regions.every((r) => ringsInside([ring], r, FILL_TOL))) {
      kept.push(...sub);
      continue;
    }
    let rings: Pt[][] = [ring];
    for (const r of regions) rings = rings.flatMap((x) => clipRingToRegion(x, r));
    for (const x of rings) kept.push(...ringSegs(x, true));
  }
  return kept;
}

/** Stroke subpaths cut to clip shapes: whole when inside, else the pieces inside. */
function cutStroke(subs: readonly Seg[][], regions: readonly Region[]): Seg[] {
  const kept: Seg[] = [];
  for (const sub of subs) {
    const b = segsBox(sub);
    if (!b || regions.some((r) => disjoint(b, r.box))) continue;
    const { pts, closed } = polyline(sub, true);
    const first = pts[0];
    if (closed && first) pts.push(first);
    if (regions.every((r) => ringsInside([pts], r, LINE_TOL))) {
      kept.push(...sub);
      continue;
    }
    let pieces: Pt[][] = [pts];
    for (const r of regions) pieces = pieces.flatMap((x) => clipLines(x, r, LINE_TOL));
    for (const x of pieces) kept.push(...ringSegs(x, false));
  }
  return kept;
}

/** Glyphs whose text is unknown: nothing, U+FFFD, private use or control codes. */
export function unmappable(unicode: string): boolean {
  if (unicode === '') return true;
  for (const ch of unicode) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfffd || (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000) return true;
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return true;
  }
  return false;
}

/** Font name as written in the PDF → CSS family, weight and style. */
export function pdfFontStyle(font: PdfFont): { family: string; weight?: string; style?: string } {
  const raw = (font.name ?? '').replace(/^[A-Z]{6}\+/, '');
  const ps = raw.replace(/(?:PSMT|PS|MT)(?=$|-|,)/g, '').replace(/,/g, '-');
  const generic = font.fallbackName ?? 'sans-serif';
  const base =
    ps === ''
      ? { family: generic }
      : /^Symbol$/i.test(ps)
        ? { family: 'Symbol, serif' }
        : fontFromPsName(ps);
  return {
    ...base,
    ...(font.bold === true || font.black === true ? { weight: 'bold' } : {}),
    ...(font.italic === true ? { style: 'italic' } : {}),
  };
}

interface R {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  c: string;
}

function asImage(v: unknown): PdfImage | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Partial<PdfImage>;
  return typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    typeof o.kind === 'number' &&
    o.data &&
    typeof o.data.length === 'number'
    ? (o as PdfImage)
    : null;
}

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/**
 * An image as filled rectangles in its unit square (PDF image space: y up,
 * first row at the top), one path of draw ops per colour: runs of equal
 * pixels along each row, merged with identical runs in the rows below.
 * Null when it is too big or too detailed to be worth it, or not RGB(A).
 */
export function imageRects(img: PdfImage): [string, number, number[]][] | null {
  const { width: w, height: h, kind, data } = img;
  const ch = kind === 2 ? 3 : kind === 3 ? 4 : 0;
  if (ch === 0 || w < 1 || h < 1 || w * h > MAX_IMAGE_PIXELS || data.length < w * h * ch)
    return null;
  const colour = (i: number): string => {
    const a = ch === 4 ? (data[i + 3] ?? 255) : 255;
    return a === 0
      ? ''
      : `#${hex2(data[i] ?? 0)}${hex2(data[i + 1] ?? 0)}${hex2(data[i + 2] ?? 0)}/${String(a)}`;
  };
  // Open rectangles by run key (x0, x1, colour), extended row by row.
  const done: R[] = [];
  let open = new Map<string, R>();
  for (let y = 0; y < h; y++) {
    const next = new Map<string, R>();
    let x = 0;
    while (x < w) {
      const c = colour((y * w + x) * ch);
      let x1 = x + 1;
      while (x1 < w && colour((y * w + x1) * ch) === c) x1++;
      if (c !== '') {
        const key = `${String(x)},${String(x1)},${c}`;
        const r = open.get(key);
        if (r) {
          r.y1 = y + 1;
          open.delete(key);
          next.set(key, r);
        } else next.set(key, { x0: x, x1, y0: y, y1: y + 1, c });
      }
      x = x1;
    }
    done.push(...open.values());
    if (done.length + next.size > MAX_IMAGE_RECTS) return null;
    open = next;
  }
  done.push(...open.values());
  const byColour = new Map<string, number[]>();
  for (const r of done) {
    const ops = byColour.get(r.c) ?? [];
    const [x0, x1] = [r.x0 / w, r.x1 / w];
    const [y0, y1] = [1 - r.y1 / h, 1 - r.y0 / h];
    ops.push(0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4);
    byColour.set(r.c, ops);
  }
  return [...byColour].map(([c, ops]) => {
    const [hex = '#000000', a = '255'] = c.split('/');
    return [hex, Number(a) / 255, ops];
  });
}

/**
 * pdf.js image data as RGB(A) pixels: RGBA only when some pixel is not
 * opaque (an RGB PNG says it has no see-through parts). Null for kinds it
 * does not know or data too short for the size.
 */
export function toPixels(img: PdfImage): Pixels | null {
  const { width: w, height: h, kind, data } = img;
  if (w < 1 || h < 1) return null;
  if (kind === 1) {
    const stride = Math.ceil(w / 8);
    if (data.length < stride * h) return null;
    const out = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bit = ((data[y * stride + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        out.fill(bit ? 255 : 0, (y * w + x) * 3, (y * w + x) * 3 + 3);
      }
    return { width: w, height: h, channels: 3, data: out };
  }
  const ch = kind === 2 ? 3 : kind === 3 ? 4 : 0;
  if (ch === 0 || data.length < w * h * ch) return null;
  let opaque = true;
  if (ch === 4)
    for (let i = 3; i < w * h * 4; i += 4)
      if ((data[i] ?? 255) !== 255) {
        opaque = false;
        break;
      }
  if (ch === 3 || !opaque)
    return {
      width: w,
      height: h,
      channels: ch === 3 ? 3 : 4,
      data: Uint8Array.from({ length: w * h * ch }, (_, i) => data[i] ?? 0),
    };
  const out = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 3) {
    out[j] = data[i] ?? 0;
    out[j + 1] = data[i + 1] ?? 0;
    out[j + 2] = data[i + 2] ?? 0;
  }
  return { width: w, height: h, channels: 3, data: out };
}

/** The pixels averaged over k × k blocks (a partial block at the edges averages what it has). */
export function reducePixels(px: Pixels, k: number): Pixels {
  const ch = px.channels;
  const w = Math.ceil(px.width / k);
  const h = Math.ceil(px.height / k);
  const out = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0, 0];
      let n = 0;
      for (let yy = y * k; yy < Math.min(px.height, (y + 1) * k); yy++)
        for (let xx = x * k; xx < Math.min(px.width, (x + 1) * k); xx++) {
          for (let c = 0; c < ch; c++)
            sum[c] = (sum[c] ?? 0) + (px.data[(yy * px.width + xx) * ch + c] ?? 0);
          n++;
        }
      for (let c = 0; c < ch; c++) out[(y * w + x) * ch + c] = Math.round((sum[c] ?? 0) / n);
    }
  return { width: w, height: h, channels: ch, data: out };
}

/**
 * Image rectangles worth drawing as shapes: their mean area on the page
 * (`scale` square units per unit square) is at least `MIN_BLOCK_AREA`.
 */
export function blocky(
  rects: [string, number, number[]][] | null,
  scale: number,
): [string, number, number[]][] | null {
  if (!rects) return null;
  let n = 0;
  let area = 0;
  for (const [, , ops] of rects)
    for (let i = 0; i + 12 < ops.length; i += 13) {
      n++;
      area += Math.abs(
        ((ops[i + 4] ?? 0) - (ops[i + 1] ?? 0)) * ((ops[i + 8] ?? 0) - (ops[i + 2] ?? 0)),
      );
    }
  return n > 0 && (area * scale) / n >= MIN_BLOCK_AREA ? rects : null;
}

function fresh(viewport: Matrix): State {
  return {
    ctm: viewport,
    fill: '#000000',
    stroke: '#000000',
    fillAlpha: 1,
    strokeAlpha: 1,
    lineWidth: 1,
    lineCap: 0,
    lineJoin: 0,
    miterLimit: 10,
    dash: [],
    dashPhase: 0,
    clip: null,
    regions: [],
    baseCtm: viewport,
    fillShading: null,
    font: null,
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    renderMode: 0,
    textMatrix: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
    colourLocked: false,
  };
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const mat = (v: unknown): Matrix | null => {
  if (v === null || typeof v !== 'object' || !('length' in v)) return null;
  const a = Array.from(v as ArrayLike<unknown>, (x) => num(x, NaN));
  return a.length === 6 && a.every(Number.isFinite) ? (a as unknown as Matrix) : null;
};

export function pageToSvg(input: PdfPageInput): PdfPageSvg {
  const name: Record<number, string> = {};
  for (const [k, v] of Object.entries(input.OPS)) name[v] = k;
  const warnings = new Set<string>();
  const out: string[] = [];
  const images: Pixels[] = [];
  const sources: PictureSource[] = [];
  const stack: State[] = [];
  let st = fresh(input.viewport);
  let pendingClip: 'nonzero' | 'evenodd' | null = null;
  /** The last `<text>` written, so a run that continues it can join it. */
  let lastText: { at: number; tm: Matrix; attrs: string; end: [number, number]; s: string } | null =
    null;
  /** A run, with its advance width (in em, from the PDF's own widths) for plot cleanup. */
  const textElement = (tm: Matrix, attrs: string, s: string, end: [number, number]): string => {
    const [ox, oy] = apply(tm, 0, 0);
    const em2 = tm[0] * tm[0] + tm[1] * tm[1];
    const adv = em2 > 0 ? ((end[0] - ox) * tm[0] + (end[1] - oy) * tm[1]) / em2 : 0;
    return `<text transform="${matrixString(tm)}" font-size="1" ${attrs} ${ADVANCE_ATTR}="${fmt(adv)}">${esc(s)}</text>`;
  };

  const paintAttrs = (fill: boolean, stroke: boolean, evenOdd: boolean, m: Matrix): string => {
    const a: string[] = [];
    a.push(`fill="${fill ? st.fill : 'none'}"`);
    if (fill && st.fillAlpha < 1) a.push(`fill-opacity="${fmt(st.fillAlpha)}"`);
    if (fill && evenOdd) a.push('fill-rule="evenodd"');
    if (!stroke) return a.join(' ');
    // In the element's own units: `m` is what is left for it to carry (identity when baked).
    const k = scaleOf(st.ctm) / (scaleOf(m) || 1);
    const w = st.lineWidth > 0 ? st.lineWidth * k : HAIRLINE / (scaleOf(m) || 1);
    a.push(`stroke="${st.stroke}"`, `stroke-width="${fmt(w)}"`);
    if (st.strokeAlpha < 1) a.push(`stroke-opacity="${fmt(st.strokeAlpha)}"`);
    if (st.lineCap > 0) a.push(`stroke-linecap="${CAPS[st.lineCap] ?? 'butt'}"`);
    if (st.lineJoin > 0) a.push(`stroke-linejoin="${JOINS[st.lineJoin] ?? 'miter'}"`);
    if (st.lineJoin === 0 && st.miterLimit !== 4)
      a.push(`stroke-miterlimit="${fmt(Math.max(1, st.miterLimit))}"`);
    if (st.dash.length > 0 && st.dash.some((d) => d > 0)) {
      a.push(`stroke-dasharray="${st.dash.map((d) => fmt(d * k)).join(' ')}"`);
      if (st.dashPhase !== 0) a.push(`stroke-dashoffset="${fmt(st.dashPhase * k)}"`);
    }
    return a.join(' ');
  };

  /** Paints path data (user space under `ctm`), with the current clip applied. */
  const paint = (
    data: ArrayLike<number>,
    ctm: Matrix,
    fill: boolean,
    stroke: boolean,
    evenOdd: boolean,
  ) => {
    if (fill && st.fill === 'none') fill = false;
    if (stroke && st.stroke === 'none') stroke = false;
    if (!fill && !stroke) return;
    const segs = drawOpsToSegs(data, ctm);
    const box = segsBox(segs);
    if (!box) return;
    const clip = st.clip;
    if (clip && disjoint(box, clip)) return;
    const regions = st.regions;
    if (fill && st.fillShading) {
      shade(st.fillShading.sh, st.fillShading.m, subpaths(segs), evenOdd);
      if (!stroke) return;
      fill = false;
    }
    const whole =
      (!clip || inside(box, clip)) &&
      regions.every((r) => ringsInside([boxRing(box)], r, FILL_TOL));
    if (whole) {
      if (isSimilarity(ctm) || !stroke) {
        out.push(`<path d="${segsToD(segs)}" ${paintAttrs(fill, stroke, evenOdd, IDENTITY)}/>`);
      } else {
        // Plot cleanup keeps the matrix on a stroke it cannot bake exactly.
        const local = drawOpsToSegs(data, IDENTITY);
        out.push(
          `<path d="${segsToD(local)}" transform="${matrixString(ctm)}" ${paintAttrs(fill, stroke, evenOdd, ctm)}/>`,
        );
      }
      return;
    }
    // Straddles the clip: keep whole subpaths inside, drop outside ones, cut the rest.
    const subs = subpaths(segs);
    const boxed = !clip || inside(box, clip);
    if (fill) {
      let kept: Seg[] = [];
      if (boxed) kept = segs.slice();
      else
        for (const sub of subs) {
          const b = segsBox(sub);
          if (!b || disjoint(b, clip)) continue;
          if (inside(b, clip)) kept.push(...sub);
          else {
            const ring = clipRing(polyline(sub).pts, clip);
            if (ring.length >= 3) kept.push(...polyToSegs(ring, true));
          }
        }
      if (regions.length > 0) kept = cutFill(subpaths(kept), regions);
      if (kept.length > 0)
        out.push(`<path d="${segsToD(kept)}" ${paintAttrs(true, false, evenOdd, IDENTITY)}/>`);
    }
    if (stroke) {
      let kept: Seg[] = [];
      if (boxed) kept = segs.slice();
      else
        for (const sub of subs) {
          const b = segsBox(sub);
          if (!b || disjoint(b, clip)) continue;
          if (inside(b, clip)) {
            kept.push(...sub);
            continue;
          }
          const { pts, closed } = polyline(sub);
          const first = pts[0];
          if (closed && first) pts.push(first);
          for (const piece of clipPolyline(pts, clip)) kept.push(...polyToSegs(piece, false));
        }
      if (regions.length > 0) kept = cutStroke(subpaths(kept), regions);
      if (kept.length > 0)
        out.push(`<path d="${segsToD(kept)}" ${paintAttrs(false, true, false, IDENTITY)}/>`);
    }
  };

  /**
   * A shading painted under the current clip (and inside `shape`, the
   * subpaths of a path it fills): its bands, each cut like a filled path.
   */
  const shade = (sh: Shading, m: Matrix, shape: readonly Seg[][] | null, evenOdd: boolean) => {
    if (!isFinite(determinant(m)) || determinant(m) === 0) return;
    let clip: Box = st.clip ?? [0, 0, input.width, input.height];
    const regions = [...st.regions];
    const narrow = (rings: Pt[][], eo: boolean, b: Box) => {
      if (rings.length === 1 && pathRect(ringSegs(rings[0] ?? [], true)) !== null) {
        clip = intersect(clip, b);
        return;
      }
      const r = makeRegion(rings, eo);
      if (r) {
        regions.push(r);
        clip = intersect(clip, r.box);
      } else clip = [0, 0, 0, 0];
    };
    if (shape) {
      const b = segsBox(shape.flat());
      if (!b) return;
      narrow(
        shape.map((sub) => polyline(sub, true).pts),
        evenOdd,
        b,
      );
    }
    if (sh.bbox) {
      const ring = boxRing(sh.bbox).map(([x, y]) => apply(m, x, y));
      const b = segsBox(ringSegs(ring, true));
      if (b) narrow([ring], false, b);
    }
    if (clip[2] <= clip[0] || clip[3] <= clip[1]) return;
    stack.push(st);
    st = { ...st, clip, regions, fillShading: null };
    if (sh.kind === 'mesh') {
      // Smooth in two directions: a picture, cropped and masked like any other.
      const r = rasterMesh(sh, m, clip);
      if (r) {
        const [x0, y0, x1, y1] = r.box;
        st.ctm = [x1 - x0, 0, 0, y0 - y1, x0, y1];
        picture({ width: r.px.width, height: r.px.height, kind: 3, data: r.px.data });
      }
      st = stack.pop() ?? st;
      return;
    }
    const bands = shadingBands(sh, m, clip, st.fillAlpha >= 1);
    for (const band of bands) {
      st.fill = band.colour;
      const ops: number[] = [];
      for (const ring of band.rings) {
        ring.forEach(([x, y], i) => ops.push(i === 0 ? 0 : 1, x, y));
        ops.push(4);
      }
      paint(ops, IDENTITY, true, false, band.evenOdd);
    }
    st = stack.pop() ?? st;
  };

  /**
   * An image as a picture: an `<image>` over its unit square (PDF puts the
   * first row at the top, y = 1), its pixels cropped to a rectangular clip
   * when it is axis-aligned, reduced when huge, and handed back to be encoded.
   */
  const picture = (img: PdfImage) => {
    const decoded = toPixels(img);
    if (!decoded) {
      warnings.add('A picture in an unsupported format was left out.');
      return;
    }
    // Unit square with y down (row 0 at the top) → SVG units.
    const cut = clipPicture(decoded, multiply(st.ctm, [1, 0, 0, -1, 0, 1]), st.clip, st.regions);
    if (!cut) return;
    let { px } = cut;
    const { m } = cut;
    if (px.width * px.height > MAX_PICTURE_PIXELS) {
      px = reducePixels(px, Math.ceil(Math.sqrt((px.width * px.height) / MAX_PICTURE_PIXELS)));
      warnings.add('A very large picture was stored at a lower resolution.');
    }
    const opacity = st.fillAlpha < 1 ? ` opacity="${fmt(st.fillAlpha)}"` : '';
    out.push(
      `<image x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="${matrixString(m)}"${opacity} href="${PDF_IMAGE_HREF}${String(images.length)}"/>`,
    );
    images.push(px);
    sources.push({ width: decoded.width, height: decoded.height, whole: px === decoded });
  };

  /**
   * A clip path (user space under the CTM) → the new clip: a box for a
   * rectangle, else also a clip shape (its box narrows the clip box).
   */
  const setClip = (data: ArrayLike<number>, evenOdd: boolean) => {
    const segs = drawOpsToSegs(data, st.ctm);
    const box = segsBox(segs);
    if (!box) {
      st.clip = [0, 0, 0, 0];
      return;
    }
    if (!(isAxisAligned(st.ctm) && pathRect(segs) !== null)) {
      const rings = subpaths(segs).map((sub) => polyline(sub, true).pts);
      if (rings.reduce((n, r) => n + r.length, 0) > MAX_CLIP_POINTS)
        warnings.add('A very detailed clipping shape was approximated by a rectangle.');
      else {
        const region = makeRegion(rings, evenOdd);
        if (!region) {
          st.clip = [0, 0, 0, 0];
          return;
        }
        st.regions = [...st.regions, region];
      }
    }
    st.clip = st.clip ? intersect(st.clip, box) : box;
  };

  const textAttrs = (font: PdfFont): string => {
    const f = pdfFontStyle(font);
    const mode = st.renderMode & 3;
    const fills = mode === 0 || mode === 2;
    const strokes = mode === 1 || mode === 2;
    const a = [`font-family="${esc(f.family)}"`];
    if (f.weight) a.push(`font-weight="${f.weight}"`);
    if (f.style) a.push(`font-style="${f.style}"`);
    a.push(`fill="${fills ? st.fill : 'none'}"`);
    if (fills && st.fillAlpha < 1) a.push(`fill-opacity="${fmt(st.fillAlpha)}"`);
    if (strokes) {
      a.push(
        `stroke="${st.stroke}"`,
        `stroke-width="${fmt(st.lineWidth > 0 ? st.lineWidth / Math.max(st.fontSize, 1e-6) : 0.02)}"`,
      );
      if (st.strokeAlpha < 1) a.push(`stroke-opacity="${fmt(st.strokeAlpha)}"`);
    }
    return a.join(' ');
  };

  /** Runs a Type 3 glyph's own operator list under `m` (glyph space → SVG). */
  const type3Glyph = (list: PdfOpList, m: Matrix, depth: number) => {
    if (depth > 4) return;
    stack.push(st);
    const locked = list.fnArray[0] === input.OPS['setCharWidthAndBounds'];
    st = { ...st, ctm: m, colourLocked: st.colourLocked || locked, dash: [...st.dash] };
    if (list.fnArray[0] === input.OPS['setCharWidth']) {
      st.fillAlpha = 1;
      st.strokeAlpha = 1;
    }
    run(list, depth + 1);
    st = stack.pop() ?? st;
  };

  const showText = (glyphs: readonly unknown[], depth: number) => {
    const font = st.font;
    if (!font || st.fontSize === 0) return;
    if ((st.renderMode & 3) === 3) {
      advance(glyphs, font); // invisible (an OCR layer): nothing to draw
      return;
    }
    if (font.vertical === true) warnings.add('Vertical text was laid out horizontally.');
    const fm = font.fontMatrix ? Array.from(font.fontMatrix) : [0.001, 0, 0, 0.001, 0, 0];
    const fm0 = fm[0] ?? 0.001;
    const size = st.fontSize;
    const dir = size < 0 ? -1 : 1;
    const absSize = Math.abs(size);
    const h = st.hScale * dir;
    const runStart = multiply(st.ctm, multiply(st.textMatrix, [1, 0, 0, 1, st.x, st.y + st.rise]));
    // One letter with no known meaning and the whole run is drawn as shapes.
    const asShapes = glyphs.some(
      (g) =>
        typeof g === 'object' &&
        g !== null &&
        (g as PdfGlyph).isInFont !== false &&
        !(g as PdfGlyph).isSpace &&
        unmappable((g as PdfGlyph).unicode),
    );
    const mode = st.renderMode & 3;
    const fills = mode === 0 || mode === 2;
    const strokes = mode === 1 || mode === 2;
    // Pieces: x offset (text units before horizontal scaling) and their string.
    const pieces: { x: number; end: number; s: string }[] = [];
    let piece: { x: number; end: number; s: string } | null = null;
    let x = 0;
    for (const g of glyphs) {
      if (typeof g === 'number') {
        x += (-g * absSize) / 1000;
        if (Math.abs(g) / 1000 > SPLIT_GAP && piece) {
          pieces.push(piece);
          piece = null;
        } else if (-g / 1000 > WORD_GAP && piece && !piece.s.endsWith(' ')) {
          piece.s += ' '; // a word gap written as an offset, not a space
        }
        continue;
      }
      if (typeof g !== 'object' || g === null) continue;
      const glyph = g as PdfGlyph;
      const spacing = (glyph.isSpace ? st.wordSpacing : 0) + st.charSpacing;
      if (asShapes) {
        const gm = multiply(runStart, [h, 0, 0, dir, x * h, 0]);
        const em = multiply(gm, [absSize, 0, 0, absSize, 0, 0]);
        if (font.isType3Font === true) {
          const list = glyph.operatorListId
            ? font.charProcOperatorList?.get(glyph.operatorListId)
            : undefined;
          if (list) type3Glyph(list, multiply(em, fm as unknown as Matrix), depth);
        } else if (glyph.isInFont !== false && !glyph.isSpace) {
          const path = input.glyphPath(font, glyph.fontChar);
          if (path && path.length > 0) paint(path, em, fills, strokes, false);
          else warnings.add('Some letters could not be read from their font and were left out.');
          if (glyph.accent) {
            const ap = input.glyphPath(font, glyph.accent.fontChar);
            const am = multiply(em, [1, 0, 0, 1, glyph.accent.offset.x, glyph.accent.offset.y]);
            if (ap && ap.length > 0) paint(ap, am, fills, strokes, false);
          }
        }
      } else {
        piece ??= { x, end: x, s: '' };
        piece.s += glyph.isSpace && glyph.unicode === '' ? ' ' : glyph.unicode;
      }
      x += glyph.width * fm0 * absSize + spacing * dir;
      if (piece) piece.end = x;
    }
    if (piece) pieces.push(piece);
    if (asShapes)
      warnings.add('Text whose letters have no known meaning was kept as letter shapes.');
    for (const p of pieces) {
      const lead = p.s.length - p.s.trimStart().length;
      const s = p.s.trim().replace(/\s+/g, ' ');
      if (s === '') continue;
      // Leading spaces: start where the first visible letter does (a space is ~0.28 em).
      const tm = multiply(runStart, [
        h * absSize,
        0,
        0,
        -dir * absSize,
        (p.x + lead * 0.278 * absSize) * h,
        0,
      ]);
      const [ox, oy] = apply(tm, 0, 0);
      const c = st.clip;
      const pad = absSize * scaleOf(st.ctm) * 4;
      if (c && (ox < c[0] - pad || ox > c[2] + pad || oy < c[1] - pad || oy > c[3] + pad)) continue;
      const attrs = textAttrs(font);
      const end = apply(multiply(runStart, [h, 0, 0, dir, p.end * h, 0]), 0, 0);
      const em = Math.hypot(tm[0], tm[1]);
      const prev = lastText;
      if (prev?.at === out.length - 1 && prev.attrs === attrs && em > 0) {
        // Continues the previous run on the same baseline (matplotlib writes a
        // non-ASCII letter such as − as a run of its own): one label, not two.
        const sameLinear = [0, 1, 2, 3].every(
          (k) => Math.abs((prev.tm[k] ?? 0) - (tm[k] ?? 0)) < 1e-6 * em,
        );
        const dx = ox - prev.end[0];
        const dy = oy - prev.end[1];
        const along = (dx * tm[0] + dy * tm[1]) / em / em;
        const across = Math.abs(dx * tm[1] - dy * tm[0]) / em / em;
        if (sameLinear && across < 0.1 && along > -0.1 && along < SPLIT_GAP) {
          prev.s += (along > WORD_GAP ? ' ' : '') + s;
          prev.end = end;
          out[prev.at] = textElement(prev.tm, attrs, prev.s, end);
          continue;
        }
      }
      lastText = { at: out.length, tm, attrs, end, s };
      out.push(textElement(tm, attrs, s, end));
    }
    st.x += x * st.hScale;
  };

  /** Moves the text position past glyphs without drawing them. */
  const advance = (glyphs: readonly unknown[], font: PdfFont) => {
    const fm0 = font.fontMatrix?.[0] ?? 0.001;
    const absSize = Math.abs(st.fontSize);
    let x = 0;
    for (const g of glyphs) {
      if (typeof g === 'number') x += (-g * absSize) / 1000;
      else if (typeof g === 'object' && g !== null) {
        const glyph = g as PdfGlyph;
        x += glyph.width * fm0 * absSize + (glyph.isSpace ? st.wordSpacing : 0) + st.charSpacing;
      }
    }
    st.x += x * st.hScale;
  };

  const run = (list: PdfOpList, depth: number) => {
    const { fnArray, argsArray } = list;
    for (let i = 0; i < fnArray.length; i++) {
      const op = name[fnArray[i] ?? -1] ?? '';
      const args = (argsArray[i] ?? []) as unknown[];
      switch (op) {
        case 'save':
        case 'beginGroup':
          stack.push(st);
          st = { ...st };
          break;
        case 'restore':
        case 'endGroup':
          st = stack.pop() ?? st;
          break;
        case 'paintFormXObjectBegin': {
          stack.push(st);
          st = { ...st };
          const m = mat(args[0]);
          if (m) st.ctm = multiply(st.ctm, m);
          st.baseCtm = st.ctm;
          const bb = args[1];
          if (bb && typeof bb === 'object' && 'length' in bb) {
            const [x0, y0, x1, y1] = Array.from(bb as ArrayLike<number>);
            setClip(
              [
                0,
                num(x0),
                num(y0),
                1,
                num(x1),
                num(y0),
                1,
                num(x1),
                num(y1),
                1,
                num(x0),
                num(y1),
                4,
              ],
              false,
            );
          }
          break;
        }
        case 'paintFormXObjectEnd':
          st = stack.pop() ?? st;
          break;
        case 'transform': {
          const m = mat(args);
          if (m) st.ctm = multiply(st.ctm, m);
          break;
        }
        case 'setLineWidth':
          st.lineWidth = Math.abs(num(args[0], 1));
          break;
        case 'setLineCap':
          st.lineCap = num(args[0]);
          break;
        case 'setLineJoin':
          st.lineJoin = num(args[0]);
          break;
        case 'setMiterLimit':
          st.miterLimit = num(args[0], 10);
          break;
        case 'setDash':
          st.dash = Array.from((args[0] ?? []) as ArrayLike<number>, (d) => Math.abs(num(d)));
          st.dashPhase = num(args[1]);
          break;
        case 'setGState':
          for (const entry of (args[0] ?? []) as [string, unknown][]) {
            const [key, value] = entry;
            if (key === 'LW') st.lineWidth = Math.abs(num(value, 1));
            else if (key === 'LC') st.lineCap = num(value);
            else if (key === 'LJ') st.lineJoin = num(value);
            else if (key === 'ML') st.miterLimit = num(value, 10);
            else if (key === 'D' && Array.isArray(value)) {
              st.dash = Array.from((value[0] ?? []) as ArrayLike<number>, (d) => Math.abs(num(d)));
              st.dashPhase = num(value[1]);
            } else if (key === 'CA') st.strokeAlpha = num(value, 1);
            else if (key === 'ca') st.fillAlpha = num(value, 1);
            else if (key === 'Font' && Array.isArray(value)) {
              st.font = input.font(String(value[0]));
              st.fontSize = num(value[1]);
            } else if (key === 'SMask' && value) warnings.add('Soft masks were ignored.');
            else if (key === 'BM' && value !== 'source-over' && value)
              warnings.add('Blend modes were ignored.');
          }
          break;
        case 'setFillRGBColor':
          if (!st.colourLocked) {
            st.fill = typeof args[0] === 'string' ? args[0] : '#000000';
            st.fillShading = null;
          }
          break;
        case 'setStrokeRGBColor':
          if (!st.colourLocked) st.stroke = typeof args[0] === 'string' ? args[0] : '#000000';
          break;
        case 'setFillTransparent':
          if (!st.colourLocked) {
            st.fill = 'none';
            st.fillShading = null;
          }
          break;
        case 'setStrokeTransparent':
          if (!st.colourLocked) st.stroke = 'none';
          break;
        case 'setFillColorN':
        case 'setStrokeColorN': {
          if (st.colourLocked) break;
          const fills = op === 'setFillColorN';
          // ['Shading', id, matrix]: the pattern's space is the page's (or form's) own.
          const sh =
            args[0] === 'Shading' && typeof args[1] === 'string'
              ? readShading(input.pattern?.(args[1]))
              : null;
          if (!sh) warnings.add('Hatching and other pattern fills became grey.');
          const colour = sh ? averageColour(sh) : '#808080';
          if (fills) {
            st.fill = colour;
            st.fillShading = sh ? { sh, m: multiply(st.baseCtm, mat(args[2]) ?? IDENTITY) } : null;
          } else {
            st.stroke = colour;
            if (sh) warnings.add('Gradient lines became their average colour.');
          }
          break;
        }
        case 'clip':
          pendingClip = 'nonzero';
          break;
        case 'eoClip':
          pendingClip = 'evenodd';
          break;
        case 'constructPath': {
          const paintOp = name[num(args[0], -1)] ?? '';
          const data = (Array.isArray(args[1]) ? args[1][0] : null) as ArrayLike<number> | null;
          const path = data ?? [];
          const isClip = pendingClip;
          pendingClip = null;
          switch (paintOp) {
            case 'stroke':
            case 'closeStroke':
              paint(path, st.ctm, false, true, false);
              break;
            case 'fill':
            case 'rawFillPath':
              paint(path, st.ctm, true, false, false);
              break;
            case 'eoFill':
              paint(path, st.ctm, true, false, true);
              break;
            case 'fillStroke':
            case 'closeFillStroke':
              paint(path, st.ctm, true, true, false);
              break;
            case 'eoFillStroke':
            case 'closeEOFillStroke':
              paint(path, st.ctm, true, true, true);
              break;
            default:
              break;
          }
          if (isClip) setClip(path, isClip === 'evenodd');
          break;
        }
        case 'beginText':
          st.textMatrix = IDENTITY;
          st.x = st.lineX = st.y = st.lineY = 0;
          break;
        case 'setFont':
          st.font = input.font(String(args[0]));
          st.fontSize = num(args[1]);
          break;
        case 'setCharSpacing':
          st.charSpacing = num(args[0]);
          break;
        case 'setWordSpacing':
          st.wordSpacing = num(args[0]);
          break;
        case 'setHScale':
          st.hScale = num(args[0], 100) / 100;
          break;
        case 'setLeading':
          st.leading = -num(args[0]);
          break;
        case 'setTextRise':
          st.rise = num(args[0]);
          break;
        case 'setTextRenderingMode':
          st.renderMode = num(args[0]);
          break;
        case 'moveText':
          st.x = st.lineX += num(args[0]);
          st.y = st.lineY += num(args[1]);
          break;
        case 'setLeadingMoveText':
          st.leading = num(args[1]);
          st.x = st.lineX += num(args[0]);
          st.y = st.lineY += num(args[1]);
          break;
        case 'nextLine':
          st.x = st.lineX;
          st.y = st.lineY += st.leading;
          break;
        case 'setTextMatrix': {
          const m = mat(Array.isArray(args[0]) || ArrayBuffer.isView(args[0]) ? args[0] : args);
          if (m) st.textMatrix = m;
          st.x = st.lineX = st.y = st.lineY = 0;
          break;
        }
        case 'showText':
          showText((args[0] ?? []) as unknown[], depth);
          break;
        case 'paintSolidColorImageMask':
          paint([0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 4], st.ctm, true, false, false);
          break;
        case 'paintImageXObject':
        case 'paintInlineImageXObject': {
          const img =
            op === 'paintInlineImageXObject'
              ? asImage(args[0])
              : typeof args[0] === 'string'
                ? (input.image?.(args[0]) ?? null)
                : null;
          if (!img) {
            warnings.add('A picture that could not be read was left out.');
            break;
          }
          // Blocks of colour big on the page become shapes, crisp in every export, unless
          // the PDF asks for them to be smoothed.
          const rects =
            img.interpolate === true
              ? null
              : blocky(imageRects(img), Math.abs(determinant(st.ctm)));
          if (!rects) {
            picture(img);
            break;
          }
          for (const [colour, alpha, data] of rects) {
            stack.push(st);
            st = { ...st, fill: colour, fillShading: null, fillAlpha: alpha * st.fillAlpha };
            paint(data, st.ctm, true, false, false);
            st = stack.pop() ?? st;
          }
          break;
        }
        case 'paintInlineImageXObjectGroup':
        case 'paintImageXObjectRepeat':
          warnings.add('Repeated pictures were left out.');
          break;
        case 'paintImageMaskXObject':
        case 'paintImageMaskXObjectGroup':
        case 'paintImageMaskXObjectRepeat':
          warnings.add('Stencil masks (pictures in one colour) were left out.');
          break;
        case 'shadingFill': {
          const sh = typeof args[0] === 'string' ? readShading(input.pattern?.(args[0])) : null;
          if (sh) shade(sh, st.ctm, null, false);
          else warnings.add('A gradient that could not be read was left out.');
          break;
        }
        default:
          break;
      }
    }
  };

  run(input.ops, 0);
  const w = fmt(input.width);
  const h = fmt(input.height);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${out.join('')}</svg>`,
    images,
    sources,
    warnings: [...warnings],
  };
}
