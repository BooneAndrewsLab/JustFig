/** Phase 4: arrow binding, templates, palettes, the shortcut editor, BarelySig import, the guide, keyboard access. */
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

async function rect(page: Page, x: number, y: number, w: number, h: number) {
  await page.keyboard.press('r');
  await drag(page, await at(page, x, y), await at(page, x + w, y + h));
}

const field = (page: Page, name: string) => page.locator('.side').getByLabel(name, { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('an arrow drawn between two objects follows them, and detaches when dragged away', async ({
  page,
}) => {
  await rect(page, 40, 60, 60, 40);
  await rect(page, 240, 60, 60, 40);
  await page.keyboard.press('a');
  const a = await at(page, 70, 80);
  const b = await at(page, 270, 80);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(page.getByTestId('bind-target')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('bound-start')).toBeVisible();
  await expect(page.getByTestId('bound-end')).toBeVisible();
  // The ends sit on the rectangles' facing edges, not at the pointer.
  const x0 = Number(await field(page, 'X').inputValue());
  const w0 = Number(await field(page, 'W').inputValue());
  // Move the second rectangle down: the arrow's end follows.
  await page.locator('.layers .item .name', { hasText: 'Rect' }).first().click();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+ArrowDown');
  await page.locator('.layers .item .name', { hasText: 'Arrow' }).click();
  expect(Number(await field(page, 'H').inputValue())).toBeGreaterThan(5);
  expect(Number(await field(page, 'X').inputValue())).toBeCloseTo(x0, 0);
  expect(Number(await field(page, 'W').inputValue())).toBeCloseTo(w0, 0);
  await expect(page.getByTestId('bound-end')).toBeVisible();
  // Nudging the arrow itself detaches both ends.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bound-start')).toHaveCount(0);
  await expect(page.getByTestId('bound-end')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('bound-end')).toBeVisible();
  await page.getByRole('button', { name: 'Detach the end of the arrow' }).click();
  await expect(page.getByTestId('bound-end')).toHaveCount(0);
  await expect(page.getByTestId('bound-start')).toBeVisible();
});
