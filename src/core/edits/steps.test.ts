import { beforeAll, describe, expect, it } from 'vitest';

import { exportSvg } from '@/export/svg';
import { linkColours, setSwatch } from '@/palette/recolor';
import { loadTestFonts } from '@/test/fonts';

import { History } from '../history/history';
import { reconcileBindings } from '../model/binding';
import { cloneObjects } from '../model/clone';
import { createDoc, createRect, frame } from '../model/factory';
import type { Id } from '../model/ids';
import { type StepBadge, formatStep, isStep, stepNumbers } from '../model/steps';
import { findObj, pageObjects } from '../model/tree';
import type { Figure, Obj, Page } from '../model/types';
import { center } from '../geometry/matrix';
import { objBounds } from '../geometry/transform';
import {
  type Edit,
  addObjects,
  deleteObjects,
  groupObjects,
  moveObjects,
  setLabelStyle,
} from './edits';
import { numberSteps, setStepVariant } from './steps';

const OPTS = { textMode: 'outline', footer: false, background: false } as const;
const run = (f: Figure, e: Edit): Figure => reconcileBindings(f, e.apply(f));
const page = (f: Figure): Page => {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p;
};
const badges = (f: Figure): StepBadge[] => [...pageObjects(page(f))].filter(isStep);
const badgeOn = (f: Figure, target: Id): StepBadge => {
  const b = badges(f).find((x) => x.step.target === target);
  if (!b) throw new Error(`no badge on ${target}`);
  return b;
};
const label = (b: StepBadge): string => b.runs[0]?.[0]?.text ?? '';
const get = (f: Figure, id: Id): Obj => {
  const o = findObj(page(f), id);
  if (!o) throw new Error(`no ${id}`);
  return o;
};

/** Three rectangles in a row, numbered. */
function three(): { f: Figure; ids: Id[] } {
  const rects = [0, 1, 2].map((i) => createRect(frame(40 + i * 100, 60, 60, 40)));
  let f: Figure = { doc: createDoc(), assets: {} };
  f = run(f, addObjects(page(f).id, rects));
  const ids = rects.map((r) => r.id);
  // Selection order is not reading order: the numbers come from positions.
  f = run(f, numberSteps(page(f).id, [ids[2], ids[0], ids[1]] as Id[]));
  return { f, ids };
}

describe('numbered steps (note 48)', () => {
  beforeAll(loadTestFonts);

  it('numbers three objects 1 2 3 in reading order, one badge each, at their top-left corners', () => {
    const { f, ids } = three();
    expect(badges(f)).toHaveLength(3);
    expect(ids.map((id) => label(badgeOn(f, id)))).toEqual(['1', '2', '3']);
    for (const id of ids) {
      const c = center(objBounds(badgeOn(f, id)));
      const t = objBounds(get(f, id));
      expect(c.x).toBeCloseTo(t.x);
      expect(c.y).toBeCloseTo(t.y);
    }
    // Each badge sits directly above its target in the stack.
    const order = page(f).layers[0]?.children.map((o) => o.id) ?? [];
    for (const id of ids) expect(order[order.indexOf(id) + 1]).toBe(badgeOn(f, id).id);
    // Its colour is a swatch, added to the palette once.
    expect(f.doc.palette.filter((s) => s.name === 'Steps')).toHaveLength(1);
    expect('swatch' in badgeOn(f, ids[0]!).step.paint).toBe(true);
  });

  it('renumbers when a target moves past the others, and the badge follows it', () => {
    const { f, ids } = three();
    const [a, b, c] = ids as [Id, Id, Id];
    const g = run(f, moveObjects(page(f).id, [a], 300, 0));
    expect([b, c, a].map((id) => label(badgeOn(g, id)))).toEqual(['1', '2', '3']);
    const at = center(objBounds(badgeOn(g, a)));
    expect(at.x).toBeCloseTo(objBounds(get(g, a)).x);
    // Unchanged badges keep their identity (b's number did change).
    expect(badgeOn(g, c)).not.toBe(badgeOn(f, c));
  });

  it('a badge dragged alone keeps its new offset from its object', () => {
    const { f, ids } = three();
    const a = ids[0]!;
    const g = run(f, moveObjects(page(f).id, [badgeOn(f, a).id], 5, -7));
    const h = run(g, moveObjects(page(g).id, [a], 0, 50));
    const c = center(objBounds(badgeOn(h, a)));
    const t = objBounds(get(h, a));
    expect(c.x - t.x).toBeCloseTo(5);
    expect(c.y - t.y).toBeCloseTo(-7);
  });

  it('deleting a target deletes its badge, and the rest renumber', () => {
    const { f, ids } = three();
    const g = run(f, deleteObjects(page(f).id, [ids[0]!]));
    expect(badges(g)).toHaveLength(2);
    expect([ids[1], ids[2]].map((id) => label(badgeOn(g, id!)))).toEqual(['1', '2']);
  });

  it('a copied group with its steps gets badges on the copies; a lone badge copy is plain text', () => {
    const { f, ids } = three();
    const all = [...ids, ...ids.map((id) => badgeOn(f, id).id)];
    const g = run(f, groupObjects(page(f).id, all, 'grp' as Id));
    const group = get(g, 'grp' as Id);
    const copy = cloneObjects([group], 0, 200);
    const h = run(g, addObjects(page(g).id, copy));
    expect(badges(h)).toHaveLength(6);
    const copied = copy[0];
    if (copied?.type !== 'group') throw new Error('no group');
    // The copy's badges point at the copies, numbered 1 2 3 within their own group.
    const kids = copied.children.filter((o) => o.type === 'rect').map((o) => o.id);
    expect(kids.map((id) => label(badgeOn(h, id)))).toEqual(['1', '2', '3']);
    const lone = cloneObjects([badgeOn(f, ids[0]!)])[0];
    expect(lone?.type === 'text' && lone.step).toBeFalsy();
  });

  it('numbers within a group separately from the page', () => {
    const { f, ids } = three();
    const [a, b] = ids as [Id, Id, Id];
    const g = run(f, groupObjects(page(f).id, [a, b, badgeOn(f, a).id, badgeOn(f, b).id]));
    expect(ids.map((id) => label(badgeOn(g, id)))).toEqual(['1', '2', '1']);
  });

  it('follows the panel-label format and the label font and size', () => {
    const { f, ids } = three();
    const style = f.doc.panelLabelStyle;
    const g = run(f, setLabelStyle({ ...style, format: '(a)', size: 9, font: 'tinos' }));
    const b = badgeOn(g, ids[1]!);
    expect(label(b)).toBe('(2)');
    expect(b.runs[0]?.[0]?.size).toBe(9);
    expect(b.runs[0]?.[0]?.font).toBe('tinos');
    expect(formatStep(3, 'a)')).toBe('3)');
    expect(formatStep(3, 'A')).toBe('3');
  });

  it('a plain badge is its coloured number; a circle is a filled ellipse in the export', () => {
    const { f, ids } = three();
    const b = badgeOn(f, ids[0]!);
    const svg = exportSvg(f, page(f), OPTS, 'test');
    expect(svg).toContain('<ellipse');
    const g = run(f, setStepVariant(page(f).id, [b.id], 'plain'));
    const p = badgeOn(g, ids[0]!);
    expect(p.runs[0]?.[0]?.color).toEqual(p.step.paint);
    expect(center(objBounds(p)).x).toBeCloseTo(center(objBounds(b)).x);
  });

  it('a palette change recolours the badges through their swatch', () => {
    const { f } = three();
    const sw = f.doc.palette.find((s) => s.name === 'Steps');
    if (!sw) throw new Error('no swatch');
    const g = run(run(f, linkColours()), setSwatch(sw.id, '#cc0000'));
    expect(exportSvg(g, page(g), OPTS, 'test')).toContain('#cc0000');
  });

  it('is one undo step', () => {
    const rects = [0, 1, 2].map((i) => createRect(frame(40 + i * 100, 60, 60, 40)));
    let f: Figure = { doc: createDoc(), assets: {} };
    f = run(f, addObjects(page(f).id, rects));
    const e = numberSteps(
      page(f).id,
      rects.map((r) => r.id),
    );
    const h = History.create(f).push(run(f, e), e.label);
    expect(h.undoLabel).toBe('Number steps');
    expect(badges(h.present)).toHaveLength(3);
    expect(badges(h.undo().present)).toHaveLength(0);
    expect(h.undo().present).toBe(f);
  });

  it('adds one step to one object, and refuses a second', () => {
    const r = createRect(frame(10, 10, 20, 20));
    let f: Figure = { doc: createDoc(), assets: {} };
    f = run(f, addObjects(page(f).id, [r]));
    const e = numberSteps(page(f).id, [r.id]);
    expect(e.label).toBe('Add step');
    f = run(f, e);
    expect(label(badgeOn(f, r.id))).toBe('1');
    expect(() => numberSteps(page(f).id, [r.id]).apply(f)).toThrow(/already/);
  });

  it('reconciling twice changes nothing', () => {
    const { f } = three();
    expect(reconcileBindings(f, f)).toBe(f);
  });

  it('counts numbers per scope', () => {
    const { f, ids } = three();
    const n = stepNumbers(page(f));
    expect(ids.map((id) => n.get(badgeOn(f, id).id))).toEqual([1, 2, 3]);
  });
});
