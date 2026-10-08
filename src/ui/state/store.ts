/**
 * The app's one store (note 01, after BarelySig's ui/state/store.ts): the
 * figure with its history, the open page, selection, tool, view and the
 * notice line. Read from React with `useAppState` (useSyncExternalStore);
 * the figure changes only through `edit`, so every change is a named
 * step. A continuous gesture passes a coalesce key and its start figure,
 * and becomes one undo step (PlasmidPop's History.push contract).
 */
import { type Edit, EditError } from '@/core/edits/edits';
import { History } from '@/core/history/history';
import { reconcileBindings } from '@/core/model/binding';
import { createDoc } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import { findObj } from '@/core/model/tree';
import type { Figure, Obj, Page } from '@/core/model/types';
import type { Unit } from '@/core/units';

import { analytics } from '../analytics';

export type ToolId =
  'select' | 'rect' | 'ellipse' | 'line' | 'pen' | 'arrow' | 'text' | 'panel' | 'hand';

export interface View {
  /** Screen pixels per point. */
  readonly zoom: number;
  /** Screen position of the page's top-left, in pixels. */
  readonly x: number;
  readonly y: number;
}

export type NoticeTone = 'info' | 'warning' | 'error';

export interface Notice {
  readonly text: string;
  readonly tone: NoticeTone;
  readonly seq: number;
}

export interface AppState {
  readonly history: History<Figure>;
  readonly pageId: Id;
  readonly selection: readonly Id[];
  readonly tool: ToolId;
  readonly view: View;
  readonly units: Unit;
  readonly snap: boolean;
  /** The text object being edited in the overlay, if any. */
  readonly editingText: Id | null;
  readonly notice: Notice | null;
  /** The figure as last downloaded or opened from a file; null if never. */
  readonly downloaded: Figure | null;
}

export const NOTICE_MS = 5000;

export const figure = (s: AppState): Figure => s.history.present;

export function currentPage(s: AppState): Page {
  const doc = s.history.present.doc;
  const p = doc.pages.find((x) => x.id === s.pageId) ?? doc.pages[0];
  if (!p) throw new Error('figure without pages');
  return p;
}

export function selectedObjects(s: AppState): Obj[] {
  const p = currentPage(s);
  return s.selection.map((id) => findObj(p, id)).filter((o): o is Obj => o !== undefined);
}

export interface EditOptions {
  /** Merge with the previous step when it carries the same key (a drag, a nudge, a slider). */
  readonly coalesce?: string;
  /** Apply to this figure instead of the present (a drag recomputed from its start). */
  readonly from?: Figure;
  /** Leave the selection alone even when the edit names one. */
  readonly keepSelection?: boolean;
}

const emptyFigure = (): Figure => ({ doc: createDoc(), assets: {} });

function initialUnits(): Unit {
  try {
    const u = globalThis.localStorage.getItem('units');
    return u === 'in' || u === 'mm' ? u : 'mm';
  } catch {
    return 'mm';
  }
}

export class AppStore {
  private state: AppState;
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: Figure = emptyFigure()) {
    this.state = {
      history: History.create(initial, { limit: 300 }),
      pageId: initial.doc.pages[0]?.id ?? ('' as Id),
      selection: [],
      tool: 'select',
      view: { zoom: 1, x: 40, y: 40 },
      units: initialUnits(),
      snap: true,
      editingText: null,
      notice: null,
      downloaded: null,
    };
  }

  readonly getState = (): AppState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Applies an edit as one undo step (or merges into a gesture). Returns whether it applied. */
  edit(e: Edit, opts: EditOptions = {}): boolean {
    const base = opts.from ?? this.state.history.present;
    let next: Figure;
    try {
      // Bound arrows follow their targets, whatever the edit was (note 06).
      next = reconcileBindings(base, e.apply(base));
    } catch (err: unknown) {
      if (!(err instanceof EditError)) throw err;
      this.notify(err.message, 'error');
      return false;
    }
    const coalesce =
      opts.coalesce === undefined
        ? undefined
        : { follows: opts.coalesce, key: opts.coalesce, withinMs: 600_000 };
    const history = this.state.history.push(next, e.label, Date.now(), coalesce);
    const selection =
      opts.keepSelection === true || e.select === undefined ? this.state.selection : e.select;
    this.set({ history, ...this.fix(history.present, selection) });
    return true;
  }

  /** Ends any open gesture, so the next change is a step of its own. */
  seal(): void {
    this.set({ history: this.state.history.seal() });
  }

  undo(): void {
    if (!this.state.history.canUndo) return;
    const history = this.state.history.undo();
    this.set({ history, ...this.fix(history.present, this.state.selection) });
    analytics.trackOnce('history', 'undo');
  }

  redo(): void {
    if (!this.state.history.canRedo) return;
    const history = this.state.history.redo();
    this.set({ history, ...this.fix(history.present, this.state.selection) });
    analytics.trackOnce('history', 'redo');
  }

  undoLabel(): string | null {
    const l = this.state.history.undoLabel;
    return l === undefined ? null : `Undo ${l}`;
  }

  redoLabel(): string | null {
    const l = this.state.history.redoLabel;
    return l === undefined ? null : `Redo ${l}`;
  }

  /** Replaces the figure (open, new, restore); history starts afresh. */
  load(f: Figure, opts: { readonly hasFile?: boolean } = {}): void {
    this.set({
      history: History.create(f, { limit: 300 }),
      pageId: f.doc.pages[0]?.id ?? ('' as Id),
      selection: [],
      editingText: null,
      downloaded: opts.hasFile === true ? f : null,
    });
  }

  select(ids: readonly Id[]): void {
    const same =
      ids.length === this.state.selection.length &&
      ids.every((id, i) => this.state.selection[i] === id);
    if (!same) this.set({ selection: ids });
  }

  setTool(tool: ToolId): void {
    this.set({ tool, editingText: null });
    if (tool !== 'select' && tool !== 'hand') analytics.trackOnce('tool', tool);
  }

  setView(view: View): void {
    this.set({ view });
  }

  setPage(pageId: Id): void {
    this.set({ pageId, selection: [], editingText: null });
  }

  setUnits(units: Unit): void {
    try {
      globalThis.localStorage.setItem('units', units);
    } catch {
      // A remembered preference only.
    }
    this.set({ units });
  }

  setSnap(snap: boolean): void {
    this.set({ snap });
  }

  editText(id: Id | null): void {
    this.set({ editingText: id });
  }

  markDownloaded(): void {
    this.set({ downloaded: this.state.history.present, history: this.state.history.seal() });
  }

  notify(text: string, tone: NoticeTone = 'info'): void {
    this.seq += 1;
    const seq = this.seq;
    this.set({ notice: { text, tone, seq } });
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = null;
      if (this.state.notice?.seq === seq) this.set({ notice: null });
    }, NOTICE_MS);
  }

  /** Page and selection still valid in a figure (after undo, a page delete…). */
  private fix(
    f: Figure,
    selection: readonly Id[],
  ): Pick<AppState, 'pageId' | 'selection' | 'editingText'> {
    const page = f.doc.pages.find((p) => p.id === this.state.pageId) ?? f.doc.pages[0];
    const pageId = page?.id ?? this.state.pageId;
    const keep = page ? selection.filter((id) => findObj(page, id) !== undefined) : [];
    const editing = this.state.editingText;
    return {
      pageId,
      selection: keep,
      editingText: editing !== null && page && findObj(page, editing) ? editing : null,
    };
  }

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => {
      l();
    });
  }
}

export const store = new AppStore();
