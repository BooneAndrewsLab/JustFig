/**
 * The text editor (note 03; plan risk "rich-text editing"): a plain
 * textarea in an overlay under the text object, with the canvas showing
 * the live rich result above it. Edits map back onto runs through
 * core/text/rich.ts. Bold Ctrl+B, italic Ctrl+I, subscript Ctrl+=,
 * superscript Ctrl+Shift+= (Ctrl++); the Ω button opens the Greek and
 * symbol picker. The whole editing session is one undo step.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { deleteObjects, updateObjects } from '@/core/edits/edits';
import { frameBounds } from '@/core/geometry/matrix';
import { INK } from '@/core/model/factory';
import { FONT_IDS, type FontId, type Page, type Text } from '@/core/model/types';
import {
  type Rich,
  type RunStyle,
  type Toggle,
  SYMBOLS,
  applyInput,
  build,
  flatten,
  isOn,
  patchRange,
  styleAt,
  toggleRange,
  toggleStyle,
} from '@/core/text/rich';
import { plainText } from '@/core/text/layout';
import { findObj } from '@/core/model/tree';

import { type View, store } from '../state/store';

const FALLBACK: RunStyle = { font: 'arimo', size: 10, color: { hex: INK } };
const FONT_LABEL: Record<FontId, string> = {
  arimo: 'Arimo (sans)',
  tinos: 'Tinos (serif)',
  cousine: 'Cousine (mono)',
};

export function TextEditor({ text, page, view }: { text: Text; page: Page; view: View }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const range = useRef({ start: 0, end: 0 });
  const [typing, setTyping] = useState<RunStyle | null>(null);
  const [symbols, setSymbols] = useState(false);
  const fallback = text.runs[0]?.[0] ?? FALLBACK;
  const rich = useMemo(() => flatten(text.runs, fallback), [text.runs, fallback]);
  const [caret, setCaret] = useState(() => rich.text.length);
  const caretStyle = typing ?? styleAt(rich, caret, fallback);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    range.current = { start: el.value.length, end: el.value.length };
    const id = text.id;
    return () => {
      // An editor closed on empty text leaves no invisible object behind.
      // Still editing this object: not a real close but StrictMode's dev-only
      // unmount/remount, which would otherwise delete the text just created.
      const s = store.getState();
      if (s.editingText === id) return;
      const p = s.history.present.doc.pages.find((x) => x.id === page.id);
      const found = p ? findObj(p, id) : undefined;
      if (found?.type === 'text' && plainText(found).trim() === '')
        store.edit({ ...deleteObjects(page.id, [id]), label: 'Delete empty text' });
      store.seal();
    };
    // Mount/unmount only: the editor is keyed by the object id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: Rich, at?: number) => {
    const runs = build(next, fallback);
    store.edit(
      updateObjects(page.id, [text.id], 'Edit text', (o) =>
        o.type === 'text' ? { ...o, runs } : o,
      ),
      { coalesce: `text:${text.id}`, keepSelection: true },
    );
    if (at !== undefined)
      requestAnimationFrame(() => {
        area.current?.setSelectionRange(at, at);
        range.current = { start: at, end: at };
        setCaret(at);
      });
  };

  const readRange = () => {
    const el = area.current;
    if (el) range.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  const toggle = (key: Toggle) => {
    const { start, end } = range.current;
    if (start !== end) commit(toggleRange(rich, start, end, key));
    else setTyping(toggleStyle(caretStyle, key));
    area.current?.focus();
  };

  const patch = (p: Partial<Pick<RunStyle, 'font' | 'size' | 'color'>>) => {
    const { start, end } = range.current;
    commit(patchRange(rich, start, end, p));
    if (start === end) setTyping({ ...caretStyle, ...p });
  };

  const insert = (sym: string) => {
    const { start, end } = range.current;
    const next = rich.text.slice(0, start) + sym + rich.text.slice(end);
    commit(applyInput(rich, next, caretStyle), start + sym.length);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      store.editText(null);
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') toggle('bold');
    else if (k === 'i') toggle('italic');
    else if (e.key === '+' || (e.key === '=' && e.shiftKey)) toggle('sup');
    else if (e.key === '=') toggle('sub');
    else return;
    e.preventDefault();
  };

  const b = frameBounds(text.frame);
  const left = b.x * view.zoom + view.x;
  const top = (b.y + b.h) * view.zoom + view.y + 10;

  return (
    <div
      className="text-editor"
      style={{ left, top }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      role="dialog"
      aria-label="Edit text"
    >
      <div className="bar">
        <button
          type="button"
          className="icon"
          aria-pressed={isOn(caretStyle, 'bold')}
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => {
            e.preventDefault();
            toggle('bold');
          }}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className="icon"
          aria-pressed={isOn(caretStyle, 'italic')}
          title="Italic (Ctrl+I)"
          onMouseDown={(e) => {
            e.preventDefault();
            toggle('italic');
          }}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          className="icon"
          aria-pressed={isOn(caretStyle, 'sub')}
          title="Subscript (Ctrl+=)"
          onMouseDown={(e) => {
            e.preventDefault();
            toggle('sub');
          }}
        >
          x<sub>2</sub>
        </button>
        <button
          type="button"
          className="icon"
          aria-pressed={isOn(caretStyle, 'sup')}
          title="Superscript (Ctrl+Shift+=)"
          onMouseDown={(e) => {
            e.preventDefault();
            toggle('sup');
          }}
        >
          x<sup>2</sup>
        </button>
        <button
          type="button"
          className="icon"
          aria-pressed={symbols}
          title="Greek letters and symbols"
          onMouseDown={(e) => {
            e.preventDefault();
            setSymbols(!symbols);
          }}
        >
          Ω
        </button>
        <select
          aria-label="Font"
          value={caretStyle.font}
          onChange={(e) => {
            patch({ font: e.target.value as FontId });
          }}
        >
          {FONT_IDS.map((f) => (
            <option key={f} value={f}>
              {FONT_LABEL[f]}
            </option>
          ))}
        </select>
        <input
          type="number"
          aria-label="Font size (pt)"
          title="Font size (pt)"
          min={2}
          max={200}
          step={0.5}
          value={caretStyle.size}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > 0) patch({ size: v });
          }}
          style={{ width: 56 }}
        />
        <button
          type="button"
          onClick={() => {
            store.editText(null);
          }}
        >
          Done
        </button>
      </div>
      <textarea
        ref={area}
        aria-label="Text"
        value={rich.text}
        spellCheck
        onKeyDown={onKeyDown}
        onSelect={() => {
          // A caret the user moved (not one typing moved) drops a toggled typing style.
          const el = area.current;
          if (
            el &&
            (el.selectionStart !== range.current.start || el.selectionEnd !== range.current.end)
          )
            setTyping(null);
          readRange();
        }}
        onChange={(e) => {
          const style = caretStyle;
          const next = applyInput(rich, e.target.value, style);
          range.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
          setCaret(e.target.selectionStart);
          commit(next);
        }}
      />
      {symbols && (
        <div className="symbols" role="group" aria-label="Symbols">
          {SYMBOLS.map((sym) => (
            <button
              type="button"
              key={sym}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(sym);
              }}
            >
              {sym}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
