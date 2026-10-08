/**
 * Cuts the small committed test library in src/icons/fixtures/lib/ out of
 * the pinned release in public/lib/<version>/ (run `npm run icons` first):
 * a dozen icons from all three sources and the main licences, in the same
 * format, with its own search index. Unit tests read it, so they need
 * neither the full library nor the network.
 *
 *   node scripts/icons/make-fixture-library.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import MiniSearch from 'minisearch';

const IDS = [
  'test-tube',
  'microcentrifuge-tube',
  'petri-dish',
  'mouse',
  'hi-dna',
  'hi-kidneys',
  'bi-erythrocyte-5',
  'bi-aortic-dissection',
  'bi-epithelial-cell',
  'bi-amplicons',
  'bi-chlamydomonas-2',
  'bi-iga-immunoglobulin',
];

interface Entry {
  id: string;
  title: string;
  tags: string[];
  category: string;
  hash: string;
  svg: string;
  thumb?: unknown;
  meta: {
    license: string;
    source: string;
    author?: string;
    originalUrl: string;
    shareAlike: boolean;
  };
}
interface Manifest {
  version: string;
  categories: { id: string; title: string; count: number; shard: string }[];
  thumbs?: unknown;
  search?: string;
  [k: string]: unknown;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lock = JSON.parse(readFileSync(join(root, 'icons.lock.json'), 'utf8')) as { version: string };
const src = join(root, 'public', 'lib', lock.version);
const out = join(root, 'src', 'icons', 'fixtures', 'lib');
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8')) as Manifest;

const picked = new Map<string, Entry[]>();
for (const c of manifest.categories) {
  const shard = JSON.parse(readFileSync(join(src, c.shard), 'utf8')) as { icons: Entry[] };
  const list = shard.icons.filter((e) => IDS.includes(e.id)).map(({ thumb: _thumb, ...e }) => e);
  if (list.length > 0) picked.set(c.id, list);
}
const all = [...picked.values()].flat();
const missing = IDS.filter((id) => !all.some((e) => e.id === id));
if (missing.length > 0) throw new Error(`not in the library: ${missing.join(', ')}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'svg'), { recursive: true });
mkdirSync(join(out, 'shards'), { recursive: true });
for (const e of all) writeFileSync(join(out, e.svg), readFileSync(join(src, e.svg)));
const categories = manifest.categories
  .filter((c) => picked.has(c.id))
  .map((c) => {
    const icons = picked.get(c.id) ?? [];
    writeFileSync(join(out, c.shard), `${JSON.stringify({ category: c.id, icons }, null, 1)}\n`);
    return { ...c, count: icons.length, shareAlike: icons.filter((e) => e.meta.shareAlike).length };
  });
const ms = new MiniSearch({ fields: ['title', 'tags', 'synonyms'], storeFields: ['category'] });
ms.addAll(
  all.map((e) => ({
    id: e.id,
    title: e.title,
    tags: e.tags.join(' '),
    synonyms: '',
    category: e.category,
  })),
);
const search = JSON.parse(readFileSync(join(src, 'search-index.json'), 'utf8')) as Record<
  string,
  unknown
>;
writeFileSync(
  join(out, 'search-index.json'),
  `${JSON.stringify({ ...search, index: ms.toJSON() })}\n`,
);
const { thumbs: _thumbs, ...rest } = manifest;
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify({ ...rest, categories }, null, 1)}\n`);
writeFileSync(
  join(out, 'CREDITS.md'),
  [
    '# Icon credits (test fixture)',
    '',
    `A subset of the justfig-icons ${manifest.version} release, for unit tests.`,
    '',
    ...all
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (e) =>
          `- ${e.title}: ${e.meta.source}, ${e.meta.author ?? 'unknown'}, ${e.meta.license}, ${e.meta.originalUrl}`,
      ),
    '',
  ].join('\n'),
);
console.warn(
  `fixture library: ${String(all.length)} icons in ${String(categories.length)} categories`,
);
