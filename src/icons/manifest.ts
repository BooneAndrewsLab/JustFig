/**
 * The icon library format (note 01, "Icon library loader"): what the
 * Phase 1 stub in public/lib/stub/ serves and what the Phase 2
 * `justfig-icons` release must serve, under `lib/<version>/`:
 *
 *   manifest.json        LibraryManifest
 *   shards/<cat>.json    LibraryShard
 *   svg/<hash>.svg       normalised SVG (slots as data-slot / data-tone)
 *
 * Decoded strictly: an entry without complete licence metadata is
 * rejected, never shown.
 */
import type { IconMeta, SlotDef } from '@/core/model/types';
import { Path, arr, bool, int, list, obj, oneOf, opt, str } from '@/io/decode';
import { iconMeta } from '@/io/jfig';

export const LIBRARY_FORMAT = 'justfig-icons';
export const LIBRARY_FORMAT_VERSION = 1;

export interface CategoryRef {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  /** Relative to the manifest. */
  readonly shard: string;
}

export interface SourceInfo {
  readonly id: string;
  readonly name: string;
  readonly homepage: string;
  /** Default SPDX id for the source; each icon carries its own. */
  readonly license: string;
  readonly licenseUrl: string;
  /** Required attribution wording, if the source has one. */
  readonly attribution?: string;
}

export interface LibraryManifest {
  readonly format: typeof LIBRARY_FORMAT;
  readonly formatVersion: number;
  readonly library: string;
  readonly version: string;
  readonly categories: readonly CategoryRef[];
  readonly sources: readonly SourceInfo[];
}

export interface IconEntry {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly category: string;
  /** Content hash of the SVG text. */
  readonly hash: string;
  /** Relative to the manifest. */
  readonly svg: string;
  readonly slots: readonly SlotDef[];
  readonly recolor: 'slots' | 'whole';
  readonly meta: IconMeta;
}

export interface LibraryShard {
  readonly category: string;
  readonly icons: readonly IconEntry[];
}

const HEX = /^#[0-9a-f]{6}$/;

export function decodeManifest(v: unknown): LibraryManifest {
  const p = new Path(['manifest']);
  const o = obj(v, p);
  if (o['format'] !== LIBRARY_FORMAT) p.key('format').fail(`expected "${LIBRARY_FORMAT}"`);
  const formatVersion = int(o['formatVersion'], p.key('formatVersion'));
  if (formatVersion > LIBRARY_FORMAT_VERSION)
    p.key('formatVersion').fail('library is newer than this app');
  return {
    format: LIBRARY_FORMAT,
    formatVersion,
    library: str(o['library'], p.key('library')),
    version: str(o['version'], p.key('version')),
    categories: list(o['categories'], p.key('categories'), (x, q) => {
      const c = obj(x, q);
      return {
        id: str(c['id'], q.key('id')),
        title: str(c['title'], q.key('title')),
        count: int(c['count'], q.key('count')),
        shard: str(c['shard'], q.key('shard')),
      };
    }),
    sources: list(o['sources'], p.key('sources'), (x, q) => {
      const s = obj(x, q);
      return {
        id: str(s['id'], q.key('id')),
        name: str(s['name'], q.key('name')),
        homepage: str(s['homepage'], q.key('homepage')),
        license: str(s['license'], q.key('license')),
        licenseUrl: str(s['licenseUrl'], q.key('licenseUrl')),
        ...opt(s, 'attribution', q, str),
      };
    }),
  };
}

export function decodeShard(v: unknown): LibraryShard {
  const p = new Path(['shard']);
  const o = obj(v, p);
  return {
    category: str(o['category'], p.key('category')),
    icons: list(o['icons'], p.key('icons'), (x, q) => {
      const e = obj(x, q);
      const meta = iconMeta(e['meta'], q.key('meta'));
      for (const k of ['license', 'licenseUrl', 'source', 'originalUrl'] as const)
        if (meta[k].trim() === '') q.key('meta').key(k).fail('licence metadata is required');
      return {
        id: str(e['id'], q.key('id')),
        title: str(e['title'], q.key('title')),
        tags: arr(e['tags'], q.key('tags')).map((t, i) => str(t, q.key('tags').index(i))),
        category: str(e['category'], q.key('category')),
        hash: str(e['hash'], q.key('hash')),
        svg: str(e['svg'], q.key('svg')),
        slots: list(e['slots'], q.key('slots'), (y, r) => {
          const s = obj(y, r);
          const d = str(s['default'], r.key('default'));
          if (!HEX.test(d)) r.key('default').fail('expected #rrggbb');
          return {
            id: str(s['id'], r.key('id')),
            label: str(s['label'], r.key('label')),
            default: d,
          };
        }),
        recolor: oneOf(e['recolor'], q.key('recolor'), ['slots', 'whole'] as const),
        meta: { ...meta, shareAlike: bool(meta.shareAlike, q.key('meta').key('shareAlike')) },
      };
    }),
  };
}
