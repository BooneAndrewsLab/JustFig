// @vitest-environment jsdom
/**
 * The week-1 svg2pdf spike (note 03, "Spike findings"), kept as a
 * regression test: the torture fixture through jsPDF + svg2pdf, checked
 * with pdf-lib.
 */
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadTestFonts } from '@/test/fonts';
import { stubDom } from '@/test/domStubs';

import { buildTorture } from './fixtures/torture';
import { exportPdf } from './pdf';

beforeAll(async () => {
  stubDom();
  await loadTestFonts();
});

async function pdfOf(textMode: 'text' | 'outline') {
  const fig = buildTorture();
  const bytes = await exportPdf(
    fig,
    fig.doc.pages,
    { textMode, footer: true, background: true },
    '0.0.0',
  );
  if (process.env['SPIKE_OUT'])
    writeFileSync(`${process.env['SPIKE_OUT']}/torture.${textMode}.pdf`, bytes);
  return { bytes, pdf: await PDFDocument.load(bytes) };
}

/** Embedded font files (one per family and style), and counts of image XObjects. */
function inspect(pdf: PDFDocument): { fonts: string[]; images: number } {
  const fonts: string[] = [];
  let images = 0;
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    const type = dict.get(PDFName.of('Type'));
    const sub = dict.get(PDFName.of('Subtype'));
    if (type === PDFName.of('FontDescriptor')) {
      const name = dict.get(PDFName.of('FontName'));
      const file = dict.get(PDFName.of('FontFile2'));
      if (name && file) fonts.push(name.toString());
    }
    if (sub === PDFName.of('Image')) images += 1;
  }
  return { fonts: fonts.sort(), images };
}

/** BaseFont names of the font resources the content streams select with Tf (one per style). */
function fontsUsed(bytes: Uint8Array): string[] {
  const text = Buffer.from(bytes).toString('latin1');
  const names = new Map<string, string>();
  // jsPDF writes `/F<n> <ref> 0 R` in the font resource dict and `/BaseFont /<name>` per font object.
  for (const m of text.matchAll(/(\d+) 0 obj\s*<<[^>]*?\/BaseFont \/([^\s/]+)/g))
    names.set(m[1] ?? '', m[2] ?? '');
  const keys = new Map<string, string>();
  for (const m of text.matchAll(/\/(F\d+) (\d+) 0 R/g))
    keys.set(m[1] ?? '', names.get(m[2] ?? '') ?? '?');
  const used = new Map<string, string>();
  for (const m of contentStreams(bytes)
    .join('\n')
    .matchAll(/\/(F\d+) [\d.]+ Tf/g))
    used.set(m[1] ?? '', keys.get(m[1] ?? '') ?? '?');
  // One entry per font resource (style), named by its family.
  return [...used.values()];
}

function contentStreams(bytes: Uint8Array): string[] {
  const text = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    const raw = Buffer.from(text.slice(start, end), 'latin1');
    try {
      out.push(inflateSync(raw).toString('latin1'));
    } catch {
      out.push(raw.toString('latin1'));
    }
  }
  return out;
}

describe('PDF export (svg2pdf spike)', () => {
  it('has the page size in points and embeds the fonts used', async () => {
    const { pdf, bytes } = await pdfOf('text');
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(841.89, 1);
    // The footer strip adds to the page height.
    expect(page.getHeight()).toBeGreaterThan(595.28);
    const { fonts, images } = inspect(pdf);
    expect(fonts.length).toBeGreaterThanOrEqual(6);
    expect(fonts.some((f) => f.includes('Arimo'))).toBe(true);
    expect(fonts.some((f) => f.includes('Tinos'))).toBe(true);
    expect(fonts.some((f) => f.includes('Cousine'))).toBe(true);
    // Text is drawn only with the embedded fonts, never a standard-14 fallback.
    const used = fontsUsed(bytes);
    expect(used.length).toBeGreaterThanOrEqual(6);
    expect(used.every((f) => /Arimo|Tinos|Cousine/.test(f))).toBe(true);
    // Only the fixture's one PNG is a raster image; everything else is vector.
    expect(images).toBe(1);
    expect(bytes.length).toBeLessThan(2_000_000);
  });

  it('multiplies nested opacity (svg2pdf does not)', async () => {
    const { bytes } = await pdfOf('outline');
    const gs =
      Buffer.from(bytes)
        .toString('latin1')
        .match(/\/ca [\d.]+/g) ?? [];
    // 0.5 group × 0.8 child = 0.4 must appear; 0.8 alone must not.
    expect(gs).toContain('/ca 0.4');
    expect(gs).not.toContain('/ca 0.8');
  });

  it('needs no fonts when text is outlined', async () => {
    const { pdf } = await pdfOf('outline');
    expect(inspect(pdf).fonts).toEqual([]);
    expect(inspect(pdf).images).toBe(1);
  });
});
