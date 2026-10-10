/** Saved versions (note 23): save a named version, compare it, restore it as one undo step. */
import { type Page, expect, test } from '@playwright/test';

import { pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function rect(page: Page, x: number, y: number, w: number, h: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  await page.keyboard.press('r');
  await page.mouse.move(b.x + x * k, b.y + y * k);
  await page.mouse.down();
  await page.mouse.move(b.x + (x + w) * k, b.y + (y + h) * k, { steps: 8 });
  await page.mouse.up();
}

const rects = (page: Page) => page.locator('.layers .item .name', { hasText: 'Rect' });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  page.on('dialog', (d) => {
    // Leaving a figure never saved as a file is guarded by the browser's own prompt.
    if (d.type() === 'beforeunload') return void d.accept();
    throw new Error('window.confirm must not be used');
  });
});

test('save a version, change the figure, compare, restore, undo; versions survive a reload', async ({
  page,
}) => {
  await rect(page, 30, 30, 40, 40);
  await expect(rects(page)).toHaveCount(1);

  // Saved straight after a change: the version and the figure both hold it.
  await page.getByRole('button', { name: 'Versions…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved versions' });
  await expect(dialog.getByLabel('Version name')).toBeFocused();
  await dialog.getByLabel('Version name').fill('sent to PI');
  await page.keyboard.press('Enter');
  await expect(page.locator('.status')).toContainText('Saved version “sent to PI”');
  await expect(dialog.locator('.version-row')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await rect(page, 90, 30, 40, 40);
  await expect(rects(page)).toHaveCount(2);

  // Compare, by keyboard.
  await page.getByRole('button', { name: 'Versions…' }).click();
  await dialog.getByRole('button', { name: 'Compare sent to PI' }).focus();
  await page.keyboard.press('Enter');
  const compare = page.getByRole('dialog', { name: 'Compare versions' });
  await expect(compare).toContainText('sent to PI: 1 page, 1 object. Now: 1 page, 2 objects.');
  await expect(compare.getByRole('img', { name: 'Page 1 of sent to PI' })).toBeVisible();
  await expect(compare.getByRole('img', { name: 'Page 1 of Now' })).toBeVisible();

  // Restore asks first, in the app.
  await compare.getByRole('button', { name: 'Restore this version' }).click();
  const ask = page.getByRole('dialog', { name: 'Restore this version?' });
  // Cancel has the focus: Enter alone never replaces the figure.
  await expect(ask.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(ask.getByRole('button', { name: 'Restore', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rects(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveAttribute(
    'title',
    'Undo Restore version “sent to PI”',
  );

  // One undo step brings the two rectangles back; redo restores again.
  await page.keyboard.press('Control+z');
  await expect(rects(page)).toHaveCount(2);
  await page.keyboard.press('Control+Shift+z');
  await expect(rects(page)).toHaveCount(1);

  // Rename, then reload: the restored figure was autosaved and the version is still there.
  await page.getByRole('button', { name: 'Versions…' }).click();
  await dialog.getByRole('button', { name: 'Rename sent to PI' }).click();
  await page.getByLabel('New name for sent to PI').fill('before revision');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.version-row strong')).toHaveText('before revision');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await expect(rects(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Versions…' }).click();
  await expect(dialog.locator('.version-row')).toHaveCount(1);

  // Delete asks first.
  await dialog.getByRole('button', { name: 'Delete before revision' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this version?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(dialog).toContainText('No saved versions of this figure yet.');
});

test('versions belong to their figure', async ({ page }) => {
  await rect(page, 30, 30, 40, 40);
  await page.getByRole('button', { name: 'Versions…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved versions' });
  await dialog.getByLabel('Version name').fill('A1');
  await dialog.getByRole('button', { name: 'Save version' }).click();
  await expect(dialog.locator('.version-row')).toHaveCount(1);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(rects(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Versions…' }).click();
  await expect(dialog).toContainText('No saved versions of this figure yet.');
});

test('compare two versions in both modes and restore one deleted object', async ({ page }) => {
  await rect(page, 30, 30, 40, 40);
  await page.getByRole('button', { name: 'Versions…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved versions' });
  await dialog.getByLabel('Version name').fill('v1');
  await dialog.getByRole('button', { name: 'Save version' }).click();
  await expect(dialog.locator('.version-row')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Delete the rectangle and draw another elsewhere.
  await page.keyboard.press('Delete');
  await expect(rects(page)).toHaveCount(0);
  await rect(page, 100, 60, 30, 30);
  await expect(rects(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Versions…' }).click();
  await dialog.getByRole('button', { name: 'Compare v1' }).focus();
  await page.keyboard.press('Enter');
  const compare = page.getByRole('dialog', { name: 'Compare versions' });
  await expect(compare.locator('[data-diff="removed"]')).toHaveCount(1);
  await expect(compare.locator('[data-diff="added"]')).toHaveCount(1);
  await expect(compare.getByRole('list', { name: 'Changed objects' })).toContainText(
    'Removed: rect',
  );

  // Onion skin: one picture with the older page faded over the newer.
  await compare.getByLabel('Onion skin').check();
  await expect(compare.locator('[data-onion="older"]')).toHaveCount(1);
  await compare.getByLabel('Side by side').check();
  await expect(compare.locator('[data-onion="older"]')).toHaveCount(0);

  // Restore the deleted rectangle from v1: one undo step.
  await compare.getByRole('button', { name: 'Removed: rect' }).click();
  await compare.getByRole('button', { name: 'Restore this object from v1' }).click();
  await expect(page.locator('.status')).toContainText('Restored');
  await expect(compare.locator('[data-diff="removed"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rects(page)).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(rects(page)).toHaveCount(1);
});
