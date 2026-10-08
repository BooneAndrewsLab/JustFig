/**
 * Path data for flattening imported SVGs (note 12): `d` → absolute
 * M/L/C/Q/Z segments (H/V become L, S/T get explicit control points, arcs
 * become cubics), so any affine matrix can be baked into the points.
 */
import { type Matrix, apply, fmt } from './matrix';

export type Seg =
  | { readonly c: 'M' | 'L'; readonly p: readonly [number, number] }
  | { readonly c: 'C'; readonly p: readonly [number, number, number, number, number, number] }
  | { readonly c: 'Q'; readonly p: readonly [number, number, number, number] }
  | { readonly c: 'Z' };

const ARGS: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/** Tokens of a path: command letters and numbers (arc flags may be packed: `a1 1 0 01 2 3`). */
function tokens(d: string): (string | number)[] | null {
  const out: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
  let pos = 0;
  let cmd = '';
  let argIndex = 0;
  while (pos < d.length) {
    while (pos < d.length && /[\s,]/.test(d.charAt(pos))) pos++;
    if (pos >= d.length) break;
    // Arc flags (4th and 5th argument) are single digits that may have no separator.
    if ((cmd === 'A' || cmd === 'a') && (argIndex % 7 === 3 || argIndex % 7 === 4)) {
      const f = /([01])/y;
      f.lastIndex = pos;
      const m = f.exec(d);
      if (!m) return null;
      out.push(Number(m[1]));
      pos = f.lastIndex;
      argIndex++;
      continue;
    }
    re.lastIndex = pos;
    const m = re.exec(d);
    if (!m?.[1]) return null;
    pos = re.lastIndex;
    const t = m[1];
    if (/[a-z]/i.test(t)) {
      cmd = t;
      argIndex = 0;
      out.push(t);
    } else {
      out.push(Number(t));
      argIndex++;
    }
  }
  return out;
}

function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotDeg: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): Seg[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [{ c: 'L', p: [x2, y2] }];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const deriv = (t: number): [number, number] => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const [ax, ay] = point(a);
    const [bx, by] = i === n - 1 ? [x2, y2] : point(b);
    const [dax, day] = deriv(a);
    const [dbx, dby] = deriv(b);
    out.push({
      c: 'C',
      p: [ax + alpha * dax, ay + alpha * day, bx - alpha * dbx, by - alpha * dby, bx, by],
    });
  }
  return out;
}

/** Absolute, normalised segments of a path's `d`, or null when it does not parse. */
export function parsePath(d: string): Seg[] | null {
  const t = tokens(d);
  if (!t) return null;
  const out: Seg[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  // Last control point, for S and T reflection.
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;
  while (i < t.length) {
    const tok = t[i];
    if (typeof tok === 'string') {
      cmd = tok;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        out.push({ c: 'Z' });
        x = sx;
        y = sy;
        lastC = lastQ = null;
        continue;
      }
    } else if (cmd === '' || cmd === 'Z' || cmd === 'z') {
      return null;
    }
    const up = cmd.toUpperCase();
    const n = ARGS[up] ?? 0;
    const a = t.slice(i, i + n);
    if (a.length < n || a.some((v) => typeof v !== 'number')) return null;
    const v = a as number[];
    i += n;
    const rel = cmd !== up;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const [v0 = 0, v1 = 0, v2 = 0, v3 = 0, v4 = 0, v5 = 0, v6 = 0] = v;
    let nextC: [number, number] | null = null;
    let nextQ: [number, number] | null = null;
    switch (up) {
      case 'M':
        x = v0 + ox;
        y = v1 + oy;
        sx = x;
        sy = y;
        out.push({ c: 'M', p: [x, y] });
        // Further pairs after a moveto are linetos.
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        x = v0 + ox;
        y = v1 + oy;
        out.push({ c: 'L', p: [x, y] });
        break;
      case 'H':
        x = v0 + ox;
        out.push({ c: 'L', p: [x, y] });
        break;
      case 'V':
        y = v0 + (rel ? y : 0);
        out.push({ c: 'L', p: [x, y] });
        break;
      case 'C':
      case 'S': {
        const [c1x, c1y] =
          up === 'C' ? [v0 + ox, v1 + oy] : lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        const rest = up === 'C' ? [v2, v3, v4, v5] : [v0, v1, v2, v3];
        const c2x = (rest[0] ?? 0) + ox;
        const c2y = (rest[1] ?? 0) + oy;
        x = (rest[2] ?? 0) + ox;
        y = (rest[3] ?? 0) + oy;
        out.push({ c: 'C', p: [c1x, c1y, c2x, c2y, x, y] });
        nextC = [c2x, c2y];
        break;
      }
      case 'Q':
      case 'T': {
        let qx = x;
        let qy = y;
        if (up === 'Q') {
          qx = v0 + ox;
          qy = v1 + oy;
        } else if (lastQ) {
          qx = 2 * x - lastQ[0];
          qy = 2 * y - lastQ[1];
        }
        x = (up === 'Q' ? v2 : v0) + ox;
        y = (up === 'Q' ? v3 : v1) + oy;
        out.push({ c: 'Q', p: [qx, qy, x, y] });
        nextQ = [qx, qy];
        break;
      }
      case 'A': {
        const ex = v5 + ox;
        const ey = v6 + oy;
        out.push(...arcToCubics(x, y, v0, v1, v2, v3 !== 0, v4 !== 0, ex, ey));
        x = ex;
        y = ey;
        break;
      }
      default:
        return null;
    }
    lastC = nextC;
    lastQ = nextQ;
  }
  return out;
}

export function transformPath(segs: readonly Seg[], m: Matrix): Seg[] {
  return segs.map((s): Seg => {
    if (s.c === 'Z') return s;
    const pts: number[] = [];
    for (let i = 0; i < s.p.length; i += 2) pts.push(...apply(m, s.p[i] ?? 0, s.p[i + 1] ?? 0));
    return { c: s.c, p: pts } as unknown as Seg;
  });
}

export function pathString(segs: readonly Seg[]): string {
  return segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${s.p.map(fmt).join(' ')}`)).join('');
}

/** Every point of the path, control points included (their hull bounds the curve). */
export function pathPoints(segs: readonly Seg[]): [number, number][] {
  const out: [number, number][] = [];
  for (const s of segs) {
    if (s.c === 'Z') continue;
    for (let i = 0; i < s.p.length; i += 2) out.push([s.p[i] ?? 0, s.p[i + 1] ?? 0]);
  }
  return out;
}

/** The axis-aligned rectangle a path traces (straight edges along its 4 corners only), or null. */
export function pathRect(
  segs: readonly Seg[],
): { x: number; y: number; w: number; h: number } | null {
  if (segs.some((s) => s.c === 'C' || s.c === 'Q')) return null;
  // A trailing moveto (cairo writes `Z M x y`) draws nothing.
  const body = [...segs];
  while (body.length > 0 && body[body.length - 1]?.c === 'M') body.pop();
  if (body.filter((s) => s.c === 'M').length !== 1) return null;
  const pts = pathPoints(body);
  if (pts.length < 4) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const tol = 1e-6 * Math.max(1, x1 - x0, y1 - y0);
  const corner = (v: number, a: number, b: number) =>
    Math.abs(v - a) <= tol || Math.abs(v - b) <= tol;
  if (!pts.every(([x, y]) => corner(x, x0, x1) && corner(y, y0, y1))) return null;
  const distinct = new Set(
    pts.map(([x, y]) => `${String(x <= x0 + tol)},${String(y <= y0 + tol)}`),
  );
  if (distinct.size !== 4) return null;
  // Consecutive points share an edge (no diagonal), so this is the rectangle's outline.
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1] ?? [0, 0];
    const [bx, by] = pts[i] ?? [0, 0];
    if (Math.abs(ax - bx) > tol && Math.abs(ay - by) > tol) return null;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
