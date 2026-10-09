import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

import { createDoc } from '@/core/model/factory';
import type { Figure } from '@/core/model/types';

import { writeJfig } from './jfig';
import { FigureDb, FigureStorage, NamedStore, StoreFullError, cleanName } from './storage';

const APP = { name: 't', version: '0' };
const dbName = () => `t-${String(Math.random())}`;
const fig = (title: string): Figure => ({ doc: { ...createDoc(), title }, assets: {} });

describe('FigureStorage', () => {
  it('keeps one record per document id, newest first', async () => {
    const s = new FigureStorage(new FigureDb(dbName()));
    const a = fig('A');
    const b = fig('B');
    await s.save(a, APP, { now: 1 });
    await s.save(b, APP, { now: 2 });
    await s.save({ ...a, doc: { ...a.doc, title: 'A2' } }, APP, { now: 3 });
    const list = await s.list();
    expect(list.map((r) => r.title)).toEqual(['A2', 'B']);
    expect((await s.load(b.doc.id))?.doc.title).toBe('B');
    expect((await s.latest())?.doc.id).toBe(a.doc.id);
  });

  it('migrates a v1 database (one autosave row) to an entry of the list', async () => {
    const name = dbName();
    const old = fig('Old autosave');
    const v1 = new Dexie(name);
    v1.version(1).stores({ figures: 'id, updatedAt' });
    await v1.table('figures').put({
      id: old.doc.id,
      title: old.doc.title,
      text: writeJfig(old, APP),
      downloaded: true,
      updatedAt: 5,
    });
    v1.close();
    const s = new FigureStorage(new FigureDb(name));
    const [row, ...rest] = await s.list();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      id: old.doc.id,
      title: 'Old autosave',
      downloaded: true,
      thumb: null,
    });
    expect((await s.load(old.doc.id))?.doc).toEqual(old.doc);
    await s.save(fig('New'), APP, { now: 6 });
    expect((await s.list()).map((r) => r.title)).toEqual(['New', 'Old autosave']);
  });

  it('evicts the oldest past the count cap, never the figure just saved', async () => {
    const s = new FigureStorage(new FigureDb(dbName()));
    const figs = [fig('1'), fig('2'), fig('3'), fig('4')];
    for (const [i, f] of figs.entries()) await s.save(f, APP, { now: 10 + i });
    const gone = await s.evict(figs[0]?.doc.id ?? '', 2);
    expect(gone.length).toBe(2);
    expect((await s.list()).map((r) => r.title).sort()).toEqual(['1', '4']);
  });

  it('evicts by total size', async () => {
    const s = new FigureStorage(new FigureDb(dbName()));
    await s.save(fig('old'), APP, { now: 1 });
    await s.save(fig('new'), APP, { now: 2 });
    const [newest] = await s.list();
    await s.evict(newest?.id ?? '', 100, 1);
    expect((await s.list()).map((r) => r.title)).toEqual(['new']);
  });

  it('renames in the row and the file text, keeping the modified time and thumbnail', async () => {
    const s = new FigureStorage(new FigureDb(dbName()));
    const a = fig('A');
    await s.save(a, APP, { now: 7 });
    await s.setThumb(a.doc.id, 'data:image/jpeg;base64,xx');
    await s.rename(a.doc.id, 'Renamed', APP);
    const [row] = await s.list();
    expect(row).toMatchObject({
      title: 'Renamed',
      updatedAt: 7,
      thumb: 'data:image/jpeg;base64,xx',
    });
    expect((await s.load(a.doc.id))?.doc.title).toBe('Renamed');
    await s.save(a, APP, { now: 8 });
    expect((await s.list())[0]?.thumb).toBe('data:image/jpeg;base64,xx');
  });

  it('removes one figure and reads its text back', async () => {
    const s = new FigureStorage(new FigureDb(dbName()));
    const a = fig('A');
    await s.save(a, APP);
    expect(await s.text(a.doc.id)).toContain('"justfig"');
    await s.remove(a.doc.id);
    expect(await s.list()).toEqual([]);
    expect(await s.text(a.doc.id)).toBeNull();
  });
});

describe('NamedStore (presets)', () => {
  const store = (maxRows = 3, maxChars = 100) =>
    new NamedStore(new FigureDb(dbName()).presets, { maxRows, maxChars, what: 'presets' });

  it('adds, lists newest first, renames and removes', async () => {
    const s = store();
    const [a] = await s.add([{ name: 'A', text: 'aa' }], { now: 1 });
    await s.add([{ name: 'B', text: 'b' }], { now: 2 });
    expect((await s.list()).map((r) => [r.name, r.size])).toEqual([
      ['B', 1],
      ['A', 2],
    ]);
    await s.rename(a ?? '', 'A2');
    expect((await s.get(a ?? ''))?.name).toBe('A2');
    expect((await s.get(a ?? ''))?.updatedAt).toBe(1);
    await s.remove(a ?? '');
    expect((await s.list()).map((r) => r.name)).toEqual(['B']);
  });

  it('refuses a save past either cap, all or nothing, and evicts nothing', async () => {
    const s = store(3, 10);
    await s.add([{ name: 'A', text: '12345' }]);
    await expect(
      s.add([
        { name: 'B', text: '1' },
        { name: 'C', text: '1' },
        { name: 'D', text: '1' },
      ]),
    ).rejects.toThrow(/up to 3 presets/);
    await expect(s.add([{ name: 'B', text: '123456' }])).rejects.toBeInstanceOf(StoreFullError);
    expect((await s.list()).map((r) => r.name)).toEqual(['A']);
  });

  it('opens a v2 database with its figures and an empty presets table', async () => {
    const name = dbName();
    const v2 = new Dexie(name);
    v2.version(2).stores({ figures: 'id, updatedAt' });
    const old = fig('Kept');
    await v2.table('figures').put({
      id: old.doc.id,
      title: 'Kept',
      text: writeJfig(old, APP),
      downloaded: false,
      updatedAt: 1,
      thumb: null,
    });
    v2.close();
    const db = new FigureDb(name);
    expect((await new FigureStorage(db).list()).map((r) => r.title)).toEqual(['Kept']);
    expect(await new NamedStore(db.presets, { maxRows: 1, maxChars: 1, what: 'x' }).list()).toEqual(
      [],
    );
  });

  it('cleans names', () => {
    expect(cleanName('  a\t b ', 'f')).toBe('a b');
    expect(cleanName(' ', 'f')).toBe('f');
  });
});
