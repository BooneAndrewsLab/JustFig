/**
 * The export torture suite (note 03), per browser engine: the torture
 * fixture opened through the UI and exported.
 *  - PNG vs the golden (rendered by Chromium; other engines anti-alias
 *    differently, hence a small tolerance).
 *  - PDF structure with pdf-lib: page size, embedded fonts, one raster image.
 *  - PDF rendered by pdf.js in the page vs the PNG.
 *  - TIFF decoded, DPI and size checked.
 * UPDATE_GOLDEN=1 rewrites e2e/golden/torture-150.png (from Chromium only).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import { UTIF, exportVia, readDpi } from './helpers';

const root = process.cwd();
const FIXTURE = join(root, 'src/export/fixtures/torture.jfig');
const GOLDEN = join(root, 'e2e/golden/torture-150.png');
const OUT = process.env['E2E_OUT'];

function diff(a: PNG, b: PNG): number {
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  const n = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.2 });
  return n / (a.width * a.height);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await page.getByTestId('open-input').setInputFiles(FIXTURE);
  await expect(page.locator('.topbar .title')).toHaveValue('Torture');
});

test('PNG export matches the golden image', async ({ page }, info) => {
  const download = await exportVia(page, 'PNG', { dpi: 150 });
  const bytes = readFileSync(await download.path());
  expect(readDpi(bytes)).toBe(150);
  const png = PNG.sync.read(bytes);
  if (OUT) writeFileSync(`${OUT}/torture-${info.project.name}.png`, bytes);
  if (process.env['UPDATE_GOLDEN'] === '1' && info.project.name === 'chromium') {
    mkdirSync(join(root, 'e2e/golden'), { recursive: true });
    writeFileSync(GOLDEN, bytes);
  }
  if (!existsSync(GOLDEN))
    throw new Error('No golden image: run once with UPDATE_GOLDEN=1 in Chromium');
  const golden = PNG.sync.read(readFileSync(GOLDEN));
  const d = diff(golden, png);
  info.annotations.push({ type: 'pixel diff vs golden', description: `${(d * 100).toFixed(3)}%` });
  expect(d).toBeLessThan(0.005);
});

test('PDF export: page size, embedded fonts, no rasterised vectors; pdf.js render matches the PNG', async ({
  page,
}, info) => {
  const pdfBytes = readFileSync(await (await exportVia(page, 'PDF')).path());
  const pdf = await PDFDocument.load(pdfBytes);
  const p0 = pdf.getPage(0);
  expect(p0.getWidth()).toBeCloseTo(841.89, 1);
  expect(p0.getHeight()).toBeGreaterThan(595.28);
  let fonts = 0;
  let images = 0;
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    if (
      dict.get(PDFName.of('Type')) === PDFName.of('FontDescriptor') &&
      dict.get(PDFName.of('FontFile2'))
    )
      fonts += 1;
    if (dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) images += 1;
  }
  expect(fonts).toBeGreaterThanOrEqual(6);
  // The fixture's one PNG; everything else stayed vector.
  expect(images).toBe(1);

  // The legacy build: pdf.js 6's modern build uses syntax Playwright's WebKit can't
  // parse ("Importing a module script failed", #20); the legacy one works everywhere.
  // Render with pdf.js, served from node_modules, inside this engine.
  // Hand the sources to the page as blob URLs: Playwright's WebKit does not deliver
  // routed responses to module imports (#20), and blobs need no routing.
  const libDir = join(root, 'node_modules/pdfjs-dist/legacy/build');
  const pdfjsSrc = readFileSync(join(libDir, 'pdf.min.mjs'), 'utf8');
  const workerSrc = readFileSync(join(libDir, 'pdf.worker.min.mjs'), 'utf8');
  const dataUrl = await page.evaluate(
    async ({ b64, lib, worker }: { b64: string; lib: string; worker: string }) => {
      const blobUrl = (src: string) =>
        URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const pdfjs = (await import(/* @vite-ignore */ blobUrl(lib))) as {
        GlobalWorkerOptions: { workerSrc: string };
        getDocument: (src: { data: Uint8Array }) => {
          promise: Promise<{
            getPage: (n: number) => Promise<{
              getViewport: (o: { scale: number }) => { width: number; height: number };
              render: (o: {
                canvasContext: CanvasRenderingContext2D;
                viewport: unknown;
                background?: string;
              }) => { promise: Promise<void> };
            }>;
          }>;
        };
      };
      pdfjs.GlobalWorkerOptions.workerSrc = blobUrl(worker);
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data }).promise;
      const pg = await doc.getPage(1);
      const viewport = pg.getViewport({ scale: 150 / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      await pg.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
      return canvas.toDataURL('image/png');
    },
    { b64: Buffer.from(pdfBytes).toString('base64'), lib: pdfjsSrc, worker: workerSrc },
  );
  const rendered = PNG.sync.read(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
  if (OUT) writeFileSync(`${OUT}/torture-pdfjs-${info.project.name}.png`, PNG.sync.write(rendered));
  const pngBytes = readFileSync(await (await exportVia(page, 'PNG', { dpi: 150 })).path());
  const d = diff(PNG.sync.read(pngBytes), rendered);
  info.annotations.push({ type: 'pdf.js vs PNG', description: `${(d * 100).toFixed(3)}%` });
  // Real text (PDF) against outlined text (PNG) and two rasterisers: a looser bound.
  expect(d).toBeLessThan(0.02);
});

test('TIFF export: LZW, DPI and size', async ({ page }) => {
  const tif = readFileSync(await (await exportVia(page, 'TIFF', { dpi: 150 })).path());
  const ifd = UTIF.decode(tif)[0];
  if (!ifd) throw new Error('no IFD');
  expect(ifd['t259']).toEqual([5]);
  expect(ifd['t282']).toEqual([150]);
  expect(ifd['t296']).toEqual([2]);
  UTIF.decodeImage(tif, ifd);
  const golden = existsSync(GOLDEN) ? PNG.sync.read(readFileSync(GOLDEN)) : null;
  if (golden) {
    expect([ifd.width, ifd.height]).toEqual([golden.width, golden.height]);
    const rgba = UTIF.toRGBA8(ifd);
    const d = pixelmatch(golden.data, rgba, undefined, golden.width, golden.height, {
      threshold: 0.2,
    });
    expect(d / (golden.width * golden.height)).toBeLessThan(0.005);
  }
});

// Issue 16: above the canvas cap (16.7 Mpx) the page is drawn in bands and stitched.
test('PNG and TIFF export above the canvas cap are tiled and match the 150 dpi golden', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const golden = PNG.sync.read(readFileSync(GOLDEN));
  const bytes = readFileSync(await (await exportVia(page, 'PNG', { dpi: 600 })).path());
  expect(readDpi(bytes)).toBe(600);
  const big = PNG.sync.read(bytes);
  expect(big.width * big.height).toBeGreaterThan(16_777_216);
  expect(Math.abs(big.width - golden.width * 4)).toBeLessThanOrEqual(2);
  expect(Math.abs(big.height - golden.height * 4)).toBeLessThanOrEqual(2);
  // Box-filter down to the golden's size: bands must meet without seams.
  const small = new PNG({ width: golden.width, height: golden.height });
  for (let y = 0; y < golden.height; y += 1)
    for (let x = 0; x < golden.width; x += 1)
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let dy = 0; dy < 4; dy += 1)
          for (let dx = 0; dx < 4; dx += 1)
            sum += big.data[((y * 4 + dy) * big.width + x * 4 + dx) * 4 + c] ?? 0;
        small.data[(y * golden.width + x) * 4 + c] = Math.round(sum / 16);
      }
  expect(diff(golden, small)).toBeLessThan(0.02);

  const tif = readFileSync(await (await exportVia(page, 'TIFF', { dpi: 600 })).path());
  const ifd = UTIF.decode(tif)[0];
  if (!ifd) throw new Error('no IFD');
  expect([ifd['t256'], ifd['t257']]).toEqual([[big.width], [big.height]]);
});
