/**
 * The icon library client (note 01): the one interface the app reads
 * icons through. `BRAND.iconLibraryPath` points at a pinned
 * `justfig-icons` release (manifest.ts) unpacked into `public/lib/<version>/`.
 *
 * - Categories load one shard at a time, on demand.
 * - Search uses the release's serialised MiniSearch index, loaded on the
 *   first search; a library without one (an old stub) falls back to a
 *   substring filter over every shard.
 * - Thumbnails come from sprite sheets when the release has them, else the
 *   SVG itself.
 * - Share-alike (CC BY-SA) icons are left out unless the caller asks for them.
 */
import MiniSearch from 'minisearch';

import type { Asset } from '@/core/model/types';
import { hashAsset } from '@/io/assets';
import { sanitizeSvg } from '@/io/svg/sanitize';

import { type IconEntry, type LibraryManifest, decodeManifest, decodeShard } from './manifest';

export interface SearchOptions {
  /** Include share-alike icons (the user's opt-in). Default false. */
  readonly shareAlike?: boolean;
  /** At most this many results (best first). Default 240. */
  readonly limit?: number;
}

export interface Thumb {
  /** CSS `background-image` value (1× and 2× sheets). */
  readonly image: string;
  /** Cell offset and sheet width at a cell size of `size` CSS px. */
  readonly x: number;
  readonly y: number;
  readonly sheetWidth: number;
}

export interface IconLibrary {
  manifest(): Promise<LibraryManifest>;
  /** Icons of one category (a shard, fetched once). */
  category(id: string, opts?: SearchOptions): Promise<readonly IconEntry[]>;
  /** Icons matching a query, best first; [] for a blank query. */
  search(query: string, opts?: SearchOptions): Promise<readonly IconEntry[]>;
  /** One icon by id (drag and drop carries only the id). */
  byId(id: string): Promise<IconEntry | undefined>;
  /** URL of an icon's SVG. */
  svgUrl(entry: IconEntry): string;
  /** Sprite position for a tile `size` CSS px wide; null without sprites. */
  thumb(manifest: LibraryManifest, entry: IconEntry, size: number): Thumb | null;
  /** The release's CREDITS.md (null when it has none). */
  credits(): Promise<string | null>;
  /** The asset to embed when the icon is placed (SVG fetched and sanitised). */
  asset(entry: IconEntry): Promise<{ hash: string; asset: Extract<Asset, { kind: 'icon' }> }>;
}

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

interface SearchFile {
  readonly format: 'justfig-search';
  readonly formatVersion: number;
  readonly fields: string[];
  readonly storeFields: string[];
  readonly searchOptions: {
    readonly prefix: boolean;
    readonly fuzzy: number;
    readonly boost: Record<string, number>;
    readonly combineWith: 'AND' | 'OR';
  };
  readonly index: unknown;
}

function decodeSearchFile(v: unknown): SearchFile {
  const o = v as Partial<SearchFile> | null;
  if (o?.format !== 'justfig-search' || o.formatVersion !== 1)
    throw new Error('Icon library: unknown search index format');
  if (!Array.isArray(o.fields) || !Array.isArray(o.storeFields) || !o.searchOptions)
    throw new Error('Icon library: malformed search index');
  return o as SearchFile;
}

export class HttpIconLibrary implements IconLibrary {
  private manifestP: Promise<LibraryManifest> | null = null;
  private readonly shards = new Map<string, Promise<readonly IconEntry[]>>();
  private readonly svgs = new Map<string, Promise<string>>();
  private indexP: Promise<{ ms: MiniSearch; file: SearchFile } | null> | null = null;
  /** Milliseconds the last index query took (not counting shard fetches). */
  lastQueryMs = 0;

  /** `base` ends with a slash, e.g. `${BASE_URL}lib/1.0.0/`. */
  constructor(
    private readonly base: string,
    private readonly fetchText: Fetcher = (u) => fetch(u),
  ) {}

  private async get(path: string): Promise<string> {
    const r = await this.fetchText(this.base + path);
    if (!r.ok) throw new Error(`Icon library: ${path} (${String(r.status)})`);
    return r.text();
  }

  manifest(): Promise<LibraryManifest> {
    this.manifestP ??= this.get('manifest.json').then((t) => decodeManifest(JSON.parse(t)));
    return this.manifestP;
  }

  private shard(id: string, path: string): Promise<readonly IconEntry[]> {
    let p = this.shards.get(id);
    if (!p) {
      p = this.get(path).then((t) => decodeShard(JSON.parse(t)).icons);
      // A failed fetch is retried next time rather than cached.
      p.catch(() => this.shards.delete(id));
      this.shards.set(id, p);
    }
    return p;
  }

  async category(id: string, opts: SearchOptions = {}): Promise<readonly IconEntry[]> {
    const m = await this.manifest();
    const c = m.categories.find((x) => x.id === id);
    if (!c) return [];
    const icons = await this.shard(c.id, c.shard);
    return opts.shareAlike === true ? icons : icons.filter((e) => !e.meta.shareAlike);
  }

  private index(): Promise<{ ms: MiniSearch; file: SearchFile } | null> {
    this.indexP ??= this.manifest().then(async (m) => {
      if (m.search === undefined) return null;
      const file = decodeSearchFile(JSON.parse(await this.get(m.search)));
      const ms = MiniSearch.loadJS(file.index as Parameters<typeof MiniSearch.loadJS>[0], {
        fields: file.fields,
        storeFields: file.storeFields,
      });
      return { ms, file };
    });
    this.indexP.catch(() => {
      this.indexP = null;
    });
    return this.indexP;
  }

  async search(query: string, opts: SearchOptions = {}): Promise<readonly IconEntry[]> {
    const q = query.trim();
    if (q === '') return [];
    const limit = opts.limit ?? 240;
    const keep = (e: IconEntry) => opts.shareAlike === true || !e.meta.shareAlike;
    const m = await this.manifest();
    const idx = await this.index();
    if (!idx) {
      const all = (await Promise.all(m.categories.map((c) => this.shard(c.id, c.shard)))).flat();
      const words = q.toLowerCase().split(/\s+/);
      return all
        .filter((e) => {
          const hay = `${e.title} ${e.tags.join(' ')} ${e.category}`.toLowerCase();
          return keep(e) && words.every((w) => hay.includes(w));
        })
        .slice(0, limit);
    }
    const t0 = performance.now();
    const hits = idx.ms.search(q, { ...idx.file.searchOptions });
    this.lastQueryMs = performance.now() - t0;
    // Fetch only the shards the best hits live in.
    const top = hits.slice(0, limit * 2);
    const cats = new Set(top.map((h) => String(h['category'])));
    const byId = new Map<string, IconEntry>();
    await Promise.all(
      m.categories
        .filter((c) => cats.has(c.id))
        .map(async (c) => {
          for (const e of await this.shard(c.id, c.shard)) byId.set(e.id, e);
        }),
    );
    const out: IconEntry[] = [];
    for (const h of top) {
      const e = byId.get(String(h.id));
      if (e && keep(e)) out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  async byId(id: string): Promise<IconEntry | undefined> {
    const m = await this.manifest();
    const idx = await this.index().catch(() => null);
    const stored = idx?.ms.getStoredFields(id);
    const cats =
      stored && typeof stored['category'] === 'string'
        ? m.categories.filter((c) => c.id === stored['category'])
        : m.categories;
    for (const c of cats) {
      const e = (await this.shard(c.id, c.shard)).find((x) => x.id === id);
      if (e) return e;
    }
    return undefined;
  }

  svgUrl(entry: IconEntry): string {
    return this.base + entry.svg;
  }

  thumb(manifest: LibraryManifest, entry: IconEntry, size: number): Thumb | null {
    const t = manifest.thumbs;
    if (!t || !entry.thumb) return null;
    const k = size / t.size;
    const url = (suffix: string) =>
      JSON.stringify(`${this.base}${entry.thumb?.sheet ?? ''}${suffix}${t.ext}`);
    const col = entry.thumb.i % t.columns;
    const row = Math.floor(entry.thumb.i / t.columns);
    return {
      image: `image-set(url(${url('')}) 1x, url(${url(t.hiDpi)}) 2x)`,
      x: -col * t.size * k,
      y: -row * t.size * k,
      sheetWidth: t.columns * t.size * k,
    };
  }

  async credits(): Promise<string | null> {
    const m = await this.manifest();
    return m.credits === undefined ? null : this.get(m.credits);
  }

  async asset(
    entry: IconEntry,
  ): Promise<{ hash: string; asset: Extract<Asset, { kind: 'icon' }> }> {
    let p = this.svgs.get(entry.hash);
    if (!p) {
      p = this.get(entry.svg);
      this.svgs.set(entry.hash, p);
    }
    const svg = await p;
    // Validated here as on import: the library is data, not trusted code.
    sanitizeSvg(svg);
    const asset = {
      kind: 'icon' as const,
      svg,
      slots: entry.slots,
      recolor: entry.recolor,
      meta: entry.meta,
    };
    return { hash: hashAsset(asset), asset };
  }
}
