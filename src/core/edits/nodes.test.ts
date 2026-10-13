/** Editing a path's points (note 28, #50). */
import { describe, expect, it } from 'vitest';

import { apply, frameMatrix } from '@/core/geometry/matrix';
import { reconcileBindings } from '@/core/model/binding';
import { createArrow, createDoc, createPath } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import { findObj } from '@/core/model/tree';
import type { Arrow, Figure, Obj, PathNode, PathObj, Procedural, Vec2 } from '@/core/model/types';
import { createProcedural } from '@/procedural/edits';
import { getKind } from '@/procedural/registry';
import { samplePath } from '@/render/path';

import { addObjects, rotateObjects, flipObjects } from './edits';
import {
  deleteNodePart,
  editableNodes,
  insertNode,
  isSmooth,
  moveNodePart,
  nearestOnPath,
  nodeRefs,
  setSmooth,
  toLocalDelta,
} from './nodes';

function figWith(...objs: Obj[]): Figure {
  const doc = createDoc();
  const f: Figure = { doc, assets: {} };
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return addObjects(page.id, objs).apply(f);
}

const pageId = (f: Figure): Id => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p.id;
};
/** An object by id, typed by the caller (the second use of T keeps the parameter meaningful). */
const get = <T extends Obj>(f: Figure, id: Id, _as?: (o: T) => void): T => {
  const p = f.doc.pages[0];
  const o = p ? findObj(p, id) : undefined;
  if (!o) throw new Error(`no ${id}`);
  return o as T;
};

/** A node (or point) of an object, on the page. */
const onPage = (o: Obj, p: Vec2): Vec2 => apply(frameMatrix(o.frame), p);
const pageNodes = (o: Obj): Vec2[] => (editableNodes(o)?.nodes ?? []).map((n) => onPage(o, n));

const near = (a: Vec2 | undefined, b: Vec2 | undefined, tol = 1e-6) => {
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  expect(Math.abs((a?.x ?? 0) - (b?.x ?? 0))).toBeLessThan(tol);
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 0))).toBeLessThan(tol);
};

const zigzag = (): PathObj =>
  createPath(
    [
      { x: 100, y: 100 },
      { x: 150, y: 50, in: { x: 130, y: 50 }, out: { x: 170, y: 50 } },
      { x: 200, y: 100 },
    ],
    false,
  );

describe('moving points', () => {
  it('moves a node with its handles and refits the frame to the nodes', () => {
    const p = zigzag();
    const f0 = figWith(p);
    const f1 = moveNodePart(pageId(f0), p.id, { index: 1, part: 'node' }, 10, -20).apply(f0);
    const q = get<PathObj>(f1, p.id);
    const [a, b, c] = pageNodes(q);
    near(a, { x: 100, y: 100 });
    near(b, { x: 160, y: 30 });
    near(c, { x: 200, y: 100 });
    near(onPage(q, q.nodes[1]?.in ?? { x: 0, y: 0 }), { x: 140, y: 30 });
    expect(q.frame).toMatchObject({ x: 100, y: 30, w: 100, h: 70 });
  });

  it('turns the other handle of a smooth point, leaves a cusp alone', () => {
    const p = zigzag();
    const f0 = figWith(p);
    const f1 = moveNodePart(pageId(f0), p.id, { index: 1, part: 'out' }, 0, -20).apply(f0);
    const n = get<PathObj>(f1, p.id).nodes[1];
    expect(n && isSmooth(n)).toBe(true);
    const cusp = createPath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0, in: { x: 40, y: 10 }, out: { x: 60, y: 10 } },
        { x: 100, y: 0 },
      ],
      false,
    );
    const g0 = figWith(cusp);
    const g1 = moveNodePart(pageId(g0), cusp.id, { index: 1, part: 'out' }, 5, 5).apply(g0);
    const m = get<PathObj>(g1, cusp.id);
    near(onPage(m, m.nodes[1]?.in ?? { x: 0, y: 0 }), { x: 40, y: 10 });
    near(onPage(m, m.nodes[1]?.out ?? { x: 0, y: 0 }), { x: 65, y: 15 });
  });

  it('moves a point of a rotated, flipped path exactly by the page offset', () => {
    const p = zigzag();
    const f0 = figWith(p);
    const id = pageId(f0);
    const rotated = rotateObjects(id, [p.id], { x: 150, y: 75 }, 33).apply(f0);
    const turned = flipObjects(id, [p.id], 'x', [get(rotated, p.id)]).apply(rotated);
    const before = pageNodes(get(turned, p.id));
    const f1 = moveNodePart(id, p.id, { index: 2, part: 'node' }, 7, -4).apply(turned);
    const q = get<PathObj>(f1, p.id);
    expect(q.frame.rotation).toBe(get<PathObj>(turned, p.id).frame.rotation);
    const after = pageNodes(q);
    near(after[0], before[0]);
    near(after[1], before[1]);
    near(after[2], { x: (before[2]?.x ?? 0) + 7, y: (before[2]?.y ?? 0) - 4 });
  });

  it('undoes rotation and flip in a page offset', () => {
    near(toLocalDelta({ x: 0, y: 0, w: 1, h: 1, rotation: 90 }, 1, 0), { x: 0, y: -1 });
    near(toLocalDelta({ x: 0, y: 0, w: 1, h: 1, rotation: 0, flipX: true }, 1, 2), { x: -1, y: 2 });
  });
});

describe('adding and deleting points', () => {
  it('splits a curve without changing its shape', () => {
    const p = zigzag();
    const f0 = figWith(p);
    const f1 = insertNode(pageId(f0), p.id, 1, 0.3).apply(f0);
    const q = get<PathObj>(f1, p.id);
    expect(q.nodes).toHaveLength(4);
    // The split curve passes through the old curve's points.
    const old = samplePath(p.nodes, false, 2000).map((v) => onPage(p, v));
    const now = samplePath(q.nodes, false, 64).map((v) => onPage(q, v));
    for (const v of now) {
      const d = Math.min(...old.map((w) => Math.hypot(w.x - v.x, w.y - v.y)));
      expect(d).toBeLessThan(0.05);
    }
    near(onPage(q, q.nodes[2] ?? { x: 0, y: 0 }), onPage(p, splitAt(p.nodes, 1, 0.3)));
  });

  it('puts a point on a straight segment where it was clicked', () => {
    const line = createPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
    );
    const hit = nearestOnPath(line.nodes, false, { x: 25, y: 3 });
    expect(hit.seg).toBe(0);
    expect(hit.t).toBeCloseTo(0.25, 1);
    const f0 = figWith(line);
    const q = get<PathObj>(insertNode(pageId(f0), line.id, hit.seg, hit.t).apply(f0), line.id);
    expect(q.nodes.map((n) => n.x)).toEqual([0, 25, 100]);
    expect(q.nodes[1]?.in).toBeUndefined();
  });

  it('adds on the closing segment of a closed path', () => {
    const tri = createPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 80 },
      ],
      true,
    );
    const f0 = figWith(tri);
    const q = get<PathObj>(insertNode(pageId(f0), tri.id, 2, 0.5).apply(f0), tri.id);
    expect(q.nodes[3]).toEqual({ x: 25, y: 40 });
  });

  it('deletes a point but never below two', () => {
    const p = zigzag();
    const f0 = figWith(p);
    const id = pageId(f0);
    const f1 = deleteNodePart(id, p.id, { index: 1, part: 'node' }).apply(f0);
    const q = get<PathObj>(f1, p.id);
    expect(q.nodes).toHaveLength(2);
    expect(q.frame.h).toBe(0);
    expect(() => deleteNodePart(id, p.id, { index: 0, part: 'node' }).apply(f1)).toThrow(
      /at least two/,
    );
  });

  it('removes one handle, making that side a corner', () => {
    const p = zigzag();
    const f0 = figWith(p);
    const f1 = deleteNodePart(pageId(f0), p.id, { index: 1, part: 'in' }).apply(f0);
    const n = get<PathObj>(f1, p.id).nodes[1];
    expect(n?.in).toBeUndefined();
    expect(n?.out).toBeDefined();
  });
});

describe('corner and smooth', () => {
  it('makes a corner smooth along its neighbours, and back', () => {
    const tri = createPath(
      [
        { x: 0, y: 0 },
        { x: 60, y: 30 },
        { x: 120, y: 0 },
      ],
      false,
    );
    const f0 = figWith(tri);
    const id = pageId(f0);
    const f1 = setSmooth(id, tri.id, 1, true).apply(f0);
    const q = get<PathObj>(f1, tri.id);
    const n = q.nodes[1];
    expect(n && isSmooth(n)).toBe(true);
    // Along the line from the previous to the next point: horizontal, a third of the way.
    expect(n?.in?.y).toBeCloseTo(n?.y ?? NaN, 9);
    expect((n?.x ?? 0) - (n?.in?.x ?? 0)).toBeCloseTo(Math.hypot(60, 30) / 3, 9);
    const f2 = setSmooth(id, tri.id, 1, false).apply(f1);
    expect(pageNodes(get(f2, tri.id))).toEqual(pageNodes(tri));
    expect(get<PathObj>(f2, tri.id).nodes[1]).toEqual({ x: 60, y: 30 });
  });

  it('gives an end point one handle', () => {
    const p = zigzag();
    const f0 = figWith(p);
    const n = get<PathObj>(setSmooth(pageId(f0), p.id, 0, true).apply(f0), p.id).nodes[0];
    expect(n?.in).toBeUndefined();
    expect(n?.out).toBeDefined();
  });

  it('walks nodes and handles in path order', () => {
    expect(nodeRefs(zigzag().nodes)).toEqual([
      { index: 0, part: 'node' },
      { index: 1, part: 'in' },
      { index: 1, part: 'node' },
      { index: 1, part: 'out' },
      { index: 2, part: 'node' },
    ]);
  });
});

describe('arrows and path-following objects', () => {
  it('re-solves an arrow bound to a closed path whose point moved', () => {
    const box = createPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
    );
    const a: Arrow = {
      ...createArrow([
        { x: 300, y: 50 },
        { x: 102, y: 50 },
      ]),
      bind: { end: { id: box.id } },
    };
    const f0 = reconcileBindings(figWith(box), figWith(box, a));
    const end0 = pageNodes(get(f0, a.id))[1];
    near(end0, { x: 102, y: 50 }, 1e-3);
    // Pull the right side out by 40 pt: the end follows the outline.
    const id = pageId(f0);
    const moved = moveNodePart(id, box.id, { index: 1, part: 'node' }, 40, 0).apply(f0);
    const f1 = reconcileBindings(
      f0,
      moveNodePart(id, box.id, { index: 2, part: 'node' }, 40, 0).apply(moved),
    );
    const arrow = get<Arrow>(f1, a.id);
    expect(arrow.bind?.end?.id).toBe(box.id);
    near(pageNodes(arrow)[1], { x: 142, y: 50 }, 1e-3);
  });

  it("detaches an arrow's bound end dragged away, keeps it when a middle point moves", () => {
    const box = createPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      true,
    );
    const a: Arrow = {
      ...createArrow([
        { x: 300, y: 50 },
        { x: 250, y: 80 },
        { x: 102, y: 50 },
      ]),
      bind: { end: { id: box.id } },
    };
    const f0 = reconcileBindings(figWith(box), figWith(box, a));
    const id = pageId(f0);
    const mid = reconcileBindings(
      f0,
      moveNodePart(id, a.id, { index: 1, part: 'node' }, 0, 30).apply(f0),
    );
    expect(get<Arrow>(mid, a.id).bind?.end?.id).toBe(box.id);
    const end = reconcileBindings(
      f0,
      moveNodePart(id, a.id, { index: 2, part: 'node' }, 0, 30).apply(f0),
    );
    expect(get<Arrow>(end, a.id).bind).toBeUndefined();
  });

  it("edits a bilayer's guide path and leaves its params alone", () => {
    const k = getKind('bilayer');
    if (!k) throw new Error('no bilayer');
    const o = createProcedural(k, { x: 200, y: 200 });
    const f0 = figWith(o);
    const ed = editableNodes(o);
    expect(ed?.nodes.length).toBeGreaterThanOrEqual(2);
    const f1 = moveNodePart(pageId(f0), o.id, { index: 0, part: 'node' }, -30, 10).apply(f0);
    const q = get<Procedural>(f1, o.id);
    expect(q.params).toBe(o.params);
    const before = pageNodes(o);
    const after = pageNodes(q);
    near(after[0], { x: (before[0]?.x ?? 0) - 30, y: (before[0]?.y ?? 0) + 10 });
    near(after[1], before[1]);
    // The frame keeps the room the lipids reach past the path.
    const margin = (p: Procedural) => Math.min(...(p.path ?? []).map((n) => n.x));
    expect(margin(q)).toBeCloseTo(margin(o), 9);
    // Inserting a point goes into the path too.
    const f2 = insertNode(pageId(f1), o.id, 0, 0.5).apply(f1);
    expect(get<Procedural>(f2, o.id).path?.length).toBe((o.path?.length ?? 0) + 1);
  });

  it('leaves locked objects and kinds without a path alone', () => {
    expect(editableNodes({ ...zigzag(), locked: true })).toBeNull();
    const plate = getKind('plate');
    if (plate) expect(editableNodes(createProcedural(plate, { x: 0, y: 0 }))).toBeNull();
  });
});

function splitAt(nodes: readonly PathNode[], seg: number, t: number): Vec2 {
  const a = nodes[seg];
  const b = nodes[seg + 1];
  if (!a || !b) throw new Error('no segment');
  const p1 = a.out ?? a;
  const p2 = b.in ?? b;
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
  };
}
