/** Export one file per panel (issue 5): a zip of cropped files named by panel label. */
import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';

import { pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function drawPanel(page: Page, from: [number, number], to: [number, number]) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  await page.keyboard.press('f');
  await page.mouse.move(b.x + from[0] * k, b.y + from[1] * k);
  await page.mouse.down();
  await page.mouse.move(b.x + to[0] * k, b.y + to[1] * k, { steps: 6 });
  await page.mouse.up();
}

async function openExport(page: Page) {
  await page.getByRole('button', { name: 'Export…' }).click();
  return page.getByRole('dialog', { name: 'Export figure' });
}

test('one file per panel is disabled without panels, with the reason', async ({ page }) => {
  await page.goto('./');
  const dialog = await openExport(page);
  await expect(dialog.getByLabel('One file per panel, in a zip')).toBeDisabled();
  await expect(dialog.getByText('this page has no panels')).toBeVisible();
});

test('exports a zip with one cropped file per panel', async ({ page }) => {
  await page.goto('./');
  await drawPanel(page, [10, 10], [200, 190]);
  await drawPanel(page, [260, 10], [450, 190]);
  const dialog = await openExport(page);
  await dialog.locator('input[name="format"][value="svg"]').check();
  const box = dialog.getByLabel('One file per panel, in a zip');
  await box.focus();
  await page.keyboard.press('Space'); // reachable and operable from the keyboard
  await expect(box).toBeChecked();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export SVG panels' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-panels\.zip$/);
  const files = unzipSync(readFileSync(await download.path()));
  const names = Object.keys(files).filter((n) => n.endsWith('.svg'));
  expect(names.map((n) => n.replace(/^.*_/, '')).sort()).toEqual(['A.svg', 'B.svg']);
  const svg = new TextDecoder().decode(files[names[0] ?? '']);
  const vb = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)?.slice(1).map(Number);
  // Drawn by mouse, so near (10, 10) and 190 × 180 pt, and nothing like the whole page.
  expect(vb?.[2]).toBeGreaterThan(150);
  expect(vb?.[2]).toBeLessThan(230);
  expect(vb?.[3]).toBeGreaterThan(140);
  expect(vb?.[3]).toBeLessThan(220);
});

test('exports panels as PNG through the band path', async ({ page }) => {
  await page.goto('./');
  await drawPanel(page, [10, 10], [200, 190]);
  const dialog = await openExport(page);
  await dialog.locator('input[name="format"][value="png"]').check();
  await dialog.getByLabel('One file per panel, in a zip').check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export PNG panels' }).click(),
  ]);
  const files = unzipSync(readFileSync(await download.path()));
  const png = Object.entries(files).find(([n]) => n.endsWith('_A.png'))?.[1];
  expect(png).toBeDefined();
  const buf = Buffer.from(png ?? []);
  // About 190 × 180 pt at 300 dpi (drawn by mouse), not the page's 2161 px.
  expect(Math.abs(buf.readUInt32BE(16) - (190 * 300) / 72)).toBeLessThan(150);
  expect(Math.abs(buf.readUInt32BE(20) - (180 * 300) / 72)).toBeLessThan(150);
});

test('exports panels as PDFs sized to the panel', async ({ page }) => {
  await page.goto('./');
  await drawPanel(page, [10, 10], [200, 190]);
  const dialog = await openExport(page);
  await dialog.getByLabel('One file per panel, in a zip').check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export PDF panels' }).click(),
  ]);
  const files = unzipSync(readFileSync(await download.path()));
  const pdf = Object.entries(files).find(([n]) => n.endsWith('_A.pdf'))?.[1];
  expect(pdf).toBeDefined();
  const doc = await PDFDocument.load(pdf ?? new Uint8Array());
  const { width, height } = doc.getPage(0).getSize();
  expect(width).toBeGreaterThan(150);
  expect(width).toBeLessThan(230);
  expect(height).toBeLessThan(220);
});
