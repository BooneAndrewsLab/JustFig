/** Editing a path's points after drawing (note 28, #50): mouse, keyboard, undo. */
import { type Page, expect, test } from '@playwright/test';

import { pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

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

/** A line from (x0, y) to (x1, y), in points; it is left selected. */
async function line(page: Page, x0: number, x1: number, y: number) {
  await page.keyboard.press('l');
  await drag(page, await at(page, x0, y), await at(page, x1, y));
  await expect(page.locator('.layers .item .name', { hasText: 'Path' })).toHaveCount(1);
}

const nodes = (page: Page) => page.locator('[data-node-part="node"]');
const status = (page: Page) => page.getByTestId('node-status').locator('[aria-live]');
const field = (page: Page, name: string) => page.locator('.side').getByLabel(name, { exact: true });

async function centre(page: Page, selector: string, i = 0) {
  const b = await page.locator(selector).nth(i).boundingBox();
  if (!b) throw new Error(`no ${selector}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('double-click shows the points; drag one, add one on the line, undo each', async ({
  page,
}) => {
  await line(page, 60, 260, 150);
  // A quarter along: the middle of a flat line is under its top and bottom resize handles.
  const mid = await at(page, 110, 150);
  await page.mouse.dblclick(mid.x, mid.y);
  await expect(nodes(page)).toHaveCount(2);
  // The resize handles give way to the points.
  await expect(page.locator('[data-handle="se"]')).toHaveCount(0);
  const h0 = Number(await field(page, 'H').inputValue());
  expect(h0).toBe(0);

  // Drag the end point down: one undo step.
  const end = await centre(page, '[data-node-part="node"]', 1);
  await drag(page, end, { x: end.x, y: end.y + 60 });
  await expect(status(page)).toContainText('Point 2 of 2');
  expect(Number(await field(page, 'H').inputValue())).toBeGreaterThan(0);

  // Click halfway along the line: a third point, the shape unchanged.
  const a = await centre(page, '[data-node-part="node"]', 0);
  const b = await centre(page, '[data-node-part="node"]', 1);
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await expect(nodes(page)).toHaveCount(3);
  await expect(status(page)).toContainText('Point 2 of 3');

  await page.keyboard.press('Control+z');
  await expect(nodes(page)).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(field(page, 'H')).toHaveValue('0');
  await expect(nodes(page)).toHaveCount(2);

  // A click on empty canvas ends point editing.
  const empty = await at(page, 160, 50);
  await page.mouse.click(empty.x, empty.y);
  await expect(nodes(page)).toHaveCount(0);
});

test('points from the keyboard: Tab, arrows, add, smooth, delete, undo, Escape', async ({
  page,
}) => {
  await line(page, 60, 260, 150);
  await page.locator('.side').getByRole('button', { name: 'Edit points' }).click();
  await expect(page.getByTestId('canvas')).toBeFocused();
  await expect(nodes(page)).toHaveCount(2);
  await expect(status(page)).toContainText('Point 1 of 2, corner');

  await page.keyboard.press('Tab');
  await expect(status(page)).toContainText('Point 2 of 2');
  await expect(page.getByTestId('canvas')).toBeFocused();
  const yOf = async () =>
    Number(/Y ([\d.]+) mm/.exec((await status(page).textContent()) ?? '')?.[1]);
  const y0 = await yOf();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('ArrowDown');
  // 11 pt down: 3.9 mm.
  // Shown to 0.1 mm, so within 0.1 mm of 3.88.
  await expect.poll(async () => Math.abs((await yOf()) - y0 - (11 / 72) * 25.4)).toBeLessThan(0.11);

  await page.keyboard.press('i');
  await expect(nodes(page)).toHaveCount(3);
  await expect(status(page)).toContainText('Point 2 of 3, corner');
  await page.keyboard.press('s');
  await expect(status(page)).toContainText('Point 2 of 3, smooth');
  // Its handles join the Tab order.
  await page.keyboard.press('Tab');
  await expect(status(page)).toContainText('outgoing handle');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(status(page)).toContainText('incoming handle');
  await page.keyboard.press('Shift+Tab');
  await expect(status(page)).toContainText('Point 1 of 3');

  await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(page.locator('.status')).toContainText('at least two points');
  await expect(nodes(page)).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(nodes(page)).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(nodes(page)).toHaveCount(0);
  await expect(page.locator('.status')).toContainText('1 selected');
  // Enter brings them back.
  await page.keyboard.press('Enter');
  await expect(nodes(page)).toHaveCount(3);
});

test("a bilayer's path is edited the same way", async ({ page }) => {
  await line(page, 60, 360, 200);
  await page.locator('.side').getByRole('button', { name: 'Lipid bilayer' }).click();
  await expect(page.locator('.layers .item .name', { hasText: 'Lipid bilayer' })).toHaveCount(1);
  const lipids = page.locator('[data-layer] > g').last().locator('path').first();
  const d0 = await lipids.getAttribute('d');
  await page.locator('.side').getByRole('button', { name: 'Edit points' }).click();
  await expect(page.getByTestId('canvas')).toBeFocused();
  await expect(nodes(page)).toHaveCount(2);
  const n = await centre(page, '[data-node-part="node"]', 1);
  await drag(page, n, { x: n.x, y: n.y - 80 });
  await expect.poll(() => lipids.getAttribute('d')).not.toBe(d0);
  await page.keyboard.press('Control+z');
  await expect.poll(() => lipids.getAttribute('d')).toBe(d0);
});
