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
}

export interface FigureSummary {
  readonly id: string;
  readonly title: string;
  readonly downloaded: boolean;
  readonly updatedAt: number;
}

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
  }
}

export class FigureStorage {
  constructor(private readonly db: FigureDb = new FigureDb()) {}

  async save(
    figure: Figure,
    app: { name: string; version: string },
    opts: { now?: number; downloaded?: boolean } = {},
  ): Promise<void> {
    await this.db.figures.put({
      id: figure.doc.id,
      title: figure.doc.title,
      text: writeJfig(figure, app),
      downloaded: opts.downloaded ?? false,
      updatedAt: opts.now ?? Date.now(),
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

  async list(limit = 20): Promise<FigureSummary[]> {
    const rows = await this.db.figures.orderBy('updatedAt').reverse().limit(limit).toArray();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      downloaded: r.downloaded,
      updatedAt: r.updatedAt,
    }));
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
