import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

import { createDoc } from '@/core/model/factory';
import type { Figure } from '@/core/model/types';

import { writeJfig } from './jfig';
import { FigureDb, FigureStorage } from './storage';

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
