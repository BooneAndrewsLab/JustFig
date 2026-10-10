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
import {
  type NodeRef,
  deleteNodePart,
  editableNodes,
  insertNode,
  moveNodePart,
  nodeRefs,
  setSmooth,
} from '@/core/edits/nodes';
import { findObj } from '@/core/model/tree';

import { canvasSize, fitPage, zoomAt } from './canvas/view';
import { actionFor, resolveBindings } from './keyBindings';
import {
  closeTab,
  copySelection,
  duplicateSelection,
  pasteText,
  saveFile,
  saveFileAs,
} from './state/session';
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

/** Focus on the canvas or nowhere: Tab and Enter belong to a focused control otherwise. */
const canvasFocus = (t: EventTarget | null): boolean =>
  !(t instanceof Element) || t === document.body || t.closest('.canvas') !== null;

/**
 * Point editing's keys (note 28): Enter starts it on a selected path; while it is on,
 * Tab walks the points, arrows nudge the current one, Delete removes it, Escape leaves,
 * and the "Points" actions add a point or switch corner/smooth. True when handled.
 */
function pointKeys(e: KeyboardEvent): boolean {
  const s = store.getState();
  const page = currentPage(s);
  const ne = s.nodeEdit;
  if (ne === null) {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return false;
    if (s.tool !== 'select' || s.selection.length !== 1 || !canvasFocus(e.target)) return false;
    const [one] = selectedObjects(s);
    if (!one || !editableNodes(one)) return false;
    store.editNodes({ id: one.id, index: 0, part: 'node' });
    return true;
  }
  const o = findObj(page, ne.id);
  const ed = o ? editableNodes(o) : null;
  if (!ed) return false;
  const go = (ref: NodeRef) => {
    store.editNodes({ id: ne.id, ...ref });
  };
  switch (e.code) {
    case 'Escape':
      store.editNodes(null);
      return true;
    case 'Tab': {
      if (!canvasFocus(e.target)) return false;
      const refs = nodeRefs(ed.nodes);
      const at = refs.findIndex((r) => r.index === ne.index && r.part === ne.part);
      const next = refs[(at + (e.shiftKey ? refs.length - 1 : 1)) % refs.length];
      if (next) go(next);
      return true;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      const d = e.shiftKey ? 10 : 1;
      const dx = e.code === 'ArrowLeft' ? -d : e.code === 'ArrowRight' ? d : 0;
      const dy = e.code === 'ArrowUp' ? -d : e.code === 'ArrowDown' ? d : 0;
      // A burst of nudges is one undo step, as for objects.
      if (Date.now() - lastNudge > 1500) nudgeSeq += 1;
      lastNudge = Date.now();
      store.edit(moveNodePart(page.id, ne.id, ne, dx, dy), {
        coalesce: `node-nudge:${String(nudgeSeq)}`,
        keepSelection: true,
      });
      return true;
    }
    case 'Delete':
    case 'Backspace':
      if (
        store.edit(deleteNodePart(page.id, ne.id, ne), { keepSelection: true }) &&
        ne.part === 'node'
      )
        go({ index: Math.max(0, ne.index - 1), part: 'node' });
      return true;
  }
  const id = actionFor(e, resolveBindings(s.keyBindings));
  if (id === 'node-add') {
    const n = ed.nodes.length;
    const seg = ne.index < n - 1 || ed.closed ? ne.index : ne.index - 1;
    if (store.edit(insertNode(page.id, ne.id, seg, 0.5), { keepSelection: true }))
      go({ index: seg + 1, part: 'node' });
    return true;
  }
  if (id === 'node-smooth') {
    const n = ed.nodes[ne.index];
    if (n) {
      store.edit(setSmooth(page.id, ne.id, ne.index, !n.in && !n.out), { keepSelection: true });
      go({ index: ne.index, part: 'node' });
    }
    return true;
  }
  return false;
}

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

let pasteInPlaceUntil = 0;

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
    // Paste in place: let the browser paste, and have `onPaste` keep the positions. Where it
    // fires no paste event for this chord (Firefox), the app's own clipboard is used (note 35).
    if (k === 'KeyV' && e.shiftKey) {
      const armed = Date.now() + 1000;
      pasteInPlaceUntil = armed;
      setTimeout(() => {
        if (pasteInPlaceUntil === armed) {
          pasteInPlaceUntil = 0;
          pasteText(null, 10, true);
        }
      }, 150);
      return;
    }
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
    if (k === 'KeyS') {
      handled();
      void (e.shiftKey ? saveFileAs() : saveFile());
      return;
    }
  }
  if (!mod && !e.altKey && pointKeys(e)) {
    handled();
    return;
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
    'tab-close': () => {
      closeTab(s.front);
    },
    'tab-left': () => {
      store.moveFront(-1);
    },
    'tab-right': () => {
      store.moveFront(1);
    },
  };
  const tab = /^tab-(\d)$/.exec(id)?.[1];
  if (tab !== undefined) {
    handled();
    store.activateAt(Number(tab) - 1);
    return;
  }
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
  const inPlace = Date.now() < pasteInPlaceUntil;
  pasteInPlaceUntil = 0;
  if (pasteText(text === '' ? null : text, 10, inPlace)) e.preventDefault();
}
