/**
 * Review notes (note 24): the list of every note in the figure, to read,
 * write, answer, resolve and delete them from the keyboard. A note's text
 * is untrusted (it came in a file) and is only ever rendered as text.
 */
import { useEffect, useRef, useState } from 'react';

import {
  addNote,
  deleteNote,
  deleteNoteReply,
  editNote,
  replyToNote,
  setNoteResolved,
} from '@/core/edits/notes';
import { NOTE_LIMITS, cleanAuthor, createNote, createReply, noteAnchor } from '@/core/model/notes';
import { findObj } from '@/core/model/tree';
import type { Note, NoteReply, Page } from '@/core/model/types';

import { analytics } from '../analytics';
import { type NoteDraft, currentPage, figure, selectedObjects, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { objName } from './objName';

const AUTHOR_KEY = 'noteAuthor';

function loadAuthor(): string {
  try {
    return globalThis.localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveAuthor(name: string): void {
  try {
    globalThis.localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    // A remembered preference only.
  }
}

const when = (t: number): string =>
  new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const byline = (r: NoteReply): string => `${r.author || 'Someone'} · ${when(r.time)}`;

/** Outside the components: the time is read when the user acts, not while rendering. */
function addDraft(draft: NoteDraft, text: string, author: string, object?: Note['object']): void {
  const n = createNote(draft.page, draft.at, text, author, Date.now(), object);
  if (store.edit(addNote(n))) {
    store.setActiveNote(n.id);
    analytics.track('note', 'add');
  }
}

function addReply(id: Note['id'], text: string, author: string): boolean {
  if (!store.edit(replyToNote(id, createReply(text, author, Date.now())))) return false;
  analytics.track('note', 'reply');
  return true;
}

const excerpt = (s: string): string => {
  const line = s.split('\n')[0] ?? '';
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
};

/** Starts a note on the selected object, else in the middle of the page. */
function startNote(): void {
  const s = store.getState();
  const page = currentPage(s);
  const o = selectedObjects(s)[0];
  store.setNoteDraft(
    o
      ? { page: page.id, at: noteAnchor(o), object: o.id }
      : { page: page.id, at: { x: page.size.w / 2, y: page.size.h / 2 } },
  );
  if (!s.showNotes) store.setShowNotes(true);
}

function DraftForm({ author }: { author: string }) {
  const s = useAppState();
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  // The form appears because the user asked for a note: put them in it, after the
  // click on the canvas that placed it has finished moving focus.
  useEffect(() => {
    const t = setTimeout(() => {
      box.current?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, []);
  const draft = s.noteDraft;
  if (!draft) return null;
  const page = currentPage(s);
  const o = draft.object === undefined ? undefined : findObj(page, draft.object);
  const submit = () => {
    addDraft(draft, text, author, o?.id);
  };
  return (
    <form
      className="note-draft"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="note">{o ? `New note on ${objName(o)}` : 'New note on the page'}</p>
      <textarea
        ref={box}
        aria-label="Note text"
        rows={3}
        maxLength={NOTE_LIMITS.text}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') store.setNoteDraft(null);
        }}
      />
      <div className="row">
        <button type="submit" className="primary" disabled={text.trim() === ''}>
          Add note
        </button>
        <button
          type="button"
          onClick={() => {
            store.setNoteDraft(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function NoteBody({ n, page, author }: { n: Note; page: Page | undefined; author: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const o = page && n.object !== undefined ? findObj(page, n.object) : undefined;
  return (
    <div className="note-body">
      <p className="note">
        {byline(n)}
        {o ? ` · on ${objName(o)}` : ''}
        {n.resolved === true ? ' · Resolved' : ''}
      </p>
      {editing === null ? (
        <p className="note-text">{n.text}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (store.edit(editNote(n.id, editing))) setEditing(null);
          }}
        >
          <textarea
            aria-label="Edit note text"
            autoFocus
            rows={3}
            maxLength={NOTE_LIMITS.text}
            value={editing}
            onChange={(e) => {
              setEditing(e.target.value);
            }}
          />
          <div className="row">
            <button type="submit" disabled={editing.trim() === ''}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {n.replies.length > 0 && (
        <ul className="note-replies" aria-label="Replies">
          {n.replies.map((r) => (
            <li key={r.id}>
              <p className="note">
                {byline(r)}{' '}
                <button
                  type="button"
                  className="link"
                  aria-label={`Delete reply by ${r.author || 'someone'}`}
                  onClick={() => store.edit(deleteNoteReply(n.id, r.id))}
                >
                  Delete
                </button>
              </p>
              <p className="note-text">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
      {editing === null && (
        <div className="row note-actions">
          <button
            type="button"
            onClick={() => {
              setEditing(n.text);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (store.edit(setNoteResolved(n.id, n.resolved !== true)) && n.resolved !== true)
                analytics.track('note', 'resolve');
            }}
          >
            {n.resolved === true ? 'Reopen' : 'Resolve'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (store.edit(deleteNote(n.id))) analytics.track('note', 'delete');
            }}
          >
            Delete
          </button>
        </div>
      )}
      <form
        className="note-reply"
        onSubmit={(e) => {
          e.preventDefault();
          if (addReply(n.id, reply, author)) setReply('');
        }}
      >
        <textarea
          aria-label="Reply"
          placeholder="Reply…"
          rows={2}
          maxLength={NOTE_LIMITS.text}
          value={reply}
          onChange={(e) => {
            setReply(e.target.value);
          }}
        />
        <button type="submit" disabled={reply.trim() === ''}>
          Reply
        </button>
      </form>
    </div>
  );
}

export function NotesPanel() {
  const s = useAppState();
  const doc = figure(s).doc;
  const [author, setAuthor] = useState(loadAuthor);
  const open = (n: Note) => {
    if (s.activeNote === n.id) {
      store.setActiveNote(null);
      return;
    }
    store.setActiveNote(n.id);
    const page = doc.pages.find((p) => p.id === n.page);
    if (page && n.object !== undefined && findObj(page, n.object)) store.select([n.object]);
  };
  const pageName = new Map(doc.pages.map((p) => [p.id, p.name]));
  const pageIndex = new Map(doc.pages.map((p, i) => [p.id, i]));
  // Grouped by page in page order; the number is the marker's (order added).
  const listed = doc.notes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (pageIndex.get(a.n.page) ?? 0) - (pageIndex.get(b.n.page) ?? 0) || a.i - b.i);
  const open1 = doc.notes.filter((n) => n.resolved !== true).length;
  return (
    <section className="section notes" aria-label="Notes">
      <h2>
        Notes{' '}
        {doc.notes.length > 0 && (
          <span className="count">
            {open1} open / {doc.notes.length}
          </span>
        )}
      </h2>
      <div className="section__head">
        <button type="button" onClick={startNote} title="On the selected object, else the page">
          + Note
        </button>
      </div>
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={s.showNotes}
            onChange={(e) => {
              store.setShowNotes(e.target.checked);
              if (!e.target.checked) analytics.trackOnce('note', 'hide');
            }}
          />{' '}
          Show notes on the canvas
        </label>
      </div>
      <div className="row">
        <label htmlFor="note-author">Your name</label>
        <input
          id="note-author"
          type="text"
          placeholder="for your notes"
          maxLength={NOTE_LIMITS.author}
          value={author}
          onChange={(e) => {
            setAuthor(e.target.value);
            saveAuthor(cleanAuthor(e.target.value));
          }}
        />
      </div>
      {s.noteDraft && <DraftForm key={JSON.stringify(s.noteDraft)} author={author} />}
      {doc.notes.length === 0 && !s.noteDraft && (
        <p className="note">
          No notes. Pick the Review note tool and click an object or a point, or use + Note.
        </p>
      )}
      <ul
        className="note-list"
        aria-label="Review notes"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          const heads = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.note-head')];
          const i = heads.findIndex((b) => b === document.activeElement);
          if (i === -1) return;
          e.preventDefault();
          heads[
            Math.max(0, Math.min(heads.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
          ]?.focus();
        }}
      >
        {listed.map(({ n, i }, k) => {
          const on = s.activeNote === n.id;
          const showPage = doc.pages.length > 1 && listed[k - 1]?.n.page !== n.page;
          return (
            <li
              key={n.id}
              className={`${on ? 'active' : ''}${n.resolved === true ? ' resolved' : ''}`}
            >
              {showPage && <p className="note-page">{pageName.get(n.page)}</p>}
              <button
                type="button"
                className="note-head"
                data-note={n.id}
                aria-expanded={on}
                onClick={() => {
                  open(n);
                }}
              >
                <span className="note-num">{i + 1}</span>
                <span className="note-excerpt">{excerpt(n.text)}</span>
                {n.resolved === true && <span className="note"> ✓</span>}
              </button>
              {on && (
                <NoteBody n={n} page={doc.pages.find((p) => p.id === n.page)} author={author} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
