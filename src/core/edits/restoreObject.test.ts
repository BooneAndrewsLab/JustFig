import { describe, expect, it } from 'vitest';

import { createDoc, createRect, frame } from '../model/factory';
import { findObj } from '../model/tree';
import type { Figure, Icon } from '../model/types';
import { AppStore, figure } from '@/ui/state/store';

import { addObjects, deleteObjects, updateObjects } from './edits';
import { restoreObject } from './restoreObject';

function firstPage(f: Figure) {
  const p = f.doc.pages[0];
  if (!p) throw new Error('no page');
  return p.id;
}

describe('restoreObject', () => {
  const f0: Figure = { doc: createDoc(), assets: {} };
  const pid = firstPage(f0);

  it('replaces a changed object by id, one undo step', () => {
    const r = createRect(frame(0, 0, 10, 10));
    const store = new AppStore(f0);
    store.edit(addObjects(pid, [r]));
    const saved = figure(store.getState());
    store.edit(updateObjects(pid, [r.id], 'Move', (o) => ({ ...o, frame: frame(50, 0, 10, 10) })));
    const now = figure(store.getState());
    store.edit(restoreObject(pid, r, saved, 'v1'));
    const page = figure(store.getState()).doc.pages[0];
    expect(page && findObj(page, r.id)?.frame.x).toBe(0);
    expect(store.undoLabel()).toBe('Undo Restore rect from “v1”');
    store.undo();
    expect(figure(store.getState())).toBe(now);
  });

  it('re-adds a deleted object with its id and the assets it uses', () => {
    const icon = {
      ...createRect(frame(0, 0, 10, 10)),
      type: 'icon',
      asset: 'h1',
    } as unknown as Icon;
    const saved: Figure = {
      doc: createDoc(),
      assets: { h1: { kind: 'svgImport', svg: '<svg/>', meta: {} } } as unknown as Figure['assets'],
    };
    const store = new AppStore(f0);
    store.edit(addObjects(pid, [icon]));
    store.edit(deleteObjects(pid, [icon.id]));
    expect(figure(store.getState()).assets['h1']).toBeUndefined();
    store.edit(restoreObject(pid, icon, saved, 'v1'));
    const now = figure(store.getState());
    expect(now.doc.pages[0] && findObj(now.doc.pages[0], icon.id)).toBeDefined();
    expect(now.assets['h1']).toBeDefined();
  });
});
