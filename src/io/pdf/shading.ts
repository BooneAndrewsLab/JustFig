/**
 * PDF shadings as flat-colour shapes (issue 25, note 13): the export subset
 * has no gradients, so a shading becomes shapes of plain colour that
 * `pageToSvg` then cuts to the clip like any path.
 *
 * - Axial and radial shadings become bands: up to `MAX_BANDS`, about one per
 *   `BAND_STEP` levels of the largest colour change, neighbours of equal
 *   colour merged. An axial band is a strip across the axis; a radial one a
 *   disc, painted from the largest down so each covers the middle of the one
 *   before (no hairline seams), or a ring when the fill is see-through. The
 *   ends extend (`/Extend`) as pdf.js encodes them: in its colour stops, a
 *   stop of `transparent` where the shading does not extend.
 * - Mesh shadings (types 4–7, and type 1, which pdf.js turns into a mesh;
 *   matplotlib's Gouraud shading) are smooth in two directions, which bands
 *   cannot follow: they are drawn as pixels (`MESH_SCALE` per page unit) and
 *   become a picture, like a rasterized layer.
 *
 * Pure: the shading arrives as pdf.js's IR (`page.objs`).
 */
import { type Box, type Pt, curveSteps } from '../svg/clipRegion';
import { type Matrix, apply, invert, scaleOf } from '../svg/matrix';
import type { Pixels } from '../png';

export const MAX_BANDS = 64;
/** Colour levels (of 255) one band may span. */
export const BAND_STEP = 4;

type Stop = readonly [number, string];

export type Shading =
  | {
      readonly kind: 'axial' | 'radial';
      readonly stops: readonly Stop[];
      readonly p0: Pt;
      readonly p1: Pt;
      readonly r0: number;
      readonly r1: number;
      readonly bbox: Box | null;
    }
  | {
      readonly kind: 'mesh';
      readonly pos: ArrayLike<number>;
      readonly col: ArrayLike<number>;
      readonly count: number;
      readonly bbox: Box | null;
    };

/** One flat-colour shape: rings in page space and their fill rule. */
export interface Band {
  readonly colour: string;
  readonly rings: Pt[][];
  readonly evenOdd: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pair = (v: unknown): Pt | null => {
  if (!Array.isArray(v) && !ArrayBuffer.isView(v)) return null;
  const a = Array.from(v as ArrayLike<unknown>, num);
  const [x, y] = a;
  return a.length >= 2 && x != null && y != null ? [x, y] : null;
};
const box = (v: unknown): Box | null => {
  if (!Array.isArray(v) && !ArrayBuffer.isView(v)) return null;
  const a = Array.from(v as ArrayLike<unknown>, num);
  const [x0, y0, x1, y1] = a;
  return a.length === 4 && x0 != null && y0 != null && x1 != null && y1 != null
    ? [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
    : null;
};
const HEX = /^#[0-9a-f]{6}$/i;

/** pdf.js's shading IR → a shading; null for one this cannot draw. */
export function readShading(ir: unknown): Shading | null {
  if (!Array.isArray(ir)) return null;
  const a = ir as unknown[];
  if (a[0] === 'RadialAxial' && (a[1] === 'axial' || a[1] === 'radial')) {
    const stops: Stop[] = [];
    if (Array.isArray(a[3]))
      for (const s of a[3] as unknown[]) {
        if (!Array.isArray(s)) continue;
        const t = num(s[0]);
        const c: unknown = s[1];
        if (t != null && typeof c === 'string' && (HEX.test(c) || c === 'transparent'))
          stops.push([t, c.toLowerCase()]);
      }
    const p0 = pair(a[4]);
    const p1 = pair(a[5]);
    if (stops.length === 0 || !p0 || !p1) return null;
    stops.sort((x, y) => x[0] - y[0]);
    const r0 = Math.max(0, num(a[6]) ?? 0);
    const r1 = Math.max(0, num(a[7]) ?? 0);
    if (a[1] === 'radial' && r0 === 0 && r1 === 0) return null;
    return { kind: a[1], stops, p0, p1, r0, r1, bbox: box(a[2]) };
  }
  if (a[0] === 'Mesh') {
    const pos = a[2];
    const col = a[3];
    const count = num(a[4]) ?? 0;
    if (!ArrayBuffer.isView(pos) || !ArrayBuffer.isView(col) || count < 3) return null;
    const p = pos as unknown as ArrayLike<number>;
    const c = col as unknown as ArrayLike<number>;
    if (p.length < count * 2 || c.length < count * 4) return null;
    return { kind: 'mesh', pos: p, col: c, count: count - (count % 3), bbox: box(a[6]) };
  }
  return null;
}

type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const hex2 = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
const toHex = (c: RGB): string => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;

/** The colour at t (stops padded beyond their ends); null where it is see-through. */
export function colourAt(stops: readonly Stop[], t: number): RGB | null {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return null;
  if (t <= first[0]) return first[1] === 'transparent' ? null : rgb(first[1]);
  if (t >= last[0]) return last[1] === 'transparent' ? null : rgb(last[1]);
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    const a = stops[i - 1];
    if (!a || !b || t > b[0]) continue;
    if (a[1] === 'transparent' || b[1] === 'transparent') return null;
    const u = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
    const ca = rgb(a[1]);
    const cb = rgb(b[1]);
    return [ca[0] + u * (cb[0] - ca[0]), ca[1] + u * (cb[1] - ca[1]), ca[2] + u * (cb[2] - ca[2])];
  }
  return null;
}

/** The shading's average colour (over t, or over the mesh's vertices). */
export function averageColour(sh: Shading): string {
  const sum = [0, 0, 0];
  let n = 0;
  if (sh.kind === 'mesh') {
    for (let i = 0; i < sh.count; i++)
      for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + (sh.col[i * 4 + k] ?? 0);
    n = sh.count;
  } else
    for (let i = 0; i <= 64; i++) {
      const c = colourAt(sh.stops, i / 64);
      if (!c) continue;
      for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + (c[k] ?? 0);
      n++;
    }
  return n === 0 ? '#808080' : toHex([(sum[0] ?? 0) / n, (sum[1] ?? 0) / n, (sum[2] ?? 0) / n]);
}

/** Bands over [ta, tb]: about one per BAND_STEP levels of colour change, equal neighbours merged. */
function bands(stops: readonly Stop[], ta: number, tb: number): [number, number, RGB | null][] {
  // How far the channel that changes most travels over [ta, tb].
  const travel = [0, 0, 0];
  let prev = colourAt(stops, ta);
  for (let i = 1; i <= 256; i++) {
    const c = colourAt(stops, ta + ((tb - ta) * i) / 256);
    if (c && prev)
      for (let k = 0; k < 3; k++)
        travel[k] = (travel[k] ?? 0) + Math.abs((c[k] ?? 0) - (prev[k] ?? 0));
    prev = c;
  }
  const n = Math.min(MAX_BANDS, Math.max(1, Math.ceil(Math.max(...travel) / BAND_STEP)));
  const out: [number, number, RGB | null][] = [];
  for (let k = 0; k < n; k++) {
    const t0 = ta + ((tb - ta) * k) / n;
    const t1 = ta + ((tb - ta) * (k + 1)) / n;
    const c = colourAt(stops, (t0 + t1) / 2);
    const last = out[out.length - 1];
    if (last && sameColour(last[2], c)) last[1] = t1;
    else out.push([t0, t1, c]);
  }
  return out;
}

const sameColour = (a: RGB | null, b: RGB | null): boolean =>
  a === b || (!!a && !!b && toHex(a) === toHex(b));

/** A circle (shading space) as a ring in page space. */
function circle(m: Matrix, c: Pt, r: number): Pt[] {
  const n = Math.min(256, Math.max(16, curveSteps(r * scaleOf(m) * 1.65) * 4));
  return Array.from({ length: n }, (_, i) =>
    apply(
      m,
      c[0] + r * Math.cos((2 * Math.PI * i) / n),
      c[1] + r * Math.sin((2 * Math.PI * i) / n),
    ),
  );
}

const boxRing = (b: Box): Pt[] => [
  [b[0], b[1]],
  [b[2], b[1]],
  [b[2], b[3]],
  [b[0], b[3]],
];

/**
 * The shading (in the space `m` maps to the page) as flat-colour shapes
 * covering `target` (page space), in painting order. `opaque`: the fill has
 * no alpha, so bands may overlap where that hides seams.
 */
export function shadingBands(
  sh: Exclude<Shading, { kind: 'mesh' }>,
  m: Matrix,
  target: Box,
  opaque: boolean,
): Band[] {
  const inv = invert(m);
  const corners = boxRing(target).map(([x, y]) => apply(inv, x, y));
  const out: Band[] = [];
  const push = (c: RGB | null, rings: Pt[][], evenOdd = false) => {
    if (c) out.push({ colour: toHex(c), rings, evenOdd });
  };
  const first = sh.stops[0]?.[0] ?? 0;
  const last = sh.stops[sh.stops.length - 1]?.[0] ?? 1;
  if (sh.kind === 'axial') {
    const [x0, y0] = sh.p0;
    const dx = sh.p1[0] - x0;
    const dy = sh.p1[1] - y0;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return [];
    const len = Math.sqrt(l2);
    const ts = corners.map(([x, y]) => ((x - x0) * dx + (y - y0) * dy) / l2);
    const ss = corners.map(([x, y]) => ((x - x0) * -dy + (y - y0) * dx) / len);
    const tmin = Math.min(...ts);
    const tmax = Math.max(...ts);
    const smin = Math.min(...ss) - 1;
    const smax = Math.max(...ss) + 1;
    const at = (t: number, s: number): Pt =>
      apply(m, x0 + t * dx - (s * dy) / len, y0 + t * dy + (s * dx) / len);
    const pieces: [number, number, RGB | null][] = [];
    if (tmin < 0) pieces.push([tmin, 0, colourAt(sh.stops, first - 1)]);
    const ta = Math.max(0, tmin);
    const tb = Math.min(1, tmax);
    if (ta < tb) pieces.push(...bands(sh.stops, ta, tb));
    if (tmax > 1) pieces.push([1, tmax, colourAt(sh.stops, last + 1)]);
    // Each strip reaches half a unit (page) into the next, which is painted over it.
    const overlap = opaque ? 0.5 / (len * (scaleOf(m) || 1)) : 0;
    pieces.forEach(([t0, t1, c], i) => {
      const e = i + 1 < pieces.length ? Math.min(overlap, (t1 - t0) / 2) : 0;
      push(c, [[at(t0, smin), at(t1 + e, smin), at(t1 + e, smax), at(t0, smax)]]);
    });
    return out;
  }
  // Radial: discs (or rings) by decreasing radius, t running from the smaller circle out.
  const swapped = sh.r1 < sh.r0;
  const [c0, c1, r0, r1] = swapped ? [sh.p1, sh.p0, sh.r1, sh.r0] : [sh.p0, sh.p1, sh.r0, sh.r1];
  const centre = (t: number): Pt => [c0[0] + t * (c1[0] - c0[0]), c0[1] + t * (c1[1] - c0[1])];
  const radius = (t: number): number => r0 + t * (r1 - r0);
  const nested = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) + r0 <= r1 + 1e-9;
  const outerEnd = colourAt(sh.stops, swapped ? first - 1 : last + 1);
  const innerEnd = colourAt(sh.stops, swapped ? last + 1 : first - 1);
  if (nested && outerEnd)
    push(outerEnd, opaque ? [boxRing(target)] : [boxRing(target), circle(m, c1, r1)], !opaque);
  const inT = bands(sh.stops, 0, 1);
  const pieces = swapped
    ? inT.map(([t0, t1, c]): [number, number, RGB | null] => [1 - t1, 1 - t0, c]).reverse()
    : inT;
  for (let i = pieces.length - 1; i >= 0; i--) {
    const [t0, t1, c] = pieces[i] ?? [0, 0, null];
    const ring = circle(m, centre(t1), radius(t1));
    // A ring when see-through, or where nothing is painted inside it.
    const hole = (!opaque || (i === 0 && !innerEnd)) && radius(t0) > 0;
    push(c, hole ? [ring, circle(m, centre(t0), radius(t0))] : [ring], hole);
  }
  if (innerEnd && r0 > 0) push(innerEnd, [circle(m, c0, r0)]);
  return out;
}

/** Pixels per page unit a mesh is drawn at, and the most pixels it may take. */
export const MESH_SCALE = 2;
export const MAX_MESH_PIXELS = 1024 * 1024;

/**
 * A mesh shading drawn as pixels over `target` (page space), each pixel the
 * colour interpolated across the triangle its centre is in (as pdf.js and
 * PDF viewers draw it), see-through where no triangle is; null when it
 * covers no pixel. `box` is where the pixels go on the page.
 */
export function rasterMesh(
  sh: Extract<Shading, { kind: 'mesh' }>,
  m: Matrix,
  target: Box,
): { px: Pixels; box: Box } | null {
  const pts: Pt[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < sh.count; i++) {
    const p = apply(m, sh.pos[i * 2] ?? 0, sh.pos[i * 2 + 1] ?? 0);
    pts.push(p);
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  x0 = Math.max(x0, target[0]);
  y0 = Math.max(y0, target[1]);
  x1 = Math.min(x1, target[2]);
  y1 = Math.min(y1, target[3]);
  if (!(x1 > x0 && y1 > y0)) return null;
  const k = Math.min(MESH_SCALE, Math.sqrt(MAX_MESH_PIXELS / ((x1 - x0) * (y1 - y0))));
  const w = Math.max(1, Math.ceil((x1 - x0) * k));
  const h = Math.max(1, Math.ceil((y1 - y0) * k));
  const sx = w / (x1 - x0);
  const sy = h / (y1 - y0);
  const data = new Uint8Array(w * h * 4);
  let any = false;
  for (let t = 0; t + 2 < sh.count; t += 3) {
    const [a, b, c] = [pts[t], pts[t + 1], pts[t + 2]];
    if (!a || !b || !c) continue;
    const ax = (a[0] - x0) * sx;
    const ay = (a[1] - y0) * sy;
    const bx = (b[0] - x0) * sx;
    const by = (b[1] - y0) * sy;
    const cx = (c[0] - x0) * sx;
    const cy = (c[1] - y0) * sy;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (den === 0) continue;
    const px0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const px1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const py0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const py1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    const e = -1e-9;
    for (let y = py0; y <= py1; y++)
      for (let x = px0; x <= px1; x++) {
        const qx = x + 0.5;
        const qy = y + 0.5;
        const l1 = ((by - cy) * (qx - cx) + (cx - bx) * (qy - cy)) / den;
        const l2 = ((cy - ay) * (qx - cx) + (ax - cx) * (qy - cy)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < e || l2 < e || l3 < e) continue;
        const o = (y * w + x) * 4;
        for (let ch = 0; ch < 3; ch++)
          data[o + ch] = Math.round(
            l1 * (sh.col[t * 4 + ch] ?? 0) +
              l2 * (sh.col[(t + 1) * 4 + ch] ?? 0) +
              l3 * (sh.col[(t + 2) * 4 + ch] ?? 0),
          );
        data[o + 3] = 255;
        any = true;
      }
  }
  return any ? { px: { width: w, height: h, channels: 4, data }, box: [x0, y0, x1, y1] } : null;
}
