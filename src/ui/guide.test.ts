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
import { LOOKS, STYLE_IDS } from '@/procedural/prims';
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

  it('describes the front page and each of its buttons (note 57)', () => {
    const home = src('./Home.tsx');
    for (const b of [
      'Back to your figures',
      'Open…',
      'New figure',
      'Open a figure…',
      'Try an example',
      'More templates and examples…',
      'Recent figures',
      'Start from a template',
    ]) {
      expect(home, b).toContain(b);
      expect(has(b.replace('…', '')), b).toBe(true);
    }
    expect(src('./App.tsx')).toContain('Front page: your open figures stay open');
    expect(has('front page')).toBe(true);
  });

  it('describes every top-bar button, File menu item, dialog and Inspector section', () => {
    const app = src('./App.tsx') + src('./FileMenu.tsx') + src('./HistoryMenu.tsx');
    for (const b of [
      'File',
      'New',
      'Templates…',
      'Open…',
      'Save',
      'Import…',
      'Versions…',
      'Save as…',
      'Attribution…',
      'Export…',
      'Undo',
      'Redo',
      'History',
      'Opened figure',
      'Help',
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

  it("lists every kind preset on its kind's line under Starting points (note 58)", () => {
    const objects = pages.find((p) => p.id === '08-objects')?.text ?? '';
    const start = objects.indexOf('## Starting points');
    expect(start).toBeGreaterThan(-1);
    const section = objects.slice(start, objects.indexOf('\n## ', start + 1));
    const lines = section.split('\n');
    expect(section).toContain('Start from…');
    expect(src('./panels/ProceduralInspector.tsx')).toContain('Start from…');
    for (const k of allKinds()) {
      if ((k.presets ?? []).length === 0) continue;
      const line = lines.find((l) => l.startsWith(`- **${k.title}**`));
      expect(line, k.kind).toBeDefined();
      for (const p of k.presets ?? []) expect(line, `${k.kind}/${p.id}`).toContain(p.label);
    }
  });

  it('describes every style, the kinds that have them and Apply this style to all (note 58)', () => {
    const objects = pages.find((p) => p.id === '08-objects')?.text ?? '';
    const start = objects.indexOf('## Styles');
    expect(start).toBeGreaterThan(-1);
    const section = objects.slice(start, objects.indexOf('\n## ', start + 1));
    const used = new Set(allKinds().flatMap((k) => k.styles ?? []));
    for (const id of STYLE_IDS)
      if (id === 'flat' || used.has(id))
        expect(section, id).toContain(`- **${LOOKS[id].label}** —`);
    for (const k of allKinds())
      if ((k.styles ?? []).length > 0) expect(section, k.kind).toContain(k.title);
    expect(section).toContain('Apply this style to all');
    expect(src('./panels/ProceduralInspector.tsx')).toContain('Apply this style to all');
  });

  it('describes every kind wizard, its questions and answers under Wizards (note 58)', () => {
    const objects = pages.find((p) => p.id === '08-objects')?.text ?? '';
    const start = objects.indexOf('## Wizards');
    expect(start).toBeGreaterThan(-1);
    const section = objects.slice(start, objects.indexOf('\n## ', start + 1));
    for (const k of allKinds()) {
      const w = k.wizard;
      if (!w) continue;
      expect(section, k.kind).toContain(`**${w.title}…**`);
      for (const s of w.steps) {
        expect(section, s.question).toContain(`**${s.question}**`);
        for (const f of s.fields)
          if (f.type !== 'bool')
            expect(section.toLowerCase(), f.key).toContain(f.label.toLowerCase());
      }
    }
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
