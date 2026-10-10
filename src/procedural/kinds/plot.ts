/**
 * Placeholder plot (note 04): a plot-shaped drawing for schematics and
 * graphical abstracts before real data exists. PCA, UMAP, scatter or bar,
 * drawn from a seed so the same params always give the same points. Points
 * of one group are one `<path>`; axes, ticks and error bars one more.
 */
import { type Prim, type Sub, circle, line, pathPrim, poly, rect } from '../prims';
import { type Item, defineKind } from '../types';
import { type GateType, renderFlow } from './flow';
import { byColour, clamp, mix, rng, text } from './util';

/** Okabe–Ito, colourblind-safe: the colour each new group gets, in order. */
export const GROUP_COLOURS = [
  '#0072b2',
  '#d55e00',
  '#009e73',
  '#cc79a7',
  '#e69f00',
  '#56b4e9',
  '#f0e442',
  '#999999',
] as const;

export type PlotType = 'pca' | 'umap' | 'scatter' | 'bar' | 'flow';

export interface Group {
  readonly name: string;
  readonly color: string;
}

export interface PlotParams {
  readonly plot: PlotType;
  readonly groups: readonly Group[];
  readonly points: number;
  readonly spread: number;
  readonly pointSize: number;
  readonly axes: boolean;
  readonly axisLabels: boolean;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly legend: boolean;
  readonly errorBars: boolean;
  readonly dots: boolean;
  readonly events: number;
  readonly gate: GateType;
  readonly seed: number;
}

/** Dots drawn on each bar when "Data points" is on. */
const BAR_DOTS = 6;

/** The axis labels a plot type gets when its label fields are empty. */
export function autoLabels(plot: PlotType, seed: number): { x: string; y: string } {
  switch (plot) {
    case 'pca': {
      // Plausible explained variances, from the seed: PC1 25–54%, PC2 below it.
      const r = rng(seed + 101);
      const pc1 = 25 + Math.floor(r() * 30);
      const pc2 = 8 + Math.floor(r() * Math.min(pc1 - 8, 17));
      return { x: `PC1 (${String(pc1)}%)`, y: `PC2 (${String(pc2)}%)` };
    }
    case 'umap':
      return { x: 'UMAP 1', y: 'UMAP 2' };
    case 'scatter':
      return { x: 'x', y: 'y' };
    case 'bar':
      return { x: '', y: 'Value' };
    case 'flow':
      return { x: 'CD4-FITC', y: 'CD8-PE' };
  }
}

/** A standard normal draw (Box–Muller) from a uniform source. */
const gauss = (rand: () => number): number =>
  Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

/** `n` well-separated centres in [lo, hi]² (best of 20 candidates each). */
function centres(
  n: number,
  rand: () => number,
  lo: number,
  hi: number,
): { u: number; v: number }[] {
  const out: { u: number; v: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    let best = { u: 0.5, v: 0.5 };
    let bestD = -1;
    for (let c = 0; c < 20; c += 1) {
      const q = { u: lo + rand() * (hi - lo), v: lo + rand() * (hi - lo) };
      const d = out.reduce((m, o) => Math.min(m, Math.hypot(o.u - q.u, o.v - q.v)), Infinity);
      if (d > bestD) {
        best = q;
        bestD = d;
      }
    }
    out.push(best);
  }
  return out;
}

/** Points of each group in unit coordinates (u right, v up), seeded. */
export function plotPoints(p: PlotParams): { u: number; v: number }[][] {
  const rand = rng(p.seed);
  const n = p.groups.length;
  const s = p.spread;
  const out: { u: number; v: number }[][] = [];
  if (p.plot === 'scatter') {
    for (let g = 0; g < n; g += 1) {
      const off = n > 1 ? (g / (n - 1) - 0.5) * 0.4 : 0;
      const pts: { u: number; v: number }[] = [];
      for (let i = 0; i < p.points; i += 1) {
        const u = 0.05 + rand() * 0.9;
        pts.push({ u, v: 0.25 + 0.5 * u + off + gauss(rand) * 0.06 * s });
      }
      out.push(pts);
    }
    return out;
  }
  const umap = p.plot === 'umap';
  const cs = centres(n, rand, umap ? 0.15 : 0.22, umap ? 0.85 : 0.78);
  for (const c of cs) {
    const pts: { u: number; v: number }[] = [];
    if (umap) {
      // Two to four sub-blobs per cluster give UMAP's lumpy, irregular islands.
      const k = 2 + Math.floor(rand() * 3);
      const subs = Array.from({ length: k }, () => ({
        u: c.u + gauss(rand) * 0.04 * s,
        v: c.v + gauss(rand) * 0.04 * s,
      }));
      for (let i = 0; i < p.points; i += 1) {
        const b = subs[Math.floor(rand() * k)] ?? c;
        pts.push({ u: b.u + gauss(rand) * 0.022 * s, v: b.v + gauss(rand) * 0.022 * s });
      }
    } else {
      // PCA: elongated, tilted Gaussian clouds, wider along PC1.
      const a = (rand() - 0.5) * 1.2;
      const sx = 0.07 * s * (0.8 + 0.5 * rand());
      const sy = 0.04 * s * (0.8 + 0.5 * rand());
      for (let i = 0; i < p.points; i += 1) {
        const x = gauss(rand) * sx;
        const y = gauss(rand) * sy;
        pts.push({
          u: c.u + x * Math.cos(a) - y * Math.sin(a),
          v: c.v + x * Math.sin(a) + y * Math.cos(a),
        });
      }
    }
    out.push(pts);
  }
  return out;
}

export const placeholderPlot = defineKind<PlotParams>({
  kind: 'placeholderPlot',
  version: 1,
  title: 'Placeholder plot',
  category: 'Data',
  description:
    'A plot-shaped placeholder (PCA, UMAP, scatter, bar or flow cytometry) drawn from a seed.',
  keywords: [
    'pca',
    'umap',
    'tsne',
    'scatter',
    'bar',
    'chart',
    'graph',
    'cluster',
    'embedding',
    'flow',
    'cytometry',
    'facs',
    'gate',
    'data',
    'mockup',
  ],
  defaultSize: { w: 200, h: 160 },
  fields: [
    {
      key: 'plot',
      label: 'Plot type',
      type: 'enum',
      options: [
        { value: 'pca', label: 'PCA' },
        { value: 'umap', label: 'UMAP' },
        { value: 'scatter', label: 'Scatter' },
        { value: 'bar', label: 'Bar chart' },
        { value: 'flow', label: 'Flow cytometry' },
      ],
      default: 'pca',
    },
    {
      key: 'groups',
      label: 'Groups',
      type: 'list',
      min: 1,
      max: 8,
      help: 'Clusters, or bars of a bar chart. Flow cytometry uses the first colour for events and the second for events inside the polygon gate.',
      item: [
        { key: 'name', label: 'Name', type: 'text', maxLength: 30, default: '' },
        { key: 'color', label: 'Colour', type: 'color', default: GROUP_COLOURS[0] },
      ],
      default: [
        { name: 'Control', color: GROUP_COLOURS[0] },
        { name: 'Treated', color: GROUP_COLOURS[1] },
        { name: 'Knockout', color: GROUP_COLOURS[2] },
      ],
      itemTitle: (it: Item, i: number) =>
        typeof it['name'] === 'string' && it['name'] !== '' ? it['name'] : `Group ${String(i + 1)}`,
      newItem: (_p, items) => ({
        name: `Group ${String(items.length + 1)}`,
        color: GROUP_COLOURS[items.length % GROUP_COLOURS.length] ?? GROUP_COLOURS[0],
      }),
    },
    {
      key: 'points',
      label: 'Points per group',
      type: 'int',
      min: 1,
      max: 1000,
      default: 60,
      showIf: (p) => p['plot'] !== 'bar' && p['plot'] !== 'flow',
    },
    {
      key: 'events',
      label: 'Events',
      type: 'int',
      min: 50,
      max: 5000,
      default: 1500,
      help: 'How many cells the flow plot draws.',
      showIf: (p) => p['plot'] === 'flow',
    },
    {
      key: 'gate',
      label: 'Gate',
      type: 'enum',
      options: [
        { value: 'none', label: 'None' },
        { value: 'quadrant', label: 'Quadrant' },
        { value: 'polygon', label: 'Polygon' },
      ],
      default: 'quadrant',
      help: 'The percentages are the share of the drawn events in each region.',
      showIf: (p) => p['plot'] === 'flow',
    },
    {
      key: 'spread',
      label: 'Spread',
      type: 'number',
      min: 0.25,
      max: 2.5,
      step: 0.05,
      default: 1,
      help: 'How loose the clusters, or how long the error bars, are.',
    },
    {
      key: 'pointSize',
      label: 'Point size',
      type: 'number',
      min: 0.5,
      max: 12,
      step: 0.25,
      unit: 'pt',
      default: 2.5,
      showIf: (p) => p['plot'] !== 'bar' || p['dots'] === true,
    },
    { key: 'axes', label: 'Axes', type: 'bool', default: true },
    { key: 'axisLabels', label: 'Axis labels', type: 'bool', default: true },
    {
      key: 'xLabel',
      label: 'x-axis label',
      type: 'text',
      maxLength: 40,
      default: '',
      placeholder: 'Automatic',
      help: 'Empty uses the usual label for the plot type.',
      showIf: (p) => p['axisLabels'] === true,
    },
    {
      key: 'yLabel',
      label: 'y-axis label',
      type: 'text',
      maxLength: 40,
      default: '',
      placeholder: 'Automatic',
      showIf: (p) => p['axisLabels'] === true,
    },
    {
      key: 'legend',
      label: 'Group names',
      type: 'bool',
      default: true,
      showIf: (p) => p['plot'] !== 'flow',
      help: 'A legend beside the plot; under the bars of a bar chart.',
    },
    {
      key: 'errorBars',
      label: 'Error bars',
      type: 'bool',
      default: true,
      showIf: (p) => p['plot'] === 'bar',
    },
    {
      key: 'dots',
      label: 'Data points',
      type: 'bool',
      default: true,
      showIf: (p) => p['plot'] === 'bar',
    },
    {
      key: 'seed',
      label: 'Arrangement',
      type: 'int',
      min: 0,
      max: 99999,
      default: 3,
      help: 'Another number gives another set of points.',
    },
  ],
  slots: [
    { id: 'axis', label: 'Axes', default: '#1f2933' },
    { id: 'text', label: 'Text', default: '#1f2933' },
  ],
  render(p, { w, h, slots }) {
    const out: Prim[] = [];
    const axisC = slots['axis'] ?? '#1f2933';
    const ink = slots['text'] ?? '#1f2933';
    const X = (x: number) => clamp(x, 0, w);
    const Y = (y: number) => clamp(y, 0, h);
    const ts = clamp(Math.min(w, h) * 0.055, 1, 9);
    const sw = clamp(Math.min(w, h) * 0.006, 0.1, 1.2);
    const bar = p.plot === 'bar';
    const umap = p.plot === 'umap';
    const auto = autoLabels(p.plot, p.seed);
    const xl = p.axisLabels ? p.xLabel.trim() || auto.x : '';
    const yl = p.axisLabels ? p.yLabel.trim() || auto.y : '';
    const flow = p.plot === 'flow';
    const legend = p.legend && !bar && !flow && p.groups.some((g) => g.name.trim() !== '');
    const chars = Math.max(0, ...p.groups.map((g) => g.name.trim().length));
    const legendW = legend ? Math.min(w * 0.35, ts * (1.6 + 0.55 * chars)) : 0;
    const names = p.legend && bar;
    // The flow style adds room for the 10^k tick labels.
    const left = Math.min(
      w * (flow ? 0.4 : 0.3),
      (yl ? ts * 1.9 : ts * 0.5) + (flow ? ts * 1.8 : 0),
    );
    const bottom = Math.min(
      h * (flow ? 0.4 : 0.3),
      (xl ? ts * 1.9 : ts * 0.5) + (names ? ts * 1.3 : 0) + (flow ? ts * 1.2 : 0),
    );
    const top = Math.min(h * 0.1, ts * 0.6);
    const px0 = left;
    const px1 = Math.max(px0, w - legendW - ts * 0.5);
    const py0 = top;
    const py1 = Math.max(py0, h - bottom);
    const pw = px1 - px0;
    const ph = py1 - py0;
    const tick = ts * 0.3;

    if (flow) {
      out.push(...renderFlow(p, { w, h, px0, px1, py0, py1, ts, sw, tick, axisC, ink }));
    }

    // Axes: an L with a few unlabelled ticks, or UMAP's two short corner arrows.
    if (p.axes && !flow) {
      const ax: Sub[] = [];
      if (umap) {
        const L = Math.min(pw, ph) * 0.25;
        const a = Math.min(ts * 0.45, L * 0.3);
        ax.push(line({ x: X(px0), y: Y(py1) }, { x: X(px0 + L), y: Y(py1) }));
        ax.push(line({ x: X(px0), y: Y(py1) }, { x: X(px0), y: Y(py1 - L) }));
        const heads: Sub[] = [
          poly(
            [
              { x: X(px0 + L + a), y: Y(py1) },
              { x: X(px0 + L), y: Y(py1 - a * 0.5) },
              { x: X(px0 + L), y: Y(py1 + a * 0.5) },
            ],
            true,
          ),
          poly(
            [
              { x: X(px0), y: Y(py1 - L - a) },
              { x: X(px0 - a * 0.5), y: Y(py1 - L) },
              { x: X(px0 + a * 0.5), y: Y(py1 - L) },
            ],
            true,
          ),
        ];
        out.push(...pathPrim(heads, { fill: axisC }));
      } else {
        ax.push(
          poly([
            { x: X(px0), y: Y(py0) },
            { x: X(px0), y: Y(py1) },
            { x: X(px1), y: Y(py1) },
          ]),
        );
        for (let i = 1; i <= 4; i += 1) {
          const y = py1 - (ph * i) / 4.4;
          ax.push(line({ x: X(px0 - tick), y: Y(y) }, { x: X(px0), y: Y(y) }));
          if (!bar) {
            const x = px0 + (pw * i) / 4.4;
            ax.push(line({ x: X(x), y: Y(py1) }, { x: X(x), y: Y(py1 + tick) }));
          }
        }
      }
      out.push(...pathPrim(ax, { stroke: axisC, sw, cap: 'butt', join: 'miter' }));
    }

    const colour = (g: Group) => g.color;
    if (bar) {
      const n = p.groups.length;
      const pitch = pw / Math.max(1, n);
      const bw = pitch * 0.62;
      const rand = rng(p.seed);
      const r = Math.min(p.pointSize / 2, bw / 2, ph / 2);
      const bars: { colour: string; sub: Sub }[] = [];
      const dots: { colour: string; sub: Sub }[] = [];
      const errs: Sub[] = [];
      p.groups.forEach((g, k) => {
        const v = 0.3 + 0.55 * rand();
        const e = (0.03 + 0.05 * rand()) * p.spread;
        const x = px0 + k * pitch + (pitch - bw) / 2;
        const yTop = py1 - v * ph * 0.85;
        bars.push({ colour: g.color, sub: rect(X(x), Y(yTop), bw, Math.max(0, py1 - yTop)) });
        const eh = e * ph * 0.85;
        if (p.errorBars) {
          const cx = x + bw / 2;
          const cap = bw * 0.15;
          errs.push(line({ x: X(cx), y: Y(yTop - eh) }, { x: X(cx), y: Y(yTop + eh) }));
          errs.push(line({ x: X(cx - cap), y: Y(yTop - eh) }, { x: X(cx + cap), y: Y(yTop - eh) }));
          errs.push(line({ x: X(cx - cap), y: Y(yTop + eh) }, { x: X(cx + cap), y: Y(yTop + eh) }));
        }
        if (p.dots)
          for (let i = 0; i < BAR_DOTS; i += 1) {
            const dx = x + bw * (0.2 + 0.6 * rand());
            const dy = yTop + gauss(rand) * eh * 1.2;
            dots.push({
              colour: mix(g.color, '#000000', 0.45),
              sub: circle(clamp(dx, x + r, x + bw - r), clamp(dy, py0 + r, py1 - r), r),
            });
          }
        if (names && g.name.trim() !== '')
          out.push(text(g.name, X(x + bw / 2), Y(py1 + tick + ts * 0.7), ts * 0.85, ink));
      });
      for (const [c, list] of byColour(bars, (b) => b.colour))
        out.push(
          ...pathPrim(
            list.map((b) => b.sub),
            { fill: c },
          ),
        );
      out.push(...pathPrim(errs, { stroke: axisC, sw, cap: 'butt' }));
      for (const [c, list] of byColour(dots, (b) => b.colour))
        out.push(
          ...pathPrim(
            list.map((b) => b.sub),
            { fill: c },
          ),
        );
    } else if (!flow) {
      const pad = p.axes && !umap ? 0.03 : 0;
      const r = Math.min(p.pointSize / 2, pw / 2, ph / 2);
      const groups = plotPoints(p);
      const placed = p.groups.map((g, k) => ({
        colour: colour(g),
        subs: (groups[k] ?? []).map((q) =>
          circle(
            px0 + r + clamp(q.u * (1 - pad) + pad, 0, 1) * (pw - 2 * r),
            py1 - r - clamp(q.v * (1 - pad) + pad, 0, 1) * (ph - 2 * r),
            r,
          ),
        ),
      }));
      for (const [c, list] of byColour(placed, (g) => g.colour))
        out.push(
          ...pathPrim(
            list.flatMap((g) => g.subs),
            { fill: c },
          ),
        );
    }

    // Axis labels: centred on the axes, or at UMAP's corner arrows.
    if (xl !== '')
      out.push(
        text(xl, X(umap ? px0 : (px0 + px1) / 2), Y(h - ts * 0.7), ts, ink, {
          anchor: umap ? 'start' : 'middle',
        }),
      );
    if (yl !== '')
      out.push(
        text(yl, X(ts * 0.7), Y(umap ? py1 : (py0 + py1) / 2), ts, ink, {
          anchor: umap ? 'start' : 'middle',
          rotation: -90,
        }),
      );

    if (legend) {
      const mr = ts * 0.35;
      const x0 = px1 + ts * 0.5;
      let y = py0 + ts * 0.6;
      const marks: { colour: string; sub: Sub }[] = [];
      for (const g of p.groups) {
        if (y > py1) break;
        if (g.name.trim() === '') continue;
        const rr = Math.min(mr, w / 2, h / 2);
        marks.push({
          colour: g.color,
          sub: circle(clamp(x0 + mr, rr, w - rr), clamp(y, rr, h - rr), rr),
        });
        out.push(
          text(g.name, X(x0 + mr * 2 + ts * 0.35), Y(y), ts * 0.85, ink, { anchor: 'start' }),
        );
        y += ts * 1.3;
      }
      for (const [c, list] of byColour(marks, (m) => m.colour))
        out.push(
          ...pathPrim(
            list.map((m) => m.sub),
            { fill: c },
          ),
        );
    }
    return out;
  },
});
