/**
 * Resizing imported plots without scaling their text, line widths and tick
 * lengths (note 17), on the real matplotlib, R and ggplot2 fixtures.
 */
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { importPdf, importSvgText } from '@/io/import';
import { type SvgNode, el, nodeToSvgString } from '@/render/svgNode';
import { loadTestFonts } from '@/test/fonts';

import { type ViewBox, drawnLeaves } from './plotCleanup';
import { type PlotLayout, growthFor, plotLayout, resizePlot } from './plotResize';
import { type PlotParts, plotParts } from './plotRoles';
import { sanitizeSvg } from './sanitize';

beforeAll(loadTestFonts);

async function load(name: string): Promise<string> {
  if (name.endsWith('.pdf')) {
    const bytes = new Uint8Array(readFileSync(new URL(`../pdf/fixtures/${name}`, import.meta.url)));
    const imp = await importPdf(bytes, name, () => Promise.resolve(1));
    if (imp?.asset.kind !== 'svgImport') throw new Error('not imported');
    return imp.asset.svg;
  }
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  const imp = importSvgText(text, name);
  if (imp.asset.kind !== 'svgImport') throw new Error('not imported');
  return imp.asset.svg;
}

const textOf = (n: SvgNode): string =>
  n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

interface Plot {
  readonly root: SvgNode;
  readonly viewBox: ViewBox;
  readonly parts: PlotParts;
  readonly layout: PlotLayout;
}

function analyse(svg: string): Plot {
  const s = sanitizeSvg(svg);
  const parts = plotParts(s.root, s.viewBox);
  const layout = plotLayout(s.root, s.viewBox, parts);
  if (!layout) throw new Error('no layout');
  return { root: s.root, viewBox: s.viewBox, parts, layout };
}

const stored = (root: SvgNode, vb: ViewBox): string =>
  nodeToSvgString(
    el(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', ...root.attrs, viewBox: vb.join(' ') },
      root.children,
    ),
  );

/** The plot resized to `fx × fy` its viewBox, stored and parsed back. */
function resized(
  p: Plot,
  fx: number,
  fy: number,
): { svg: string; plot: Plot; sx: number; sy: number } {
  const [sx, sy] = growthFor(p.viewBox, p.layout, p.viewBox[2] * fx, p.viewBox[3] * fy);
  const r = resizePlot(p.root, p.viewBox, p.layout, sx, sy);
  const svg = stored(r.root, r.viewBox);
  return { svg, plot: analyse(svg), sx, sy };
}

const FIXTURES = [
  'matplotlib-paths.svg',
  'matplotlib-text.svg',
  'matplotlib-log.svg',
  'r-svglite.svg',
  'r-cairo.svg',
  'matplotlib-subplots.svg',
  'r-facets.svg',
  'matplotlib-shared-colorbar.svg',
  'r-facets-touching.svg',
  'matplotlib-type3.pdf',
  'r-pdf.pdf',
  'r-cairo.pdf',
];
const SIZES: readonly (readonly [number, number])[] = [
  [1.6, 1],
  [1, 1.5],
  [0.7, 0.7],
];

const close = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol;

describe('resizePlot on the fixtures', () => {
  it.each(FIXTURES)('%s: text, widths and ticks keep their size; roles survive', async (name) => {
    const p = analyse(await load(name));
    for (const [fx, fy] of SIZES) {
      const { svg, plot: q, sx, sy } = resized(p, fx, fy);
      // The viewBox is the requested size: only the area changed.
      expect(q.viewBox[2]).toBeCloseTo(p.viewBox[2] * fx, 2);
      expect(q.viewBox[3]).toBeCloseTo(p.viewBox[3] * fy, 2);
      const span = (pl: Plot, axis: 0 | 1) =>
        pl.layout.spans[axis].reduce((a, [lo, hi]) => a + hi - lo, 0);
      expect(span(q, 0)).toBeCloseTo(span(p, 0) * sx, 1);
      expect(span(q, 1)).toBeCloseTo(span(p, 1) * sy, 1);
      expect(q.layout.regions.length).toBe(p.layout.regions.length);
      // Same text at the same sizes, same strokes at the same widths, same roles.
      expect(q.parts.texts.map((t) => [textOf(t.node), t.size, t.role])).toEqual(
        p.parts.texts.map((t) => [textOf(t.node), t.size, t.role]),
      );
      expect(q.parts.strokes.map((s) => [s.width, s.role])).toEqual(
        p.parts.strokes.map((s) => [s.width, s.role]),
      );
      // Ticks keep their length, and tick labels their offset from the tick.
      p.parts.strokes.forEach((s, i) => {
        const t = q.parts.strokes[i];
        if (s.role !== 'tick' || !s.base || !t?.base) return;
        const before = drawnLeaves(p.root, p.viewBox).find((l) => l.node === s.node)?.box;
        const after = drawnLeaves(q.root, q.viewBox).find((l) => l.node === t.node)?.box;
        if (!before || !after) throw new Error('no tick box');
        expect(close(after[2] - after[0], before[2] - before[0])).toBe(true);
        expect(close(after[3] - after[1], before[3] - before[1])).toBe(true);
      });
      const boxes = (pl: Plot) =>
        new Map(drawnLeaves(pl.root, pl.viewBox).map((l) => [l.path.join('.'), l.box]));
      const bp = boxes(p);
      const bq = boxes(q);
      p.parts.texts.forEach((t, i) => {
        const u = q.parts.texts[i];
        if (!t.tick || !u?.tick) return;
        const a = bp.get(t.path.join('.'));
        const b = bq.get(u.path.join('.'));
        if (!a || !b) throw new Error('no label box');
        expect(close(a[0] - t.tick[0], b[0] - u.tick[0])).toBe(true);
        expect(close(a[1] - t.tick[1], b[1] - u.tick[1])).toBe(true);
      });
      // The stored plot re-sanitises to itself.
      expect(stored(q.root, q.viewBox)).toBe(svg);
    }
  });

  it('matplotlib: titles stay centred on the axes, the legend keeps its corner', async () => {
    const p = analyse(await load('matplotlib-paths.svg'));
    const { plot: q } = resized(p, 1.6, 1.3);
    const find = (pl: Plot, s: string) => {
      const t = pl.parts.texts.find((x) => textOf(x.node) === s);
      const box = drawnLeaves(pl.root, pl.viewBox).find((l) => l.node === t?.node)?.box;
      if (!box) throw new Error(s);
      return box;
    };
    const mid = (b: readonly number[], i: 0 | 1) => ((b[i] ?? 0) + (b[i + 2] ?? 0)) / 2;
    for (const pl of [p, q]) {
      const a = pl.layout.area;
      // "Time (h)" and "Growth" centred across, "Signal (a.u.)" centred along y.
      expect(mid(find(pl, 'Time (h)'), 0)).toBeCloseTo(mid(a, 0), 0);
      expect(mid(find(pl, 'Growth'), 0)).toBeCloseTo(mid(a, 0), 0);
      expect(mid(find(pl, 'Signal (a.u.)'), 1)).toBeCloseTo(mid(a, 1), 0);
    }
    // Margins keep their size: the x title stays as far below the axes, the title above.
    const below = (pl: Plot) => find(pl, 'Time (h)')[1] - pl.layout.area[3];
    const above = (pl: Plot) => pl.layout.area[1] - find(pl, 'Growth')[3];
    expect(below(q)).toBeCloseTo(below(p), 3);
    expect(above(q)).toBeCloseTo(above(p), 3);
    // The legend (upper left) keeps its offset from that corner.
    const wild = (pl: Plot) => find(pl, 'Wild type');
    expect(wild(q)[0] - q.layout.area[0]).toBeCloseTo(wild(p)[0] - p.layout.area[0], 3);
    expect(wild(q)[1] - q.layout.area[1]).toBeCloseTo(wild(p)[1] - p.layout.area[1], 3);
  });

  it('PDFs: a legend in the upper right stays there; a mathtext axis title stays one label', async () => {
    const p = analyse(await load('matplotlib-type3.pdf'));
    const { plot: q } = resized(p, 1.5, 1.4);
    const box = (pl: Plot, s: string) => {
      const t = pl.parts.texts.find((x) => textOf(x.node) === s);
      const b = drawnLeaves(pl.root, pl.viewBox).find((l) => l.node === t?.node)?.box;
      if (!b) throw new Error(s);
      return b;
    };
    // "sin" keeps its distance from the right and top edges of the axes.
    expect(q.layout.area[2] - box(q, 'sin')[2]).toBeCloseTo(p.layout.area[2] - box(p, 'sin')[2], 3);
    expect(box(q, 'sin')[1] - q.layout.area[1]).toBeCloseTo(box(p, 'sin')[1] - p.layout.area[1], 3);
    // The mathtext y label (runs joined into one label, note 15) keeps its size and its
    // distance from the axes.
    const y = (pl: Plot) => box(pl, 'Signal μV');
    expect(y(q)[3] - y(q)[1]).toBeCloseTo(y(p)[3] - y(p)[1], 3);
    expect(q.layout.area[0] - y(q)[2]).toBeCloseTo(p.layout.area[0] - y(p)[2], 3);
  });

  it('R pdf(): markers keep their shape; data lines scale', async () => {
    const p = analyse(await load('r-pdf.pdf'));
    const { plot: q } = resized(p, 1.8, 1);
    const sizes = (pl: Plot) =>
      drawnLeaves(pl.root, pl.viewBox)
        .filter((l) => pl.layout.actions.get(l.path.join('.'))?.kind === 'move')
        .map((l) => Math.round((l.box[2] - l.box[0]) * 100) / 100);
    expect(sizes(q)).toEqual(sizes(p));
    expect(p.layout.actions.size).toBeGreaterThan(0);
  });

  it('a legend outside the panel (ggplot2 style) keeps its keys beside its labels', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
      '<rect x="20" y="10" width="200" height="160" fill="#ebebeb"/>' +
      '<polyline points="20,170 220,10" fill="none" stroke="#000"/>' +
      '<text x="235" y="80" font-size="10">group</text>' +
      '<rect x="235" y="88" width="12" height="12" fill="#f00"/>' +
      '<text x="252" y="98" font-size="8">a</text>' +
      '<rect x="235" y="104" width="12" height="12" fill="#00f"/>' +
      '<text x="252" y="114" font-size="8">b</text>' +
      '</svg>';
    const p = analyse(svg);
    expect(p.layout.area).toEqual([20, 10, 220, 170]);
    const { plot: q, sy } = resized(p, 1.5, 1.5);
    const boxes = (pl: Plot) => drawnLeaves(pl.root, pl.viewBox).map((l) => l.box);
    const [, , ...before] = boxes(p);
    const [, , ...after] = boxes(q);
    // Title, keys and labels move by one offset: with the panel's right edge, and with
    // their centre across (the legend is centred on the panel).
    const dx = (after[0]?.[0] ?? 0) - (before[0]?.[0] ?? 0);
    const dy = (after[0]?.[1] ?? 0) - (before[0]?.[1] ?? 0);
    expect(dx).toBeCloseTo(q.layout.area[2] - 220, 3);
    const top = Math.min(...before.map((b) => b[1]));
    const bottom = Math.max(...before.map((b) => b[3]));
    expect(dy).toBeCloseTo(((top + bottom) / 2 - 10) * (sy - 1), 3);
    before.forEach((b, i) => {
      expect(after[i]?.[0]).toBeCloseTo(b[0] + dx, 3);
      expect(after[i]?.[1]).toBeCloseTo(b[1] + dy, 3);
    });
  });

  /** The box of the label reading `s` (text or, in R's SVG, one of its glyph clusters). */
  const labelBox = (pl: Plot, s: string) => {
    const t = pl.parts.texts.find((x) => textOf(x.node) === s);
    const b = drawnLeaves(pl.root, pl.viewBox).find((l) => l.node === t?.node)?.box;
    if (!b) throw new Error(s);
    return b;
  };
  const panelsOf = (pl: Plot) => pl.layout.regions.filter((r) => !r.band).map((r) => r.box);
  const bandsOf = (pl: Plot) => pl.layout.regions.filter((r) => r.band);
  const mid = (b: readonly number[], i: 0 | 1) => ((b[i] ?? 0) + (b[i + 2] ?? 0)) / 2;

  it('matplotlib subplots: each panel scales, gaps and labels stay with their own axes', async () => {
    const p = analyse(await load('matplotlib-subplots.svg'));
    expect(panelsOf(p)).toHaveLength(4);
    expect(bandsOf(p).map((r) => r.band)).toEqual([{ axis: 0, side: 'hi', of: 3 }]);
    for (const [fx, fy] of [
      [1.5, 1.3],
      [0.8, 0.75],
    ] as const) {
      const { plot: q, sx, sy } = resized(p, fx, fy);
      const [a0, b0, c0, d0] = panelsOf(p);
      const [a1, b1, c1, d1] = panelsOf(q);
      if (!a0 || !b0 || !c0 || !d0 || !a1 || !b1 || !c1 || !d1) throw new Error('panels');
      // Every panel but the one giving way to the colour bar scales by the growth; the gaps
      // between columns and rows keep their size.
      for (const [x, y] of [
        [a0, a1],
        [b0, b1],
        [c0, c1],
      ] as const) {
        expect(x[2] - x[0]).toBeCloseTo((y[2] - y[0]) / sx, 2);
        expect(x[3] - x[1]).toBeCloseTo((y[3] - y[1]) / sy, 2);
      }
      expect(b1[0] - a1[2]).toBeCloseTo(b0[0] - a0[2], 2);
      expect(c1[1] - a1[3]).toBeCloseTo(c0[1] - a0[3], 2);
      // An inner subplot's axis title stays beside its own axis; titles stay centred on theirs.
      expect(b1[0] - labelBox(q, 'Count')[2]).toBeCloseTo(b0[0] - labelBox(p, 'Count')[2], 2);
      expect(mid(labelBox(q, 'Count'), 1)).toBeCloseTo(mid(b1, 1), 1);
      expect(mid(labelBox(q, 'Time (h)'), 0)).toBeCloseTo(mid(a1, 0), 1);
      expect(labelBox(q, 'Time (h)')[1] - a1[3]).toBeCloseTo(labelBox(p, 'Time (h)')[1] - a0[3], 2);
      expect(mid(labelBox(q, 'B'), 0)).toBeCloseTo(mid(b1, 0), 1);
      // The colour bar keeps its width and its gap to its panel, takes the panel's height, and
      // its right edge stays aligned with the panel above; its label stays beside it.
      const bar0 = bandsOf(p)[0]?.box;
      const bar1 = bandsOf(q)[0]?.box;
      if (!bar0 || !bar1) throw new Error('no colour bar');
      expect(bar1[2] - bar1[0]).toBeCloseTo(bar0[2] - bar0[0], 2);
      expect(bar1[0] - d1[2]).toBeCloseTo(bar0[0] - d0[2], 2);
      expect(bar1[3] - bar1[1]).toBeCloseTo(d1[3] - d1[1], 2);
      expect(b1[2] - bar1[2]).toBeCloseTo(b0[2] - bar0[2], 2);
      expect(labelBox(q, 'Level')[0] - bar1[2]).toBeCloseTo(labelBox(p, 'Level')[0] - bar0[2], 2);
      // A one-entry legend without a frame moves as one: its key keeps beside its label, both
      // in the lower left corner.
      const sin = (pl: Plot) => labelBox(pl, 'sin');
      expect(sin(q)[0] - a1[0]).toBeCloseTo(sin(p)[0] - a0[0], 2);
      expect(a1[3] - sin(q)[3]).toBeCloseTo(a0[3] - sin(p)[3], 2);
      const keyOf = (pl: Plot) => {
        const k = drawnLeaves(pl.root, pl.viewBox).find(
          (l) =>
            l.node.tag === 'path' &&
            l.box[2] <= sin(pl)[0] &&
            l.box[2] >= sin(pl)[0] - 10 &&
            l.box[1] >= sin(pl)[1] &&
            l.box[3] <= sin(pl)[3],
        );
        if (!k) throw new Error('no legend key');
        return k.box;
      };
      expect(sin(q)[0] - keyOf(q)[2]).toBeCloseTo(sin(p)[0] - keyOf(p)[2], 2);
      expect(keyOf(q)[2] - keyOf(q)[0]).toBeCloseTo(keyOf(p)[2] - keyOf(p)[0], 2);
    }
  });

  it('ggplot2 facets: strips keep their height on their panel, the legend stays beside', async () => {
    const p = analyse(await load('r-facets.svg'));
    expect(panelsOf(p)).toHaveLength(3);
    expect(bandsOf(p).map((r) => r.band)).toEqual(
      [0, 1, 2].map((of) => ({ axis: 1, side: 'lo', of })),
    );
    const { plot: q, sx } = resized(p, 1.4, 1.5);
    const before = panelsOf(p);
    const after = panelsOf(q);
    after.forEach((b, i) => {
      const a = before[i];
      const s0 = bandsOf(p)[i]?.box;
      const s1 = bandsOf(q)[i]?.box;
      if (!a || !s0 || !s1) throw new Error('facet');
      expect(b[2] - b[0]).toBeCloseTo((a[2] - a[0]) * sx, 2);
      // The strip: as wide as its panel, as high as before, still on top of it.
      expect(s1[3] - s1[1]).toBeCloseTo(s0[3] - s0[1], 2);
      expect(s1[0]).toBeCloseTo(b[0], 2);
      expect(s1[2]).toBeCloseTo(b[2], 2);
      expect(b[1] - s1[3]).toBeCloseTo(a[1] - s0[3], 2);
      const next = after[i + 1];
      const was = before[i + 1];
      if (next && was) expect(next[0] - b[2]).toBeCloseTo(was[0] - a[2], 2);
    });
    // Glyph outlines: a strip's label stays centred on it, the legend's keep their distance
    // from the last panel.
    const glyphs = (pl: Plot, box: readonly number[]) =>
      drawnLeaves(pl.root, pl.viewBox)
        .filter(
          (l) => l.box[0] >= (box[0] ?? 0) && l.box[2] <= (box[2] ?? 0) && l.box[3] - l.box[1] < 8,
        )
        .filter((l) => l.box[1] >= (box[1] ?? 0) && l.box[3] <= (box[3] ?? 0))
        .map((l) => l.box);
    const strip0 = bandsOf(p)[1]?.box ?? [0, 0, 0, 0];
    const strip1 = bandsOf(q)[1]?.box ?? [0, 0, 0, 0];
    const label0 = glyphs(p, strip0);
    const label1 = glyphs(q, strip1);
    expect(label1).toHaveLength(label0.length);
    expect(label1.length).toBeGreaterThan(0);
    const centre = (bs: (readonly number[])[]) =>
      (Math.min(...bs.map((b) => b[0] ?? 0)) + Math.max(...bs.map((b) => b[2] ?? 0))) / 2;
    expect(centre(label1) - mid(strip1, 0)).toBeCloseTo(centre(label0) - mid(strip0, 0), 1);
    const last0 = before[2] ?? [0, 0, 0, 0];
    const last1 = after[2] ?? [0, 0, 0, 0];
    const legend = (pl: Plot, last: readonly number[]) =>
      drawnLeaves(pl.root, pl.viewBox)
        .filter((l) => l.box[0] > (last[2] ?? 0) + 4)
        .map((l) => l.box);
    const l0 = legend(p, last0);
    const l1 = legend(q, last1);
    expect(l1).toHaveLength(l0.length);
    l0.forEach((b, i) => {
      expect((l1[i]?.[0] ?? 0) - last1[2]).toBeCloseTo(b[0] - last0[2], 2);
      expect((l1[i]?.[2] ?? 0) - (l1[i]?.[0] ?? 0)).toBeCloseTo(b[2] - b[0], 2);
    });
  });

  it('matplotlib: a colour bar shared by a column makes every panel in it give way alike', async () => {
    const p = analyse(await load('matplotlib-shared-colorbar.svg'));
    const panels0 = panelsOf(p);
    expect(panels0).toHaveLength(5);
    expect(bandsOf(p).map((r) => r.band)).toEqual([{ axis: 0, side: 'hi', of: 4, also: [2] }]);
    for (const [fx, fy] of [
      [1.5, 1.3],
      [0.8, 0.75],
    ] as const) {
      const { plot: q, sx, sy } = resized(p, fx, fy);
      const [a0, b0, c0, d0, e0] = panels0;
      const [a1, b1, c1, d1, e1] = panelsOf(q);
      const bar0 = bandsOf(p)[0]?.box;
      const bar1 = bandsOf(q)[0]?.box;
      if (!a0 || !b0 || !c0 || !d0 || !e0 || !a1 || !b1 || !c1 || !d1 || !e1 || !bar0 || !bar1)
        throw new Error('panels');
      // The wide panel and the left column scale by the growth; rows keep their gaps.
      for (const [x, y] of [
        [a0, a1],
        [b0, b1],
        [d0, d1],
      ] as const) {
        expect(y[2] - y[0]).toBeCloseTo((x[2] - x[0]) * sx, 2);
        expect(y[3] - y[1]).toBeCloseTo((x[3] - x[1]) * sy, 2);
      }
      expect(b1[1] - a1[3]).toBeCloseTo(b0[1] - a0[3], 2);
      // Both panels beside the bar give way alike: still aligned with each other.
      expect(c1[0]).toBeCloseTo(e1[0], 2);
      expect(c1[2]).toBeCloseTo(e1[2], 2);
      // The bar keeps its width, its gap to them and its distance to the wide panel's edge.
      expect(bar1[2] - bar1[0]).toBeCloseTo(bar0[2] - bar0[0], 2);
      expect(bar1[0] - e1[2]).toBeCloseTo(bar0[0] - e0[2], 2);
      expect(a1[2] - bar1[2]).toBeCloseTo(a0[2] - bar0[2], 2);
      // Along, it still runs from the top of the upper panel to the bottom of the lower.
      expect(bar1[1]).toBeCloseTo(c1[1], 2);
      expect(bar1[3]).toBeCloseTo(e1[3], 2);
      expect(labelBox(q, 'Level')[0] - bar1[2]).toBeCloseTo(labelBox(p, 'Level')[0] - bar0[2], 2);
    }
  });

  it('ggplot2 facets that touch scale as separate panels, still touching', async () => {
    const p = analyse(await load('r-facets-touching.svg'));
    expect(panelsOf(p)).toHaveLength(4);
    const { plot: q, sx, sy } = resized(p, 1.4, 1.2);
    const before = panelsOf(p);
    const after = panelsOf(q);
    after.forEach((b, i) => {
      const a = before[i];
      if (!a) throw new Error('facet');
      expect(b[2] - b[0]).toBeCloseTo((a[2] - a[0]) * sx, 2);
      expect(b[3] - b[1]).toBeCloseTo((a[3] - a[1]) * sy, 2);
    });
    const [tl, tr, bl] = after;
    if (!tl || !tr || !bl) throw new Error('facets');
    expect(tr[0]).toBeCloseTo(tl[2], 2);
    // Each strip keeps its height on top of its own panel.
    bandsOf(q).forEach((r, i) => {
      const was = bandsOf(p)[i]?.box ?? [0, 0, 0, 0];
      const of = after[r.band?.of ?? -1] ?? [0, 0, 0, 0];
      expect(r.box[3] - r.box[1]).toBeCloseTo(was[3] - was[1], 2);
      expect(r.box[3]).toBeCloseTo(of[1], 2);
      expect(r.box[0]).toBeCloseTo(of[0], 2);
      expect(r.box[2]).toBeCloseTo(of[2], 2);
    });
    // An axis line along both keeps them one panel.
    const joined = analyse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">' +
        '<rect x="20" y="10" width="130" height="90" fill="#eee"/>' +
        '<rect x="150" y="10" width="130" height="90" fill="#ddd"/>' +
        '<line x1="20" y1="100" x2="280" y2="100" stroke="#000"/>' +
        '</svg>',
    );
    expect(joined.layout.regions).toEqual([{ box: [20, 10, 280, 100] }]);
  });

  it('a strip over two panels keeps lying along both, gap included', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 140">' +
      '<rect x="20" y="30" width="110" height="90" fill="#eee" stroke="#000"/>' +
      '<rect x="170" y="30" width="110" height="90" fill="#eee" stroke="#000"/>' +
      '<rect x="20" y="10" width="260" height="16" fill="#ccc"/>' +
      '</svg>';
    const p = analyse(svg);
    expect(bandsOf(p).map((r) => r.band)).toEqual([{ axis: 1, side: 'lo', of: 0, also: [1] }]);
    const { plot: q } = resized(p, 1.5, 1.3);
    const [l, r] = panelsOf(q);
    const strip = bandsOf(q)[0]?.box ?? [0, 0, 0, 0];
    expect(strip[0]).toBeCloseTo(l?.[0] ?? 0, 2);
    expect(strip[2]).toBeCloseTo(r?.[2] ?? 0, 2);
    expect(strip[3] - strip[1]).toBeCloseTo(16, 2);
    expect((r?.[0] ?? 0) - (l?.[2] ?? 0)).toBeCloseTo(40, 2);
  });

  it('panels joined by something drawn across them stay one area', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">' +
      '<rect x="20" y="10" width="110" height="90" fill="#eee"/>' +
      '<line x1="20" y1="100" x2="130" y2="100" stroke="#000"/>' +
      '<rect x="170" y="10" width="110" height="90" fill="#eee"/>' +
      '<line x1="170" y1="100" x2="280" y2="100" stroke="#000"/>' +
      '<polyline points="30,90 270,20" fill="none" stroke="#c00"/>' +
      '</svg>';
    const p = analyse(svg);
    expect(p.layout.regions).toEqual([{ box: [20, 10, 280, 100] }]);
    // Without the line across, they are two panels.
    const two = analyse(svg.replace(/<polyline[^>]*\/>/, ''));
    expect(panelsOf(two)).toEqual([
      [20, 10, 130, 100],
      [170, 10, 280, 100],
    ]);
  });

  it('a colour bar beside a lone panel keeps its width and its gap', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">' +
      '<rect x="20" y="10" width="140" height="90" fill="#eee" stroke="#000"/>' +
      '<rect x="166" y="10" width="8" height="90" fill="#08f" stroke="#000"/>' +
      '<line x1="174" y1="20" x2="177" y2="20" stroke="#000"/>' +
      '<line x1="174" y1="60" x2="177" y2="60" stroke="#000"/>' +
      '<text x="179" y="23" font-size="8">1</text>' +
      '<text x="179" y="63" font-size="8">0</text>' +
      '</svg>';
    const p = analyse(svg);
    expect(bandsOf(p).map((r) => r.band)).toEqual([{ axis: 0, side: 'hi', of: 0 }]);
    const { plot: q, sx, sy } = resized(p, 1.5, 1.5);
    const bar0 = bandsOf(p)[0]?.box ?? [0, 0, 0, 0];
    const bar1 = bandsOf(q)[0]?.box ?? [0, 0, 0, 0];
    const [panel] = panelsOf(q);
    expect(bar1[2] - bar1[0]).toBeCloseTo(bar0[2] - bar0[0], 2);
    expect(bar1[0] - (panel?.[2] ?? 0)).toBeCloseTo(bar0[0] - 160, 2);
    expect(bar1[3] - bar1[1]).toBeCloseTo((bar0[3] - bar0[1]) * sy, 2);
    expect(sx).toBeGreaterThan(1);
    // Its tick labels stay beside it.
    expect(labelBox(q, '1')[0] - bar1[2]).toBeCloseTo(labelBox(p, '1')[0] - bar0[2], 2);
  });

  it('never shrinks the area below its minimum; text then scales with the plot', async () => {
    const p = analyse(await load('r-svglite.svg'));
    const [sx, sy] = growthFor(p.viewBox, p.layout, 1, 1);
    expect(sx).toBe(0.05);
    expect(sy).toBe(0.05);
  });
});
