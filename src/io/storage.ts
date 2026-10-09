/**
 * Figures kept in the browser (note 02, "Storage"): IndexedDB via Dexie,
 * as BarelySig's io/storage.ts. Each row holds the `.jfig` text itself, so
 * what is stored is the file format, with its migrations.
 */
import Dexie, { type EntityTable } from 'dexie';

import { newId } from '@/core/model/ids';
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
  declare presets: EntityTable<NamedRow, 'id'>;
  declare versions: EntityTable<NamedRow, 'id'>;

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
    // v3 adds saved presets (note 22); figures are untouched.
    this.version(3).stores({ figures: 'id, updatedAt', presets: 'id, updatedAt' });
    // v4 adds saved versions of a figure (note 23), indexed by the figure they belong to.
    this.version(4).stores({
      figures: 'id, updatedAt',
      presets: 'id, updatedAt',
      versions: 'id, updatedAt, owner',
    });
  }
}

export class FigureStorage {
  constructor(private readonly db: FigureDb = new FigureDb()) {}

  async save(
    figure: Figure,
    app: { name: string; version: string },
    /** `keep`: figures open in other tabs, which eviction must not drop either (note 25). */
    opts: { now?: number; downloaded?: boolean; keep?: readonly string[] } = {},
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
    await this.evict([id, ...(opts.keep ?? [])]);
  }

  /**
   * Deletes the oldest figures past the caps, never one in `keep` (just saved,
   * or open in a tab) and never a figure with saved versions (note 23): those
   * were kept on purpose.
   */
  async evict(
    keep: string | readonly string[],
    maxFigures = MAX_FIGURES,
    maxChars = MAX_TOTAL_CHARS,
  ): Promise<string[]> {
    const rows = await this.db.figures.orderBy('updatedAt').reverse().toArray();
    const pinned = new Set(
      (await this.db.versions.orderBy('owner').uniqueKeys()).filter(
        (k): k is string => typeof k === 'string',
      ),
    );
    const kept = new Set(typeof keep === 'string' ? [keep] : keep);
    const gone: string[] = [];
    let count = rows.length;
    let total = rows.reduce((n, r) => n + r.text.length + (r.thumb?.length ?? 0), 0);
    for (let i = rows.length - 1; i >= 0 && (count > maxFigures || total > maxChars); i -= 1) {
      const r = rows[i];
      if (!r || kept.has(r.id) || pinned.has(r.id)) continue;
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

  /** Deletes a figure and its saved versions (note 23). */
  async remove(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.figures, this.db.versions, async () => {
      await this.db.figures.delete(id);
      await this.db.versions.where('owner').equals(id).delete();
    });
  }
}

// --- named things the user keeps on purpose (presets, saved versions) -----------------

/** A row the user named and kept on purpose: the text is a file format with its migrations. */
export interface NamedRow {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly updatedAt: number;
  /** What the row belongs to (a saved version: its figure's `doc.id`); absent for presets. */
  readonly owner?: string;
}

export interface NamedSummary {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
  /** Size of the stored text, in characters. */
  readonly size: number;
}

/** Limits of a named store; past them a save is refused, never evicted (note 22). */
export interface NamedCaps {
  readonly maxRows: number;
  readonly maxChars: number;
  /** What the rows are, plural, for the message ("presets"). */
  readonly what: string;
  /** Most rows one owner may have, when rows have owners. */
  readonly maxPerOwner?: number;
}

/** A save that would pass a cap; the message is for the user. */
export class StoreFullError extends Error {
  override readonly name = 'StoreFullError';
}

/** Longest name kept; longer ones are cut. */
export const MAX_NAME = 80;

/** A name as stored: whitespace collapsed, cut to `MAX_NAME`, never empty. */
export function cleanName(name: string, fallback: string): string {
  const s = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
  return s === '' ? fallback : s;
}

/**
 * Rows the user names and keeps on purpose (presets; saved versions, which
 * belong to a figure through `owner`). Unlike autosaved figures nothing is evicted: a save that would pass
 * a cap is refused with a message, and the user deletes what they no longer need.
 */
export class NamedStore {
  constructor(
    private readonly table: EntityTable<NamedRow, 'id'>,
    readonly caps: NamedCaps,
  ) {}

  /** Adds rows all at once, or none when they would pass a cap. Returns their ids. */
  async add(
    rows: readonly { name: string; text: string }[],
    opts: { now?: number; owner?: string } = {},
  ): Promise<string[]> {
    const now = opts.now ?? Date.now();
    const { owner } = opts;
    const made: NamedRow[] = rows.map((r) => ({
      id: newId('k'),
      name: r.name,
      text: r.text,
      updatedAt: now,
      ...(owner === undefined ? {} : { owner }),
    }));
    await this.table.db.transaction('rw', this.table, async () => {
      const all = await this.table.toArray();
      const count = all.length + made.length;
      const chars = [...all, ...made].reduce((n, r) => n + r.text.length, 0);
      const mine = all.filter((r) => r.owner === owner).length + made.length;
      if (
        owner !== undefined &&
        this.caps.maxPerOwner !== undefined &&
        mine > this.caps.maxPerOwner
      )
        throw new StoreFullError(
          `This browser keeps up to ${String(this.caps.maxPerOwner)} ${this.caps.what} of one figure. Delete some first.`,
        );
      if (count > this.caps.maxRows)
        throw new StoreFullError(
          `This browser keeps up to ${String(this.caps.maxRows)} ${this.caps.what}. Delete some first.`,
        );
      if (chars > this.caps.maxChars)
        throw new StoreFullError(
          `Your ${this.caps.what} would take too much room in this browser. Delete some first.`,
        );
      await this.table.bulkAdd(made);
    });
    return made.map((r) => r.id);
  }

  /** Every row, or every row of `owner`, newest first. */
  async all(owner?: string): Promise<NamedRow[]> {
    if (owner === undefined) return this.table.orderBy('updatedAt').reverse().toArray();
    const rows = await this.table.where('owner').equals(owner).toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async list(owner?: string): Promise<NamedSummary[]> {
    return (await this.all(owner)).map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updatedAt,
      size: r.text.length,
    }));
  }

  async get(id: string): Promise<NamedRow | null> {
    return (await this.table.get(id)) ?? null;
  }

  /** Renames a row; its text and modified time stay. */
  async rename(id: string, name: string): Promise<void> {
    await this.table.update(id, { name });
  }

  async remove(id: string): Promise<void> {
    await this.table.delete(id);
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
let sharedDb: FigureDb | null = null;

function db(): FigureDb {
  sharedDb ??= new FigureDb();
  return sharedDb;
}

/** The app's storage, created on first use so importing this module has no side effects. */
export function getStorage(): FigureStorage {
  shared ??= new FigureStorage(db());
  return shared;
}

/** Limits of saved presets (note 22). */
export const PRESET_CAPS: NamedCaps = { maxRows: 100, maxChars: 30_000_000, what: 'presets' };

let presets: NamedStore | null = null;
let versions: NamedStore | null = null;

/** The app's saved presets, in the same database as the figures. */
export function getPresetStore(): NamedStore {
  presets ??= new NamedStore(db().presets, PRESET_CAPS);
  return presets;
}

/** Limits of saved versions (note 23): refused past them, like presets. */
export const VERSION_CAPS: NamedCaps = {
  maxRows: 200,
  maxChars: 60_000_000,
  what: 'saved versions',
  maxPerOwner: 30,
};

/** The app's saved versions of figures, in the same database as the figures. */
export function getVersionStore(): NamedStore {
  versions ??= new NamedStore(db().versions, VERSION_CAPS);
  return versions;
}
