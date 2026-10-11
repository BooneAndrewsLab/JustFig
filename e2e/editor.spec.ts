/**
 * The Phase 1 definition of done, end to end: build a 2×2 multi-panel
 * figure with stub icons, arrows and sub/sup labels, and export it to
 * SVG, PDF, PNG and TIFF.
 */
import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

import { UTIF, exportVia, iconTile, pageBox, readDpi } from './helpers';

/** Page size of the default preset (Nature, 2 columns), points. */
const PAGE_W = (183 / 25.4) * 72;

async function toScreen(page: Page, x: number, y: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test('builds a 2×2 figure with icons, arrows and sub/sup labels, and exports all four formats', async ({
  page,
}) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  const canvas = page.getByTestId('canvas');

  // Four panels, lettered A–D in reading order.
  const cells: [number, number][] = [
    [10, 10],
    [265, 10],
    [10, 205],
    [265, 205],
  ];
  for (const [x, y] of cells) {
    await page.keyboard.press('f');
    await drag(page, [x, y], [x + 240, y + 180]);
  }
  await expect(page.locator('.layers .item .name', { hasText: 'Panel' })).toHaveCount(4);

  // An icon in each panel, dropped from the browser.
  const tiles: [string, string][] = [
    ['petri-dish', 'petri dish'],
    ['microcentrifuge-tube', 'eppendorf'],
    ['mouse', 'mouse'],
    ['hi-dna', 'dna'],
  ];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = cells[i] ?? [0, 0];
    const at = await toScreen(page, x + 70, y + 90);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    const [id, query] = tiles[i] ?? ['', ''];
    await (
      await iconTile(page, id, query)
    ).dragTo(canvas, {
      targetPosition: { x: at.x - box.x, y: at.y - box.y },
    });
  }

  // Arrows: one plain, one changed to an inhibition bar in the Inspector.
  await page.keyboard.press('a');
  await drag(page, [110, 100], [200, 100]);
  await page.keyboard.press('a');
  await drag(page, [365, 100], [455, 100]);
  await page.getByLabel('End', { exact: true }).selectOption('bar');

  // A label with a subscript and a superscript.
  await page.keyboard.press('t');
  const t = await toScreen(page, 120, 300);
  await page.mouse.click(t.x, t.y);
  const area = page.locator('.text-editor textarea');
  await expect(area).toBeFocused();
  await page.keyboard.type('H');
  await page.keyboard.press('Control+=');
  await page.keyboard.type('2');
  await page.keyboard.press('Control+=');
  await page.keyboard.type('O + Ca');
  await page.keyboard.press('Control+Shift+=');
  await page.keyboard.type('2+');
  await page.keyboard.press('Escape');

  // SVG: real text with the sub/sup as smaller tspans, four panel labels, icons recolourable.
  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  for (const l of ['A', 'B', 'C', 'D']) expect(svg).toContain(`>${l}</tspan>`);
  expect(svg).toMatch(/font-size="6.5"[^>]*>2<\/tspan>/);
  expect(svg).toMatch(/font-size="6.5"[^>]*>2\+<\/tspan>/);
  expect(svg).toContain('Created with');
  expect(svg).not.toMatch(/<marker|foreignObject|baseline-shift/);

  // PDF: page in points (plus the credit footer, on by default), fonts embedded.
  const pdfBytes = readFileSync(await (await exportVia(page, 'PDF')).path());
  const pdf = await PDFDocument.load(pdfBytes);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(PAGE_W, 0);
  expect(pdf.getPage(0).getHeight()).toBeGreaterThan((140 / 25.4) * 72);
  expect(Buffer.from(pdfBytes).toString('latin1')).toContain('/FontFile2');

  // PNG at 300 dpi with the DPI recorded.
  const pngDownload = await exportVia(page, 'PNG');
  const png = readFileSync(await pngDownload.path());
  // E2E_OUT=dir keeps the exports for a look.
  const out = process.env['E2E_OUT'];
  if (out) await pngDownload.saveAs(`${out}/figure-${test.info().project.name}.png`);
  expect(readDpi(png)).toBe(300);
  expect(png.readUInt32BE(16)).toBe(Math.round((PAGE_W * 300) / 72));

  // TIFF at 300 dpi, LZW.
  const tif = readFileSync(await (await exportVia(page, 'TIFF')).path());
  const ifd = UTIF.decode(tif)[0];
  expect(ifd?.['t282']).toEqual([300]);
  expect(ifd?.['t259']).toEqual([5]);
  expect(ifd?.['t256']).toEqual([Math.round((PAGE_W * 300) / 72)]);
});

test('undo and redo walk back through the edits', async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await page.keyboard.press('r');
  await drag(page, [20, 20], [120, 80]);
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(1);
});
