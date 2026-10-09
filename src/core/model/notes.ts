/**
 * Review notes (note 24): comments pinned to a point on a page or to an
 * object, kept in the `.jfig` file and never drawn by the renderer, so no
 * export, fragment, preset or template source ever carries one.
 */
import { objBounds } from '../geometry/transform';
import { type Id, newId } from './ids';
import { findObj } from './tree';
import type { Doc, Figure, Note, NoteReply, Obj, Vec2 } from './types';

/** Longest note or reply text and author name a file may hold (files are untrusted). */
export const NOTE_LIMITS = { text: 10_000, author: 100, notes: 2_000, replies: 200 } as const;

/** Where an object's note marker sits: the top-right corner of its bounds. */
export function noteAnchor(o: Obj): Vec2 {
  const b = objBounds(o);
  return { x: b.x + b.w, y: b.y };
}

export const cleanAuthor = (s: string): string =>
  s.replace(/\s+/g, ' ').trim().slice(0, NOTE_LIMITS.author);

export const cleanText = (s: string): string => s.trim().slice(0, NOTE_LIMITS.text);

/** A new note; `time` comes from the caller so edits stay pure. */
export function createNote(
  page: Id,
  at: Vec2,
  text: string,
  author: string,
  time: number,
  object?: Id,
): Note {
  return {
    id: newId('n'),
    page,
    at,
    ...(object === undefined ? {} : { object }),
    text: cleanText(text),
    author: cleanAuthor(author),
    time,
    replies: [],
  };
}

export function createReply(text: string, author: string, time: number): NoteReply {
  return { id: newId('n'), text: cleanText(text), author: cleanAuthor(author), time };
}

/** The notes on one page, in document order. */
export const pageNotes = (doc: Doc, pageId: Id): Note[] =>
  doc.notes.filter((n) => n.page === pageId);

const samePoint = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

/**
 * Notes after an edit, run by the store after every edit like
 * `reconcileBindings`: a note on an object moves its marker with the
 * object; one whose object is gone keeps its place as a point note; one
 * whose page is gone goes with the page. Returns `f` itself when nothing
 * changed, so a no-op edit stays a no-op.
 */
export function reconcileNotes(f: Figure): Figure {
  const pages = new Map(f.doc.pages.map((p) => [p.id, p]));
  let changed = false;
  const notes: Note[] = [];
  for (const n of f.doc.notes) {
    const page = pages.get(n.page);
    if (!page) {
      changed = true;
      continue;
    }
    if (n.object === undefined) {
      notes.push(n);
      continue;
    }
    const o = findObj(page, n.object);
    if (!o) {
      const { object: _gone, ...rest } = n;
      notes.push(rest);
      changed = true;
      continue;
    }
    const at = noteAnchor(o);
    if (samePoint(at, n.at)) notes.push(n);
    else {
      notes.push({ ...n, at });
      changed = true;
    }
  }
  return changed ? { ...f, doc: { ...f.doc, notes } } : f;
}
