/**
 * Roles of the text and strokes inside imported plots (note 16), on the real
 * matplotlib, ggplot2 and R fixtures, and restyling them.
 */
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { importPdf, importSvgText } from '@/io/import';
import { layoutImportedTexts } from '@/render/importedText';
import { nodeToSvgString, walkNodes } from '@/render/svgNode';
import { loadTestFonts } from '@/test/fonts';

import { plotParts, restylePlot } from './plotRoles';
import { sanitizeSvg } from './sanitize';

beforeAll(loadTestFonts);

function svgFixture(name: string): string {
  const text = readFileSync(new URL(`./fixtures/${name}.svg`, import.meta.url), 'utf8');
  const imp = importSvgText(text, `${name}.svg`);
  if (imp.asset.kind !== 'svgImport') throw new Error('not imported');
  return imp.asset.svg;
}

async function pdfFixture(name: string): Promise<string> {
  const bytes = new Uint8Array(
    readFileSync(new URL(`../pdf/fixtures/${name}.pdf`, import.meta.url)),
  );
  const imp = await importPdf(bytes, `${name}.pdf`, () => Promise.resolve(1));
  if (imp?.asset.kind !== 'svgImport') throw new Error('not imported');
  return imp.asset.svg;
}

const textOf = (n: { children: readonly unknown[] }): string =>
  n.children
    .map((c) => (typeof c === 'string' ? c : textOf(c as { children: unknown[] })))
    .join('');

function summary(svg: string) {
  const s = sanitizeSvg(svg);
  const p = plotParts(s.root, s.viewBox);
  const count = (role: string) => p.strokes.filter((x) => x.role === role).length;
  return {
    ticks: p.texts.filter((t) => t.role === 'tick').map((t) => textOf(t.node)),
    labels: p.texts.filter((t) => t.role === 'label').map((t) => textOf(t.node)),
    strokes: { tick: count('tick'), axis: count('axis'), data: count('data') },
  };
}

describe('plot roles', () => {
  it('matplotlib: ticks touch the spines; tick labels sit at their free ends', () => {
    for (const name of ['matplotlib-paths', 'matplotlib-text']) {
      expect(summary(svgFixture(name))).toEqual({
        ticks: ['0', '1', '2', '3', '1', '2', '3', '4'],
        labels: ['Time (h)', 'Signal (a.u.)', 'Growth', 'Wild type'],
        // 4 spines; the data line, its 4 markers, the legend frame, handle and marker.
        strokes: { tick: 8, axis: 4, data: 8 },
      });
    }
  });

  it('svglite: grid lines are axis lines, ticks touch the panel background', () => {
    expect(summary(svgFixture('r-svglite'))).toEqual({
      ticks: ['2', '3', '4', '5', '1', '2', '3', '4'],
      labels: ['Dose (mg)', 'Response'],
      strokes: { tick: 8, axis: 14, data: 4 },
    });
  });

  it('R cairo svg: strokes classified even though its text is outlines', () => {
    expect(summary(svgFixture('r-cairo')).strokes).toEqual({ tick: 8, axis: 14, data: 4 });
  });

  it('PDFs: matplotlib, R pdf() with rotated y tick labels, ggplot2 cairo_pdf()', async () => {
    expect(summary(await pdfFixture('matplotlib-type3'))).toEqual({
      ticks: ['0.0', '2.5', '5.0', '7.5', '10.0', '−1.0', '−0.5', '0.0', '0.5', '1.0'],
      labels: ['Time (s)', 'Signal μV', 'Two waves', 'sin', 'cos'],
      strokes: { tick: 10, axis: 4, data: 46 },
    });
    expect(summary(await pdfFixture('r-pdf'))).toEqual({
      ticks: ['2', '4', '6', '8', '10', '0', '5', '15', '25'],
      labels: ['Base R', 'Dose (mg)', 'Response', 'obs', 'fit'],
      // Two axis lines and the box; the dashed legend line is data.
      strokes: { tick: 11, axis: 3, data: 11 },
    });
    expect(summary(await pdfFixture('r-cairo'))).toEqual({
      ticks: ['0', '2', '4', '6', 'ctrl', 'drug A', 'drug B'],
      labels: ['Treatment', 'Expression', 'ggplot2'],
      strokes: { tick: 7, axis: 12, data: 0 },
    });
  });

  it('a legend made of equal short lines is not ticks', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
      '<path d="M10 10L30 10" stroke="#f00"/><path d="M10 20L30 20" stroke="#00f"/>' +
      '<text x="35" y="13" font-size="8">a</text><text x="35" y="23" font-size="8">b</text></svg>';
    expect(summary(svg)).toEqual({
      ticks: [],
      labels: ['a', 'b'],
      strokes: { tick: 0, axis: 0, data: 2 },
    });
  });

  it('tick labels keep the edge facing their tick', async () => {
    const keeps = (svg: string) => {
      const s = sanitizeSvg(svg);
      return plotParts(s.root, s.viewBox)
        .texts.filter((t) => t.role === 'tick')
        .map((t) => t.keep);
    };
    // matplotlib: x tick labels hang from their top, y tick labels sit beside at their middle.
    expect(keeps(svgFixture('matplotlib-paths'))).toEqual([
      ...Array<string>(4).fill('top'),
      ...Array<string>(4).fill('middle'),
    ]);
    // R pdf(): y tick labels are rotated with their baseline towards the axis.
    expect(keeps(await pdfFixture('r-pdf'))).toEqual([
      ...Array<string>(5).fill('top'),
      ...Array<string>(4).fill('baseline'),
    ]);
  });
});

describe('restylePlot', () => {
  it('writes sizes and fonts on labels in their own units and widths on strokes', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<g transform="scale(2)"><text x="5" y="5" font-size="4" font-family="DejaVu Sans">' +
      'a<tspan font-size="3" font-family="Courier">b</tspan><tspan font-size="3" dy="-1">2</tspan></text>' +
      '<path d="M0 0L10 0" stroke="#000" stroke-dasharray="2 1"/></g></svg>';
    const s = sanitizeSvg(svg);
    const parts = plotParts(s.root, s.viewBox);
    expect(parts.texts[0]?.size).toBe(8);
    expect(parts.strokes[0]?.width).toBe(2);
    const out = restylePlot(s.root, parts, {
      text: () => ({ font: 'tinos', size: 12 }),
      stroke: () => 4,
    });
    const str = nodeToSvgString(out);
    expect(str).toContain('<text x="5" y="5" font-size="6" font-family="Tinos">');
    // The tspan keeps its proportion and loses its own family.
    expect(str).toContain('<tspan font-size="4.5">b</tspan>');
    // A script's baseline shift scales with it.
    expect(str).toContain('<tspan dy="-1.5" font-size="4.5">2</tspan>');
    expect(str).toContain('stroke-dasharray="4 2" stroke-width="2"');
    // Unchanged requests give back the same tree.
    expect(restylePlot(s.root, parts, { text: () => null, stroke: () => null })).toBe(s.root);
  });

  it('restyled plots re-sanitise to themselves and render only bundled fonts', () => {
    const svg = svgFixture('matplotlib-paths');
    const s = sanitizeSvg(svg);
    const parts = plotParts(s.root, s.viewBox);
    const out = restylePlot(s.root, parts, {
      text: (t) => (t.role === 'tick' ? { font: 'cousine', size: 7 } : null),
      stroke: (st) => (st.role === 'data' ? null : 0.5),
    });
    const str = nodeToSvgString({
      ...out,
      attrs: { xmlns: 'http://www.w3.org/2000/svg', ...out.attrs },
    });
    const again = sanitizeSvg(str);
    expect(
      nodeToSvgString({
        ...again.root,
        attrs: { xmlns: 'http://www.w3.org/2000/svg', ...again.root.attrs },
      }),
    ).toBe(str);
    const re = plotParts(again.root, again.viewBox);
    expect(
      re.texts.filter((t) => t.role === 'tick').every((t) => t.font === 'cousine' && t.size === 7),
    ).toBe(true);
    expect(re.texts.find((t) => t.role === 'label')?.font).toBe('arimo');
    expect(re.strokes.filter((x) => x.role !== 'data').every((x) => x.width === 0.5)).toBe(true);
    expect(re.strokes.find((x) => x.role === 'data')?.width).toBe(1.5);
    // The roles survive the restyle.
    expect(re.texts.map((t) => t.role)).toEqual(parts.texts.map((t) => t.role));
    const laid = layoutImportedTexts(again.root, 'text');
    const families = new Set(
      [...walkNodes(laid)].map((n) => n.attrs['font-family']).filter((f) => f !== undefined),
    );
    expect([...families].sort()).toEqual(['Arimo', 'Cousine']);
  });

  it('a resized tick label keeps its facing edge, and every label keeps its role', () => {
    const svg = svgFixture('matplotlib-paths');
    const s = sanitizeSvg(svg);
    const parts = plotParts(s.root, s.viewBox);
    for (const size of [2, 5, 30]) {
      const out = restylePlot(s.root, parts, { text: () => ({ size }) });
      const str = nodeToSvgString(out);
      // y tick label "1": baseline 130.022 at 10, middle kept (0.36 em).
      expect(str).toContain(
        `y="${String(Math.round((130.022 + (size - 10) * 0.36) * 1000) / 1000)}"`,
      );
      // x tick label "0": baseline 145.597 at 10, top kept (0.72 em).
      expect(str).toContain(
        `y="${String(Math.round((145.597 + (size - 10) * 0.72) * 1000) / 1000)}"`,
      );
      const again = sanitizeSvg(str);
      const re = plotParts(again.root, again.viewBox);
      expect(re.texts.map((t) => t.role)).toEqual(parts.texts.map((t) => t.role));
      expect(re.strokes.map((t) => t.role)).toEqual(parts.strokes.map((t) => t.role));
    }
  });
});
