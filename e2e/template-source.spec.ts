/** Save as template source (note 08): from the Templates dialog, by keyboard, to a .ts download. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fileMenu } from './helpers';

test('writes the current page as a gallery entry source file', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await fileMenu(page, 'Templates…');
  const gallery = page.getByRole('dialog', { name: 'Templates and examples' });
  await gallery.getByRole('tab', { name: 'Examples' }).click();
  await gallery.getByRole('button', { name: 'Signalling pathway' }).click();
  await expect(gallery).toBeHidden();

  await fileMenu(page, 'Templates…');
  const open = page.getByRole('button', { name: 'Save as template source…' });
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Save as template source' });
  await expect(dialog.getByLabel('Id')).toHaveValue('signalling-pathway');
  await expect(dialog.getByLabel('Source')).toHaveValue(
    /export const signallingPathway: GalleryEntry/,
  );

  await dialog.getByLabel('Id').fill('Not valid');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download .ts file' })).toBeDisabled();
  await dialog.getByLabel('Id').fill('my-pathway');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download .ts file' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('my-pathway.ts');
  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain("id: 'my-pathway'");
  expect(text).toContain('templateFigure(DOC, PAGE, OBJECTS, ASSETS)');
});
