/** Recent figures (note 02): figures are kept separately and reopen from the dialog. */
import { type Page, expect, test } from '@playwright/test';

import { fileMenu, pageBox } from './helpers';

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
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('make A, start B, reopen A from Recent figures; rename, download, delete', async ({
  page,
}) => {
  await page.getByLabel('Figure title').fill('Figure A');
  await page.getByLabel('Figure title').blur();
  await rect(page, 30, 30, 40, 40);
  await rect(page, 90, 30, 40, 40);
  await expect(rects(page)).toHaveCount(2);

  // No browser confirm box: New just switches, A is kept.
  page.on('dialog', () => {
    throw new Error('window.confirm must not be used');
  });
  await fileMenu(page, 'New');
  await expect(rects(page)).toHaveCount(0);
  await page.getByLabel('Figure title').fill('Figure B');
  await page.getByLabel('Figure title').blur();
  await rect(page, 30, 30, 40, 40);
  await expect(rects(page)).toHaveCount(1);

  await page.keyboard.press('Shift+O');
  const dialog = page.getByRole('dialog', { name: 'Recent figures' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.recent-row')).toHaveCount(2);

  // Rename A, then open it.
  await dialog.getByRole('button', { name: 'Rename Figure A' }).click();
  await page.getByLabel('New title for Figure A').fill('Figure A renamed');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Open Figure A renamed' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download Figure A renamed as .jfig' }).click(),
  ]);
  // Playwright's WebKit reports spaces in download names as underscores.
  expect(download.suggestedFilename().replaceAll('_', ' ')).toBe('Figure A renamed.jfig');

  await dialog.getByRole('button', { name: 'Open Figure A renamed' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Figure title')).toHaveValue('Figure A renamed');
  await expect(rects(page)).toHaveCount(2);

  // B is still open in its tab (note 25); deleting it, through the in-app confirmation, closes the tab.
  const tabs = page.getByRole('tablist', { name: 'Open figures' }).getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await page.getByRole('button', { name: 'Recent…' }).click();
  // The first page was drawn into a small thumbnail by now.
  await expect(dialog.locator('.recent-row img').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete Figure B' }).click();
  const sure = page.getByRole('dialog', { name: 'Delete this figure?' });
  await expect(sure).toBeVisible();
  await expect(sure).toContainText('Its tab is closed.');
  await sure.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.locator('.recent-row')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Delete Figure B' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this figure?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(dialog.locator('.recent-row')).toHaveCount(1);
  await expect(tabs).toHaveCount(1);

  // A reload restores the figure last opened.
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByLabel('Figure title')).toHaveValue('Figure A renamed');
  await expect(rects(page)).toHaveCount(2);
});
