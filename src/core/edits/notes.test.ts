import { describe, expect, it } from 'vitest';

import { createDoc } from '../model/factory';
import { createNote, createReply } from '../model/notes';
import type { Figure, Note } from '../model/types';
import { AppStore, figure } from '@/ui/state/store';

import {
  addNote,
  deleteNote,
  deleteNoteReply,
  editNote,
  replyToNote,
  setNoteResolved,
} from './notes';

function setup(): { store: AppStore; n: Note } {
  const f: Figure = { doc: createDoc(), assets: {} };
  const page = f.doc.pages[0];
  if (!page) throw new Error('no page');
  const store = new AppStore(f);
  const n = createNote(page.id, { x: 5, y: 6 }, 'first', 'PI', 1);
  store.edit(addNote(n));
  return { store, n };
}

const notes = (s: AppStore) => figure(s.getState()).doc.notes;

describe('note edits (note 24)', () => {
  it('adds, edits, resolves, reopens, replies and deletes, each one undo step', () => {
    const { store, n } = setup();
    expect(store.undoLabel()).toBe('Undo Add note');
    store.edit(editNote(n.id, ' second '));
    expect(notes(store)[0]?.text).toBe('second');
    expect(store.undoLabel()).toBe('Undo Edit note');
    store.edit(setNoteResolved(n.id, true));
    expect(notes(store)[0]?.resolved).toBe(true);
    expect(store.undoLabel()).toBe('Undo Resolve note');
    store.edit(setNoteResolved(n.id, false));
    expect(notes(store)[0]).not.toHaveProperty('resolved');
    const r = createReply('done', 'Student', 2);
    store.edit(replyToNote(n.id, r));
    expect(notes(store)[0]?.replies).toEqual([r]);
    store.edit(deleteNoteReply(n.id, r.id));
    expect(notes(store)[0]?.replies).toEqual([]);
    store.edit(deleteNote(n.id));
    expect(notes(store)).toEqual([]);
    expect(store.undoLabel()).toBe('Undo Delete note');
    for (let i = 0; i < 6; i += 1) store.undo();
    expect(notes(store)[0]?.text).toBe('first');
    store.undo();
    expect(notes(store)).toEqual([]);
  });

  it('refuses empty text and a note that is gone', () => {
    const { store, n } = setup();
    expect(store.edit(editNote(n.id, '   '))).toBe(false);
    expect(store.edit(replyToNote(n.id, createReply('', '', 1)))).toBe(false);
    store.edit(deleteNote(n.id));
    expect(store.edit(editNote(n.id, 'x'))).toBe(false);
    const page = figure(store.getState()).doc.pages[0];
    if (!page) throw new Error('no page');
    expect(store.edit(addNote(createNote(page.id, { x: 0, y: 0 }, '', '', 1)))).toBe(false);
  });

  it('records no step when nothing changes', () => {
    const { store, n } = setup();
    const f = figure(store.getState());
    expect(setNoteResolved(n.id, false).apply(f)).toBe(f);
    expect(editNote(n.id, 'first').apply(f)).toBe(f);
  });
});
