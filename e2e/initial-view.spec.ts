/** The view on load is the fit-to-page view: centred, at the fit zoom. */
import { expect, test } from '@playwright/test';

import { pageBox } from './helpers';

test('on load the page is centred at the fit zoom, same as Fit page', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  const canvas = await page.locator('.canvas').boundingBox();
  if (!canvas) throw new Error('canvas not visible');
  const before = await pageBox(page);
  expect(Math.abs(before.x + before.width / 2 - (canvas.x + canvas.width / 2))).toBeLessThan(2);
  expect(Math.abs(before.y + before.height / 2 - (canvas.y + canvas.height / 2))).toBeLessThan(2);

  await page.getByTitle('Fit page').click();
  const after = await pageBox(page);
  expect(Math.abs(before.width - after.width)).toBeLessThan(1);
  expect(Math.abs(before.x - after.x)).toBeLessThan(1);
  expect(Math.abs(before.y - after.y)).toBeLessThan(1);
});
