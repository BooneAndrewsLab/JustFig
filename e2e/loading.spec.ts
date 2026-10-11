/** The loading screen (note 49): served in the page itself, gone once the editor has painted. */
import { expect, test } from '@playwright/test';

test('the page ships a loading screen that the editor replaces', async ({ page }) => {
  const html = await (await page.request.get('./')).text();
  expect(html).toContain('id="loading"');
  expect(html).toContain('Loading…');

  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('a start failure replaces the loading screen with the recovery page', async ({ page }) => {
  // Break the font download so startup fails before React renders.
  await page.route('**/fonts/*.ttf', (route) => route.fulfill({ status: 500, body: '' }));
  await page.goto('./?editor');
  const recovery = page.getByRole('alertdialog');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('could not start');
  await expect(page.locator('#loading')).toHaveCount(0);
});
