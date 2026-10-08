/**
 * Keyboard shortcuts. Typing in a field never triggers them. The plan's
 * shortcut editor (port of PlasmidPop's KeyBindings) is Phase 4.
 */
import {
  deleteObjects,
  groupObjects,
  moveObjects,
  reorderObjects,
  ungroupObjects,
  allIds,
} from '@/core/edits/edits';

import { copySelection, duplicateSelection, pasteText, saveFile } from './state/session';
import { type ToolId, currentPage, selectedObjects, store } from './state/store';

const TOOL_KEYS: Readonly<Record<string, ToolId>> = {
  v: 'select',
  h: 'hand',
  r: 'rect',
  e: 'ellipse',
  l: 'line',
  p: 'pen',
  a: 'arrow',
  t: 'text',
  f: 'panel',
};

export function isTyping(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLElement && t.isContentEditable)
  );
}

let nudgeSeq = 0;
let lastNudge = 0;

export function onKeyDown(
  e: KeyboardEvent,
  open: { exportDialog: () => void; openFile: () => void },
): void {
  if (isTyping(e.target) || document.querySelector('.dialog')) return;
  const s = store.getState();
  const page = currentPage(s);
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const ids = s.selection;
  const handled = (): void => {
    e.preventDefault();
  };
  if (mod) {
    // Copy, cut and paste go through the clipboard events (App), so the system clipboard works.
    const action: (() => void) | undefined = {
      z: () => {
        if (e.shiftKey) store.redo();
        else store.undo();
      },
      y: () => {
        store.redo();
      },
      s: saveFile,
      o: open.openFile,
      e: open.exportDialog,
      a: () => {
        store.select(allIds(page));
      },
      d: duplicateSelection,
      g: () => {
        if (e.shiftKey) store.edit(ungroupObjects(page.id, ids));
        else if (ids.length > 1) store.edit(groupObjects(page.id, ids));
      },
    }[k];
    if (action) {
      handled();
      action();
    }
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length > 0) {
    handled();
    store.edit(deleteObjects(page.id, ids));
    return;
  }
  if (e.key === 'Escape') {
    if (s.tool !== 'select') store.setTool('select');
    else store.select([]);
    return;
  }
  if (e.key === ']' && ids.length > 0)
    return (
      handled(),
      void store.edit(reorderObjects(page.id, ids, e.shiftKey ? 'forward' : 'front'))
    );
  if (e.key === '[' && ids.length > 0)
    return (
      handled(),
      void store.edit(reorderObjects(page.id, ids, e.shiftKey ? 'backward' : 'back'))
    );
  if (e.key.startsWith('Arrow') && ids.length > 0) {
    const d = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    // A burst of nudges is one undo step.
    if (Date.now() - lastNudge > 1500) nudgeSeq += 1;
    lastNudge = Date.now();
    const movable = selectedObjects(s)
      .filter((o) => o.locked !== true)
      .map((o) => o.id);
    store.edit(
      { ...moveObjects(page.id, movable, dx, dy), label: 'Nudge' },
      { coalesce: `nudge:${String(nudgeSeq)}`, keepSelection: true },
    );
    handled();
    return;
  }
  const tool = TOOL_KEYS[k];
  if (tool && !e.altKey) store.setTool(tool);
}

export function onCopy(e: ClipboardEvent, cut: boolean): void {
  if (isTyping(e.target)) return;
  const text = copySelection(cut);
  if (text !== null && e.clipboardData) {
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  }
}

export function onPaste(e: ClipboardEvent, importFile: (f: File) => void): void {
  if (isTyping(e.target)) return;
  const files = Array.from(e.clipboardData?.files ?? []);
  if (files.length > 0) {
    e.preventDefault();
    files.forEach(importFile);
    return;
  }
  const text = e.clipboardData?.getData('text/plain') ?? null;
  if (pasteText(text === '' ? null : text)) e.preventDefault();
}
