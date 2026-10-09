/**
 * Exact clipping to any shape, as plain geometry (issue 25, note 13): the
 * export subset has no `clipPath`, so what an imported plot clips must be
 * cut. Works on flattened rings (closed polygons) in one coordinate space,
 * independent of where they came from (PDF clip paths, and SVG `clipPath`
 * around a plot picture, issue 36).
 *
 * A region is rings with a fill rule (nonzero or even-odd), like a clip path.
 * `clipRing` cuts one ring of a filled shape to it so that the winding
 * number of the result equals the ring's inside the region and is 0
 * outside. Winding numbers add up, so a shape of many rings is cut ring by
 * ring and keeps its own fill rule (holes stay holes), and cutting by one
 * region after another is cutting by their intersection.
 *
 * - A region that is one convex ring (a circle, a rotated rectangle: polar
 *   plots, rotated axes) uses Sutherland–Hodgman, one half-plane at a time;
 *   a half-plane cut keeps winding numbers on its inner side exactly.
 * - Any other region uses a sweep: horizontal slabs between every vertex
 *   and crossing, in each the spans between edges where the ring winds and
 *   the region is inside become trapezoids, chained down the slabs into
 *   polygons where they continue one another. Exact up to rounding, for
 *   self-crossing, holed and coincident shapes alike.
 * - Lines (`clipLines`) are cut where they cross the region's edges and
 *   keep the pieces whose middle is inside, or within `tol` of the edge (so
 *   a grid circle drawn on the clip's own edge is not lost to rounding).
 */

export type Pt = readonly [number, number];
export type Ring = readonly Pt[];
export type Box = readonly [number, number, number, number]; // x0 y0 x1 y1

export interface Region {
  readonly rings: readonly Ring[];
  readonly evenOdd: boolean;
  readonly box: Box;
  /** The region as one convex ring, when it is one, and the sign of its turning. */
  readonly convex: { ring: Ring; turn: 1 | -1 } | null;
  /** y of each crossing between the region's own edges (sweep events). */
  readonly crossYs: readonly number[];
}

const EPS = 1e-9;

/** Points to flatten a curve into, from the length of its control polygon (≤ ~0.1 unit off). */
export const curveSteps = (controlLength: number): number =>
  Math.min(64, Math.max(4, Math.ceil(1.5 * Math.sqrt(controlLength))));

const cross = (a: Pt, b: Pt, p: Pt): number =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function boxOf(rings: readonly Ring[]): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

/** Consecutive duplicate points dropped (and a last point equal to the first). */
function clean(ring: Ring): Pt[] {
  const out: Pt[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > EPS || Math.abs(q[1] - p[1]) > EPS) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && Math.abs(first[0] - last[0]) <= EPS)
    if (Math.abs(first[1] - last[1]) <= EPS) out.pop();
  return out;
}

/** Points on a straight line between their neighbours dropped. */
function simplify(ring: Ring): Pt[] {
  let pts = clean(ring);
  for (let changed = true; changed && pts.length > 2;) {
    changed = false;
    const next: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = next[next.length - 1] ?? pts[pts.length - 1] ?? pts[i];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (!a || !b || !c) continue;
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const between = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0;
      if (Math.abs(cross(a, c, b)) <= 1e-9 * Math.max(1, len * len) && between) changed = true;
      else next.push(b);
    }
    pts = next;
  }
  return pts.length >= 3 ? pts : [];
}

/** A simple convex ring's turning sign, or 0 when the ring is not one. */
function convexTurn(ring: Ring): 0 | 1 | -1 {
  const n = ring.length;
  if (n < 3) return 0;
  let sign = 0;
  let angle = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i] ?? [0, 0];
    const b = ring[(i + 1) % n] ?? a;
    const c = ring[(i + 2) % n] ?? b;
    const z = cross(a, b, c);
    const s = z > 0 ? 1 : z < 0 ? -1 : 0;
    if (s !== 0) {
      if (sign !== 0 && s !== sign) return 0;
      sign = s;
    }
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = t2 - t1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    angle += d;
  }
  // Turning once (not a star that turns twice) in one direction.
  return sign !== 0 && Math.abs(Math.abs(angle) - 2 * Math.PI) < 1e-6 ? (sign as 1 | -1) : 0;
}

interface Edge {
  readonly a: Pt;
  readonly b: Pt;
}

function edgesOf(rings: readonly Ring[]): Edge[] {
  const out: Edge[] = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i] ?? [0, 0];
      const b = r[(i + 1) % r.length] ?? a;
      if (a[0] !== b[0] || a[1] !== b[1]) out.push({ a, b });
    }
  return out;
}

/** Where two segments cross strictly inside both (or e at an end of f), as [s along e, t along f]. */
function crossing(e: Edge, f: Edge, atEnds = false): [number, number] | null {
  const dx = e.b[0] - e.a[0];
  const dy = e.b[1] - e.a[1];
  const ex = f.b[0] - f.a[0];
  const ey = f.b[1] - f.a[1];
  const den = dx * ey - dy * ex;
  if (den === 0) return null;
  const qx = f.a[0] - e.a[0];
  const qy = f.a[1] - e.a[1];
  const s = (qx * ey - qy * ex) / den;
  const t = (qx * dy - qy * dx) / den;
  const onF = atEnds ? t >= 0 && t <= 1 : t > 0 && t < 1;
  return s > 0 && s < 1 && onF ? [s, t] : null;
}

function crossYs(es: readonly Edge[], fs: readonly Edge[] | null): number[] {
  const out: number[] = [];
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e) continue;
    const ex0 = Math.min(e.a[0], e.b[0]);
    const ex1 = Math.max(e.a[0], e.b[0]);
    const ey0 = Math.min(e.a[1], e.b[1]);
    const ey1 = Math.max(e.a[1], e.b[1]);
    const others = fs ?? es;
    for (let j = fs ? 0 : i + 1; j < others.length; j++) {
      const f = others[j];
      if (!f) continue;
      if (Math.max(f.a[0], f.b[0]) < ex0 || Math.min(f.a[0], f.b[0]) > ex1) continue;
      if (Math.max(f.a[1], f.b[1]) < ey0 || Math.min(f.a[1], f.b[1]) > ey1) continue;
      const st = crossing(e, f);
      if (st) out.push(e.a[1] + st[0] * (e.b[1] - e.a[1]));
    }
  }
  return out;
}

/** A region from rings (each implicitly closed) and a fill rule; null when it is empty. */
export function makeRegion(rings: readonly Ring[], evenOdd: boolean): Region | null {
  const rs = rings.map(simplify).filter((r) => r.length >= 3);
  const box = boxOf(rs);
  if (!box) return null;
  const only = rs.length === 1 ? rs[0] : undefined;
  const turn = only ? convexTurn(only) : 0;
  return {
    rings: rs,
    evenOdd,
    box,
    convex: only && turn !== 0 ? { ring: only, turn } : null,
    crossYs: turn !== 0 ? [] : crossYs(edgesOf(rs), null),
  };
}

/** Winding number of the rings around p (Sunday's crossing rule). */
export function windingAt(p: Pt, rings: readonly Ring[]): number {
  let w = 0;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i] ?? [0, 0];
      const b = r[(i + 1) % r.length] ?? a;
      if (a[1] <= p[1]) {
        if (b[1] > p[1] && cross(a, b, p) > 0) w++;
      } else if (b[1] <= p[1] && cross(a, b, p) < 0) w--;
    }
  return w;
}

const filled = (w: number, evenOdd: boolean): boolean => (evenOdd ? (w & 1) !== 0 : w !== 0);

export const contains = (region: Region, p: Pt): boolean =>
  p[0] >= region.box[0] &&
  p[0] <= region.box[2] &&
  p[1] >= region.box[1] &&
  p[1] <= region.box[3] &&
  filled(windingAt(p, region.rings), region.evenOdd);

/** Distance from p to the region's edge is under tol. */
function nearEdge(region: Region, p: Pt, tol: number): boolean {
  const [x0, y0, x1, y1] = region.box;
  if (p[0] < x0 - tol || p[0] > x1 + tol || p[1] < y0 - tol || p[1] > y1 + tol) return false;
  for (const { a, b } of edgesOf(region.rings)) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
    );
    if (Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) < tol) return true;
  }
  return false;
}

/** Inside the region, or (tol > 0) within tol of its edge. */
export const containsNear = (region: Region, p: Pt, tol: number): boolean =>
  contains(region, p) || (tol > 0 && nearEdge(region, p, tol));

/** Sutherland–Hodgman: the ring cut by each edge's half-plane of a convex ring. */
function clipConvex(ring: Ring, convex: Ring, turn: 1 | -1): Pt[] {
  let out: Pt[] = [...ring];
  for (let i = 0; i < convex.length && out.length > 0; i++) {
    const a = convex[i] ?? [0, 0];
    const b = convex[(i + 1) % convex.length] ?? a;
    const side = (p: Pt): number => turn * cross(a, b, p);
    const next: Pt[] = [];
    for (let j = 0; j < out.length; j++) {
      const cur = out[j] ?? [0, 0];
      const prev = out[(j + out.length - 1) % out.length] ?? cur;
      const sc = side(cur);
      const sp = side(prev);
      const cut = (): Pt => {
        const t = sp / (sp - sc);
        return [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
      };
      if (sc >= 0) {
        if (sp < 0) next.push(cut());
        next.push(cur);
      } else if (sp >= 0) next.push(cut());
    }
    out = next;
  }
  return out;
}

interface Trap {
  y0: number;
  y1: number;
  xl0: number;
  xl1: number;
  xr0: number;
  xr1: number;
  /** Winding counted from the left (the ring's winding number is its negative). */
  w: number;
}

/** The sweep (see the module comment): the ring's parts inside the region, winding kept. */
function sweep(ring: Ring, region: Region): Pt[][] {
  const S = edgesOf([ring]);
  const R = edgesOf(region.rings);
  const rb = boxOf([ring]);
  if (!rb || S.length < 3) return [];
  const lo = Math.max(rb[1], region.box[1]);
  const hi = Math.min(rb[3], region.box[3]);
  if (lo >= hi) return [];
  const raw = [lo, hi, ...region.crossYs, ...crossYs(S, null), ...crossYs(S, R)];
  for (const e of [...S, ...R]) raw.push(e.a[1], e.b[1]);
  const ys = raw.filter((y) => y >= lo && y <= hi).sort((a, b) => a - b);
  const scale = Math.max(1, Math.abs(lo), Math.abs(hi));
  const events: number[] = [];
  for (const y of ys) {
    const last = events[events.length - 1];
    if (last === undefined || y - last > EPS * scale) events.push(y);
  }
  const all = [...S.map((e) => ({ ...e, s: true })), ...R.map((e) => ({ ...e, s: false }))].filter(
    (e) => e.a[1] !== e.b[1],
  );
  const xAt = (e: Edge, y: number): number =>
    e.a[0] + ((e.b[0] - e.a[0]) * (y - e.a[1])) / (e.b[1] - e.a[1]);
  const closed: Trap[][] = [];
  let open: Trap[][] = [];
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-7 * scale;
  for (let k = 0; k + 1 < events.length; k++) {
    const y0 = events[k] ?? 0;
    const y1 = events[k + 1] ?? 0;
    const ym = (y0 + y1) / 2;
    const active = all
      .filter((e) => Math.min(e.a[1], e.b[1]) < ym && Math.max(e.a[1], e.b[1]) > ym)
      .map((e) => ({
        x0: xAt(e, y0),
        x1: xAt(e, y1),
        xm: xAt(e, ym),
        dir: e.b[1] > e.a[1] ? 1 : -1,
        s: e.s,
      }))
      .sort((a, b) => a.xm - b.xm);
    const traps: Trap[] = [];
    let ws = 0;
    let wr = 0;
    let cur = null as Trap | null;
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      if (!e) continue;
      if (e.s) ws += e.dir;
      else wr += e.dir;
      const nx = active[i + 1];
      const inside = ws !== 0 && filled(wr, region.evenOdd);
      if (!nx || !inside) {
        cur = null;
        continue;
      }
      if (cur?.w === ws) {
        cur.xr0 = nx.x0;
        cur.xr1 = nx.x1;
      } else {
        cur = { y0, y1, xl0: e.x0, xl1: e.x1, xr0: nx.x0, xr1: nx.x1, w: ws };
        traps.push(cur);
      }
    }
    const next: Trap[][] = [];
    for (const t of traps) {
      if (t.xr0 - t.xl0 <= 0 && t.xr1 - t.xl1 <= 0) continue;
      const i = open.findIndex((c) => {
        const b = c[c.length - 1];
        return b?.w === t.w && near(b.y1, t.y0) && near(b.xl1, t.xl0) && near(b.xr1, t.xr0);
      });
      const chain = i >= 0 ? (open.splice(i, 1)[0] ?? []) : [];
      chain.push(t);
      next.push(chain);
    }
    closed.push(...open);
    open = next;
  }
  closed.push(...open);
  const out: Pt[][] = [];
  for (const chain of closed) {
    const first = chain[0];
    if (!first) continue;
    const left: Pt[] = [[first.xl0, first.y0], ...chain.map((t): Pt => [t.xl1, t.y1])];
    const right: Pt[] = [[first.xr0, first.y0], ...chain.map((t): Pt => [t.xr1, t.y1])];
    // Down the left side, up the right: winding -1, the sign of a left-counted +1.
    let ring = simplify([...left, ...right.reverse()]);
    if (ring.length < 3) continue;
    if (first.w < 0) ring = ring.reverse();
    for (let n = 0; n < Math.abs(first.w); n++) out.push(ring);
  }
  return out;
}

/**
 * One ring of a filled shape cut to the region: rings whose winding number
 * is the ring's inside the region and 0 outside.
 */
export function clipRing(ring: Ring, region: Region): Pt[][] {
  const r = clean(ring);
  if (r.length < 3) return [];
  if (region.convex) {
    const out = simplify(clipConvex(r, region.convex.ring, region.convex.turn));
    return out.length >= 3 ? [out] : [];
  }
  return sweep(r, region);
}

/** Parameter intervals [t0, t1] of the segment a→b inside the region (or within tol of it). */
export function segmentSpans(a: Pt, b: Pt, region: Region, tol = 0): [number, number][] {
  const ts = [0, 1];
  const e = { a, b };
  for (const f of edgesOf(region.rings)) {
    const st = crossing(e, f, true);
    if (st) ts.push(st[0]);
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i] ?? 0;
    const t1 = ts[i + 1] ?? 0;
    if (t1 - t0 <= 1e-12) continue;
    const tm = (t0 + t1) / 2;
    const m: Pt = [a[0] + tm * (b[0] - a[0]), a[1] + tm * (b[1] - a[1])];
    if (!containsNear(region, m, tol)) continue;
    const last = out[out.length - 1];
    if (last?.[1] === t0) last[1] = t1;
    else out.push([t0, t1]);
  }
  return out;
}

/** An open polyline cut to the region, as the pieces inside (or within tol of its edge). */
export function clipLines(pts: readonly Pt[], region: Region, tol = 0): Pt[][] {
  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  const flush = () => {
    if (cur.length > 1) pieces.push(cur);
    cur = [];
  };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] ?? [0, 0];
    const b = pts[i] ?? a;
    const at = (t: number): Pt =>
      t === 1 ? b : [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const spans = segmentSpans(a, b, region, tol);
    if (spans[0]?.[0] !== 0) flush();
    for (const [t0, t1] of spans) {
      if (t0 > 0 || cur.length === 0) {
        flush();
        cur = [at(t0)];
      }
      cur.push(at(t1));
      if (t1 < 1) flush();
    }
  }
  flush();
  return pieces;
}

/**
 * Every ring lies inside the region (or within tol of its edge): every point
 * is, and for a region that is not convex no edge crosses the region's.
 */
export function ringsInside(rings: readonly Ring[], region: Region, tol = 0): boolean {
  if (!rings.every((r) => r.every((p) => containsNear(region, p, tol)))) return false;
  if (region.convex) return true;
  const R = edgesOf(region.rings);
  return edgesOf(rings).every((e) => R.every((f) => !crossing(e, f)));
}
