/** What hangs past a frame counts (#44): bounds, align/distribute, grid layout, snapshots. */
import { beforeAll, describe, expect, it } from 'vitest';

import { addObjects, alignObjects, distributeObjects } from '@/core/edits/edits';
import { GRID_DEFAULTS, arrangeInGrid } from '@/core/edits/grid';
import { boxContains, frameBounds } from '@/core/geometry/matrix';
import { objBounds } from '@/core/geometry/transform';
import { createDoc } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import { docObjects, findObj } from '@/core/model/tree';
import type { Figure, Group, Image, Obj, Procedural } from '@/core/model/types';
import { objectToNode } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';
import { loadTestFonts } from '@/test/fonts';

import { drawnBounds, drawnBoundsIn } from './bounds';
import { convertObjects, createProcedural, labelGelImage } from './edits';
import { getKind } from './registry';
import { withSnapshots } from './snapshot';

beforeAll(loadTestFonts);

const gel = (x: number, y: number, rotation = 0): Procedural => {
  const k = getKind('gelLabels');
  if (!k) throw new Error('kind');
  const o = createProcedural(k, { x: 0, y: 0 });
  return { ...o, frame: { ...o.frame, x, y, rotation } };
};

const picture = (x: number, y: number): Image => ({
  id: newId('o'),
  type: 'image',
  asset: 'h',
  frame: { x, y, w: 300, h: 200, rotation: 0 },
  opacity: 1,
});

function figureWith(objs: readonly Obj[]): Figure {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return addObjects(page.id, objs).apply({ doc, assets: {} });
}

const pageOf = (f: Figure) => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p;
};

/** A picture with lane labels over it, as **Label gel lanes** makes it. */
function labelledPicture(x: number, y: number): Group {
  const img = picture(x, y);
  const fig = figureWith([img]);
  const out = labelGelImage(pageOf(fig).id, img).apply(fig);
  const g = [...docObjects(out.doc)].find((o) => o.type === 'group');
  if (g?.type !== 'group') throw new Error('no group');
  return g;
}

const bounds = drawnBoundsIn([]);

describe('drawnBounds', () => {
  it('reaches past the frame to the lane labels above and the sizes beside it', () => {
    const o = gel(100, 100);
    const d = drawnBounds(o, []);
    const f = objBounds(o);
    expect(d.y).toBeLessThan(f.y - 4);
    expect(d.x).toBeLessThan(f.x);
    expect(boxContains(d, f)).toBe(true);
  });

  it('turns with the object and covers a group of picture and labels', () => {
    const o = gel(100, 100, 90);
    const d = drawnBounds(o, []);
    // Turned 90° clockwise, the labels above end up on the right.
    expect(d.x + d.w).toBeGreaterThan(objBounds(o).x + objBounds(o).w + 4);
    const g = labelledPicture(50, 60);
    const gd = drawnBounds(g, []);
    expect(gd.y).toBeLessThan(60 - 4);
    expect(objBounds(g).y).toBeCloseTo(60, 6);
  });

  it('is the frame for everything else', () => {
    const img = picture(10, 20);
    expect(drawnBounds(img, [])).toEqual(objBounds(img));
  });
});

describe('align, distribute and grid layout by what is drawn', () => {
  it('aligns top edges to the top of the labels', () => {
    const a = labelledPicture(0, 100);
    const b = picture(400, 40);
    const fig = figureWith([a, b]);
    const page = pageOf(fig);
    const pageBox = { x: 0, y: 0, w: page.size.w, h: page.size.h };
    const out = alignObjects(page.id, [a, b], 'top', pageBox, bounds).apply(fig);
    const p = pageOf(out);
    const na = findObj(p, a.id);
    const nb = findObj(p, b.id);
    if (!na || !nb) throw new Error('lost');
    expect(drawnBounds(na, []).y).toBeCloseTo(40, 6);
    expect(nb.frame.y).toBeCloseTo(40, 6);
  });

  it('distributes with equal gaps between the drawn boxes', () => {
    const objs = [picture(0, 300), labelledPicture(0, 0), picture(0, 700)];
    const fig = figureWith(objs);
    const out = distributeObjects(pageOf(fig).id, objs, 'y', bounds).apply(fig);
    const p = pageOf(out);
    const boxes = objs
      .map((o) => findObj(p, o.id))
      .map((o) => {
        if (!o) throw new Error('lost');
        return drawnBounds(o, []);
      })
      .sort((m, n) => m.y - n.y);
    const gaps = boxes.slice(1).map((b, i) => {
      const prev = boxes[i]!;
      return b.y - (prev.y + prev.h);
    });
    expect(gaps[0]).toBeCloseTo(gaps[1] ?? NaN, 6);
  });

  it('fits a labelled picture, labels included, into its grid cell', () => {
    const g = labelledPicture(0, 0);
    const other = picture(400, 0);
    const fig = figureWith([g, other]);
    const edit = arrangeInGrid(
      pageOf(fig).id,
      [g.id, other.id],
      { ...GRID_DEFAULTS, rows: 1, cols: 2, fitWidth: true, letterRoom: false },
      'scale',
      bounds,
    );
    const out = edit.apply(fig);
    const p = pageOf(out);
    const panel = p.layers
      .flatMap((l) => l.children)
      .find((o) => o.type === 'panel' && o.children.some((c) => c.id === g.id));
    const placed = panel?.type === 'panel' ? panel.children[0] : undefined;
    if (panel?.type !== 'panel' || !placed) throw new Error('not placed');
    const d = drawnBounds(placed, []);
    const cell = frameBounds(panel.frame);
    const slack = 0.05;
    expect(d.y).toBeGreaterThanOrEqual(cell.y - slack);
    expect(d.x).toBeGreaterThanOrEqual(cell.x - slack);
    expect(d.x + d.w).toBeLessThanOrEqual(cell.x + cell.w + slack);
    expect(d.y + d.h).toBeLessThanOrEqual(cell.y + cell.h + slack);
  });
});

describe('snapshots', () => {
  it('cover the labels hanging past the frame and draw them where they were', () => {
    const o = gel(100, 100);
    const snap = withSnapshots([o], []);
    const a = Object.values(snap.assets)[0];
    if (a?.kind !== 'svgImport') throw new Error('no snapshot');
    const vb = /viewBox="([^"]+)"/.exec(a.svg)?.[1]?.split(' ').map(Number) ?? [];
    expect(vb[1]).toBeLessThan(-4);
    expect(a.meta.width).toBe(o.frame.w);
    expect(a.meta.height).toBe(o.frame.h);
    // An app without the kind draws the snapshot at the frame's scale, not squeezed into it.
    const future = { ...(snap.objs[0] as Procedural), kind: 'fromTheFuture' };
    const node = objectToNode(future, {
      assets: snap.assets,
      palette: [],
      textMode: 'outline',
      screen: false,
      labelStyle: createDoc().panelLabelStyle,
      labels: new Map(),
    });
    if (!node) throw new Error('not drawn');
    expect(nodeToSvgString(node)).toContain('scale(1 1)');
  });

  it('becomes a picture covering the labels when converted in an app without the kind', () => {
    const o = gel(100, 100, 90);
    const snap = withSnapshots([o], []);
    const future = { ...(snap.objs[0] as Procedural), kind: 'fromTheFuture' };
    const fig: Figure = { ...figureWith([future]), assets: snap.assets };
    const out = convertObjects(pageOf(fig).id, [future], [], fig.assets).apply(fig);
    const img = [...docObjects(out.doc)][0];
    if (img?.type !== 'image') throw new Error('no picture');
    const drawn = drawnBounds(o, []);
    const pic = objBounds(img);
    expect(pic.x).toBeCloseTo(drawn.x, 1);
    expect(pic.y).toBeCloseTo(drawn.y, 1);
    expect(pic.w).toBeCloseTo(drawn.w, 1);
    expect(pic.h).toBeCloseTo(drawn.h, 1);
  });
});
