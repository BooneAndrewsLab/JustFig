/**
 * The app's one store (note 01, after BarelySig's ui/state/store.ts): the
 * open figures, one tab each with its history, page, selection and view
 * (note 25), and what the app shares: tool, preferences and the notice line.
 * Read from React with `useAppState` (useSyncExternalStore), which sees the
 * front tab flattened over the shared state. A figure changes only through
 * `edit`, so every change is a named step. A continuous gesture passes a
 * coalesce key and its start figure, and becomes one undo step
 * (PlasmidPop's History.push contract).
 */
import { type Edit, EditError } from '@/core/edits/edits';
import { type NodeRef, editableNodes, partAt } from '@/core/edits/nodes';
import { History } from '@/core/history/history';
import type { PlotSizing } from '@/core/edits/plotSize';
import { reconcileBindings } from '@/core/model/binding';
import { createDoc } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import { reconcileNotes } from '@/core/model/notes';
import { findObj } from '@/core/model/tree';
import type { Figure, Obj, Page, Vec2 } from '@/core/model/types';
import type { Unit } from '@/core/units';

import { analytics } from '../analytics';
import { loadCustomBindings, saveCustomBindings } from '../keyBindings';

export type ToolId =
  'select' | 'rect' | 'ellipse' | 'line' | 'pen' | 'arrow' | 'text' | 'panel' | 'note' | 'hand';

/** A review note being written, not yet in the figure (note 24). */
export interface NoteDraft {
  readonly page: Id;
  readonly at: Vec2;
  readonly object?: Id;
}

/** Point editing (note 28): whose points, and which one is current. */
export interface NodeEdit extends NodeRef {
  readonly id: Id;
}

/** The point editing still valid in this page and selection, the current point clamped. */
function fixNodeEdit(
  e: NodeEdit | null,
  page: Page | undefined,
  sel: readonly Id[],
): NodeEdit | null {
  if (e === null || !page || sel.length !== 1 || sel[0] !== e.id) return null;
  const o = findObj(page, e.id);
  const nodes = o ? editableNodes(o)?.nodes : undefined;
  if (!nodes || nodes.length === 0) return null;
  const index = Math.min(e.index, nodes.length - 1);
  const ref = { index, part: e.part };
  return partAt(nodes, ref)
    ? index === e.index
      ? e
      : { ...e, index }
    : { ...e, index, part: 'node' };
}

/** How the canvas shows colours: as they are, or as a colour-vision deficiency sees them (note 07). */
export type Vision = 'normal' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'greyscale';

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

/** What each open figure keeps for itself (note 25): one per tab. */
export interface TabState {
  /** The tab's own id for as long as it is open; the figure's `doc.id` can change under it. */
  readonly key: string;
  readonly history: History<Figure>;
  readonly pageId: Id;
  readonly selection: readonly Id[];
  /** The text object being edited in the overlay, if any. */
  readonly editingText: Id | null;
  /** Point editing (note 28): the object whose points are shown and the current point. */
  readonly nodeEdit: NodeEdit | null;
  /** The review note open in the Notes panel. */
  readonly activeNote: Id | null;
  /** A note placed but not yet written. */
  readonly noteDraft: NoteDraft | null;
  /** The figure as last downloaded or opened from a file; null if never. */
  readonly downloaded: Figure | null;
  /** Zoom and scroll, so a tab comes back where it was left. */
  readonly view: View;
  /** An empty New figure: while untouched, the next figure opened takes its tab. */
  readonly fresh: boolean;
}

/** What the whole app shares, whichever tab is in front. */
export interface SharedState {
  readonly tool: ToolId;
  readonly units: Unit;
  readonly snap: boolean;
  /** Resizing an imported plot keeps its text and line sizes (note 17); remembered per browser. */
  readonly plotSizing: PlotSizing;
  /** Editor-only colour-vision preview; never exported. */
  readonly vision: Vision;
  /** The user's changed shortcuts (note 09), action id → binding; remembered per browser. */
  readonly keyBindings: Readonly<Record<string, string>>;
  readonly notice: Notice | null;
  /** Review note markers on the canvas (note 24); remembered per browser. Never exported either way. */
  readonly showNotes: boolean;
  /** Document ids of open figures whose last autosave failed (note 02); empty when all is kept. */
  readonly unsaved: readonly string[];
}

type DocFields = Omit<TabState, 'key' | 'fresh'>;

/** The front tab flattened over the shared state, as every view reads it, plus the tabs. */
export interface AppState extends DocFields, SharedState {
  /** Every open tab, in strip order. */
  readonly tabs: readonly TabState[];
  /** The front tab's key. */
  readonly front: string;
}

const DOC_KEYS: ReadonlySet<string> = new Set<keyof DocFields>([
  'history',
  'pageId',
  'selection',
  'editingText',
  'nodeEdit',
  'activeNote',
  'noteDraft',
  'downloaded',
  'view',
]);

export const NOTICE_MS = 5000;
/** Edits with one coalesce key this close together are one undo step. */
const COALESCE_MS = 600_000;

export const figure = (s: Pick<TabState, 'history'>): Figure => s.history.present;

/** Changed since it was last saved to a file (the tab's dot). */
export const isUnsaved = (t: Pick<TabState, 'history' | 'downloaded'>): boolean =>
  t.downloaded !== t.history.present && t.history.canUndo;

/** A fresh tab nothing has happened in yet: the next figure opened may take it. */
export const isUntouched = (t: TabState): boolean =>
  t.fresh && !t.history.canUndo && !t.history.canRedo && t.downloaded === null;

export function currentPage(s: Pick<TabState, 'history' | 'pageId'>): Page {
  const doc = s.history.present.doc;
  const p = doc.pages.find((x) => x.id === s.pageId) ?? doc.pages[0];
  if (!p) throw new Error('figure without pages');
  return p;
}

export function selectedObjects(s: Pick<TabState, 'history' | 'pageId' | 'selection'>): Obj[] {
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
  /** Apply in this tab instead of the front one (renaming a figure open behind). */
  readonly tab?: string;
}

export interface OpenOptions {
  /** Opened from (or as) a file: it counts as saved to file. */
  readonly hasFile?: boolean;
  /** An empty New figure (see `TabState.fresh`). */
  readonly fresh?: boolean;
}

const emptyFigure = (): Figure => ({ doc: createDoc(), assets: {} });

const START_VIEW: View = { zoom: 1, x: 40, y: 40 };

function initialUnits(): Unit {
  try {
    const u = globalThis.localStorage.getItem('units');
    return u === 'in' || u === 'mm' ? u : 'mm';
  } catch {
    return 'mm';
  }
}

function initialShowNotes(): boolean {
  try {
    return globalThis.localStorage.getItem('showNotes') !== 'off';
  } catch {
    return true;
  }
}

function initialPlotSizing(): PlotSizing {
  try {
    return globalThis.localStorage.getItem('plotSizing') === 'scale' ? 'scale' : 'keep';
  } catch {
    return 'keep';
  }
}

/** Page, selection and notes still valid in a figure (after undo, a page delete…). */
function fix(t: TabState, f: Figure, selection: readonly Id[]): TabState {
  const page = f.doc.pages.find((p) => p.id === t.pageId) ?? f.doc.pages[0];
  const pageId = page?.id ?? t.pageId;
  const keep = page ? selection.filter((id) => findObj(page, id) !== undefined) : [];
  const editing = t.editingText;
  const active = t.activeNote;
  const draft = t.noteDraft;
  return {
    ...t,
    pageId,
    selection: keep,
    editingText: editing !== null && page && findObj(page, editing) ? editing : null,
    nodeEdit: fixNodeEdit(t.nodeEdit, page, keep),
    activeNote: active !== null && f.doc.notes.some((n) => n.id === active) ? active : null,
    noteDraft: draft && f.doc.pages.some((p) => p.id === draft.page) ? draft : null,
  };
}

export class AppStore {
  private tabs: readonly TabState[];
  private frontKey: string;
  private shared: SharedState;
  private state: AppState;
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private tabSeq = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  /** With no figure, the app's start: one fresh empty tab. */
  constructor(initial?: Figure) {
    const first = this.newTab(initial ?? emptyFigure(), { fresh: initial === undefined });
    this.tabs = [first];
    this.frontKey = first.key;
    this.shared = {
      tool: 'select',
      units: initialUnits(),
      snap: true,
      plotSizing: initialPlotSizing(),
      vision: 'normal',
      keyBindings: loadCustomBindings(),
      notice: null,
      showNotes: initialShowNotes(),
      unsaved: [],
    };
    this.state = this.flatten();
  }

  readonly getState = (): AppState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Applies an edit as one undo step (or merges into a gesture). Returns whether it applied. */
  edit(e: Edit, opts: EditOptions = {}): boolean {
    const t = this.tab(opts.tab ?? this.frontKey);
    if (!t) return false;
    const base = opts.from ?? t.history.present;
    let next: Figure;
    try {
      // Bound arrows follow their targets, whatever the edit was (note 06), and
      // review notes their objects (note 24).
      next = reconcileNotes(reconcileBindings(base, e.apply(base)));
    } catch (err: unknown) {
      if (!(err instanceof EditError)) throw err;
      this.notify(err.message, 'error');
      return false;
    }
    const coalesce =
      opts.coalesce === undefined
        ? undefined
        : { follows: opts.coalesce, key: opts.coalesce, withinMs: COALESCE_MS };
    const history = t.history.push(next, e.label, Date.now(), coalesce);
    const selection =
      opts.keepSelection === true || e.select === undefined ? t.selection : e.select;
    this.replaceTab(fix({ ...t, history }, history.present, selection));
    return true;
  }

  /**
   * Applies an edit that completes the present instead of being a change of
   * its own (re-baked inset pixels, note 44): no undo step, and the figure's
   * saved state is unaffected beyond what the edit sets. Returns whether it applied.
   */
  amend(e: Edit, tabKey?: string): boolean {
    const t = this.tab(tabKey ?? this.frontKey);
    if (!t) return false;
    const base = t.history.present;
    let next: Figure;
    try {
      next = reconcileNotes(reconcileBindings(base, e.apply(base)));
    } catch (err: unknown) {
      if (!(err instanceof EditError)) throw err;
      return false;
    }
    if (next === base) return false;
    const history = t.history.amended(next);
    this.replaceTab(fix({ ...t, history }, history.present, t.selection));
    return true;
  }

  /** The figure an open run of edits with this coalesce key started from, if one is open. */
  runStart(key: string): Figure | undefined {
    return this.state.history.runStart(key, Date.now(), COALESCE_MS);
  }

  /** Ends any open gesture, so the next change is a step of its own. */
  seal(): void {
    this.set({ history: this.state.history.seal() });
  }

  undo(): void {
    if (!this.state.history.canUndo) return;
    const history = this.state.history.undo();
    const t = this.front();
    this.replaceTab(fix({ ...t, history }, history.present, t.selection));
    analytics.trackOnce('history', 'undo');
  }

  redo(): void {
    if (!this.state.history.canRedo) return;
    const history = this.state.history.redo();
    const t = this.front();
    this.replaceTab(fix({ ...t, history }, history.present, t.selection));
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

  /** Replaces the front tab's figure; its history starts afresh. The caller flushes autosave first. */
  load(f: Figure, opts: OpenOptions = {}): void {
    const t = this.front();
    this.replaceTab({ ...this.newTab(f, opts), key: t.key });
  }

  // --- tabs (note 25) --------------------------------------------------------------

  /** The key of the tab holding this document, if one does. */
  tabOf(docId: string): string | undefined {
    return this.tabs.find((t) => t.history.present.doc.id === docId)?.key;
  }

  /**
   * Opens a figure and brings it forward: the tab already holding its
   * document, else an untouched fresh front tab (taken over), else a new tab
   * at the end. Returns the tab's key. The caller flushes autosave first.
   */
  open(f: Figure, opts: OpenOptions = {}): string {
    const have = this.tabOf(f.doc.id);
    if (have !== undefined) {
      this.activate(have);
      return have;
    }
    const front = this.front();
    const tab = this.newTab(f, opts);
    if (isUntouched(front) && opts.fresh !== true) {
      const taken = { ...tab, key: front.key };
      this.replaceTab(taken);
      return taken.key;
    }
    if (isUntouched(front) && opts.fresh === true) return front.key;
    this.tabs = [...this.tabs, tab];
    this.frontKey = tab.key;
    this.publish();
    if (this.tabs.length === 2) analytics.trackOnce('tabs', 'second');
    return tab.key;
  }

  /** Brings a tab forward; a half-done text edit or note draft in the one left is dropped. */
  activate(key: string): void {
    if (key === this.frontKey || !this.tab(key)) return;
    this.tabs = this.tabs.map((t) =>
      t.key === this.frontKey ? { ...t, editingText: null, nodeEdit: null, noteDraft: null } : t,
    );
    this.frontKey = key;
    this.publish();
  }

  /** Brings the tab at this place in the strip forward (Alt+1…9). */
  activateAt(index: number): void {
    const t = this.tabs[index];
    if (t) this.activate(t.key);
  }

  /** Closes a tab; the one to its right (else left) comes forward. The caller flushes autosave first. */
  close(key: string): void {
    const at = this.tabs.findIndex((t) => t.key === key);
    if (at < 0) return;
    const rest = this.tabs.filter((t) => t.key !== key);
    if (rest.length === 0) {
      const t = this.newTab(emptyFigure(), { fresh: true });
      this.tabs = [t];
      this.frontKey = t.key;
    } else {
      this.tabs = rest;
      const next = rest[at] ?? rest[at - 1];
      if (key === this.frontKey && next) this.frontKey = next.key;
    }
    this.publish();
  }

  /** Moves a tab to another place in the strip (counted without it). */
  move(key: string, index: number): void {
    const t = this.tab(key);
    if (!t) return;
    const rest = this.tabs.filter((x) => x.key !== key);
    const at = Math.max(0, Math.min(rest.length, index));
    const next = [...rest.slice(0, at), t, ...rest.slice(at)];
    if (next.every((x, i) => x === this.tabs[i])) return;
    this.tabs = next;
    this.publish();
  }

  /** Moves the front tab one place left (-1) or right (+1). */
  moveFront(by: -1 | 1): void {
    const at = this.tabs.findIndex((t) => t.key === this.frontKey);
    this.move(this.frontKey, at + by);
  }

  // --- the front tab and the shared state --------------------------------------------

  select(ids: readonly Id[]): void {
    const same =
      ids.length === this.state.selection.length &&
      ids.every((id, i) => this.state.selection[i] === id);
    if (!same)
      this.set({
        selection: ids,
        nodeEdit: fixNodeEdit(this.state.nodeEdit, currentPage(this.state), ids),
      });
  }

  /** Shows an object's points with `ref` current (note 28), or leaves point editing (null). */
  editNodes(e: NodeEdit | null): void {
    if (e === null) {
      if (this.state.nodeEdit !== null) this.set({ nodeEdit: null });
      return;
    }
    const page = currentPage(this.state);
    const o = findObj(page, e.id);
    if (!o || !editableNodes(o)) return;
    this.set({ selection: [e.id], editingText: null, nodeEdit: fixNodeEdit(e, page, [e.id]) });
  }

  setTool(tool: ToolId): void {
    this.set({ tool, editingText: null, nodeEdit: null });
    if (tool !== 'select' && tool !== 'hand') analytics.trackOnce('tool', tool);
  }

  setView(view: View): void {
    this.set({ view });
  }

  setPage(pageId: Id): void {
    const notes = this.state.history.present.doc.notes;
    const active = notes.find((n) => n.id === this.state.activeNote);
    this.set({
      pageId,
      selection: [],
      editingText: null,
      nodeEdit: null,
      activeNote: active?.page === pageId ? active.id : null,
      noteDraft: this.state.noteDraft?.page === pageId ? this.state.noteDraft : null,
    });
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

  setPlotSizing(plotSizing: PlotSizing): void {
    try {
      globalThis.localStorage.setItem('plotSizing', plotSizing);
    } catch {
      // A remembered preference only.
    }
    this.set({ plotSizing });
  }

  /** Moves an action to a key, or (null) back to its default. */
  setKeyBinding(id: string, binding: string | null): void {
    const next: Record<string, string> = Object.fromEntries(
      Object.entries(this.state.keyBindings).filter(([k]) => k !== id),
    );
    if (binding !== null) next[id] = binding;
    saveCustomBindings(next);
    this.set({ keyBindings: next });
  }

  resetKeyBindings(): void {
    saveCustomBindings({});
    this.set({ keyBindings: {} });
  }

  setShowNotes(showNotes: boolean): void {
    try {
      globalThis.localStorage.setItem('showNotes', showNotes ? 'on' : 'off');
    } catch {
      // A remembered preference only.
    }
    this.set({ showNotes });
  }

  /** Opens a note in the Notes panel (null closes it); a note on another page shows that page. */
  setActiveNote(id: Id | null): void {
    const n =
      id === null ? undefined : this.state.history.present.doc.notes.find((x) => x.id === id);
    if (n && n.page !== this.state.pageId) this.setPage(n.page);
    this.set({ activeNote: n ? n.id : null, noteDraft: null });
  }

  setNoteDraft(noteDraft: NoteDraft | null): void {
    this.set({ noteDraft, ...(noteDraft ? { activeNote: null } : {}) });
  }

  setVision(vision: Vision): void {
    this.set({ vision });
  }

  editText(id: Id | null): void {
    this.set({ editingText: id });
  }

  /** The tab's figure was just saved to a file (default: the front tab's). */
  markDownloaded(key: string = this.frontKey): void {
    const t = this.tab(key);
    if (t) this.replaceTab({ ...t, downloaded: t.history.present, history: t.history.seal() });
  }

  /** Which figures autosave could not write; the banner shows them until a save succeeds. */
  setUnsaved(ids: readonly string[]): void {
    const now = this.shared.unsaved;
    if (now.length === ids.length && now.every((id, i) => id === ids[i])) return;
    this.set({ unsaved: ids });
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

  private newTab(f: Figure, opts: OpenOptions): TabState {
    this.tabSeq += 1;
    return {
      key: `tab-${String(this.tabSeq)}`,
      history: History.create(f, { limit: 300 }),
      pageId: f.doc.pages[0]?.id ?? ('' as Id),
      selection: [],
      editingText: null,
      nodeEdit: null,
      activeNote: null,
      noteDraft: null,
      downloaded: opts.hasFile === true ? f : null,
      view: START_VIEW,
      fresh: opts.fresh === true,
    };
  }

  private tab(key: string): TabState | undefined {
    return this.tabs.find((t) => t.key === key);
  }

  private front(): TabState {
    const t = this.tab(this.frontKey);
    if (!t) throw new Error('no front tab');
    return t;
  }

  private replaceTab(next: TabState): void {
    this.tabs = this.tabs.map((t) => (t.key === next.key ? next : t));
    this.publish();
  }

  /** Splits a patch between the front tab and the shared state. */
  private set(patch: Partial<DocFields & SharedState>): void {
    const doc: Record<string, unknown> = {};
    const shared: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) (DOC_KEYS.has(k) ? doc : shared)[k] = v;
    if (Object.keys(doc).length > 0) {
      const t = this.front();
      this.tabs = this.tabs.map((x) => (x === t ? { ...t, ...doc } : x));
    }
    if (Object.keys(shared).length > 0) this.shared = { ...this.shared, ...shared };
    this.publish();
  }

  private flatten(): AppState {
    const t = this.front();
    return {
      ...this.shared,
      history: t.history,
      pageId: t.pageId,
      selection: t.selection,
      editingText: t.editingText,
      nodeEdit: t.nodeEdit,
      activeNote: t.activeNote,
      noteDraft: t.noteDraft,
      downloaded: t.downloaded,
      view: t.view,
      tabs: this.tabs,
      front: t.key,
    };
  }

  private publish(): void {
    this.state = this.flatten();
    this.listeners.forEach((l) => {
      l();
    });
  }
}

export const store = new AppStore();
