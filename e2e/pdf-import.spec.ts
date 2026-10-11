/** PDF import (note 13): a page picker for multi-page files, keyboard only, and a direct import for one page. */
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../src/io/pdf/fixtures/${name}.pdf`, import.meta.url));
const images = '.layers .item .name';

test.beforeEach(async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('a one-page PDF plot is placed straight away', async ({ page }) => {
  await page.getByTestId('import-input').setInputFiles(fixture('r-pdf'));
  await expect(page.locator(images, { hasText: 'Image' })).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notice-error')).toHaveCount(0);
});

test('a multi-page PDF asks for a page, from the keyboard, and Escape imports nothing', async ({
  page,
}) => {
  await page.getByTestId('import-input').setInputFiles(fixture('matplotlib-pages'));
  const dialog = page.getByRole('dialog', { name: 'Choose a PDF page' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await expect(dialog.getByRole('img', { name: 'Preview of page 1' })).toBeVisible();
  // The preview is the laid-out outline rendering (no browser-font text), as placed.
  const src = await dialog.getByRole('img', { name: 'Preview of page 1' }).getAttribute('src');
  expect(decodeURIComponent(src ?? '')).not.toContain('<text');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.dialog')
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );

  // Focus starts on the pages: arrow down to page 2, then forward to Import.
  await expect(dialog.getByRole('radio', { name: /Page 1/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('radio', { name: /Page 2/ })).toBeChecked();
  await expect(dialog.getByRole('img', { name: 'Preview of page 2' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Import page 2' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator(images, { hasText: 'Image' })).toHaveCount(1);

  // Again, but cancelled: nothing more is placed.
  await page.getByTestId('import-input').setInputFiles(fixture('matplotlib-pages'));
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator(images, { hasText: 'Image' })).toHaveCount(1);
});

test('a plot with pictures inside is placed as a group, pictures under the plot (issue 24)', async ({
  page,
}) => {
  await page.getByTestId('import-input').setInputFiles(fixture('matplotlib-images'));
  await expect(page.locator(images, { hasText: 'matplotlib-images.pdf' })).toHaveCount(1);
  await expect(page.locator('.notice-error')).toHaveCount(0);
  // Encoded as PNG in the browser and drawn on the canvas.
  const pics = page.locator('g[data-id] image');
  await expect(pics).toHaveCount(2);
  expect(await pics.first().getAttribute('xlink:href')).toMatch(/^data:image\/png;base64,iVBOR/);
  // One undo step removes the whole import.
  await page.keyboard.press('Control+z');
  await expect(page.locator('g[data-id] image')).toHaveCount(0);
});

test('photos in a PDF stay JPEG, a cut one re-encoded in the browser (issue 36)', async ({
  page,
}) => {
  await page.getByTestId('import-input').setInputFiles(fixture('photo'));
  await expect(page.locator(images, { hasText: 'photo.pdf' })).toHaveCount(1);
  const pics = page.locator('g[data-id] image');
  await expect(pics).toHaveCount(2);
  for (const pic of await pics.all())
    expect(await pic.getAttribute('xlink:href')).toMatch(/^data:image\/jpeg;base64,\/9j\//);
});
