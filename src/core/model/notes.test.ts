import { describe, expect, it } from 'vitest';

import { addObjects, addPage, deleteObjects, deletePage, moveObjects } from '../edits/edits';
import { addNote } from '../edits/notes';
import { exportSvg } from '@/export/svg';
import { writeFragment } from '@/io/jfig';
import { AppStore, figure } from '@/ui/state/store';

import { cloneObjects } from './clone';
import { createDoc, createPage, createRect, frame } from './factory';
import { createNote, createReply, noteAnchor, reconcileNotes } from './notes';
import type { Figure } from './types';

function setup() {
  const f: Figure = { doc: createDoc(), assets: {} };
  const page = f.doc.pages[0];
  if (!page) throw new Error('no page');
  const rect = createRect(frame(10, 20, 30, 40));
  const store = new AppStore(f);
  store.edit(addObjects(page.id, [rect]));
  return { store, page, rect };
}

describe('review notes in the model (note 24)', () => {
  it('anchors a note on an object at its top-right corner and follows it', () => {
    const { store, page, rect } = setup();
    expect(noteAnchor(rect)).toEqual({ x: 40, y: 20 });
    const n = createNote(page.id, { x: 0, y: 0 }, 'bigger', 'PI', 5, rect.id);
    store.edit(addNote(n));
    expect(figure(store.getState()).doc.notes[0]?.at).toEqual({ x: 40, y: 20 });
    store.edit(moveObjects(page.id, [rect.id], 5, 5));
    expect(figure(store.getState()).doc.notes[0]?.at).toEqual({ x: 45, y: 25 });
  });

  it('keeps a note in place, on the point, when its object is deleted; undo pins it again', () => {
    const { store, page, rect } = setup();
    store.edit(addNote(createNote(page.id, { x: 0, y: 0 }, 'x', '', 1, rect.id)));
    store.edit(deleteObjects(page.id, [rect.id]));
    const after = figure(store.getState()).doc.notes[0];
    expect(after?.object).toBeUndefined();
    expect(after?.at).toEqual({ x: 40, y: 20 });
    store.undo();
    expect(figure(store.getState()).doc.notes[0]?.object).toBe(rect.id);
  });

  it('removes the notes of a deleted page with it, and undo brings them back', () => {
    const { store } = setup();
    const p2 = createPage('Page 2');
    store.edit(addPage(p2));
    store.edit(addNote(createNote(p2.id, { x: 1, y: 2 }, 'on page 2', '', 1)));
    store.edit(deletePage(p2.id));
    expect(figure(store.getState()).doc.notes).toEqual([]);
    store.undo();
    expect(figure(store.getState()).doc.notes).toHaveLength(1);
  });

  it('returns the same figure when nothing changed', () => {
    const { store, page } = setup();
    store.edit(addNote(createNote(page.id, { x: 1, y: 2 }, 'p', '', 1)));
    const f = figure(store.getState());
    expect(reconcileNotes(f)).toBe(f);
  });

  it('cleans what is typed', () => {
    const n = createNote('pg' as never, { x: 0, y: 0 }, '  hi \n', '  Dr   Who ', 3);
    expect(n.text).toBe('hi');
    expect(n.author).toBe('Dr Who');
    expect(n.id).toMatch(/^n_[0-9a-f]{16}$/);
    expect(createReply('ok', '', 4)).toMatchObject({ text: 'ok', author: '', time: 4 });
  });

  it('is never exported, copied or put in a fragment', () => {
    const { store, page, rect } = setup();
    const before = figure(store.getState());
    const pg = before.doc.pages[0] ?? page;
    const opts = { textMode: 'outline', footer: true, background: true } as const;
    const plain = exportSvg(before, pg, opts, '0');
    store.edit(addNote(createNote(page.id, { x: 1, y: 2 }, 'SECRET-NOTE', 'PI', 1, rect.id)));
    const withNotes = figure(store.getState());
    const pg2 = withNotes.doc.pages[0] ?? page;
    expect(exportSvg(withNotes, pg2, opts, '0')).toBe(plain);
    const copies = cloneObjects(pg2.layers.flatMap((l) => l.children));
    expect(writeFragment({ objects: copies, assets: {} })).not.toContain('SECRET-NOTE');
    // A note stays on the original, never on a copy.
    store.edit(addObjects(page.id, copies));
    const notes = figure(store.getState()).doc.notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.object).toBe(rect.id);
  });
});
