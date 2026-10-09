import { describe, expect, it } from 'vitest';

import { addObjects, deleteObjects, moveObjects } from '@/core/edits/edits';
import { createArrow, createDoc, createRect, frame } from '@/core/model/factory';
import { findObj } from '@/core/model/tree';
import type { Arrow, Figure } from '@/core/model/types';

import { AppStore, type TabState, currentPage, figure, isUnsaved, isUntouched } from './store';

describe('AppStore', () => {
  it('records a drag as one undo step', () => {
    const s = new AppStore();
    const page = currentPage(s.getState());
    const r = createRect(frame(0, 0, 10, 10));
    s.edit(addObjects(page.id, [r]));
    const start = s.getState().history.present;
    for (let i = 1; i <= 5; i += 1)
      s.edit(moveObjects(page.id, [r.id], i, 0), { coalesce: 'drag:1', from: start });
    expect(s.getState().history.undoDepth).toBe(2);
    expect(currentPage(s.getState()).layers[0]?.children[0]?.frame.x).toBe(5);
    s.undo();
    expect(currentPage(s.getState()).layers[0]?.children[0]?.frame.x).toBe(0);
    expect(s.undoLabel()).toBe('Undo Add rect');
  });

  it('selects added objects and drops selected ids that undo removes', () => {
    const s = new AppStore();
    const page = currentPage(s.getState());
    const r = createRect(frame(0, 0, 10, 10));
    s.edit(addObjects(page.id, [r]));
    expect(s.getState().selection).toEqual([r.id]);
    s.undo();
    expect(s.getState().selection).toEqual([]);
  });

  it('turns a refused edit into a notice', () => {
    const s = new AppStore();
    const ok = s.edit({
      label: 'x',
      apply: () => deleteObjects('nope' as never, []).apply(s.getState().history.present),
    });
    expect(ok).toBe(false);
    expect(s.getState().notice?.tone).toBe('error');
  });
});

describe('AppStore tabs (note 25)', () => {
  const blank = (): Figure => ({ doc: createDoc(), assets: {} });
  const rect = (x = 0) => createRect(frame(x, 0, 10, 10));
  const objectsOf = (t: Pick<TabState, 'history' | 'pageId'>) =>
    currentPage(t).layers[0]?.children ?? [];

  it('keeps undo, redo and gestures per tab', () => {
    const s = new AppStore(blank());
    const a = s.getState().front;
    s.edit(addObjects(currentPage(s.getState()).id, [rect()]));
    const b = s.open(blank());
    expect(s.getState().front).toBe(b);
    expect(s.getState().history.canUndo).toBe(false);
    const r = rect();
    s.edit(addObjects(currentPage(s.getState()).id, [r]));
    s.edit(moveObjects(currentPage(s.getState()).id, [r.id], 5, 0), { coalesce: 'drag:1' });
    s.edit(moveObjects(currentPage(s.getState()).id, [r.id], 5, 0), { coalesce: 'drag:1' });
    expect(s.getState().history.undoDepth).toBe(2);
    s.undo();
    s.undo();
    expect(s.getState().history.canUndo).toBe(false);
    expect(objectsOf(s.getState())).toHaveLength(0);
    // A still has its rectangle and its one undo step; undo in B never reached it.
    s.activate(a);
    expect(objectsOf(s.getState())).toHaveLength(1);
    expect(s.getState().history.undoDepth).toBe(1);
    expect(s.undoLabel()).toBe('Undo Add rect');
    // Redo is per tab too.
    s.activate(b);
    s.redo();
    expect(objectsOf(s.getState())).toHaveLength(1);
  });

  it('keeps selection, page and view per tab, and shares the tool', () => {
    const s = new AppStore(blank());
    const a = s.getState().front;
    const r = rect();
    s.edit(addObjects(currentPage(s.getState()).id, [r]));
    s.setView({ zoom: 2, x: 5, y: 6 });
    s.setTool('rect');
    s.open(blank());
    expect(s.getState().selection).toEqual([]);
    expect(s.getState().view.zoom).toBe(1);
    expect(s.getState().tool).toBe('rect');
    s.activate(a);
    expect(s.getState().selection).toEqual([r.id]);
    expect(s.getState().view).toEqual({ zoom: 2, x: 5, y: 6 });
  });

  it('reconciles bound arrows in the tab an edit applies to, front or not', () => {
    const s = new AppStore(blank());
    const a = s.getState().front;
    const page = currentPage(s.getState()).id;
    const p = createRect(frame(0, 0, 20, 20));
    const q = createRect(frame(100, 0, 20, 20));
    const arrow: Arrow = {
      ...createArrow([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
      bind: { start: p.id, end: q.id },
    };
    s.edit(addObjects(page, [p, q]));
    s.edit(addObjects(page, [arrow]));
    const before = findObj(currentPage(s.getState()), arrow.id)?.frame;
    s.open(blank());
    s.edit(moveObjects(page, [q.id], 0, 80), { tab: a });
    const tabA = s.getState().tabs.find((t) => t.key === a);
    if (!tabA) throw new Error('tab A');
    expect(findObj(currentPage(tabA), arrow.id)?.frame).not.toEqual(before);
    // The front tab was not touched.
    expect(s.getState().history.canUndo).toBe(false);
  });

  it('brings an open figure forward instead of opening it twice', () => {
    const s = new AppStore(blank());
    const f = blank();
    const k = s.open(f);
    s.open(blank());
    expect(s.open(f)).toBe(k);
    expect(s.getState().tabs).toHaveLength(3);
    expect(s.getState().front).toBe(k);
    expect(s.tabOf(f.doc.id)).toBe(k);
  });

  it('lets the next figure take an untouched New tab, and New on it does nothing', () => {
    const s = new AppStore();
    const fresh = s.getState().front;
    const [first] = s.getState().tabs;
    expect(first && isUntouched(first)).toBe(true);
    expect(s.open(blank(), { fresh: true })).toBe(fresh);
    const f = blank();
    expect(s.open(f)).toBe(fresh);
    expect(s.getState().tabs).toHaveLength(1);
    expect(figure(s.getState()).doc.id).toBe(f.doc.id);
    // A New tab that was drawn in is not taken.
    s.open(blank(), { fresh: true });
    s.edit(addObjects(currentPage(s.getState()).id, [rect()]));
    s.open(blank());
    expect(s.getState().tabs).toHaveLength(3);
  });

  it('closes to the right-hand neighbour, and never to no tab at all', () => {
    const s = new AppStore(blank());
    const a = s.getState().front;
    const b = s.open(blank());
    const c = s.open(blank());
    s.activate(b);
    s.close(b);
    expect(s.getState().front).toBe(c);
    s.close(c);
    expect(s.getState().front).toBe(a);
    s.close(a);
    const [only] = s.getState().tabs;
    expect(s.getState().tabs).toHaveLength(1);
    expect(only && isUntouched(only)).toBe(true);
  });

  it('moves tabs, and the front one by a place either way', () => {
    const s = new AppStore(blank());
    const a = s.getState().front;
    const b = s.open(blank());
    const c = s.open(blank());
    const order = () => s.getState().tabs.map((t) => t.key);
    s.move(c, 0);
    expect(order()).toEqual([c, a, b]);
    s.moveFront(1);
    expect(order()).toEqual([a, c, b]);
    s.moveFront(1);
    s.moveFront(1);
    expect(order()).toEqual([a, b, c]);
    s.activateAt(0);
    expect(s.getState().front).toBe(a);
    s.activateAt(8);
    expect(s.getState().front).toBe(a);
  });

  it('marks a background tab as saved to file, and only that one', () => {
    const s = new AppStore(blank());
    const a = s.getState().front;
    s.edit(addObjects(currentPage(s.getState()).id, [rect()]));
    s.open(blank());
    s.edit(addObjects(currentPage(s.getState()).id, [rect()]));
    s.markDownloaded(a);
    const [ta, tb] = s.getState().tabs;
    expect(ta && isUnsaved(ta)).toBe(false);
    expect(tb && isUnsaved(tb)).toBe(true);
  });
});
