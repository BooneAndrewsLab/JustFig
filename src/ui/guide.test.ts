/**
 * The guide covers every feature (Phase 4 definition of done): each test
 * reads the names from the app's own source of truth, so a new tool,
 * shortcut, panel, dialog, object kind, palette or template without a
 * guide entry fails here.
 */
import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GALLERY } from '@/gallery/gallery';
import { PALETTES } from '@/palette/palettes';
import { allKinds } from '@/procedural/registry';

import { guidePages } from './guide';
import { KEY_ACTIONS, formatBinding } from './keyBindings';
import { TOOLS } from './panels/tools';

const dir = new URL('../../docs/guide/', import.meta.url);
const pages = guidePages(
  Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]),
  ),
);
const all = pages.map((p) => p.text).join('\n');
const has = (s: string) => all.toLowerCase().includes(s.toLowerCase());
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('the user guide', () => {
  it('has numbered pages, each with a title, and links that resolve', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(pages.map((p) => p.id));
    for (const p of pages) {
      expect(p.id).toMatch(/^\d\d-[a-z0-9-]+$/);
      expect(p.text.startsWith('# '), p.id).toBe(true);
      for (const m of p.text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = m[1] ?? '';
        if (target.startsWith('https://')) continue;
        expect(ids.has(target.replace(/\.md(#.*)?$/, '')), `${p.id} → ${target}`).toBe(true);
      }
    }
  });

  it('lists every keyboard shortcut with its default key, on one page', () => {
    const page = pages.find((p) => p.text.includes('Keyboard shortcuts'));
    expect(page).toBeDefined();
    const lines = (page?.text ?? '').split('\n');
    for (const a of KEY_ACTIONS) {
      const line = lines.find((l) => l.includes(a.label));
      expect(line, a.label).toBeDefined();
      expect(line, a.label).toContain(formatBinding(a.defaultBinding));
    }
  });

  it('describes every tool', () => {
    for (const t of TOOLS) expect(has(t.label.split(' (')[0] ?? t.label), t.id).toBe(true);
  });

  it('describes every top-bar button, dialog and Inspector section', () => {
    const app = src('./App.tsx');
    for (const b of [
      'New',
      'Templates…',
      'Open…',
      'Save',
      'Import…',
      'Attribution',
      'Export…',
      'Guide',
      'Shortcuts…',
    ]) {
      expect(app, b).toContain(b);
      expect(has(b.replace('…', '')), b).toBe(true);
    }
    const dialogs = readdirSync(new URL('./dialogs/', import.meta.url))
      .filter((f) => f.endsWith('.tsx'))
      .flatMap((f) => [...src(`./dialogs/${f}`).matchAll(/<Dialog\s+title="([^"]+)"/g)])
      .map((m) => m[1] ?? '');
    expect(dialogs.length).toBeGreaterThanOrEqual(5);
    for (const d of dialogs) expect(has(d), d).toBe(true);
    const panels = readdirSync(new URL('./panels/', import.meta.url))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => src(`./panels/${f}`))
      .join('\n');
    const sections = [
      ...[...panels.matchAll(/<Section title="([^"]+)"/g)].map((m) => m[1] ?? ''),
      ...[...panels.matchAll(/<section className="section[^"]*" aria-label="([^"]+)"/g)].map(
        (m) => m[1] ?? '',
      ),
    ];
    expect(sections.length).toBeGreaterThanOrEqual(10);
    for (const s of sections) expect(has(s), s).toBe(true);
    for (const s of ['Layers', 'Pages', 'Objects', 'Icons', 'Convert to shapes'])
      expect(has(s), s).toBe(true);
  });

  it('describes every object kind, palette and gallery entry', () => {
    for (const k of allKinds()) expect(has(k.title), k.kind).toBe(true);
    for (const p of PALETTES) expect(has(p.name.split(' (')[0] ?? p.name), p.id).toBe(true);
    for (const e of GALLERY) expect(has(e.title), e.id).toBe(true);
  });

  it('covers files, imports, the sibling apps, exports and citing', () => {
    for (const s of [
      'SVG',
      'PDF',
      'PNG',
      'TIFF',
      'DPI',
      'credit line',
      'PlasmidPop',
      'BarelySig',
      '.bsig',
      'autosave',
      'share-alike',
      'colour-vision',
      'arrow',
      'attached',
      'Detach',
      'subscript',
      'superscript',
      'Greek',
      'snap',
      'align',
      'distribute',
      'group',
      'lock',
      'CITATION',
    ])
      expect(has(s), s).toBe(true);
  });
});
