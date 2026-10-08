import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRAND } from '@/brand';
import { sanitizeSvg } from '@/io/svg/sanitize';

import { type Fetcher, HttpIconLibrary } from './library';
import { decodeManifest } from './manifest';

const fsFetcher =
  (root: string): Fetcher =>
  (url) => {
    const path = join(root, url.slice('lib/'.length));
    try {
      const text = readFileSync(path, 'utf8');
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(text) });
    } catch {
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    }
  };

/** The committed test library: 12 icons cut from the pinned release (npm run icons:fixture). */
const fixture = join(process.cwd(), 'src', 'icons', 'fixtures', 'lib');
const lib = new HttpIconLibrary('lib/', fsFetcher(fixture));

describe('icon library client (fixture library)', () => {
  it('reads categories, with share-alike icons only on request', async () => {
    const m = await lib.manifest();
    expect(m.format).toBe('justfig-icons');
    expect(m.sources.map((s) => s.id).sort()).toEqual(['bioicons', 'healthicons', 'house']);
    const cells = await lib.category('cells');
    expect(cells.some((e) => e.meta.shareAlike)).toBe(false);
    const withSa = await lib.category('cells', { shareAlike: true });
    expect(withSa.some((e) => e.id === 'bi-epithelial-cell')).toBe(true);
  });

  it('gives every icon complete licence metadata and SVGs that sanitise cleanly', async () => {
    const m = await lib.manifest();
    for (const c of m.categories)
      for (const e of await lib.category(c.id, { shareAlike: true })) {
        expect(e.meta.license, e.id).not.toBe('');
        expect(e.meta.author, e.id).toBeTruthy();
        expect(e.meta.originalUrl).toMatch(/^https:\/\//);
        const { asset } = await lib.asset(e);
        expect(sanitizeSvg(asset.svg).warnings, e.id).toEqual([]);
        const used = new Set([...asset.svg.matchAll(/data-slot="([^"]+)"/g)].map((x) => x[1]));
        for (const u of used)
          expect(
            e.slots.map((s) => s.id),
            e.id,
          ).toContain(u);
      }
  });

  it('searches the MiniSearch index: titles, tags, prefixes and typos', async () => {
    expect((await lib.search('eppendorf')).map((e) => e.id)).toEqual(['microcentrifuge-tube']);
    expect((await lib.search('kidn')).map((e) => e.id)).toContain('hi-kidneys');
    expect((await lib.search('erythrocite')).map((e) => e.id)).toContain('bi-erythrocyte-5');
    expect(await lib.search('   ')).toEqual([]);
  });

  it('hides share-alike icons from search unless asked', async () => {
    expect((await lib.search('epithelial')).map((e) => e.id)).toEqual([]);
    expect((await lib.search('epithelial', { shareAlike: true })).map((e) => e.id)).toEqual([
      'bi-epithelial-cell',
    ]);
  });

  it('finds an icon by id (drag and drop)', async () => {
    expect((await lib.byId('petri-dish'))?.title).toBe('Petri dish');
    expect(await lib.byId('nope')).toBeUndefined();
  });

  it('serves the credits file', async () => {
    expect(await lib.credits()).toContain('# Icon credits');
  });

  it('places sprite cells from the manifest layout', () => {
    const m = decodeManifest({
      format: 'justfig-icons',
      formatVersion: 1,
      library: 'l',
      version: '1',
      categories: [],
      sources: [],
      thumbs: { size: 96, columns: 10, ext: '.webp', hiDpi: '@2x' },
    });
    const e = { thumb: { sheet: 'thumbs/cells-0', i: 13 } } as Parameters<typeof lib.thumb>[1];
    expect(lib.thumb(m, e, 48)).toEqual({
      image: 'image-set(url("lib/thumbs/cells-0.webp") 1x, url("lib/thumbs/cells-0@2x.webp") 2x)',
      x: -144,
      y: -48,
      sheetWidth: 480,
    });
  });
});

describe('manifest decoding', () => {
  const base = {
    format: 'justfig-icons',
    formatVersion: 1,
    library: 'l',
    version: '1',
    sources: [],
  };
  it('keeps every path inside the library', () => {
    for (const shard of ['../x.json', '/etc/x', 'https://evil.example/x.json'])
      expect(() =>
        decodeManifest({ ...base, categories: [{ id: 'a', title: 'A', count: 1, shard }] }),
      ).toThrow(/inside the library/);
  });
});

describe('the pinned release', () => {
  const lock = JSON.parse(readFileSync(join(process.cwd(), 'icons.lock.json'), 'utf8')) as {
    version: string;
    url: string;
    sha256: string;
  };

  it('is the library BRAND points at', () => {
    expect(BRAND.iconLibraryPath).toBe(`lib/${lock.version}/`);
    expect(lock.url).toContain(`v${lock.version}/justfig-icons-${lock.version}.tar.gz`);
    expect(lock.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  // The full library is not committed (npm run icons puts it in public/lib/); when it is
  // there, check the Phase 2 budgets on it.
  const full = join(process.cwd(), 'public', 'lib', lock.version);
  it.skipIf(!existsSync(join(full, 'manifest.json')))(
    'meets the budgets: 2,000+ icons, first payload < 300 kB, search < 100 ms',
    async () => {
      const big = new HttpIconLibrary('lib/', fsFetcher(full));
      const m = await big.manifest();
      const total = m.categories.reduce((n, c) => n + c.count, 0);
      expect(total).toBeGreaterThanOrEqual(2000);
      const first = m.categories[0]!;
      const payload =
        readFileSync(join(full, 'manifest.json')).length +
        readFileSync(join(full, first.shard)).length;
      expect(payload).toBeLessThan(300_000);
      await big.search('warm up');
      let worst = 0;
      for (const q of [
        'cell',
        'mitochondria',
        'dna helix',
        'mouse',
        'pipete',
        'antibody',
        'heart',
        'virus',
        'flask',
        'neuron',
      ]) {
        await big.search(q);
        worst = Math.max(worst, big.lastQueryMs);
      }
      expect(worst).toBeLessThan(100);
      expect((await big.search('mouse')).length).toBeGreaterThan(0);
    },
  );
});
