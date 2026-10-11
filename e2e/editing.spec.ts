/** Editing interactions: handles, snapping, grouping, the pen, files, import, attribution, autosave. */
import { readFileSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

import { exportVia, fileMenu, iconTile, pageBox } from './helpers';

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
  await page.goto('./?editor');
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

test('Arrange in grid from the keyboard: lettered panels in reading order, one undo step', async ({
  page,
}) => {
  // Drawn out of order: the second rect is top-left, the first top-right, the third below.
  await rect(page, 200, 30, 60, 40);
  await rect(page, 20, 20, 80, 50);
  await rect(page, 60, 150, 50, 50);
  await page.keyboard.press('Control+a');
  await expect(page.locator('.status')).toContainText('3 selected');
  await expect(page.getByRole('button', { name: 'Arrange in grid…' })).toBeVisible();
  await page.keyboard.press('Shift+G');
  const dialog = page.getByRole('dialog', { name: 'Arrange in grid' });
  await expect(dialog).toBeVisible();
  const cols = dialog.getByLabel('Columns');
  await expect(cols).toBeFocused();
  await expect(cols).toHaveValue('3');
  await page.keyboard.press('ArrowDown');
  await expect(cols).toHaveValue('2');
  await expect(dialog.getByLabel('Rows')).toHaveValue('2');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const panels = page.locator('.layers .item .name', { hasText: 'Panel' });
  await expect(panels).toHaveCount(3);
  await expect(page.locator('.status')).toContainText('3 selected');
  // Fit to page width (2 pt in from each edge), 3 mm gutter on a 183 mm page: columns 89.3 mm
  // wide, the first at 0.7 mm, the second at 93 mm.
  // Layers list the top-most first; each panel took its rect's place in the stack.
  const xOf = async (n: number) => {
    await panels.nth(n).click();
    return Number(await field(page, 'X').inputValue());
  };
  expect(await xOf(1)).toBeCloseTo(0.7, 1); // the top-left rect
  expect(await xOf(2)).toBeCloseTo(93, 1); // the top-right rect
  expect(await xOf(0)).toBeCloseTo(0.7, 1); // the one below
  expect(Number(await field(page, 'W').inputValue())).toBeCloseTo(89.3, 1);
  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  for (const l of ['A', 'B', 'C']) expect(svg).toMatch(new RegExp(`>${l}</t`));
  await page.keyboard.press('Control+z');
  await expect(panels).toHaveCount(0);
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(3);
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
  await expect(page.locator('line[data-snap-guide]')).not.toHaveCount(0);
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
  // Chromium can save in place; this test is about the download fallback of other browsers.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showSaveFilePicker');
    Reflect.deleteProperty(window, 'showOpenFilePicker');
  });
  await page.goto('/?editor');
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
  await fileMenu(page, 'Attribution…');
  const dialog = page.getByRole('dialog', { name: 'Attribution and licences' });
  await expect(dialog.getByTestId('credit-line')).toContainText('House icons');
  await expect(dialog.getByLabel(/Include the credit line/)).toBeChecked();
  await dialog.getByRole('button', { name: 'Add as text object' }).click();
  await expect(page.locator('.layers .item .name', { hasText: 'Created with' })).toHaveCount(1);

  // Save downloads a figure file; opening it brings the same objects back.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const file = info.outputPath('fig.jfig');
  await download.saveAs(file);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
    format: 'justfig',
    schemaVersion: 2,
  });
  page.once('dialog', (d) => void d.accept());
  // Close the figure (Alt+W), so opening the file really reads it back rather than bringing its tab forward.
  await page.keyboard.press('Alt+w');
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

test('paste in place keeps the position', async ({ page }) => {
  await rect(page, 30, 30, 40, 40);
  const x = field(page, 'X');
  const x0 = await x.inputValue();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+Shift+v');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(2);
  await expect(x).toHaveValue(x0);
  await page.keyboard.press('Control+v');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(3);
  await expect(x).not.toHaveValue(x0);
});

test('swap positions and paste spacing are reachable from the keyboard', async ({ page }) => {
  await rect(page, 30, 30, 40, 40);
  await rect(page, 100, 60, 20, 20);
  const x = field(page, 'X');
  const xb = await x.inputValue();
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Paste spacing ↔' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Copy spacing from two objects first.')).toBeVisible();
  await page.getByRole('button', { name: 'Swap positions' }).focus();
  await page.keyboard.press('Enter');
  // The second rectangle was selected last; after the swap it sits where the first was.
  await page.keyboard.press('Escape');
  const p = await at(page, 40, 40);
  await page.mouse.click(p.x, p.y);
  await expect(x).not.toHaveValue(xb);
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Copy spacing' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Paste spacing ↕' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(2);
});
