/**
 * The icon library format (note 01, "Icon library loader"): what the
 * Phase 1 stub in public/lib/stub/ serves and what the Phase 2
 * `justfig-icons` release must serve, under `lib/<version>/`:
 *
 *   manifest.json        LibraryManifest
 *   shards/<cat>.json    LibraryShard
 *   svg/<hash>.svg       normalised SVG (slots as data-slot / data-tone)
 *
 *   thumbs/<cat>-<n>.webp  sprite sheets (v1 extension, + @2x)
 *   search-index.json    serialised MiniSearch index (v1 extension)
 *   CREDITS.md, LICENSES/  licence notices, shown in the app (v1 extension)
 *
 * The "v1 extension" fields are optional, so the Phase 1 stub layout still
 * decodes. Decoded strictly: an entry without complete licence metadata is
 * rejected, never shown.
 */
import type { IconMeta, SlotDef } from '@/core/model/types';
import { type Json, Path, arr, bool, int, list, obj, oneOf, opt, str } from '@/io/decode';
import { iconMeta } from '@/io/jfig';

export const LIBRARY_FORMAT = 'justfig-icons';
export const LIBRARY_FORMAT_VERSION = 1;

export interface CategoryRef {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  /** Relative to the manifest. */
  readonly shard: string;
  /** How many of them are share-alike (hidden unless the user opts in). */
  readonly shareAlike?: number;
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
  /** Pinned upstream commit the icons were built from. */
  readonly commit?: string;
  /** When the source's terms were last checked (YYYY-MM-DD). */
  readonly termsChecked?: string;
}

/** Sprite-sheet layout: `size` px cells, `columns` per row; `<sheet><ext>` and `<sheet><hiDpi><ext>`. */
export interface ThumbLayout {
  readonly size: number;
  readonly columns: number;
  readonly ext: string;
  readonly hiDpi: string;
}

export interface LibraryManifest {
  readonly format: typeof LIBRARY_FORMAT;
  readonly formatVersion: number;
  readonly library: string;
  readonly version: string;
  readonly categories: readonly CategoryRef[];
  readonly sources: readonly SourceInfo[];
  readonly thumbs?: ThumbLayout;
  /** Paths relative to the manifest. */
  readonly search?: string;
  readonly credits?: string;
  readonly licenses?: string;
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
  /** Sprite sheet (relative, without extension) and cell index. */
  readonly thumb?: { readonly sheet: string; readonly i: number };
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
        shard: relPath(c['shard'], q.key('shard')),
        ...opt(c, 'shareAlike', q, int),
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
        ...opt(s, 'commit', q, str),
        ...opt(s, 'termsChecked', q, str),
      };
    }),
    ...opt(o, 'thumbs', p, (x, q) => {
      const t = obj(x, q);
      const size = int(t['size'], q.key('size'));
      const columns = int(t['columns'], q.key('columns'));
      if (size <= 0 || columns <= 0) q.fail('expected positive sizes');
      const ext = str(t['ext'], q.key('ext'));
      const hiDpi = str(t['hiDpi'], q.key('hiDpi'));
      if (!/^\.[a-z0-9]+$/.test(ext) || !/^[@\w-]*$/.test(hiDpi)) q.fail('bad file suffix');
      return { size, columns, ext, hiDpi };
    }),
    ...opt(o, 'search', p, relPath),
    ...opt(o, 'credits', p, relPath),
    ...opt(o, 'licenses', p, relPath),
  };
}

/**
 * A path inside the library: relative, no `..`, no scheme. The library is
 * data from another repository, so it never points the app elsewhere.
 */
function relPath(v: Json | undefined, p: Path): string {
  const s = str(v, p);
  if (s.startsWith('/') || s.includes('..') || s.includes(':') || s.includes('\\'))
    p.fail('expected a path inside the library');
  return s;
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
        svg: relPath(e['svg'], q.key('svg')),
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
        ...opt(e, 'thumb', q, (x, r) => {
          const t = obj(x, r);
          const i = int(t['i'], r.key('i'));
          if (i < 0) r.key('i').fail('expected a cell index');
          return { sheet: relPath(t['sheet'], r.key('sheet')), i };
        }),
      };
    }),
  };
}
