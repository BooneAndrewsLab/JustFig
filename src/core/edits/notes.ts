/**
 * Review notes (note 24) as named edits: adding, editing, resolving,
 * replying to and deleting a note are each one undo step. Where a note on
 * an object is drawn is not an edit: the store's `reconcileNotes` keeps it
 * with its object after every edit.
 */
import { cleanText } from '../model/notes';
import type { Id } from '../model/ids';
import type { Figure, Note, NoteReply } from '../model/types';

import { type Edit, EditError } from './edits';

function withNote(f: Figure, id: Id, fn: (n: Note) => Note | null): Figure {
  const i = f.doc.notes.findIndex((n) => n.id === id);
  const n = f.doc.notes[i];
  if (!n) throw new EditError('That note no longer exists.');
  const next = fn(n);
  if (next === n) return f;
  const notes = [...f.doc.notes];
  if (next === null) notes.splice(i, 1);
  else notes[i] = next;
  return { ...f, doc: { ...f.doc, notes } };
}

export function addNote(note: Note): Edit {
  return {
    label: 'Add note',
    apply: (f) => {
      if (!f.doc.pages.some((p) => p.id === note.page))
        throw new EditError('That page no longer exists.');
      if (note.text === '') throw new EditError('A note needs some text.');
      return { ...f, doc: { ...f.doc, notes: [...f.doc.notes, note] } };
    },
  };
}

export function editNote(id: Id, text: string): Edit {
  const t = cleanText(text);
  return {
    label: 'Edit note',
    apply: (f) => {
      if (t === '') throw new EditError('A note needs some text.');
      return withNote(f, id, (n) => (n.text === t ? n : { ...n, text: t }));
    },
  };
}

export function setNoteResolved(id: Id, resolved: boolean): Edit {
  return {
    label: resolved ? 'Resolve note' : 'Reopen note',
    apply: (f) =>
      withNote(f, id, (n) => {
        if ((n.resolved === true) === resolved) return n;
        if (resolved) return { ...n, resolved: true };
        const { resolved: _was, ...rest } = n;
        return rest;
      }),
  };
}

export function deleteNote(id: Id): Edit {
  return { label: 'Delete note', apply: (f) => withNote(f, id, () => null) };
}

export function replyToNote(id: Id, reply: NoteReply): Edit {
  return {
    label: 'Reply to note',
    apply: (f) => {
      if (reply.text === '') throw new EditError('A reply needs some text.');
      return withNote(f, id, (n) => ({ ...n, replies: [...n.replies, reply] }));
    },
  };
}

export function deleteNoteReply(id: Id, replyId: Id): Edit {
  return {
    label: 'Delete reply',
    apply: (f) =>
      withNote(f, id, (n) =>
        n.replies.some((r) => r.id === replyId)
          ? { ...n, replies: n.replies.filter((r) => r.id !== replyId) }
          : n,
      ),
  };
}
