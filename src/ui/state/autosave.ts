/**
 * Autosave (notes 02 and 25, after BarelySig's ui/state/autosave.ts): every
 * open figure goes to IndexedDB a second after the last change, and at once
 * when the page is hidden or `flush()` is called. An untouched new figure is
 * not saved. Each figure is its own record, keyed by `doc.id`; the queue is
 * keyed the same way, not by tab, so a figure whose tab was just closed or
 * taken over is still written by the next flush. A small thumbnail of a
 * figure's first page is refreshed at most every THUMB_INTERVAL ms, after the
 * save itself so the save is never delayed.
 */
import type { Figure } from '@/core/model/types';
import type { FigureStorage } from '@/io/storage';

import type { AppStore, TabState } from './store';

export const AUTOSAVE_DELAY = 1000;
export const THUMB_INTERVAL = 15_000;

function worthSaving(t: TabState): boolean {
  return t.history.canUndo || t.history.canRedo || t.downloaded !== null;
}

interface Pending {
  readonly figure: Figure;
  readonly downloaded: boolean;
}

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** What was last written (or restored) for each document id. */
  private readonly saved = new Map<string, Figure>();
  private readonly pending = new Map<string, Pending>();
  /** The write under way; the next waits for it, so writes land in order. */
  private writing: Promise<void> = Promise.resolve();
  private readonly unsubscribe: () => void;
  private lastThumb = 0;
  private thumbTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly thumbsDue = new Set<string>();

  constructor(
    private readonly store: AppStore,
    private readonly storage: FigureStorage,
    private readonly app: { name: string; version: string },
    private readonly onError: (e: unknown) => void = () => undefined,
    /** Renders a small image of the first page; omitted where there is no DOM. */
    private readonly thumbnail?: (f: Figure) => Promise<string | null>,
  ) {
    for (const t of store.getState().tabs) this.markSaved(t.history.present);
    this.unsubscribe = store.subscribe(() => {
      this.changed();
    });
  }

  /** A figure just restored from storage counts as saved. */
  markSaved(f: Figure): void {
    this.saved.set(f.doc.id, f);
  }

  private changed(): void {
    const tabs = this.store.getState().tabs;
    let queued = false;
    for (const t of tabs) {
      const f = t.history.present;
      const id = f.doc.id;
      if (f === this.saved.get(id) || f === this.pending.get(id)?.figure || !worthSaving(t))
        continue;
      this.pending.set(id, { figure: f, downloaded: t.downloaded === f });
      queued = true;
    }
    // Forget what was written for figures no longer open (they hold their pictures).
    const open = new Set<string>(tabs.map((t) => t.history.present.doc.id));
    for (const id of this.saved.keys()) if (!open.has(id)) this.saved.delete(id);
    if (!queued) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, AUTOSAVE_DELAY);
  }

  /**
   * Writes every pending change now (page hidden, or before a tab is closed
   * or its figure replaced). The pending figures are taken at once, so the
   * store may drop them right after the call; the writes finish on their own.
   */
  async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const todo = [...this.pending.values()];
    this.pending.clear();
    for (const p of todo) this.writing = this.writing.then(() => this.write(p));
    await this.writing;
  }

  private async write(p: Pending): Promise<void> {
    const id = p.figure.doc.id;
    try {
      const keep = this.store.getState().tabs.map((t) => t.history.present.doc.id);
      await this.storage.save(p.figure, this.app, { downloaded: p.downloaded, keep });
      if (keep.includes(id)) this.saved.set(id, p.figure);
    } catch (e: unknown) {
      this.onError(e);
      return;
    }
    this.thumbsDue.add(id);
    this.scheduleThumb(p.figure);
  }

  /** At most one round of thumbnails per THUMB_INTERVAL; changes inside it are drawn when it ends. */
  private scheduleThumb(f: Figure): void {
    if (!this.thumbnail) return;
    // A figure no longer open is drawn now from what was written, since nothing keeps it after.
    if (!this.saved.has(f.doc.id)) {
      this.thumbsDue.delete(f.doc.id);
      void this.drawThumb(f);
      return;
    }
    if (this.thumbTimer !== undefined) return;
    const wait = Math.max(0, this.lastThumb + THUMB_INTERVAL - Date.now());
    this.thumbTimer = setTimeout(() => {
      this.thumbTimer = undefined;
      this.lastThumb = Date.now();
      const due = [...this.thumbsDue];
      this.thumbsDue.clear();
      for (const id of due) {
        const g = this.saved.get(id);
        if (g) void this.drawThumb(g);
      }
    }, wait);
  }

  private async drawThumb(f: Figure): Promise<void> {
    if (!this.thumbnail) return;
    try {
      const url = await this.thumbnail(f);
      // The row is per document, whichever tab it is in now.
      if (url) await this.storage.setThumb(f.doc.id, url);
    } catch {
      // No thumbnail is fine: the list shows a placeholder.
    }
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.thumbTimer !== undefined) clearTimeout(this.thumbTimer);
    this.unsubscribe();
  }
}
