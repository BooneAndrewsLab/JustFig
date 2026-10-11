import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
import { type Download, type Page, expect } from '@playwright/test';
import type * as Utif from 'utif';

/** UTIF is CommonJS; Playwright's ESM loader needs require for it. */
export const UTIF = createRequire(import.meta.url)('utif') as typeof Utif;

/**
 * Makes Save download the file even in Chromium, which otherwise saves in place
 * through showSaveFilePicker (note 38). Call before the page is (re)loaded.
 */
export async function downloadFallback(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showSaveFilePicker');
    Reflect.deleteProperty(window, 'showOpenFilePicker');
  });
}

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

/**
 * An icon's tile in the browser, found by searching (the browser shows one
 * category at a time; search reaches the whole library).
 */
export async function iconTile(page: Page, id: string, query: string) {
  const search = page.getByLabel('Search icons');
  await search.fill(query);
  const tile = page.locator(`.icon-tile[data-icon="${id}"]`);
  await expect(tile).toBeVisible();
  return tile;
}

/** Axe's serious and critical WCAG 2.1 A/AA problems on the page, or inside `include` (note 09). */
export async function audit(page: Page, include?: string) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) b = b.include(include);
  const r = await b.analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return bad.map(
    (v) =>
      `${v.id}: ${v.help} — ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 5)
        .join(' | ')}`,
  );
}
