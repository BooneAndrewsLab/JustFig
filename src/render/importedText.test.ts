/**
 * Text inside imported SVGs drawn with the bundled fonts (note 14): the
 * family mapping, the layout of one `<text>`, and the real matplotlib,
 * ggplot2 and PDF fixtures in both text modes, with a golden file of the
 * text-mode labels per fixture (UPDATE_GOLDEN=1 rewrites them).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { getFont } from '@/core/text/fonts';
import { importPdf, importSvgText } from '@/io/import';
import { bundledFont, isBold, isItalic } from '@/io/svg/plotFonts';
import { sanitizeSvg } from '@/io/svg/sanitize';
import { loadTestFonts } from '@/test/fonts';

import { svgImportNode } from './assets';
import { layoutImportedText, layoutImportedTexts } from './importedText';
import { type SvgNode, el, nodeToSvgString, walkNodes } from './svgNode';

const UPDATE = process.env['UPDATE_GOLDEN'] === '1';
const GOLDEN = new URL('./__golden__/plots/', import.meta.url);

function golden(file: string, actual: string): void {
  const url = new URL(file, GOLDEN);
  if (UPDATE || !existsSync(url)) {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(url, actual);
  }
  expect(actual).toBe(readFileSync(url, 'utf8'));
}

beforeAll(loadTestFonts);

const OPTS = { kerning: false, features: {} };
const width = (s: string, size: number): number =>
  getFont('arimo', { bold: false, italic: false }).getAdvanceWidth(s, size, OPTS);

function svgFixture(name: string): string {
  const text = readFileSync(new URL(`../io/svg/fixtures/${name}.svg`, import.meta.url), 'utf8');
  const imp = importSvgText(text, `${name}.svg`);
  if (imp.asset.kind !== 'svgImport') throw new Error('not imported');
  return imp.asset.svg;
}

async function pdfFixture(name: string): Promise<string> {
  const bytes = new Uint8Array(
    readFileSync(new URL(`../io/pdf/fixtures/${name}.pdf`, import.meta.url)),
  );
  const imp = await importPdf(bytes, `${name}.pdf`, () => Promise.resolve(1));
  if (imp?.asset.kind !== 'svgImport') throw new Error('not imported');
  return imp.asset.svg;
}

const FIXTURES: readonly { name: string; load: () => Promise<string> | string }[] = [
  { name: 'matplotlib-paths', load: () => svgFixture('matplotlib-paths') },
  { name: 'matplotlib-text', load: () => svgFixture('matplotlib-text') },
  { name: 'r-svglite', load: () => svgFixture('r-svglite') },
  { name: 'pdf-matplotlib-type3', load: () => pdfFixture('matplotlib-type3') },
  { name: 'pdf-matplotlib-truetype', load: () => pdfFixture('matplotlib-truetype') },
  { name: 'pdf-r-pdf', load: () => pdfFixture('r-pdf') },
  { name: 'pdf-r-cairo', load: () => pdfFixture('r-cairo') },
];

describe('font mapping', () => {
  it.each([
    ['DejaVu Sans, sans-serif', 'arimo'],
    ["'DejaVu Sans', 'Bitstream Vera Sans', 'Arial', sans-serif", 'arimo'],
    ['"Arial"', 'arimo'],
    ['Helvetica, sans-serif', 'arimo'],
    ['Helvetica Neue', 'arimo'],
    ['Liberation Sans, sans-serif', 'arimo'],
    ['Nimbus Sans L', 'arimo'],
    ['Computer Modern Sans Serif', 'arimo'],
    ['sans-serif', 'arimo'],
    ['', 'arimo'],
    ['Times New Roman', 'tinos'],
    ['Times, serif', 'tinos'],
    ['Liberation Serif', 'tinos'],
    ['DejaVu Serif', 'tinos'],
    ['STIXGeneral', 'tinos'],
    ['cmr10', 'tinos'],
    ['serif', 'tinos'],
    ['Courier New', 'cousine'],
    ['Courier, monospace', 'cousine'],
    ['DejaVu Sans Mono', 'cousine'],
    ['Liberation Mono', 'cousine'],
    ['monospace', 'cousine'],
  ])('%s → %s', (family, id) => {
    expect(bundledFont(family)).toBe(id);
  });

  it('reads weight and style', () => {
    for (const w of ['bold', 'bolder', '600', '700', '900']) expect(isBold(w)).toBe(true);
    for (const w of ['normal', '400', '500', 'lighter', undefined]) expect(isBold(w)).toBe(false);
    expect(isItalic('italic')).toBe(true);
    expect(isItalic('oblique')).toBe(true);
    expect(isItalic('normal')).toBe(false);
  });
});

describe('layout of one imported text', () => {
  const text = (attrs: Record<string, string>, ...kids: (SvgNode | string)[]): SvgNode =>
    el('text', attrs, kids);

  it('anchors each chunk on its own measured width', () => {
    for (const [anchor, k] of [
      ['start', 0],
      ['middle', 0.5],
      ['end', 1],
    ] as const) {
      const [s] = layoutImportedText(
        text({ x: '100', y: '50', 'font-size': '10', 'text-anchor': anchor }, 'Time (s)'),
      );
      expect(s?.text).toBe('Time (s)');
      expect(s?.x).toBeCloseTo(100 - k * width('Time (s)', 10), 6);
      expect(s?.y).toBe(50);
      expect(s?.style.font).toBe('arimo');
    }
  });

  it('starts a chunk at every listed position and continues the pen otherwise', () => {
    const segs = layoutImportedText(
      text(
        { x: '0 20', y: '10', 'font-size': '10', 'font-family': 'Times' },
        'ab',
        el('tspan', { 'font-weight': 'bold', fill: '#ff0000' }, ['c']),
      ),
    );
    expect(segs.map((s) => [s.text, s.x])).toEqual([
      ['a', 0],
      ['b', 20],
      ['c', 20 + getFont('tinos', { bold: false, italic: false }).getAdvanceWidth('b', 10, OPTS)],
    ]);
    expect(segs[2]?.style).toMatchObject({ font: 'tinos', bold: true, paint: { fill: '#ff0000' } });
  });

  it('collapses whitespace unless xml:space is preserve', () => {
    const t = (a: Record<string, string>) =>
      layoutImportedText(text({ y: '0', ...a }, '  a \n  b  ')).map((s) => s.text);
    expect(t({})).toEqual(['a b']);
    expect(t({ 'xml:space': 'preserve' })).toEqual(['  a    b  ']);
  });

  it('keeps transform and paint on the text and drops font attributes elsewhere', () => {
    const root = el('svg', { 'font-family': 'Courier' }, [
      el('g', { 'font-size': '20', fill: '#333333' }, [
        text({ x: '5', y: '5', transform: 'rotate(-90 5 5)', stroke: '#000000' }, 'Count'),
      ]),
    ]);
    const outline = nodeToSvgString(layoutImportedTexts(root, 'outline'));
    expect(outline).not.toContain('font-');
    expect(outline).toMatch(/^<svg><g fill="#333333"><g transform="rotate\(-90 5 5\)" stroke=/);
    const asText = nodeToSvgString(layoutImportedTexts(root, 'text'));
    expect(asText).toContain(
      '<text transform="rotate(-90 5 5)" stroke="#000000" xml:space="preserve"><tspan x="5" y="5" font-family="Cousine" font-size="20">Count</tspan></text>',
    );
  });
});

describe('imported plot fixtures', () => {
  for (const f of FIXTURES)
    it(`${f.name}: text in bundled fonts, outlines match the text layout`, async () => {
      const svg = await f.load();
      const parsed = sanitizeSvg(svg);
      // The stored asset keeps the plot's own font names (identifiable for restyling).
      expect(svg).toMatch(/font-family="[^"]*(DejaVu|Arial|Helvetica|Liberation)/);

      const asText = svgImportNode(svg, 100, 100, 'text');
      const outline = svgImportNode(svg, 100, 100, 'outline');
      const texts = [...walkNodes(asText)].filter((n) => n.tag === 'text');
      expect(texts.length).toBe([...walkNodes(parsed.root)].filter((n) => n.tag === 'text').length);
      for (const n of walkNodes(asText)) {
        expect(n.attrs['text-anchor']).toBeUndefined();
        if (n.tag === 'tspan')
          expect(['Arimo', 'Tinos', 'Cousine']).toContain(n.attrs['font-family']);
        else expect(n.attrs['font-family']).toBeUndefined();
      }
      for (const n of walkNodes(outline)) {
        expect(n.tag).not.toBe('text');
        expect(Object.keys(n.attrs).some((k) => k.startsWith('font-'))).toBe(false);
      }
      // Every tspan's glyphs appear, at its position, in the outline rendering.
      const outlineSvg = nodeToSvgString(outline);
      for (const n of walkNodes(asText))
        if (n.tag === 'tspan') {
          const glyphs = getFont(n.attrs['font-family'] === 'Tinos' ? 'tinos' : 'arimo', {
            bold: n.attrs['font-weight'] === 'bold',
            italic: n.attrs['font-style'] === 'italic',
          })
            .getPath(
              typeof n.children[0] === 'string' ? n.children[0] : '',
              Number(n.attrs['x']),
              Number(n.attrs['y']),
              Number(n.attrs['font-size']),
              OPTS,
            )
            .toPathData(2);
          expect(outlineSvg).toContain(`d="${glyphs}"`);
        }
      golden(`${f.name}.svg`, texts.map((t) => nodeToSvgString(t)).join('\n') + '\n');
    });
});
