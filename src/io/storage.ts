/**
 * Figures kept in the browser (note 02, "Storage"): IndexedDB via Dexie,
 * as BarelySig's io/storage.ts. Each row holds the `.jfig` text itself, so
 * what is stored is the file format, with its migrations.
 */
import Dexie, { type EntityTable } from 'dexie';

import type { Figure } from '@/core/model/types';

import { type SavedFigure, readJfig, writeJfig } from './jfig';

export interface StoredFigure {
  readonly id: string;
  readonly title: string;
  /** The `.jfig` text. */
  readonly text: string;
  readonly downloaded: boolean;
  readonly updatedAt: number;
  /** A small JPEG data URL of the first page (Recent figures), or absent. */
  readonly thumb?: string | null;
}

export interface FigureSummary {
  readonly id: string;
  readonly title: string;
  readonly downloaded: boolean;
  readonly updatedAt: number;
  readonly thumb: string | null;
  /** Size of the stored `.jfig` text, in characters. */
  readonly size: number;
}

/**
 * Limits (note 02): the store keeps the most recently changed figures and
 * evicts the oldest past either cap. The figure just saved is never evicted.
 */
export const MAX_FIGURES = 30;
export const MAX_TOTAL_CHARS = 150_000_000;

export interface KeptFigure extends SavedFigure {
  readonly downloaded: boolean;
}

/** Permanent database name: not the display name (note 01). */
export const DB_NAME = 'justfig';

export class FigureDb extends Dexie {
  declare figures: EntityTable<StoredFigure, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({ figures: 'id, updatedAt' });
    // v2 adds the optional, unindexed `thumb`. Rows from v1 (one per document id
    // already) are kept as they are; only the missing field is filled in.
    this.version(2)
      .stores({ figures: 'id, updatedAt' })
      .upgrade((tx) =>
        tx
          .table<StoredFigure>('figures')
          .toCollection()
          .modify((r) => {
            (r as { thumb?: string | null }).thumb ??= null;
          }),
      );
  }
}

export class FigureStorage {
  constructor(private readonly db: FigureDb = new FigureDb()) {}

  async save(
    figure: Figure,
    app: { name: string; version: string },
    opts: { now?: number; downloaded?: boolean } = {},
  ): Promise<void> {
    const id = figure.doc.id;
    const text = writeJfig(figure, app);
    await this.db.transaction('rw', this.db.figures, async () => {
      // One row per document id; the thumbnail of the last save stays until replaced.
      const old = await this.db.figures.get(id);
      await this.db.figures.put({
        id,
        title: figure.doc.title,
        text,
        downloaded: opts.downloaded ?? false,
        updatedAt: opts.now ?? Date.now(),
        thumb: old?.thumb ?? null,
      });
    });
    await this.evict(id);
  }

  /** Deletes the oldest figures past the caps, never `keep`. */
  async evict(
    keep: string,
    maxFigures = MAX_FIGURES,
    maxChars = MAX_TOTAL_CHARS,
  ): Promise<string[]> {
    const rows = await this.db.figures.orderBy('updatedAt').reverse().toArray();
    const gone: string[] = [];
    let count = rows.length;
    let total = rows.reduce((n, r) => n + r.text.length + (r.thumb?.length ?? 0), 0);
    for (let i = rows.length - 1; i >= 0 && (count > maxFigures || total > maxChars); i -= 1) {
      const r = rows[i];
      if (!r || r.id === keep) continue;
      gone.push(r.id);
      count -= 1;
      total -= r.text.length + (r.thumb?.length ?? 0);
    }
    if (gone.length > 0) await this.db.figures.bulkDelete(gone);
    return gone;
  }

  /** Sets the thumbnail without touching the modified time. */
  async setThumb(id: string, thumb: string | null): Promise<void> {
    await this.db.figures.update(id, { thumb });
  }

  /** Renames a stored figure (title in the row and in the `.jfig` text); the modified time stays. */
  async rename(id: string, title: string, app: { name: string; version: string }): Promise<void> {
    await this.db.transaction('rw', this.db.figures, async () => {
      const r = await this.db.figures.get(id);
      if (!r) return;
      const f = readJfig(r.text);
      const figure = { doc: { ...f.doc, title }, assets: f.assets };
      await this.db.figures.update(id, { title, text: writeJfig(figure, app) });
    });
  }

  /** The most recently changed figure, or null when there is none (or it can't be read). */
  async latest(): Promise<KeptFigure | null> {
    const r = await this.db.figures.orderBy('updatedAt').last();
    return r ? readStored(r) : null;
  }

  async load(id: string): Promise<KeptFigure | null> {
    const r = await this.db.figures.get(id);
    return r ? readStored(r) : null;
  }

  async list(limit = MAX_FIGURES): Promise<FigureSummary[]> {
    const rows = await this.db.figures.orderBy('updatedAt').reverse().limit(limit).toArray();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      downloaded: r.downloaded,
      updatedAt: r.updatedAt,
      thumb: r.thumb ?? null,
      size: r.text.length,
    }));
  }

  /** The stored `.jfig` text, for "Download as .jfig" without opening the figure. */
  async text(id: string): Promise<string | null> {
    return (await this.db.figures.get(id))?.text ?? null;
  }

  async remove(id: string): Promise<void> {
    await this.db.figures.delete(id);
  }
}

function readStored(r: StoredFigure): KeptFigure | null {
  try {
    return { ...readJfig(r.text), downloaded: r.downloaded };
  } catch {
    // A row this version can't read (newer app, or damaged) is left for the newer app.
    return null;
  }
}

let shared: FigureStorage | null = null;

/** The app's storage, created on first use so importing this module has no side effects. */
export function getStorage(): FigureStorage {
  shared ??= new FigureStorage();
  return shared;
}
