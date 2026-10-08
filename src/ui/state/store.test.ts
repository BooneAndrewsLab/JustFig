import { describe, expect, it } from 'vitest';

import { addObjects, deleteObjects, moveObjects } from '@/core/edits/edits';
import { createRect, frame } from '@/core/model/factory';

import { AppStore, currentPage } from './store';

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
