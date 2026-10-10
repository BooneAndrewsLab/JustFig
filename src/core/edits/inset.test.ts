/** Magnified insets (#66, note 44): the edit, the binding through reconcileBindings, clones, export. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { corners } from '@/core/geometry/matrix';
import { reconcileBindings } from '@/core/model/binding';
import { cloneObjects } from '@/core/model/clone';
import { createDoc } from '@/core/model/factory';
import { type Id, newId } from '@/core/model/ids';
import { assetSize, boxFrame, connectorEnds, magnification } from '@/core/model/inset';
import { findObj, pageObjects } from '@/core/model/tree';
import type {
  Figure,
  Frame,
  Image,
  Obj,
  PathObj,
  Procedural,
  Rect,
  Rect4,
  Vec2,
} from '@/core/model/types';
import { addScaleBar, setParams } from '@/procedural/edits';
import { type ScaleBarParams, barLength } from '@/procedural/kinds/scaleBar';
import { objectToNode } from '@/render/objectToNode';
import { nodeToSvgString } from '@/render/svgNode';

import type { CroppedPicture } from './crop';
import { type Edit, addObjects, deleteObjects, moveObjects, resizeObjects } from './edits';
import { addInset, bakeInset, plannedInset, setInsetMagnification } from './inset';

const meta = { name: 's.png', width: 200, height: 100 };
const assets: Figure['assets'] = {
  src: { kind: 'image', mime: 'image/png', dataBase64: 'AAAA', meta },
};

const baked = (c: Rect4, tag = ''): CroppedPicture => ({
  hash: `crop-${String(c.x)}-${String(c.y)}-${String(c.w)}-${String(c.h)}${tag}`,
  asset: {
    kind: 'image',
    mime: 'image/png',
    dataBase64: 'X',
    meta: { name: 's.png', width: c.w, height: c.h },
  },
});

/** Applies an edit as `store.edit` does: the edit, then the bindings re-solved. */
const run = (f: Figure, e: Edit): Figure => reconcileBindings(f, e.apply(f));

const ids = { inset: newId('o'), box: newId('o'), lines: [newId('o'), newId('o')] as const };

function setup(frame: Partial<Frame> = {}, region: Rect4 = { x: 20, y: 10, w: 40, h: 20 }) {
  const doc = createDoc();
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  const source: Image = {
    id: newId('o'),
    type: 'image',
    asset: 'src',
    // 0.5 pt per pixel.
    frame: { x: 100, y: 100, w: 100, h: 50, rotation: 0, ...frame },
    opacity: 1,
  };
  const f0 = addObjects(page.id, [source]).apply({ doc, assets });
  const view = plannedInset(source, { w: 200, h: 100 }, region);
  const fig = run(f0, addInset(page.id, source.id, { region, baked: baked(view.crop) }, ids));
  return { fig, pageId: page.id, sourceId: source.id };
}

const page0 = (f: Figure) => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p;
};
function get<T extends Obj['type']>(f: Figure, id: Id, type: T): Extract<Obj, { type: T }> {
  const o = findObj(page0(f), id);
  if (o?.type !== type) throw new Error(`no ${type} ${id}`);
  return o as Extract<Obj, { type: T }>;
}
const has = (f: Figure, id: Id) => findObj(page0(f), id) !== undefined;

const near = (a: Vec2, b: Vec2, eps = 1e-6) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
const ends = (l: PathObj): Vec2[] =>
  l.nodes.map((n) => ({ x: l.frame.x + n.x, y: l.frame.y + n.y }));

/** The box is over the region on the source, and each line joins a box corner to an inset corner. */
function expectLaid(f: Figure, sourceId: Id) {
  const s = get(f, sourceId, 'image');
  const inset = get(f, ids.inset, 'image');
  const box = get(f, ids.box, 'rect');
  const size = assetSize(s, f.assets);
  if (!size) throw new Error('no size');
  const want = boxFrame(s, size, inset);
  if (!want) throw new Error('no box');
  for (const k of ['x', 'y', 'w', 'h', 'rotation'] as const)
    expect(box.frame[k]).toBeCloseTo(want[k], 6);
  const bc = corners(box.frame);
  const ic = corners(inset.frame);
  for (const id of ids.lines) {
    const [p, q] = ends(get(f, id, 'path'));
    if (!p || !q) throw new Error('no ends');
    expect(bc.some((c) => near(c, p, 1e-6))).toBe(true);
    expect(ic.some((c) => near(c, q, 1e-6))).toBe(true);
  }
}

describe('addInset', () => {
  it('places a 2× inset beside the source, a box over the region and two lines, as one edit', () => {
    const { fig, sourceId } = setup();
    const inset = get(fig, ids.inset, 'image');
    expect(inset.asset).toBe('src');
    expect(inset.crop).toEqual({ x: 20, y: 10, w: 40, h: 20 });
    expect(inset.cropped).toBe('crop-20-10-40-20');
    expect(inset.inset).toEqual({ source: sourceId, box: ids.box, lines: [...ids.lines] });
    // 40 px at 0.5 pt/px, magnified 2× = 40 pt, 12 pt right of the source.
    expect(inset.frame).toMatchObject({ x: 212, y: 100, w: 40, h: 20 });
    const box = get(fig, ids.box, 'rect');
    expect(box.frame).toMatchObject({ x: 110, y: 105, w: 20, h: 10 });
    expect(box.style.fill).toBeNull();
    // The inset is to the right: the box's right corners to the inset's left ones.
    const [a, b] = ids.lines.map((id) => ends(get(fig, id, 'path')));
    expect(a).toEqual([
      { x: 130, y: 105 },
      { x: 212, y: 100 },
    ]);
    expect(b).toEqual([
      { x: 130, y: 115 },
      { x: 212, y: 120 },
    ]);
    expect(magnification(get(fig, sourceId, 'image'), { w: 200, h: 100 }, inset)).toBeCloseTo(2);
    expectLaid(fig, sourceId);
  });

  it('offsets the region by the source’s own crop', () => {
    const v = plannedInset(
      {
        id: newId('o'),
        type: 'image',
        asset: 'src',
        crop: { x: 50, y: 20, w: 100, h: 60 },
        frame: { x: 0, y: 0, w: 100, h: 60, rotation: 0 },
        opacity: 1,
      },
      { w: 200, h: 100 },
      { x: 10, y: 5, w: 500, h: 10 },
    );
    expect(v).toEqual({ turn: 0, crop: { x: 60, y: 25, w: 90, h: 10 } });
  });

  it('exports as plain geometry and a second raster: no clip, mask or filter', () => {
    const { fig } = setup();
    const svg = [...pageObjects(page0(fig))]
      .map((o) => {
        const node = objectToNode(o, {
          assets: fig.assets,
          palette: [],
          textMode: 'outline',
          screen: false,
          labelStyle: fig.doc.panelLabelStyle,
          labels: new Map(),
        });
        return node ? nodeToSvgString(node) : '';
      })
      .join('');
    expect(svg.match(/<image /g)).toHaveLength(2);
    expect(svg).not.toMatch(/clipPath|<mask|filter=|<filter/);
  });
});

describe('the inset binding (reconcileBindings)', () => {
  it('moving the source moves the box and the lines, not the inset', () => {
    const { fig, pageId, sourceId } = setup();
    const moved = run(fig, moveObjects(pageId, [sourceId], 30, -20));
    expect(get(moved, ids.inset, 'image')).toBe(get(fig, ids.inset, 'image'));
    expect(get(moved, ids.box, 'rect').frame).toMatchObject({ x: 140, y: 85 });
    expectLaid(moved, sourceId);
  });

  it('resizing the source scales the box; moving the inset re-lays the lines on the facing side', () => {
    const { fig, pageId, sourceId } = setup();
    const big = run(
      fig,
      resizeObjects(
        pageId,
        [sourceId],
        { x: 100, y: 100, w: 100, h: 50 },
        { x: 100, y: 100, w: 200, h: 100 },
      ),
    );
    expect(get(big, ids.box, 'rect').frame).toMatchObject({ x: 120, y: 110, w: 40, h: 20 });
    expectLaid(big, sourceId);
    // The source is now twice as large: the same inset is a 1× copy.
    expect(
      magnification(get(big, sourceId, 'image'), { w: 200, h: 100 }, get(big, ids.inset, 'image')),
    ).toBeCloseTo(1);
    // The inset moved below the source: the box's bottom corners to the inset's top ones.
    const below = run(big, moveObjects(pageId, [ids.inset], -150, 200));
    const box = get(below, ids.box, 'rect').frame;
    const ins = get(below, ids.inset, 'image').frame;
    const [a, b] = ids.lines.map((id) => ends(get(below, id, 'path')));
    expect(a).toEqual([
      { x: box.x, y: box.y + box.h },
      { x: ins.x, y: ins.y },
    ]);
    expect(b).toEqual([
      { x: box.x + box.w, y: box.y + box.h },
      { x: ins.x + ins.w, y: ins.y },
    ]);
    expectLaid(below, sourceId);
  });

  it('resizing the inset changes its magnification and keeps the box', () => {
    const { fig, pageId, sourceId } = setup();
    const r = run(
      fig,
      resizeObjects(
        pageId,
        [ids.inset],
        { x: 212, y: 100, w: 40, h: 20 },
        { x: 212, y: 100, w: 80, h: 40 },
      ),
    );
    expect(get(r, ids.box, 'rect')).toBe(get(fig, ids.box, 'rect'));
    expect(
      magnification(get(r, sourceId, 'image'), { w: 200, h: 100 }, get(r, ids.inset, 'image')),
    ).toBeCloseTo(4);
    expectLaid(r, sourceId);
  });

  it('dragging the box re-crops the inset at the same magnification, to be re-baked', () => {
    const { fig, pageId, sourceId } = setup();
    const r = run(fig, moveObjects(pageId, [ids.box], 10, 5));
    const inset = get(r, ids.inset, 'image');
    expect(inset.crop).toEqual({ x: 40, y: 20, w: 40, h: 20 });
    expect(inset.inset?.stale).toBe(true);
    expect(inset.frame).toMatchObject({ x: 212, y: 100, w: 40, h: 20 });
    expectLaid(r, sourceId);
    // Resizing the box takes more pixels at the same magnification: the inset grows.
    const big = run(
      r,
      resizeObjects(
        pageId,
        [ids.box],
        { x: 120, y: 110, w: 20, h: 10 },
        { x: 120, y: 110, w: 30, h: 10 },
      ),
    );
    expect(get(big, ids.inset, 'image').crop).toEqual({ x: 40, y: 20, w: 60, h: 20 });
    expect(get(big, ids.inset, 'image').frame).toMatchObject({ x: 212, y: 100, w: 60, h: 20 });
    // The baked pixels arrive and clear the flag; a bake of an older crop is ignored.
    const old = run(
      big,
      bakeInset(pageId, ids.inset, {
        asset: 'src',
        view: { turn: 0, crop: { x: 40, y: 20, w: 40, h: 20 } },
        picture: baked({ x: 40, y: 20, w: 40, h: 20 }),
      }),
    );
    expect(old).toBe(big);
    const done = run(
      big,
      bakeInset(pageId, ids.inset, {
        asset: 'src',
        view: { turn: 0, crop: { x: 40, y: 20, w: 60, h: 20 } },
        picture: baked({ x: 40, y: 20, w: 60, h: 20 }),
      }),
    );
    const d = get(done, ids.inset, 'image');
    expect(d.cropped).toBe('crop-40-20-60-20');
    expect(d.inset?.stale).toBeUndefined();
    expect(done.assets['crop-40-20-60-20']).toBeDefined();
  });

  it('a box dragged off the picture is clamped back onto it', () => {
    const { fig, pageId } = setup();
    const r = run(fig, moveObjects(pageId, [ids.box], -500, 0));
    expect(get(r, ids.inset, 'image').crop).toEqual({ x: 0, y: 10, w: 40, h: 20 });
    expect(get(r, ids.box, 'rect').frame).toMatchObject({ x: 100, y: 105 });
  });

  it('deleting the source removes the box and lines; the inset stays a plain crop', () => {
    const { fig, pageId, sourceId } = setup();
    const r = run(fig, deleteObjects(pageId, [sourceId]));
    expect(has(r, ids.box)).toBe(false);
    expect(ids.lines.some((id) => has(r, id))).toBe(false);
    const inset = get(r, ids.inset, 'image');
    expect(inset.inset).toBeUndefined();
    expect(inset.cropped).toBe('crop-20-10-40-20');
  });

  it('deleting the inset removes the box and lines; deleting the box drops the link', () => {
    const { fig, pageId, sourceId } = setup();
    const r = run(fig, deleteObjects(pageId, [ids.inset]));
    expect(has(r, ids.box) || ids.lines.some((id) => has(r, id))).toBe(false);
    expect(has(r, sourceId)).toBe(true);
    const nb = run(fig, deleteObjects(pageId, [ids.box]));
    expect(ids.lines.some((id) => has(nb, id))).toBe(false);
    expect(get(nb, ids.inset, 'image').inset).toBeUndefined();
    // A deleted line is just gone: the other stays laid.
    const nl = run(fig, deleteObjects(pageId, [ids.lines[0]]));
    expect(get(nl, ids.inset, 'image').inset?.lines).toEqual([ids.lines[1]]);
    const moved = run(nl, moveObjects(pageId, [sourceId], 5, 5));
    expect(ends(get(moved, ids.lines[1], 'path'))[0]).toEqual({ x: 135, y: 120 });
  });

  it('a line or box moved by itself snaps back; re-solving an unchanged figure is a no-op', () => {
    const { fig, pageId, sourceId } = setup();
    const r = run(fig, moveObjects(pageId, [ids.lines[0]], 40, 40));
    expect(ends(get(r, ids.lines[0], 'path'))).toEqual(ends(get(fig, ids.lines[0], 'path')));
    expect(reconcileBindings(fig, fig)).toBe(fig);
    expectLaid(r, sourceId);
  });

  it('typing a magnification resizes the inset about its top-left corner', () => {
    const { fig, pageId, sourceId } = setup();
    const r = run(fig, setInsetMagnification(pageId, ids.inset, 3));
    expect(get(r, ids.inset, 'image').frame).toMatchObject({ x: 212, y: 100, w: 60, h: 30 });
    expectLaid(r, sourceId);
  });

  it('clones keep the link only with their source and box', () => {
    const { fig, pageId, sourceId } = setup();
    const all = [sourceId, ids.inset, ids.box, ...ids.lines].map((id) => findObj(page0(fig), id));
    const copies = cloneObjects(
      all.filter((o): o is Obj => o !== undefined),
      300,
      0,
    );
    const [s2, i2, b2, l1, l2] = copies;
    if (i2?.type !== 'image' || !s2 || !b2 || !l1 || !l2) throw new Error('no copies');
    expect(i2.inset).toEqual({ source: s2.id, box: b2.id, lines: [l1.id, l2.id] });
    const pasted = run(fig, addObjects(pageId, copies));
    // The copy's box is over the copied source, not the original.
    expect(get(pasted, b2.id, 'rect').frame.x).toBeCloseTo(410);
    const alone = cloneObjects([get(fig, ids.inset, 'image')]);
    expect(alone[0]?.type === 'image' && alone[0].inset).toBeUndefined();
    const noBox = cloneObjects([get(fig, sourceId, 'image'), get(fig, ids.inset, 'image')]);
    expect(noBox[1]?.type === 'image' && noBox[1].inset).toBeUndefined();
  });

  it('property: after moving and resizing source, inset and box in any order, all stay laid', () => {
    const op = fc.record({
      who: fc.constantFrom('source', 'inset', 'box'),
      kind: fc.constantFrom('move', 'resize'),
      dx: fc.integer({ min: -300, max: 300 }),
      dy: fc.integer({ min: -300, max: 300 }),
      k: fc.double({ min: 0.3, max: 3, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: -90, max: 90 }),
        fc.array(op, { minLength: 1, maxLength: 6 }),
        (rotation, ops) => {
          const { fig, pageId, sourceId } = setup({ rotation });
          let f = fig;
          for (const o of ops) {
            const id = o.who === 'source' ? sourceId : o.who === 'inset' ? ids.inset : ids.box;
            const fr = (findObj(page0(f), id) as Image | Rect).frame;
            const from = { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
            f = run(
              f,
              o.kind === 'move'
                ? moveObjects(pageId, [id], o.dx, o.dy)
                : resizeObjects(pageId, [id], from, { ...from, w: fr.w * o.k, h: fr.h * o.k }),
            );
            expectLaid(f, sourceId);
            expect(reconcileBindings(f, f)).toBe(f);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('connector ends face each other on every side', () => {
    const box: Frame = { x: 0, y: 0, w: 10, h: 10, rotation: 0 };
    const at = (x: number, y: number): Frame => ({ x, y, w: 20, h: 20, rotation: 0 });
    expect(connectorEnds(box, at(-50, 0)).map(([p]) => p.x)).toEqual([0, 0]);
    expect(connectorEnds(box, at(-50, 0)).map(([, q]) => q.x)).toEqual([-30, -30]);
    expect(connectorEnds(box, at(0, -50)).map(([p]) => p.y)).toEqual([0, 0]);
    expect(connectorEnds(box, at(0, 50)).map(([, q]) => q.y)).toEqual([50, 50]);
  });
});

describe('the inset’s scale bar', () => {
  it('takes the source’s pixel size, so it reads the magnification, and follows a re-crop', () => {
    const { fig, pageId, sourceId } = setup();
    const withBar = run(fig, addScaleBar(pageId, get(fig, sourceId, 'image')));
    const bar = [...pageObjects(page0(withBar))].find(
      (o): o is Procedural => o.type === 'procedural',
    );
    if (!bar) throw new Error('no bar');
    const calibrated = run(
      withBar,
      setParams(pageId, bar.id, 'Pixel size', (p) => ({ ...p, pixelSize: 0.2 })),
    );
    const f = run(calibrated, addScaleBar(pageId, get(calibrated, ids.inset, 'image')));
    const own = [...pageObjects(page0(f))].find(
      (o): o is Procedural => o.type === 'procedural' && o.id !== bar.id,
    );
    if (!own) throw new Error('no inset bar');
    const p = own.params as ScaleBarParams;
    expect(p.pixelSize).toBe(0.2);
    expect(p.imageWidth).toBe(40);
    // Source: 0.5 pt/px, so 1 µm = 2.5 pt; the 2× inset draws 1 µm as 5 pt.
    expect(barLength({ ...p, length: 1 }, own.frame.w)).toBeCloseTo(5);
    // Dragging the box to take more pixels: the bar moves to the inset's new box, still true.
    const r = run(
      f,
      resizeObjects(
        pageId,
        [ids.box],
        { x: 110, y: 105, w: 20, h: 10 },
        { x: 110, y: 105, w: 30, h: 10 },
      ),
    );
    const moved = get(r, own.id, 'procedural');
    const inset = get(r, ids.inset, 'image');
    expect(moved.frame.w).toBeCloseTo(inset.frame.w);
    const mp = moved.params as ScaleBarParams;
    expect(mp.imageWidth).toBe(60);
    expect(barLength({ ...mp, length: 1 }, moved.frame.w)).toBeCloseTo(5);
  });
});
