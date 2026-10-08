import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createRect, frame } from '@/core/model/factory';
import { FigureDb, FigureStorage } from '@/io/storage';

import { Autosaver } from './autosave';
import { AppStore, currentPage } from './store';

describe('Autosaver', () => {
  it('saves after a change, not before, and restores the latest figure', async () => {
    const store = new AppStore();
    const storage = new FigureStorage(new FigureDb(`t-${String(Math.random())}`));
    const saver = new Autosaver(store, storage, { name: 't', version: '0' });
    await saver.flush();
    expect(await storage.latest()).toBeNull();
    const r = createRect(frame(1, 2, 3, 4));
    store.edit(addObjects(currentPage(store.getState()).id, [r]));
    await saver.flush();
    const back = await storage.latest();
    expect(back?.doc).toEqual(store.getState().history.present.doc);
    saver.dispose();
  });
});
