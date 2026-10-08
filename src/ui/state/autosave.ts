/**
 * Autosave (note 02, after BarelySig's ui/state/autosave.ts): the figure
 * goes to IndexedDB a second after the last change, and at once when the
 * page is hidden. An untouched new figure is not saved.
 */
import type { Figure } from '@/core/model/types';
import type { FigureStorage } from '@/io/storage';

import { type AppState, type AppStore, figure } from './store';

export const AUTOSAVE_DELAY = 1000;

function worthSaving(s: AppState): boolean {
  return s.history.canUndo || s.history.canRedo || s.downloaded !== null;
}

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saved: Figure | null;
  private pending: Figure | null = null;
  /** The write under way; the next waits for it, so writes land in order. */
  private writing: Promise<void> = Promise.resolve();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly store: AppStore,
    private readonly storage: FigureStorage,
    private readonly app: { name: string; version: string },
    private readonly onError: (e: unknown) => void = () => undefined,
  ) {
    this.saved = figure(store.getState());
    this.unsubscribe = store.subscribe(() => {
      this.changed();
    });
  }

  /** A figure just restored from storage counts as saved. */
  markSaved(f: Figure): void {
    this.saved = f;
  }

  private changed(): void {
    const s = this.store.getState();
    const f = figure(s);
    if (f === this.saved || f === this.pending || !worthSaving(s)) return;
    this.pending = f;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, AUTOSAVE_DELAY);
  }

  /** Writes a pending change now (page hidden, or before opening another figure). */
  async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const f = this.pending;
    this.pending = null;
    if (f) this.writing = this.writing.then(() => this.write(f));
    await this.writing;
  }

  private async write(f: Figure): Promise<void> {
    try {
      await this.storage.save(f, this.app, { downloaded: this.store.getState().downloaded === f });
      this.saved = f;
    } catch (e: unknown) {
      this.onError(e);
    }
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.unsubscribe();
  }
}
