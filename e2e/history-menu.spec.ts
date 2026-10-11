/** The History menu (note 56): Undo | Redo | ▾, the list of changes, jumping to any of them. */
import { type Page, expect, test } from '@playwright/test';

import { audit, pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function rect(page: Page, x: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  await page.keyboard.press('r');
  await page.mouse.move(b.x + x * k, b.y + 30 * k);
  await page.mouse.down();
  await page.mouse.move(b.x + (x + 30) * k, b.y + 60 * k, { steps: 6 });
  await page.mouse.up();
}

const rects = (page: Page) => page.locator('.layers .item .name', { hasText: 'Rect' });
const caret = (page: Page) => page.getByRole('button', { name: 'History', exact: true });
const changes = (page: Page) => page.getByRole('menu', { name: 'Changes' });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('the list shows every change and jumps back and forward to any of them', async ({ page }) => {
  await expect(caret(page)).toBeDisabled();
  for (const x of [20, 60, 100]) await rect(page, x);
  await expect(rects(page)).toHaveCount(3);

  await caret(page).click();
  const items = changes(page).getByRole('menuitemradio');
  await expect(items).toHaveCount(4);
  await expect(items.first()).toHaveAttribute('aria-checked', 'true');
  await expect(items.last()).toHaveText('Opened figure');
  expect(await audit(page, '.topbar')).toEqual([]);

  await items.last().click();
  await expect(changes(page)).toBeHidden();
  await expect(rects(page)).toHaveCount(0);

  // The undone changes stay listed; picking the second redoes up to it.
  await caret(page).click();
  await expect(items).toHaveCount(4);
  await items.nth(1).click();
  await expect(rects(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
});

test('the list works from the keyboard', async ({ page }) => {
  await rect(page, 20);
  await rect(page, 60);
  await caret(page).focus();
  await page.keyboard.press('ArrowDown');
  const items = changes(page).getByRole('menuitemradio');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(changes(page)).toBeHidden();
  await expect(caret(page)).toBeFocused();
  await expect(rects(page)).toHaveCount(2);

  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rects(page)).toHaveCount(0);
});
