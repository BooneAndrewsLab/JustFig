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
  const [sx, sy] = growthFor(p.viewBox, p.layout.area, p.viewBox[2] * fx, p.viewBox[3] * fy);
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
      expect(q.layout.area[2] - q.layout.area[0]).toBeCloseTo(
        (p.layout.area[2] - p.layout.area[0]) * sx,
        1,
      );
      expect(q.layout.area[3] - q.layout.area[1]).toBeCloseTo(
        (p.layout.area[3] - p.layout.area[1]) * sy,
        1,
      );
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

  it('PDFs: a legend in the upper right stays there; split axis titles stay together', async () => {
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
    // "Signal" and "μ" (mathtext split into runs) move as one.
    expect(box(q, 'μ')[1] - box(q, 'Signal')[1]).toBeCloseTo(
      box(p, 'μ')[1] - box(p, 'Signal')[1],
      3,
    );
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

  it('never shrinks the area below its minimum; text then scales with the plot', async () => {
    const p = analyse(await load('r-svglite.svg'));
    const [sx, sy] = growthFor(p.viewBox, p.layout.area, 1, 1);
    expect(sx).toBe(0.05);
    expect(sy).toBe(0.05);
  });
});
