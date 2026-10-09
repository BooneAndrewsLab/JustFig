/**
 * Resizing imported plots keeping their text and line sizes (note 17), as
 * edits: copy-on-write assets, groups and panels, the drag, Match size and
 * Arrange in grid; and bounds kept around restyled text (issue 30).
 */
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { importPdf, importSvgText } from '@/io/import';
import { drawnLeaves } from '@/io/svg/plotCleanup';
import { parsedSvg } from '@/render/assets';
import { loadTestFonts } from '@/test/fonts';

import { apply as applyMat, frameMatrix } from '../geometry/matrix';
import { objBounds } from '../geometry/transform';
import { createDoc, frame } from '../model/factory';
import type { Id } from '../model/ids';
import { findObj } from '../model/tree';
import type { Figure, Frame, Image, Obj, Page } from '../model/types';
import { addObjects, groupObjects, matchSize, resizeObjects } from './edits';
import { arrangeInGrid, GRID_DEFAULTS } from './grid';
import { placeImport } from './placeImport';
import { growFrame, partsOf } from './plotSize';
import { plotOf, setStyles } from './style';

beforeAll(loadTestFonts);

const MPL = importSvgText(
  readFileSync(new URL('../../io/svg/fixtures/matplotlib-paths.svg', import.meta.url), 'utf8'),
  'matplotlib-paths.svg',
);

let n = 0;
function image(w: number, h: number, x = 0, y = 0): Image {
  n += 1;
  return {
    id: `img${String(n)}` as Id,
    type: 'image',
    frame: frame(x, y, w, h),
    opacity: 1,
    asset: MPL.hash,
  };
}

function setup(objs: readonly Obj[]): { fig: Figure; page: Page } {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const fig = addObjects(page.id, objs, { [MPL.hash]: MPL.asset }).apply({ doc, assets: {} });
  return { fig, page };
}

const get = (f: Figure, page: Page, id: Id): Image => {
  const p = f.doc.pages.find((x) => x.id === page.id);
  const o = p ? findObj(p, id) : undefined;
  if (o?.type !== 'image') throw new Error('missing');
  return o;
};

function svgOf(f: Figure, hash: string): string {
  const a = f.assets[hash];
  if (a?.kind !== 'svgImport') throw new Error('no plot asset');
  return a.svg;
}
const viewBoxOf = (f: Figure, hash: string) => parsedSvg(svgOf(f, hash)).viewBox;

/** Text sizes and line widths in page points, per role. */
function looks(f: Figure, o: Image) {
  const plot = plotOf(o, f.assets);
  if (!plot) throw new Error('no plot');
  return {
    text: plot.parts.texts.map((t) => Math.round(t.size * plot.k * 100) / 100),
    lines: plot.parts.strokes.map((s) => Math.round(s.width * plot.k * 100) / 100),
  };
}

describe('resizing plots keeping text and line sizes', () => {
  it('resize: text and lines keep their page size; the frame is the one asked for', () => {
    const a = image(MPL.w, MPL.h);
    const copy = image(MPL.w, MPL.h, 400);
    const { fig, page } = setup([a, copy]);
    const box = objBounds(a);
    const to = { x: 10, y: 20, w: box.w * 1.5, h: box.h * 1.2 };
    const next = resizeObjects(page.id, [a.id], box, to, 'keep').apply(fig);
    const got = get(next, page, a.id);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(got.frame[k]).toBeCloseTo(to[k], 6);
    expect(looks(next, got)).toEqual(looks(fig, a));
    // Copy-on-write: the unselected copy keeps the original, so both assets stay.
    expect(got.asset).not.toBe(MPL.hash);
    expect(get(next, page, copy.id).asset).toBe(MPL.hash);
    expect(Object.keys(next.assets).sort()).toEqual([MPL.hash, got.asset].sort());
    // The asset maps at the plot's original scale: one user unit is the same on the page.
    const [, , vw, vh] = viewBoxOf(next, got.asset);
    const [, , vw0, vh0] = viewBoxOf(fig, MPL.hash);
    expect(got.frame.w / vw).toBeCloseTo(a.frame.w / vw0, 6);
    expect(got.frame.h / vh).toBeCloseTo(a.frame.h / vh0, 6);
  });

  it('plain scaling is still there, and the replaced asset goes when nothing uses it', () => {
    const a = image(MPL.w, MPL.h);
    const { fig, page } = setup([a]);
    const box = objBounds(a);
    const to = { ...box, w: box.w * 2, h: box.h * 2 };
    const plain = resizeObjects(page.id, [a.id], box, to).apply(fig);
    expect(get(plain, page, a.id).asset).toBe(MPL.hash);
    expect(looks(plain, get(plain, page, a.id)).text[0]).toBeCloseTo(
      (looks(fig, a).text[0] ?? 0) * 2,
      1,
    );
    const kept = resizeObjects(page.id, [a.id], box, to, 'keep').apply(fig);
    expect(Object.keys(kept.assets)).toEqual([get(kept, page, a.id).asset]);
  });

  it('a drag recomputed from its start gives the same plot for the same box', () => {
    const a = image(MPL.w, MPL.h);
    const { fig, page } = setup([a]);
    const box = objBounds(a);
    const to = { ...box, w: box.w * 1.3 };
    const once = resizeObjects(page.id, [a.id], box, to, 'keep').apply(fig);
    const mid = resizeObjects(page.id, [a.id], box, { ...box, w: box.w * 2 }, 'keep').apply(fig);
    expect(get(mid, page, a.id).asset).not.toBe(get(once, page, a.id).asset);
    const again = resizeObjects(page.id, [a.id], box, to, 'keep').apply(fig);
    expect(get(again, page, a.id).asset).toBe(get(once, page, a.id).asset);
    expect(again.assets).toEqual(once.assets);
  });

  it('reaches plots inside groups, Match size and Arrange in grid', () => {
    const a = image(MPL.w, MPL.h);
    const b = image(MPL.w / 2, MPL.h / 2, 400);
    const { fig, page } = setup([a, b]);
    const grouped = groupObjects(page.id, [a.id, b.id], 'g1' as Id).apply(fig);
    const g = grouped.doc.pages[0]?.layers[0]?.children.find((o) => o.id === ('g1' as Id));
    if (!g) throw new Error('no group');
    const box = objBounds(g);
    const r = resizeObjects(page.id, [g.id], box, { ...box, w: box.w * 1.5 }, 'keep').apply(
      grouped,
    );
    expect(looks(r, get(r, page, a.id))).toEqual(looks(fig, a));
    expect(looks(r, get(r, page, b.id))).toEqual(looks(fig, b));

    const m = matchSize(page.id, [a, b], { w: a.frame.w }, 'keep').apply(fig);
    expect(get(m, page, b.id).frame.w).toBeCloseTo(a.frame.w, 6);
    expect(looks(m, get(m, page, b.id))).toEqual(looks(fig, b));

    const grid = arrangeInGrid(
      page.id,
      [a.id, b.id],
      { ...GRID_DEFAULTS, rows: 1, cols: 2 },
      'keep',
    ).apply(fig);
    expect(looks(grid, get(grid, page, a.id))).toEqual(looks(fig, a));
    expect(looks(grid, get(grid, page, b.id))).toEqual(looks(fig, b));
  });
});

describe('growFrame', () => {
  it('keeps the shared part of the plot in place, rotated and flipped too', () => {
    const vb = [0, 0, 100, 50] as const;
    const next = [-10, 0, 120, 60] as const;
    for (const f of [
      frame(10, 20, 200, 100),
      { ...frame(10, 20, 200, 100), rotation: 30 },
      { ...frame(10, 20, 200, 100), rotation: -75, flipX: true },
    ] as Frame[]) {
      const g = growFrame(f, vb, next);
      expect(g.w).toBeCloseTo(240, 6);
      expect(g.h).toBeCloseTo(120, 6);
      // The viewBox point (30, 40) lands on the same page point.
      const before = applyMat(frameMatrix(f), { x: 30 * 2, y: 40 * 2 });
      const after = applyMat(frameMatrix(g), { x: (30 + 10) * 2, y: 40 * 2 });
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });
});

describe('restyled plots keep their bounds around their text (issue 30)', () => {
  it('a large title grows the viewBox and the frame; the plot stays put', () => {
    const a = image(MPL.w, MPL.h, 50, 60);
    const { fig, page } = setup([a]);
    const next = setStyles(page.id, [a], { size: 40, textTarget: 'label' }, 'Font size').apply(fig);
    const got = get(next, page, a.id);
    const before = viewBoxOf(fig, MPL.hash);
    const after = viewBoxOf(next, got.asset);
    expect(after[2]).toBeGreaterThan(before[2]);
    expect(got.frame.w).toBeGreaterThan(a.frame.w);
    // Same scale, and a viewBox point stays on the same page point.
    expect(got.frame.w / after[2]).toBeCloseTo(a.frame.w / before[2], 6);
    const k = a.frame.w / before[2];
    const p0 = applyMat(frameMatrix(a.frame), {
      x: (100 - before[0]) * k,
      y: (80 - before[1]) * k,
    });
    const p1 = applyMat(frameMatrix(got.frame), {
      x: (100 - after[0]) * k,
      y: (80 - after[1]) * k,
    });
    expect(p1.x).toBeCloseTo(p0.x, 3);
    expect(p1.y).toBeCloseTo(p0.y, 3);
    // Every label is inside the viewBox now.
    const s = parsedSvg(svgOf(next, got.asset));
    expect(partsOf(svgOf(next, got.asset)).texts.length).toBeGreaterThan(0);
    for (const l of drawnLeaves(s.root, s.viewBox, (x) => x.tag === 'text')) {
      expect(l.box[0]).toBeGreaterThanOrEqual(after[0] - 0.01);
      expect(l.box[1]).toBeGreaterThanOrEqual(after[1] - 0.01);
      expect(l.box[2]).toBeLessThanOrEqual(after[0] + after[2] + 0.01);
      expect(l.box[3]).toBeLessThanOrEqual(after[1] + after[3] + 0.01);
    }
  });

  it('moves the pictures of an imported plot with the panels under them (issue 24)', () => {
    const imp = importSvgText(
      readFileSync(new URL('../../io/svg/fixtures/matplotlib-images.svg', import.meta.url), 'utf8'),
      'matplotlib-images.svg',
    );
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const fig = placeImport(page.id, imp, { x: 200, y: 150 }).apply({ doc, assets: {} });
    const g = fig.doc.pages[0]?.layers[0]?.children[0];
    if (g?.type !== 'group') throw new Error('no group');
    // Pictures first (under the plot), each where it was in the plot; the see-through
    // scatter layer over what the plot drew under it (issue 35).
    expect(g.children.map((c) => c.name)).toEqual([
      'Picture 1',
      'Picture 2 backdrop',
      'Picture 2',
      'Picture 3',
      'Plot',
    ]);
    const plot = g.children[4];
    const [field, back, cells] = g.children;
    if (!plot || !field || !cells || !back) throw new Error('missing');
    for (const k of ['x', 'y', 'w', 'h'] as const)
      expect(back.frame[k]).toBeCloseTo(cells.frame[k], 6);
    expect(plot.frame).toMatchObject({ x: 200 - imp.w / 2, y: 150 - imp.h / 2, w: imp.w });
    expect(field.frame.x - plot.frame.x).toBeCloseTo(imp.pictures?.[0]?.frame.x ?? NaN, 9);

    const box = objBounds(g);
    const r = resizeObjects(
      page.id,
      [g.id],
      box,
      { ...box, w: box.w * 1.5, h: box.h * 1.2 },
      'keep',
    ).apply(fig);
    const at = (id: Id) => {
      const p = r.doc.pages[0];
      const o = p ? findObj(p, id) : undefined;
      if (!o) throw new Error('missing');
      return o.frame;
    };
    const [p1, f1, c1] = [at(plot.id), at(field.id), at(cells.id)];
    // The backdrop moves with its picture, not resized as a plot of its own.
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(at(back.id)[k]).toBeCloseTo(c1[k], 6);
    // The heatmap stays on its axis lines, which move and scale with the panel, and
    // grows more than the group (the margins keep their size).
    const spines = (f: Figure, o: Obj): number[] => {
      if (o.type !== 'image') return [];
      const svg = svgOf(f, o.asset);
      const s = parsedSvg(svg);
      const axis = new Set(
        partsOf(svg)
          .strokes.filter((x) => x.role === 'axis')
          .map((x) => x.path.join('.')),
      );
      const k = o.frame.w / s.viewBox[2];
      return drawnLeaves(s.root, s.viewBox)
        .filter((l) => axis.has(l.path.join('.')) && l.box[2] - l.box[0] < 2)
        .map((l) => o.frame.x + ((l.box[0] + l.box[2]) / 2 - s.viewBox[0]) * k);
    };
    const near = (xs: number[], x: number) => Math.min(...xs.map((v) => Math.abs(v - x)));
    const plotAfter = (r.doc.pages[0] && findObj(r.doc.pages[0], plot.id)) ?? plot;
    for (const [f, o, pic] of [
      [fig, plot, field.frame],
      [r, plotAfter, f1],
    ] as const) {
      // (matplotlib snaps the picture to its pixel grid: 0.16 pt off the axis lines, stretched
      // with the panel.)
      expect(near(spines(f, o), pic.x)).toBeLessThan(0.4);
      expect(near(spines(f, o), pic.x + pic.w)).toBeLessThan(0.4);
    }
    expect(p1.w).toBeCloseTo(box.w * 1.5, 6);
    expect(c1.w / cells.frame.w).toBeGreaterThan(1.5);
    expect(f1.h / field.frame.h).toBeGreaterThan(1.2);

    // Scaled plainly, they scale with the group.
    const s = resizeObjects(page.id, [g.id], box, { ...box, w: box.w * 1.5 }, 'scale').apply(fig);
    const fs = (s.doc.pages[0] && findObj(s.doc.pages[0], field.id))?.frame;
    expect(fs?.w).toBeCloseTo(field.frame.w * 1.5, 6);
  });

  it('moves a picture in a legend with the legend (ggplot2 colour bar)', async () => {
    const bytes = new Uint8Array(
      readFileSync(new URL('../../io/pdf/fixtures/r-raster.pdf', import.meta.url)),
    );
    const imp = await importPdf(bytes, 'r-raster.pdf');
    if (!imp) throw new Error('cancelled');
    const doc = createDoc();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const fig = placeImport(page.id, imp, { x: 200, y: 150 }).apply({ doc, assets: {} });
    const g = fig.doc.pages[0]?.layers[0]?.children[0];
    if (g?.type !== 'group') throw new Error('no group');
    const [raster, bar, plot] = g.children;
    if (!raster || !bar || !plot) throw new Error('missing');
    const box = objBounds(g);
    const r = resizeObjects(
      page.id,
      [g.id],
      box,
      { ...box, w: box.w * 1.7, h: box.h * 0.8 },
      'keep',
    ).apply(fig);
    const at = (id: Id) => {
      const p = r.doc.pages[0];
      const o = p ? findObj(p, id) : undefined;
      if (!o) throw new Error('missing');
      return o.frame;
    };
    // The raster scales with its panel; the legend's bar keeps its size, moving with the
    // legend.
    expect(at(raster.id).w / raster.frame.w).toBeGreaterThan(1.7);
    expect(at(bar.id).w).toBeCloseTo(bar.frame.w, 6);
    expect(at(bar.id).h).toBeCloseTo(bar.frame.h, 6);
    expect(at(bar.id).x).toBeGreaterThan(at(raster.id).x + at(raster.id).w);
  });
});
