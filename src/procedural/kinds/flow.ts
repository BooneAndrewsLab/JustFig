/**
 * The flow-cytometry style of the placeholder plot (note 04): a seeded dot
 * cloud of made-up events on two log10 axes, with a quadrant or polygon gate
 * whose percentages are the share of the generated events inside each region.
 * Pure: the same params always give the same events, gate and labels.
 */
import { type Prim, type Sub, circle, line, pathPrim, poly } from '../prims';
import { byColour, clamp, mix, rng, text } from './util';

export type GateType = 'none' | 'quadrant' | 'polygon';

/** What the flow style reads from the plot's params. */
export interface FlowParams {
  readonly groups: readonly { readonly name: string; readonly color: string }[];
  readonly events: number;
  readonly spread: number;
  readonly pointSize: number;
  readonly axes: boolean;
  readonly gate: GateType;
  readonly seed: number;
}

/** The axes span 10^LO to 10^HI; ticks are labelled at 10^1 … 10^5. */
export const FLOW_LO = 0.5;
export const FLOW_HI = 5.5;
const SPAN = FLOW_HI - FLOW_LO;

interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface FlowData {
  /** Events in log10 units. */
  readonly events: readonly Pt[];
  /** Quadrant thresholds in log10 units. */
  readonly gx: number;
  readonly gy: number;
  /** Polygon gate vertices in log10 units. */
  readonly polygon: readonly Pt[];
  /** Per event: inside the polygon. */
  readonly inside: readonly boolean[];
  /** Quadrant percentages [top-left, top-right, bottom-left, bottom-right]. */
  readonly quadrants: readonly [number, number, number, number];
  /** Percentage of events inside the polygon. */
  readonly polygonPct: number;
}

const gauss = (rand: () => number): number =>
  Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

function inPolygon(q: Pt, vs: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i, i += 1) {
    const a = vs[i];
    const b = vs[j];
    if (!a || !b) continue;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Generates the events, thresholds, polygon and percentages from the seed. */
export function flowData(p: FlowParams): FlowData {
  const rand = rng(p.seed);
  const s = p.spread;
  // Negative, x-positive, y-positive and double-positive populations.
  const pops = [
    { x: 2.0, y: 2.0, s: 0.38, w: 0.38 },
    { x: 4.1, y: 2.0, s: 0.3, w: 0.28 },
    { x: 2.0, y: 4.0, s: 0.3, w: 0.2 },
    { x: 4.0, y: 4.0, s: 0.28, w: 0.14 },
  ].map((q) => ({
    x: q.x + (rand() - 0.5) * 0.3,
    y: q.y + (rand() - 0.5) * 0.3,
    s: q.s * s,
    w: q.w * (0.8 + 0.4 * rand()),
  }));
  const total = pops.reduce((a, q) => a + q.w, 0);
  const gx = 3.0 + (rand() - 0.5) * 0.3;
  const gy = 3.0 + (rand() - 0.5) * 0.3;
  const lo = FLOW_LO + 0.03;
  const hi = FLOW_HI - 0.03;
  const events: Pt[] = [];
  const n = Math.max(1, Math.floor(p.events));
  for (let i = 0; i < n; i += 1) {
    let pick = rand() * total;
    let q = pops[0] ?? { x: 2, y: 2, s: 0.4, w: 1 };
    for (const c of pops) {
      pick -= c.w;
      q = c;
      if (pick <= 0) break;
    }
    // Two scales per population give the denser core.
    const k = rand() < 0.45 ? 0.5 : 1;
    events.push({
      x: clamp(q.x + gauss(rand) * q.s * k, lo, hi),
      y: clamp(q.y + gauss(rand) * q.s * k * (0.85 + 0.3 * rand()), lo, hi),
    });
  }
  // The polygon gate rings the x-positive population, slightly irregular.
  const g = pops[1] ?? { x: 4, y: 2, s: 0.3, w: 1 };
  const verts = 7;
  const polygon: Pt[] = [];
  for (let i = 0; i < verts; i += 1) {
    const a = (i / verts) * 2 * Math.PI + 0.3;
    const r = 2.1 * (0.9 + 0.2 * rand());
    polygon.push({
      x: clamp(g.x + Math.cos(a) * g.s * r * 1.1, lo, hi),
      y: clamp(g.y + Math.sin(a) * g.s * r, lo, hi),
    });
  }
  const inside = events.map((e) => inPolygon(e, polygon));
  const quad = [0, 0, 0, 0];
  for (const e of events) {
    const i = (e.y >= gy ? 0 : 2) + (e.x >= gx ? 1 : 0);
    quad[i] = (quad[i] ?? 0) + 1;
  }
  const pct = (c: number | undefined): number => Math.round(((c ?? 0) / n) * 1000) / 10;
  return {
    events,
    gx,
    gy,
    polygon,
    inside,
    quadrants: [pct(quad[0]), pct(quad[1]), pct(quad[2]), pct(quad[3])],
    polygonPct: pct(inside.filter(Boolean).length),
  };
}

export interface FlowLayout {
  readonly w: number;
  readonly h: number;
  readonly px0: number;
  readonly px1: number;
  readonly py0: number;
  readonly py1: number;
  readonly ts: number;
  readonly sw: number;
  readonly tick: number;
  readonly axisC: string;
  readonly ink: string;
}

/** Draws the flow plot inside the plot area [px0, px1] × [py0, py1] of a w × h frame. */
export function renderFlow(p: FlowParams, g: FlowLayout): Prim[] {
  const { w, h, px0, px1, py0, py1, ts, sw, tick, axisC, ink } = g;
  const out: Prim[] = [];
  const pw = px1 - px0;
  const ph = py1 - py0;
  const X = (x: number) => clamp(x, 0, w);
  const Y = (y: number) => clamp(y, 0, h);
  const sx = (d: number) => X(px0 + ((d - FLOW_LO) / SPAN) * pw);
  const sy = (d: number) => Y(py1 - ((d - FLOW_LO) / SPAN) * ph);
  const data = flowData(p);

  if (p.axes) {
    const ax: Sub[] = [
      poly([
        { x: X(px0), y: Y(py0) },
        { x: X(px0), y: Y(py1) },
        { x: X(px1), y: Y(py1) },
      ]),
    ];
    for (let k = 0; k <= 5; k += 1)
      for (let m = 1; m <= 9; m += 1) {
        const d = k + Math.log10(m);
        if (d < FLOW_LO || d > FLOW_HI) continue;
        const t = m === 1 ? tick : tick * 0.55;
        ax.push(line({ x: sx(d), y: Y(py1) }, { x: sx(d), y: Y(py1 + t) }));
        ax.push(line({ x: X(px0 - t), y: sy(d) }, { x: X(px0), y: sy(d) }));
      }
    out.push(...pathPrim(ax, { stroke: axisC, sw, cap: 'butt', join: 'miter' }));
    // Decade labels 10^k: "10" and a smaller raised exponent, each with explicit x/y.
    const ls = ts * 0.75;
    const es = ls * 0.65;
    const w10 = ls * 1.1;
    const we = es * 0.6;
    for (let k = 1; k <= 5; k += 1) {
      const ten = (x: number, y: number) => text('10', X(x), Y(y), ls, ink, { anchor: 'start' });
      const exp = (x: number, y: number) =>
        text(String(k), X(x), Y(y - ls * 0.35), es, ink, { anchor: 'start' });
      const x0 = sx(k) - (w10 + we) / 2;
      const yb = py1 + tick + ls * 0.75;
      out.push(ten(x0, yb), exp(x0 + w10, yb));
      const x1 = px0 - tick - ls * 0.2 - we;
      out.push(ten(x1 - w10, sy(k)), exp(x1, sy(k)));
    }
  }

  // Events: one path per colour; inside the polygon gate they take the second group's colour.
  const c0 = p.groups[0]?.color ?? '#0072b2';
  const c1 = p.groups[1]?.color ?? mix(c0, '#000000', 0.45);
  const r = Math.min(p.pointSize / 4, pw / 2, ph / 2);
  const dots = data.events.map((e, i) => ({
    colour: p.gate === 'polygon' && data.inside[i] === true ? c1 : c0,
    sub: circle(
      clamp(sx(e.x), px0 + r, Math.max(px0 + r, px1 - r)),
      clamp(sy(e.y), py0 + r, Math.max(py0 + r, py1 - r)),
      r,
    ),
  }));
  for (const [c, list] of byColour(dots, (d) => d.colour))
    out.push(
      ...pathPrim(
        list.map((d) => d.sub),
        { fill: c },
      ),
    );

  const ls = ts * 0.85;
  if (p.gate === 'quadrant') {
    out.push(
      ...pathPrim(
        [
          line({ x: sx(data.gx), y: Y(py0) }, { x: sx(data.gx), y: Y(py1) }),
          line({ x: X(px0), y: sy(data.gy) }, { x: X(px1), y: sy(data.gy) }),
        ],
        { stroke: axisC, sw: sw * 1.3, cap: 'butt' },
      ),
    );
    const m = ts * 0.4;
    const pct = (v: number) => `${v.toFixed(1)}%`;
    const q = data.quadrants;
    out.push(
      text(pct(q[0]), X(px0 + m), Y(py0 + m + ls / 2), ls, ink, { anchor: 'start' }),
      text(pct(q[1]), X(px1 - m), Y(py0 + m + ls / 2), ls, ink, { anchor: 'end' }),
      text(pct(q[2]), X(px0 + m), Y(py1 - m - ls / 2), ls, ink, { anchor: 'start' }),
      text(pct(q[3]), X(px1 - m), Y(py1 - m - ls / 2), ls, ink, { anchor: 'end' }),
    );
  } else if (p.gate === 'polygon') {
    const pts = data.polygon.map((v) => ({ x: sx(v.x), y: sy(v.y) }));
    out.push(...pathPrim([poly(pts, true)], { stroke: axisC, sw: sw * 1.3, join: 'round' }));
    const top = Math.min(...pts.map((v) => v.y));
    const cx = pts.reduce((a, v) => a + v.x, 0) / Math.max(1, pts.length);
    out.push(
      text(
        `${data.polygonPct.toFixed(1)}%`,
        X(cx),
        Y(Math.max(py0 + ls / 2, top - ls * 0.8)),
        ls,
        ink,
      ),
    );
  }
  return out;
}
