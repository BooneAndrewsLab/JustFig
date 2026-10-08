import { createRequire } from 'node:module';
import { type Download, type Page, expect } from '@playwright/test';
import type * as Utif from 'utif';

/** UTIF is CommonJS; Playwright's ESM loader needs require for it. */
export const UTIF = createRequire(import.meta.url)('utif') as typeof Utif;

/** The page's on-screen box (the outline rect over the page). */
export async function pageBox(page: Page) {
  const b = await page.getByTestId('page').boundingBox();
  if (!b) throw new Error('page not visible');
  return b;
}

/** Exports through the dialog and returns the download. */
export async function exportVia(
  page: Page,
  format: 'SVG' | 'PDF' | 'PNG' | 'TIFF',
  opts: { dpi?: number } = {},
): Promise<Download> {
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export figure' });
  await dialog.locator(`input[name="format"][value="${format.toLowerCase()}"]`).check();
  if (opts.dpi !== undefined) await dialog.locator('#dpi').selectOption(String(opts.dpi));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: `Export ${format}` }).click(),
  ]);
  await expect(dialog).toBeHidden();
  return download;
}

/** DPI from a PNG's pHYs chunk, or null. */
export function readDpi(png: Buffer): number | null {
  let at = 8;
  while (at + 12 <= png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    if (type === 'pHYs' && png[at + 16] === 1) return Math.round(png.readUInt32BE(at + 8) * 0.0254);
    if (type === 'IEND') break;
    at += 12 + len;
  }
  return null;
}
