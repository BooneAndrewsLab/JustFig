import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { sanitizeSvg } from '@/io/svg/sanitize';

import { HttpIconLibrary } from './library';

const root = join(process.cwd(), 'public', 'lib', 'stub');
const lib = new HttpIconLibrary('lib/', (url) => {
  const path = join(root, url.slice('lib/'.length));
  try {
    const text = readFileSync(path, 'utf8');
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(text) });
  } catch {
    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
  }
});

describe('stub icon library', () => {
  it('has about 50 icons, each with complete licence metadata', async () => {
    const all = await lib.search('');
    expect(all.length).toBeGreaterThanOrEqual(50);
    for (const e of all) {
      expect(e.meta.license).toBe('CC0-1.0');
      expect(e.meta.originalUrl).toMatch(/^https:\/\//);
      expect(e.slots.length).toBeGreaterThan(0);
    }
  });

  it('serves SVGs that sanitise cleanly and use only declared slots', async () => {
    for (const e of await lib.search('')) {
      const { asset } = await lib.asset(e);
      const s = sanitizeSvg(asset.svg);
      expect(s.warnings, e.id).toEqual([]);
      const used = new Set([...asset.svg.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]));
      for (const u of used)
        expect(
          e.slots.map((x) => x.id),
          e.id,
        ).toContain(u);
    }
  });

  it('searches titles and tags', async () => {
    expect((await lib.search('eppendorf')).map((e) => e.id)).toEqual(['microcentrifuge-tube']);
    expect((await lib.search('organ kidney')).map((e) => e.id)).toEqual(['hi-kidneys']);
  });
});
