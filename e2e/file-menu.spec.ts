/** The top bar's File menu (note 55): keyboard, accessibility, and the primary button's hover. */
import { expect, test } from '@playwright/test';
import { audit, pageBox } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('the File menu works from the keyboard', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'File', exact: true });
  const menu = page.getByRole('menu', { name: 'File' });
  const item = (name: string) => page.getByRole('menuitem', { name, exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(item('New')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(item('Attribution…')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(item('New')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  await expect(item('New')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // ArrowDown opens on the first item; Enter on an item runs it and closes the menu.
  await page.keyboard.press('ArrowDown');
  await expect(item('New')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Templates and examples' })).toBeVisible();
});

test('the open File menu has no serious accessibility problems; a click outside closes it', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  expect(await audit(page, '.menu')).toEqual([]);
  // Opened with the mouse, focus stays on File: Escape still closes the menu.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const b = await pageBox(page);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('a hovered primary button keeps its accent background', async ({ page }) => {
  const exportButton = page.locator('.topbar').getByRole('button', { name: 'Export…' });
  const bg = () => exportButton.evaluate((el) => getComputedStyle(el).backgroundColor);
  const ground = await page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  );
  await exportButton.hover();
  expect(await bg()).not.toBe(ground);
  expect(await bg()).not.toBe('rgb(255, 255, 255)');
});
