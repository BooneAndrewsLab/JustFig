/**
 * 2D affine matrices for flattening imported SVG transforms (note 12):
 * `[a, b, c, d, e, f]` as in SVG's `matrix()`, mapping (x, y) to
 * (a·x + c·y + e, b·x + d·y + f).
 */

export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const EPS = 1e-9;

/** `m · n`: n applied first, then m. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const near = (a: number, b: number, tol = 1e-6): boolean =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

export const isIdentity = (m: Matrix): boolean =>
  near(m[0], 1) &&
  near(m[1], 0) &&
  near(m[2], 0) &&
  near(m[3], 1) &&
  near(m[4], 0) &&
  near(m[5], 0);

/** No rotation or skew: x and y scale independently. */
export const isAxisAligned = (m: Matrix): boolean => near(m[1], 0) && near(m[2], 0);

/** Uniform scale (with any rotation or reflection): circles stay circles, strokes stay even. */
export const isSimilarity = (m: Matrix): boolean =>
  near(m[0] * m[0] + m[1] * m[1], m[2] * m[2] + m[3] * m[3]) &&
  Math.abs(m[0] * m[2] + m[1] * m[3]) <= 1e-6 * Math.max(1, m[0] * m[0] + m[1] * m[1]);

export const determinant = (m: Matrix): number => m[0] * m[3] - m[1] * m[2];

/** Length scale of a similarity (or the geometric mean scale of any matrix). */
export const scaleOf = (m: Matrix): number => Math.sqrt(Math.abs(determinant(m)));

/** Rotation of the x axis, degrees. */
export const angleOf = (m: Matrix): number => (Math.atan2(m[1], m[0]) * 180) / Math.PI;

/** The matrix of an SVG `transform` list, or null when it does not parse. */
export function parseTransform(s: string): Matrix | null {
  let m: Matrix = IDENTITY;
  const re = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/gy;
  let pos = 0;
  const text = s.trim();
  while (pos < text.length) {
    re.lastIndex = pos;
    const r = re.exec(text);
    if (!r) return null;
    pos = re.lastIndex;
    const v = (r[2] ?? '')
      .trim()
      .split(/[\s,]+/)
      .filter((t) => t !== '')
      .map(Number);
    if (v.some((x) => !Number.isFinite(x))) return null;
    const [p = 0, q, u, w, x, y] = v;
    let n: Matrix;
    switch (r[1] ?? '') {
      case 'matrix':
        if (v.length !== 6) return null;
        n = [p, q ?? 0, u ?? 0, w ?? 0, x ?? 0, y ?? 0];
        break;
      case 'translate':
        n = [1, 0, 0, 1, p, q ?? 0];
        break;
      case 'scale':
        n = [p, 0, 0, q ?? p, 0, 0];
        break;
      case 'rotate': {
        const a = (p * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const cx = q ?? 0;
        const cy = u ?? 0;
        n = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan((p * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        n = [1, Math.tan((p * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, n);
  }
  return m;
}

/** Shortest decimal for a coordinate: 3 places, no -0. */
export function fmt(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return Math.abs(r) < EPS ? '0' : String(r);
}

export const matrixString = (m: Matrix): string =>
  `matrix(${m.map((v, i) => (i < 4 ? String(Math.round(v * 1e6) / 1e6) : fmt(v))).join(' ')})`;

/** The inverse matrix (identity for a singular one). */
export function invert(m: Matrix): Matrix {
  const det = determinant(m);
  if (Math.abs(det) < EPS) return IDENTITY;
  const [a, b, c, d, e, f] = m;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
