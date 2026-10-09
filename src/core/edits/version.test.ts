import { describe, expect, it } from 'vitest';

import { createDoc, createRect, frame } from '../model/factory';
import type { Figure } from '../model/types';
import { AppStore, figure } from '@/ui/state/store';

import { addObjects } from './edits';
import { figureCounts, restoreVersion } from './version';

const start = (): Figure => ({ doc: { ...createDoc(), title: 'Fig' }, assets: {} });

describe('restoreVersion', () => {
  it('makes the figure the saved one as one undo step, keeping the document id', () => {
    const f = start();
    const page = f.doc.pages[0];
    if (!page) throw new Error('no page');
    const store = new AppStore(f);
    store.edit(addObjects(page.id, [createRect(frame(0, 0, 10, 10))]));
    const saved = figure(store.getState());
    store.edit(addObjects(page.id, [createRect(frame(20, 0, 10, 10))]));
    const now = figure(store.getState());
    expect(figureCounts(now)).toEqual({ pages: 1, objects: 2 });

    // A version read back from storage: same content, another document id.
    const fromStore: Figure = {
      doc: { ...saved.doc, id: 'd_other' as typeof saved.doc.id },
      assets: {},
    };
    store.edit(restoreVersion('sent to PI', fromStore));
    const restored = figure(store.getState());
    expect(figureCounts(restored)).toEqual({ pages: 1, objects: 1 });
    expect(restored.doc.id).toBe(f.doc.id);
    expect(store.undoLabel()).toBe('Undo Restore version “sent to PI”');
    store.undo();
    expect(figure(store.getState())).toBe(now);
  });
});
