/** Editing interactions: handles, snapping, grouping, the pen, files, import, attribution, autosave. */
import { readFileSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

import { iconTile, pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;
const OUT = process.env['E2E_OUT'];

async function at(page: Page, x: number, y: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

async function rect(page: Page, x: number, y: number, w: number, h: number) {
  await page.keyboard.press('r');
  await drag(page, await at(page, x, y), await at(page, x + w, y + h));
}

const field = (page: Page, name: string) => page.locator('.side').getByLabel(name, { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('Same width gives each selected object the first width in one step', async ({ page }) => {
  await rect(page, 20, 20, 100, 50);
  await rect(page, 20, 120, 40, 40);
  const layer = (n: number) => page.locator('.layers .item .name', { hasText: 'Rect' }).nth(n);
  // Layers list the top-most first: the second rect is first in the list.
  await layer(1).click();
  const w = await field(page, 'W').inputValue();
  await layer(0).click();
  const w0 = await field(page, 'W').inputValue();
  expect(w0).not.toBe(w);
  await layer(1).click();
  await layer(0).click({ modifiers: ['Shift'] });
  await expect(page.locator('.status')).toContainText('2 selected');
  await page.getByRole('button', { name: 'Same width' }).click();
  await layer(0).click();
  expect(await field(page, 'W').inputValue()).toBe(w);
  await page.keyboard.press('Control+z');
  expect(await field(page, 'W').inputValue()).toBe(w0);
});

test('resize and rotate handles, with one undo step per drag', async ({ page }) => {
  await rect(page, 50, 50, 100, 50);
  const w0 = Number(await field(page, 'W').inputValue());
  const se = page.locator('[data-handle="se"]');
  const box = await se.boundingBox();
  if (!box) throw new Error('no handle');
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, c, { x: c.x + 60, y: c.y + 30 });
  const w1 = Number(await field(page, 'W').inputValue());
  expect(w1).toBeGreaterThan(w0);
  const rot = page.locator('[data-handle="rotate"]');
  const rb = await rot.boundingBox();
  if (!rb) throw new Error('no rotate handle');
  const r0 = { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 };
  await page.keyboard.down('Shift');
  await drag(page, r0, { x: r0.x + 200, y: r0.y + 120 });
  await page.keyboard.up('Shift');
  const rotation = Number(await field(page, 'Rotate °').inputValue());
  expect(rotation % 15).toBe(0);
  expect(rotation).not.toBe(0);
  if (OUT) await page.screenshot({ path: `${OUT}/handles-${test.info().project.name}.png` });
  await page.keyboard.press('Control+z');
  expect(Number(await field(page, 'Rotate °').inputValue())).toBe(0);
  await page.keyboard.press('Control+z');
  expect(Number(await field(page, 'W').inputValue())).toBe(w0);
});

test('moving snaps to another object and shows a guide; group and ungroup', async ({ page }) => {
  await rect(page, 40, 40, 60, 40);
  // Narrow, so only the left edges can line up (its centre and right edge stay far from
  // the first rect's edges).
  await rect(page, 200, 120, 20, 40);
  // Drag the second so its left edge lands ~2 pt from the first's left edge.
  const from = await at(page, 210, 140);
  const to = await at(page, 52, 140);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  // A guide line (zero-width when vertical, so counted rather than 'visible').
  await expect(page.locator('line[stroke="#d55e00"]')).not.toHaveCount(0);
  await page.mouse.up();
  const xMoved = await field(page, 'X').inputValue();
  // Snapped: the moved rect's X equals the first rect's X (the bottom one in the layer list).
  await page.locator('.layers .item .name', { hasText: 'Rect' }).last().click();
  expect(await field(page, 'X').inputValue()).toBe(xMoved);
  await page.keyboard.press('Control+a');
  await expect(page.locator('.status')).toContainText('2 selected');
  await page.keyboard.press('Control+g');
  await expect(page.locator('.layers .item .name', { hasText: 'Group' })).toHaveCount(1);
  await page.keyboard.press('Control+Shift+g');
  await expect(page.locator('.layers .item .name', { hasText: 'Group' })).toHaveCount(0);
});

test('pen draws a curved path; Enter finishes it', async ({ page }) => {
  await page.keyboard.press('p');
  const a = await at(page, 40, 200);
  await page.mouse.click(a.x, a.y);
  const mid = await at(page, 120, 120);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 40, mid.y, { steps: 4 });
  await page.mouse.up();
  const b = await at(page, 200, 200);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Enter');
  await expect(page.locator('.layers .item .name', { hasText: 'Path' })).toHaveCount(1);
  await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
});

test('save, open, import an SVG, attribution, and autosave survive a reload', async ({
  page,
}, info) => {
  await (await iconTile(page, 'petri-dish', 'petri dish')).click();
  await rect(page, 10, 10, 30, 30);
  const svgPath = info.outputPath('shape.svg');
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#009e73"/><script>alert(1)</script></svg>',
  );
  await page.getByTestId('import-input').setInputFiles(svgPath);
  await expect(page.locator('.layers .item .name', { hasText: 'Image' })).toHaveCount(1);
  await expect(page.locator('.status')).toContainText('Imported with changes');

  // Attribution: the credit line names the house icon; add it as text.
  await page.getByRole('button', { name: 'Attribution' }).click();
  const dialog = page.getByRole('dialog', { name: 'Attribution and licences' });
  await expect(dialog.getByTestId('credit-line')).toContainText('House icons');
  await expect(dialog.getByLabel(/Include the credit line/)).toBeChecked();
  await dialog.getByRole('button', { name: 'Add as text object' }).click();
  await expect(page.locator('.layers .item .name', { hasText: 'Created with' })).toHaveCount(1);

  // Save downloads a figure file; opening it brings the same objects back.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save' }).click(),
  ]);
  const file = info.outputPath('fig.jfig');
  await download.saveAs(file);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
    format: 'justfig',
    schemaVersion: 1,
  });
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'New' }).click();
  await expect(page.locator('.layers .layer-head ~ ul .name')).toHaveCount(0);
  await page.getByTestId('open-input').setInputFiles(file);
  await expect(page.locator('.layers .layer-head ~ ul .name')).toHaveCount(4);

  // Autosave: a reload restores the figure from IndexedDB.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('.layers .layer-head ~ ul .name')).toHaveCount(4);
});

test('copy, paste and duplicate', async ({ page }) => {
  await rect(page, 30, 30, 40, 40);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(2);
  await page.keyboard.press('Control+d');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(3);
  await page.keyboard.press('Delete');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(2);
});
