/** Copy as image (note 36): reachable from the keyboard, and it answers in the status line. */
import { expect, test } from '@playwright/test';

test('Copy as image is in the Export dialog and says what happened', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Export…' }).click();
  const button = page.getByRole('button', { name: 'Copy as image' });
  await expect(button).toBeVisible();
  await button.focus();
  await page.keyboard.press('Enter');
  // Whether the clipboard is writable depends on the browser and its permissions;
  // either way the status line reports the outcome (a success, or the way out).
  await expect(page.locator('footer.status')).toContainText(/image/i, { timeout: 15000 });
});
