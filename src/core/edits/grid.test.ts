import { beforeAll, describe, expect, it } from 'vitest';

import { objBounds } from '../geometry/transform';
import {
  createArrow,
  createDoc,
  createPanel,
  createPath,
  createRect,
  createText,
  frame,
} from '../model/factory';
import type { Id } from '../model/ids';
import { panelLabels } from '../model/panels';
import { findObj } from '../model/tree';
import type { Figure, Icon, Obj, Page, Panel } from '../model/types';
import { loadTestFonts } from '@/test/fonts';
import { AppStore, currentPage } from '@/ui/state/store';

import { addObjects } from './edits';
import { type GridOptions, PAGE_EDGE, arrangeInGrid, gridLayout, gridShape } from './grid';

beforeAll(loadTestFonts);

const start = (): { fig: Figure; page: Page } => {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return { fig: { doc, assets: {} }, page };
};
const pg = (f: Figure): Page => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p;
};
const top = (f: Figure): readonly Obj[] => pg(f).layers[0]?.children ?? [];
const panels = (f: Figure): Panel[] => top(f).filter((o): o is Panel => o.type === 'panel');
const panelOf = (f: Figure, id: Id): Panel | undefined =>
  panels(f).find((p) => p.children.some((c) => c.id === id));
const label = (f: Figure, id: Id): string | undefined => {
  const p = panelOf(f, id);
  return p && panelLabels(pg(f), 'A').get(p.id);
};

const opts = (o: Partial<GridOptions> = {}): GridOptions => ({
  rows: 2,
  cols: 2,
  gutter: 10,
  hAlign: 'left',
  vAlign: 'top',
  fitWidth: false,
  letterRoom: false,
  ...o,
});

describe('gridShape', () => {
  it('puts up to three in a row, then a near-square grid', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9, 10].map(gridShape)).toEqual([
      { rows: 1, cols: 1 },
      { rows: 1, cols: 2 },
      { rows: 1, cols: 3 },
      { rows: 2, cols: 2 },
      { rows: 2, cols: 3 },
      { rows: 2, cols: 3 },
      { rows: 3, cols: 3 },
      { rows: 3, cols: 3 },
      { rows: 3, cols: 4 },
    ]);
  });
});

describe('gridLayout', () => {
  const items = [
    { box: { x: 50, y: 50, w: 40, h: 20 }, room: 0 },
    { box: { x: 0, y: 0, w: 10, h: 30 }, room: 0 },
    { box: { x: 0, y: 0, w: 20, h: 10 }, room: 0 },
  ];

  it('sizes columns and rows to their largest object, with gutters between', () => {
    const out = gridLayout(items, {
      cols: 2,
      gutter: 5,
      hAlign: 'left',
      vAlign: 'top',
      origin: { x: 100, y: 200 },
    });
    expect(out.map((p) => p.cell)).toEqual([
      { x: 100, y: 200, w: 40, h: 30 },
      { x: 145, y: 200, w: 10, h: 30 },
      { x: 100, y: 235, w: 40, h: 10 },
    ]);
    // Nothing scales without a width.
    expect(out.map((p) => [p.target.w, p.target.h])).toEqual([
      [40, 20],
      [10, 30],
      [20, 10],
    ]);
  });

  it('aligns inside the cell, below the letter room', () => {
    const out = gridLayout(
      items.map((i) => ({ ...i, room: 16 })),
      { cols: 2, gutter: 0, hAlign: 'center', vAlign: 'bottom', origin: { x: 0, y: 0 } },
    );
    expect(out[0]?.cell).toEqual({ x: 0, y: 0, w: 40, h: 46 });
    expect(out[0]?.target).toEqual({ x: 0, y: 26, w: 40, h: 20 });
    expect(out[2]?.target).toEqual({ x: 10, y: 46 + 16, w: 20, h: 10 });
    const mid = gridLayout(items, {
      cols: 2,
      gutter: 0,
      hAlign: 'right',
      vAlign: 'middle',
      origin: { x: 0, y: 0 },
    });
    expect(mid[0]?.target).toEqual({ x: 0, y: 5, w: 40, h: 20 });
    expect(mid[2]?.target).toEqual({ x: 20, y: 30, w: 20, h: 10 });
  });

  it('fits to a width: equal columns, each object scaled to its column keeping proportions', () => {
    const out = gridLayout(items, {
      cols: 2,
      gutter: 10,
      hAlign: 'left',
      vAlign: 'top',
      origin: { x: 0, y: 0 },
      width: 210,
    });
    expect(out.map((p) => p.cell.w)).toEqual([100, 100, 100]);
    expect(out[1]?.cell.x).toBe(110);
    expect(out.map((p) => [p.target.w, p.target.h])).toEqual([
      [100, 50],
      [100, 300],
      [100, 50],
    ]);
    expect(out[0]?.cell.h).toBe(300);
    expect(out[2]?.cell.y).toBe(310);
  });
});

describe('gridLayout height cap', () => {
  it('shrinks a tall narrow object to its row share, keeping its proportions', () => {
    const out = gridLayout(
      [
        { box: { x: 0, y: 0, w: 10, h: 400 }, room: 10 },
        { box: { x: 0, y: 0, w: 100, h: 50 }, room: 10 },
      ],
      {
        cols: 2,
        gutter: 0,
        hAlign: 'center',
        vAlign: 'top',
        origin: { x: 0, y: 0 },
        width: 200,
        height: 110,
      },
    );
    expect(out[0]?.target.h).toBeCloseTo(100);
    expect(out[0]?.target.w).toBeCloseTo(2.5);
    expect(out[0]?.target.x).toBeCloseTo(48.75);
    expect(out[1]?.target.w).toBeCloseTo(100);
    expect((out[0]?.cell.y ?? 0) + (out[0]?.cell.h ?? 0)).toBeLessThanOrEqual(110 + 1e-9);
  });
});

describe('arrangeInGrid', () => {
  it('wraps each object in an auto-lettered panel, lettered in reading order', () => {
    const { fig, page } = start();
    // Rough arrangement: b top-left, a top-right (a little lower), c bottom.
    const a = createRect(frame(200, 20, 50, 40));
    const b = createRect(frame(10, 10, 60, 30));
    const c = createRect(frame(30, 150, 40, 40));
    const f0 = addObjects(page.id, [a, b, c]).apply(fig);
    const e = arrangeInGrid(page.id, [a.id, c.id, b.id], opts());
    expect(e.label).toBe('Arrange in grid');
    const f = e.apply(f0);
    expect(panels(f)).toHaveLength(3);
    expect(top(f).every((o) => o.type === 'panel')).toBe(true);
    expect([b, a, c].map((o) => label(f, o.id))).toEqual(['A', 'B', 'C']);
    // Grid starts at the selection's top-left; columns as wide as their widest object.
    expect(objBounds(findObj(pg(f), b.id)!)).toEqual({ x: 10, y: 10, w: 60, h: 30 });
    expect(objBounds(findObj(pg(f), a.id)!)).toEqual({ x: 80, y: 10, w: 50, h: 40 });
    expect(objBounds(findObj(pg(f), c.id)!)).toEqual({ x: 10, y: 60, w: 40, h: 40 });
    // The panels are the cells.
    expect(panelOf(f, b.id)?.frame).toMatchObject({ x: 10, y: 10, w: 60, h: 40 });
    expect(panelOf(f, a.id)?.frame).toMatchObject({ x: 80, y: 10, w: 50, h: 40 });
    expect(panelOf(f, a.id)?.autoLabel).toBe(true);
    expect(e.select).toEqual([b, a, c].map((o) => panelOf(f, o.id)?.id));
    // Pure: the figure before is untouched (the undo state).
    expect(top(f0).map((o) => o.type)).toEqual(['rect', 'rect', 'rect']);
  });

  it('leaves arrows bound at both ends out of the cells', () => {
    const { fig, page } = start();
    const a = createRect(frame(0, 0, 50, 40));
    const b = createRect(frame(100, 0, 50, 40));
    const n = [
      { x: 50, y: 20 },
      { x: 100, y: 20 },
    ];
    const link = {
      ...createArrow(n),
      bind: { start: { id: a.id }, end: { id: b.id } },
    };
    const f0 = addObjects(page.id, [a, b, link]).apply(fig);
    const f = arrangeInGrid(page.id, [a.id, b.id, link.id], opts({ cols: 2, rows: 1 })).apply(f0);
    expect(panels(f)).toHaveLength(2);
    expect(top(f).filter((o) => o.type === 'arrow')).toHaveLength(1);
  });

  it('keeps room above each object for its letter', () => {
    const { fig, page } = start();
    const a = createRect(frame(0, 0, 50, 40));
    const b = createRect(frame(100, 0, 50, 40));
    const f0 = addObjects(page.id, [a, b]).apply(fig);
    const f = arrangeInGrid(
      page.id,
      [a.id, b.id],
      opts({ cols: 2, rows: 1, letterRoom: true }),
    ).apply(f0);
    const band = f.doc.panelLabelStyle.offset.y + f.doc.panelLabelStyle.size;
    expect(objBounds(findObj(pg(f), a.id)!).y).toBe(band);
    expect(panelOf(f, a.id)?.frame.h).toBe(40 + band);
    expect(panelOf(f, a.id)?.frame.y).toBe(0);
  });

  it('fits to the page width, baking path scale and scaling icons by transform', () => {
    const { fig, page } = start();
    const r = createRect(frame(0, 0, 100, 50));
    const p = createPath(
      [
        { x: 200, y: 0 },
        { x: 250, y: 50 },
      ],
      false,
    );
    const icon: Icon = {
      id: 'o_icon' as Id,
      type: 'icon',
      frame: frame(0, 100, 20, 20),
      opacity: 1,
      asset: 'sha256-x',
      slots: {},
      lockAspect: true,
    };
    const f0 = addObjects(page.id, [r, p, icon]).apply(fig);
    const W = pg(f0).size.w;
    const gutter = 10;
    const f = arrangeInGrid(
      page.id,
      [r.id, p.id, icon.id],
      opts({ cols: 3, rows: 1, gutter, fitWidth: true }),
    ).apply(f0);
    const cw = (W - 2 * PAGE_EDGE - 2 * gutter) / 3;
    const rb = objBounds(findObj(pg(f), r.id)!);
    expect(rb.x).toBeCloseTo(PAGE_EDGE);
    expect(rb.w).toBeCloseTo(cw);
    expect(rb.h).toBeCloseTo(cw / 2);
    const q = findObj(pg(f), p.id);
    if (q?.type !== 'path') throw new Error('path lost');
    expect(q.frame.w).toBeCloseTo(cw);
    // The scale is in the points, not a transform.
    expect(Math.max(...q.nodes.map((n) => n.x)) - Math.min(...q.nodes.map((n) => n.x))).toBeCloseTo(
      cw,
    );
    const ic = findObj(pg(f), icon.id);
    expect(ic?.frame.w).toBeCloseTo(cw);
    expect(ic?.frame.h).toBeCloseTo(cw);
    // The last column ends at the page edge.
    const last = panelOf(f, icon.id);
    expect((last?.frame.x ?? 0) + (last?.frame.w ?? 0)).toBeCloseTo(W - PAGE_EDGE);
  });

  it('handles mixed kinds: text keeps its words, a selected panel becomes a cell itself', () => {
    const { fig, page } = start();
    const t = createText(0, 0, [
      [{ text: 'Hello', font: 'arimo', size: 10, color: { hex: '#000000' } }],
    ]);
    const existing = createPanel(frame(300, 0, 100, 80));
    const inside = createRect(frame(320, 30, 20, 20));
    let f = addObjects(page.id, [existing]).apply(fig);
    f = addObjects(page.id, [t, inside]).apply(f);
    expect(panelOf(f, inside.id)?.id).toBe(existing.id);
    f = arrangeInGrid(page.id, [t.id, existing.id], opts({ cols: 2, rows: 1 })).apply(f);
    expect(panels(f)).toHaveLength(2);
    const moved = panels(f).find((p) => p.id === existing.id);
    const tb = objBounds(findObj(pg(f), t.id)!);
    // The existing panel sits right of the text's column; its contents moved with it.
    expect(moved?.frame.x).toBeCloseTo(tb.w + 10);
    expect(moved?.children.map((c) => c.id)).toEqual([inside.id]);
    expect(objBounds(findObj(pg(f), inside.id)!).x - (moved?.frame.x ?? 0)).toBeCloseTo(20);
    expect(label(f, t.id)).toBe('A');
    expect(panelLabels(pg(f), 'A').get(existing.id)).toBe('B');
  });

  it('takes objects off the panel they were on, leaving the rest', () => {
    const { fig, page } = start();
    const host = createPanel(frame(0, 0, 200, 200));
    const a = createRect(frame(10, 10, 20, 20));
    const b = createRect(frame(100, 100, 20, 20));
    let f = addObjects(page.id, [host]).apply(fig);
    f = addObjects(page.id, [a, b]).apply(f);
    f = arrangeInGrid(page.id, [a.id], opts({ cols: 1, rows: 1 })).apply(f);
    const hostNow = panels(f).find((p) => p.id === host.id);
    expect(hostNow?.children.map((c) => c.id)).toEqual([b.id]);
    expect(panelOf(f, a.id)?.id).not.toBe(host.id);
    // Never nested.
    expect(panels(f).every((p) => p.children.every((c) => c.type !== 'panel'))).toBe(true);
  });

  it('leaves locked objects where they are', () => {
    const { fig, page } = start();
    const a = createRect(frame(0, 0, 20, 20));
    const l = { ...createRect(frame(100, 100, 20, 20)), locked: true };
    const b = createRect(frame(50, 0, 20, 20));
    const f0 = addObjects(page.id, [a, l, b]).apply(fig);
    const f = arrangeInGrid(page.id, [a.id, l.id, b.id], opts({ cols: 1, rows: 2 })).apply(f0);
    expect(findObj(pg(f), l.id)).toEqual(l);
    expect(panelOf(f, l.id)).toBeUndefined();
    expect(panels(f)).toHaveLength(2);
  });

  it('refuses a grid too small for the selection, or nothing to arrange', () => {
    const { fig, page } = start();
    const objs = [0, 1, 2].map((i) => createRect(frame(i * 30, 0, 20, 20)));
    const f0 = addObjects(page.id, objs).apply(fig);
    expect(() =>
      arrangeInGrid(
        page.id,
        objs.map((o) => o.id),
        opts({ rows: 1, cols: 2 }),
      ).apply(f0),
    ).toThrow(/cannot hold 3/);
    expect(() => arrangeInGrid(page.id, [], opts()).apply(f0)).toThrow(/Select/);
  });

  it('is one undo step in the store', () => {
    const s = new AppStore();
    const page = currentPage(s.getState());
    const objs = [0, 1, 2, 3].map((i) => createRect(frame(i * 40, i * 7, 30, 20)));
    s.edit(addObjects(page.id, objs));
    const before = s.getState().history.present;
    const depth = s.getState().history.undoDepth;
    expect(
      s.edit(
        arrangeInGrid(
          page.id,
          objs.map((o) => o.id),
          opts(),
        ),
      ),
    ).toBe(true);
    expect(s.getState().history.undoDepth).toBe(depth + 1);
    expect(s.undoLabel()).toBe('Undo Arrange in grid');
    expect(s.getState().selection).toHaveLength(4);
    s.undo();
    expect(s.getState().history.present).toBe(before);
  });
});

describe('fit to page width with a tall narrow object', () => {
  it('keeps every drawn box inside its cell frame, whatever the shapes', () => {
    let seed = 7;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 200; t++) {
      const { fig, page } = start();
      const n = 1 + Math.floor(rnd() * 7);
      const objs = Array.from({ length: n }, (_, i) =>
        createRect({
          ...frame(i * 50, rnd() * 100, 5 + rnd() * 300, 5 + rnd() * 400),
          rotation: rnd() < 0.3 ? 90 : 0,
        }),
      );
      const f0 = addObjects(page.id, objs).apply(fig);
      const cols = 1 + Math.floor(rnd() * 3);
      const o = opts({
        cols,
        rows: Math.ceil(n / cols),
        fitWidth: true,
        letterRoom: rnd() < 0.5,
        hAlign: (['left', 'center', 'right'] as const)[Math.floor(rnd() * 3)] ?? 'left',
        vAlign: (['top', 'middle', 'bottom'] as const)[Math.floor(rnd() * 3)] ?? 'top',
      });
      const f = arrangeInGrid(
        page.id,
        objs.map((x) => x.id),
        o,
      ).apply(f0);
      for (const x of objs) {
        const b = objBounds(findObj(pg(f), x.id)!);
        const fr = panelOf(f, x.id)!.frame;
        const msg = JSON.stringify({ t, o, x: x.frame, b, fr });
        expect(b.x, msg).toBeGreaterThanOrEqual(fr.x - 1e-6);
        expect(b.y, msg).toBeGreaterThanOrEqual(fr.y - 1e-6);
        expect(b.x + b.w, msg).toBeLessThanOrEqual(fr.x + fr.w + 1e-6);
        expect(b.y + b.h, msg).toBeLessThanOrEqual(fr.y + fr.h + 1e-6);
        expect(fr.y + fr.h, msg).toBeLessThanOrEqual(pg(f).size.h + 1e-6);
      }
    }
  });
});
