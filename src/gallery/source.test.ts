import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { format, resolveConfig } from 'prettier';
import { beforeAll, describe, expect, it } from 'vitest';

import { BRAND } from '@/brand';
import { writeJfig } from '@/io/jfig';
import { loadTestFonts } from '@/test/fonts';

import { GALLERY, type GalleryEntry } from './gallery';
import { type TemplateSpec, templateIdentifier, templateObjects, templateSource } from './source';

beforeAll(loadTestFonts);

const spec = (over: Partial<TemplateSpec> = {}): TemplateSpec => ({
  id: 'test-entry',
  title: 'Test entry',
  description: 'A figure written out and read back.',
  kind: 'example',
  ...over,
});

/** The generated module, imported from a temporary file (the `@/` alias still resolves). */
async function evaluate(source: string, name: string): Promise<GalleryEntry> {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
  try {
    const file = join(dir, `${name}.ts`);
    // The module imports siblings of src/gallery; point them at the real ones.
    const here = new URL('.', import.meta.url).pathname;
    writeFileSync(
      file,
      source
        .replace("from './gallery'", `from '${here}gallery'`)
        .replace("from './kit'", `from '${here}kit'`),
    );
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, GalleryEntry>;
    const entry = mod[templateIdentifier(name)];
    if (!entry) throw new Error('entry not exported');
    return entry;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Ids are fresh, so compare the saved text with ids and bindings made equal by position. */
function shape(fig: ReturnType<GalleryEntry['build']>): string {
  const ids = new Map<string, string>();
  const text = writeJfig(fig, { name: 'test', version: '0' });
  return text.replace(/"(?:d|pg|ly|o|sw)_[A-Za-z0-9_-]+"/g, (m) => {
    let k = ids.get(m);
    if (!k) {
      k = `"#${String(ids.size)}"`;
      ids.set(m, k);
    }
    return k;
  });
}

describe('Save as template source (note 08)', () => {
  for (const entry of GALLERY) {
    it(`round-trips ${entry.id}: the generated entry builds the same figure`, async () => {
      const fig = entry.build();
      const page = fig.doc.pages[0];
      if (!page) throw new Error('no page');
      const src = templateSource(fig, page, templateObjects(page, []), {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        kind: entry.kind,
      });
      const back = await evaluate(src, entry.id);
      expect(back.id).toBe(entry.id);
      expect(back.kind).toBe(entry.kind);
      expect(back.title).toBe(entry.title);
      expect(back.description).toBe(entry.description);
      // Same figure up to ids; arrows still attached, so reconcile changed nothing.
      expect(shape(back.build())).toBe(shape(fig));
      expect(back.build().doc.id).not.toBe(back.build().doc.id);
    });
  }

  it('follows the existing entries: the same imports, shape and an export per id', () => {
    const fig = GALLERY[3]?.build();
    const page = fig?.doc.pages[0];
    if (!fig || !page) throw new Error('no entry');
    const src = templateSource(fig, page, templateObjects(page, []), spec());
    expect(src).toContain('export const testEntry: GalleryEntry = {');
    expect(src).toContain("kind: 'example',");
    expect(src).toContain('const OBJECTS: readonly Obj[] = [');
    expect(src).not.toContain(BRAND.name);
  });

  it('is already formatted: Prettier changes nothing', async () => {
    const fig = GALLERY[3]?.build();
    const page = fig?.doc.pages[0];
    if (!fig || !page) throw new Error('no entry');
    const long = 'word '.repeat(30).trim();
    const src = templateSource(fig, page, templateObjects(page, []), spec({ description: long }));
    const config = await resolveConfig(join(process.cwd(), 'src/gallery/x.ts'));
    expect(await format(src, { ...config, parser: 'typescript' })).toBe(src);
  });

  it('keeps only the selection, and the assets only the selection uses', () => {
    const fig = GALLERY[3]?.build();
    const page = fig?.doc.pages[0];
    const first = page?.layers[0]?.children[0];
    if (!fig || !page || !first) throw new Error('no entry');
    expect(templateObjects(page, [first])).toEqual([first]);
    expect(templateObjects(page, []).length).toBeGreaterThan(1);
  });

  it('refuses a bad id and an empty selection, and names ids as identifiers', () => {
    const fig = GALLERY[0]?.build();
    const page = fig?.doc.pages[0];
    if (!fig || !page) throw new Error('no entry');
    const objs = templateObjects(page, []);
    expect(() => templateSource(fig, page, objs, spec({ id: 'Bad Id' }))).toThrow();
    expect(() => templateSource(fig, page, [], spec())).toThrow();
    expect(templateIdentifier('panels-2x2')).toBe('panels2x2');
    expect(templateIdentifier('2x2-panels')).toBe('entry2x2Panels');
  });
});
