/**
 * The icon library client (note 01): the one interface the app reads
 * icons through. Phase 1 serves the stub library; Phase 2 points
 * `BRAND.iconLibraryPath` at a pinned `justfig-icons` release with the
 * same layout (manifest.ts) and adds a MiniSearch index behind `search`.
 */
import type { Asset } from '@/core/model/types';
import { hashAsset } from '@/io/assets';
import { sanitizeSvg } from '@/io/svg/sanitize';

import { type IconEntry, type LibraryManifest, decodeManifest, decodeShard } from './manifest';

export interface IconLibrary {
  manifest(): Promise<LibraryManifest>;
  /** Icons of one category (a shard, fetched once). */
  category(id: string): Promise<readonly IconEntry[]>;
  /** Every icon matching a query (title, tags, category); all when blank. */
  search(query: string): Promise<readonly IconEntry[]>;
  /** URL of an icon's SVG, for thumbnails. */
  svgUrl(entry: IconEntry): string;
  /** The asset to embed when the icon is placed (SVG fetched and sanitised). */
  asset(entry: IconEntry): Promise<{ hash: string; asset: Extract<Asset, { kind: 'icon' }> }>;
}

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class HttpIconLibrary implements IconLibrary {
  private manifestP: Promise<LibraryManifest> | null = null;
  private readonly shards = new Map<string, Promise<readonly IconEntry[]>>();
  private readonly svgs = new Map<string, Promise<string>>();

  /** `base` ends with a slash, e.g. `${BASE_URL}lib/stub/`. */
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

  async category(id: string): Promise<readonly IconEntry[]> {
    const m = await this.manifest();
    const c = m.categories.find((x) => x.id === id);
    if (!c) return [];
    let p = this.shards.get(id);
    if (!p) {
      p = this.get(c.shard).then((t) => decodeShard(JSON.parse(t)).icons);
      this.shards.set(id, p);
    }
    return p;
  }

  async search(query: string): Promise<readonly IconEntry[]> {
    const m = await this.manifest();
    const all = (await Promise.all(m.categories.map((c) => this.category(c.id)))).flat();
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w !== '');
    if (words.length === 0) return all;
    return all.filter((e) => {
      const hay = `${e.title} ${e.tags.join(' ')} ${e.category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  svgUrl(entry: IconEntry): string {
    return this.base + entry.svg;
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
