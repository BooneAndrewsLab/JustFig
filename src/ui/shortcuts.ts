/**
 * Keyboard shortcuts (note 09): the keys come from the binding table in
 * `keyBindings.ts`, with the user's changes over the defaults. Typing in a
 * field, or an open dialog, never triggers them.
 */
import {
  deleteObjects,
  groupObjects,
  moveObjects,
  reorderObjects,
  ungroupObjects,
  allIds,
} from '@/core/edits/edits';

import { canvasSize, fitPage, zoomAt } from './canvas/view';
import { actionFor, resolveBindings } from './keyBindings';
import { copySelection, duplicateSelection, pasteText, saveFile } from './state/session';
import { type ToolId, currentPage, selectedObjects, store } from './state/store';

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

export interface ShortcutTargets {
  readonly exportDialog: () => void;
  readonly openFile: () => void;
  readonly recent: () => void;
  readonly guide: () => void;
  /** Arrange in grid…, for a selection. */
  readonly grid: () => void;
}

const TOOL_ACTIONS: Readonly<Record<string, ToolId>> = {
  'tool-select': 'select',
  'tool-hand': 'hand',
  'tool-rect': 'rect',
  'tool-ellipse': 'ellipse',
  'tool-line': 'line',
  'tool-pen': 'pen',
  'tool-arrow': 'arrow',
  'tool-text': 'text',
  'tool-panel': 'panel',
  'tool-note': 'note',
};

export function onKeyDown(e: KeyboardEvent, open: ShortcutTargets): void {
  if (isTyping(e.target) || document.querySelector('.dialog')) return;
  const s = store.getState();
  const page = currentPage(s);
  const mod = e.ctrlKey || e.metaKey;
  const ids = s.selection;
  const handled = (): void => {
    e.preventDefault();
  };
  // The fixed keys first (note 09: they cannot be moved).
  if (mod && !e.altKey) {
    const k = e.code;
    if (k === 'KeyZ') {
      handled();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (k === 'KeyY' && !e.shiftKey) {
      handled();
      store.redo();
      return;
    }
    if (k === 'KeyS' && !e.shiftKey) {
      handled();
      saveFile();
      return;
    }
  }
  if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && ids.length > 0) {
    handled();
    store.edit(deleteObjects(page.id, ids));
    return;
  }
  if (e.key === 'Escape') {
    if (s.tool !== 'select') store.setTool('select');
    else store.select([]);
    return;
  }
  if (!mod && !e.altKey && e.key.startsWith('Arrow') && ids.length > 0) {
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
  const id = actionFor(e, resolveBindings(s.keyBindings));
  if (id === undefined) return;
  const tool = TOOL_ACTIONS[id];
  if (tool) {
    store.setTool(tool);
    return;
  }
  const zoom = (k: number) => {
    const { w, h } = canvasSize();
    zoomAt(s.view, w / 2, h / 2, s.view.zoom * k);
  };
  const actions: Readonly<Record<string, () => void>> = {
    'select-all': () => {
      store.select(allIds(page));
    },
    duplicate: duplicateSelection,
    group: () => {
      if (ids.length > 1) store.edit(groupObjects(page.id, ids));
    },
    ungroup: () => {
      store.edit(ungroupObjects(page.id, ids));
    },
    front: () => ids.length > 0 && store.edit(reorderObjects(page.id, ids, 'front')),
    forward: () => ids.length > 0 && store.edit(reorderObjects(page.id, ids, 'forward')),
    back: () => ids.length > 0 && store.edit(reorderObjects(page.id, ids, 'back')),
    backward: () => ids.length > 0 && store.edit(reorderObjects(page.id, ids, 'backward')),
    open: open.openFile,
    recent: open.recent,
    export: open.exportDialog,
    guide: open.guide,
    grid: () => {
      if (ids.length > 0) open.grid();
    },
    fit: () => {
      fitPage(page, canvasSize());
    },
    'zoom-in': () => {
      zoom(1.25);
    },
    'zoom-out': () => {
      zoom(1 / 1.25);
    },
  };
  const run = actions[id];
  if (run) {
    handled();
    run();
  }
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
