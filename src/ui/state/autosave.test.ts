import { describe, expect, it } from 'vitest';

import { addObjects } from '@/core/edits/edits';
import { createDoc, createRect, frame } from '@/core/model/factory';
import type { Figure } from '@/core/model/types';
import { FigureDb, FigureStorage } from '@/io/storage';

import { Autosaver } from './autosave';
import { keptTabs, rememberTabs, rememberedTabs, reopenTabs, TABS_KEY } from './openTabs';
import { AppStore, currentPage, figure } from './store';

const blank = (): Figure => ({ doc: createDoc(), assets: {} });
const newStorage = () => new FigureStorage(new FigureDb(`t-${String(Math.random())}`));
const APP = { name: 't', version: '0' };

function draw(store: AppStore, x = 1): void {
  store.edit(addObjects(currentPage(store.getState()).id, [createRect(frame(x, 2, 3, 4))]));
}

/** A key-value store standing in for localStorage. */
function memoryKv(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe('Autosaver', () => {
  it('saves after a change, not before, and restores the latest figure', async () => {
    const store = new AppStore();
    const storage = newStorage();
    const saver = new Autosaver(store, storage, APP);
    await saver.flush();
    expect(await storage.latest()).toBeNull();
    draw(store);
    await saver.flush();
    const back = await storage.latest();
    expect(back?.doc).toEqual(store.getState().history.present.doc);
    saver.dispose();
  });

  it('writes every changed tab, not only the front one (note 25)', async () => {
    const store = new AppStore();
    const storage = newStorage();
    const saver = new Autosaver(store, storage, APP);
    draw(store);
    const a = figure(store.getState()).doc.id;
    store.open(blank());
    draw(store);
    const b = figure(store.getState()).doc.id;
    await saver.flush();
    const [first] = store.getState().tabs;
    expect((await storage.load(a))?.doc).toEqual(first && figure(first).doc);
    expect((await storage.load(b))?.doc).toEqual(figure(store.getState()).doc);
    saver.dispose();
  });

  it('still writes a tab closed, or a figure replaced, right after a flush', async () => {
    const store = new AppStore();
    const storage = newStorage();
    const saver = new Autosaver(store, storage, APP);
    draw(store);
    const closed = figure(store.getState());
    const flushed = saver.flush();
    store.close(store.getState().front);
    await flushed;
    expect((await storage.load(closed.doc.id))?.doc).toEqual(closed.doc);

    draw(store, 5);
    const replaced = figure(store.getState());
    const again = saver.flush();
    store.load(blank());
    await again;
    expect((await storage.load(replaced.doc.id))?.doc).toEqual(replaced.doc);
    saver.dispose();
  });

  it('never evicts a figure open in a tab', async () => {
    const storage = newStorage();
    const old = blank();
    await storage.save(old, APP, { now: 1 });
    for (let i = 0; i < 3; i += 1) await storage.save(blank(), APP, { now: 10 + i });
    const gone = await storage.evict([old.doc.id], 2);
    // Four rows, two allowed: the two oldest that are not open go.
    expect(gone).toHaveLength(2);
    expect(gone).not.toContain(old.doc.id);
    expect(await storage.load(old.doc.id)).not.toBeNull();
  });
});

describe('open tabs across a reload (note 25)', () => {
  it('remembers the open figures and the front one, and reopens them in order', async () => {
    const kv = memoryKv();
    const storage = newStorage();
    const before = new AppStore();
    const saver = new Autosaver(before, storage, APP);
    const stop = rememberTabs(before, kv);
    draw(before);
    before.open(blank());
    draw(before);
    before.open(blank());
    draw(before);
    const ids = before.getState().tabs.map((t) => figure(t).doc.id);
    before.activateAt(1);
    await saver.flush();
    stop();
    saver.dispose();
    expect(JSON.parse(kv.data.get(TABS_KEY) ?? '')).toEqual({ ids, front: ids[1] });

    const after = new AppStore();
    reopenTabs(after, await keptTabs(storage, rememberedTabs(kv)));
    expect(after.getState().tabs.map((t) => figure(t).doc.id)).toEqual(ids);
    expect(figure(after.getState()).doc.id).toBe(ids[1]);
    // Each reopened tab starts a history of its own.
    expect(after.getState().tabs.every((t) => !t.history.canUndo)).toBe(true);
  });

  it('skips figures that are gone, and falls back to the latest one', async () => {
    const storage = newStorage();
    const kept = blank();
    await storage.save(kept, APP);
    const kv = memoryKv();
    kv.setItem(TABS_KEY, JSON.stringify({ ids: ['gone', kept.doc.id], front: 'gone' }));
    const s = new AppStore();
    reopenTabs(s, await keptTabs(storage, rememberedTabs(kv)));
    expect(s.getState().tabs.map((t) => figure(t).doc.id)).toEqual([kept.doc.id]);

    const none = memoryKv();
    none.setItem(TABS_KEY, '{"ids":["gone"],"front":null}');
    const t = new AppStore();
    reopenTabs(t, await keptTabs(storage, rememberedTabs(none)));
    expect(figure(t.getState()).doc.id).toBe(kept.doc.id);
  });

  it('reads the one figure remembered before tabs', () => {
    const kv = memoryKv();
    kv.setItem('justfig.current', 'abc');
    expect(rememberedTabs(kv)).toEqual({ ids: ['abc'], front: 'abc' });
    kv.setItem(TABS_KEY, 'not json');
    expect(rememberedTabs(kv)).toEqual({ ids: [], front: null });
  });
});
