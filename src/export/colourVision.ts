/**
 * Colour-vision simulation and confusion tests (note 46), pure. The matrices are the
 * ones the canvas's "Preview as" filters apply (`VisionFilters`), so the export check and
 * the preview agree: Machado, Oliveira & Fernandes (2009) at full severity, applied in
 * linear RGB (the default of an SVG `feColorMatrix`), plus greyscale by luminance.
 */
import { type Rgb, parseHex } from '@/core/color/color';

export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';

export const DEFICIENCIES: readonly Deficiency[] = ['deuteranopia', 'protanopia', 'tritanopia'];

export const DEFICIENCY_NAMES: Readonly<Record<Deficiency, string>> = {
  deuteranopia: 'deuteranopia (green-blind)',
  protanopia: 'protanopia (red-blind)',
  tritanopia: 'tritanopia (blue-blind)',
};

type Row = readonly [number, number, number];

/** Rows of the 3 x 3 linear-RGB matrices. */
export const CVD_MATRIX: Readonly<Record<Deficiency, readonly [Row, Row, Row]>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** The `values` of the 4 x 5 `feColorMatrix` for a deficiency (alpha untouched). */
export const cvdFilterValues = (d: Deficiency): string =>
  [...CVD_MATRIX[d].flatMap((r) => [...r, 0, 0]), 0, 0, 0, 1, 0].join(' ');

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** CIE L*a*b* (D65) of linear sRGB. */
function labOfLinear(r: number, g: number, b: number): Lab {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116;
  const fy = f(y);
  return { l: 116 * fy - 16, a: 500 * (f(x) - fy), b: 200 * (fy - f(z)) };
}

const linearOf = (hex: string): readonly [number, number, number] => {
  const c: Rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
};

export const labOf = (hex: string): Lab => labOfLinear(...linearOf(hex));

/** The colour as the deficiency shows it, in Lab. */
export function simulateLab(hex: string, d: Deficiency): Lab {
  const [r, g, b] = linearOf(hex);
  const [m0, m1, m2] = CVD_MATRIX[d];
  const mul = (m: Row): number => clamp01(m[0] * r + m[1] * g + m[2] * b);
  return labOfLinear(mul(m0), mul(m1), mul(m2));
}

/** The colour in a greyscale print (relative luminance), in Lab. */
export function greyLab(hex: string): Lab {
  const [r, g, b] = linearOf(hex);
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  return labOfLinear(y, y, y);
}

/** CIE76 colour difference. */
export const deltaE = (p: Lab, q: Lab): number => Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);

/** A pair must differ by at least this (CIE76 ΔE) in normal vision to count as "told apart". */
export const DISTINCT_DE = 25;
/** ... and simulated, it is "confused" when it falls below this. */
export const CONFUSED_DE = 12;
/** In a greyscale print a distinct pair is "lost" when its lightness differs by less than this (ΔL*). */
export const GREY_DL = 8;

export interface Confusion {
  readonly a: number;
  readonly b: number;
  readonly deficiency: Deficiency;
  /** ΔE in normal vision, and after simulation. */
  readonly before: number;
  readonly after: number;
}

/**
 * The pairs of colours (indices into `hexes`) told apart in normal vision that a
 * deficiency makes confusable. Worst (smallest simulated ΔE) first.
 */
export function confusions(hexes: readonly string[]): Confusion[] {
  const normal = hexes.map(labOf);
  const out: Confusion[] = [];
  for (const deficiency of DEFICIENCIES) {
    const sim = hexes.map((h) => simulateLab(h, deficiency));
    for (let a = 0; a < hexes.length; a += 1)
      for (let b = a + 1; b < hexes.length; b += 1) {
        const [na, nb, sa, sb] = [normal[a], normal[b], sim[a], sim[b]];
        if (!na || !nb || !sa || !sb) continue;
        const before = deltaE(na, nb);
        const after = deltaE(sa, sb);
        if (before >= DISTINCT_DE && after < CONFUSED_DE)
          out.push({ a, b, deficiency, before, after });
      }
  }
  return out.sort((p, q) => p.after - q.after);
}

/** Pairs told apart in colour that a greyscale print renders at nearly the same lightness. */
export function greyConfusions(hexes: readonly string[]): { a: number; b: number; dl: number }[] {
  const normal = hexes.map(labOf);
  const grey = hexes.map(greyLab);
  const out: { a: number; b: number; dl: number }[] = [];
  for (let a = 0; a < hexes.length; a += 1)
    for (let b = a + 1; b < hexes.length; b += 1) {
      const [na, nb, ga, gb] = [normal[a], normal[b], grey[a], grey[b]];
      if (!na || !nb || !ga || !gb) continue;
      const dl = Math.abs(ga.l - gb.l);
      if (deltaE(na, nb) >= DISTINCT_DE && dl < GREY_DL) out.push({ a, b, dl });
    }
  return out.sort((p, q) => p.dl - q.dl);
}

/** Hue (degrees), saturation and value of a hex colour. */
function hsv(hex: string): { h: number; s: number; v: number } {
  const c = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const max = Math.max(c.r, c.g, c.b);
  const d = max - Math.min(c.r, c.g, c.b);
  let h = 0;
  if (d > 0) {
    if (max === c.r) h = ((c.g - c.b) / d) % 6;
    else if (max === c.g) h = (c.b - c.r) / d + 2;
    else h = (c.r - c.g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

/** A clearly saturated, bright red (hue within 20° of 0). */
export function isRed(hex: string): boolean {
  const { h, s, v } = hsv(hex);
  return s >= 0.5 && v >= 0.5 && (h <= 20 || h >= 340);
}

/** A clearly saturated, bright green (hue 75°–165°). */
export function isGreen(hex: string): boolean {
  const { h, s, v } = hsv(hex);
  return s >= 0.5 && v >= 0.5 && h >= 75 && h <= 165;
}

/** Whether a set of channel colours has both a red and a green. */
export const hasRedAndGreen = (hexes: readonly string[]): boolean =>
  hexes.some(isRed) && hexes.some(isGreen);
