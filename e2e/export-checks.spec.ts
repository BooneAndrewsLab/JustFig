/** Checks before export (issue 4): warnings in the Export dialog select what they are about. */
import { type Page, expect, test } from '@playwright/test';

import { fileMenu, pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function typeText(page: Page, at: [number, number], s: string) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  await page.keyboard.press('t');
  await page.mouse.click(b.x + at[0] * k, b.y + at[1] * k);
  await expect(page.locator('.text-editor textarea')).toBeFocused();
  await page.keyboard.type(s);
  await page.keyboard.press('Escape');
}

test('a warning selects the object it is about, from the keyboard', async ({ page }) => {
  await page.goto('./');
  // Starts near the right edge of the page, so it runs off it.
  await typeText(page, [470, 100], 'A label that runs off the page');
  await page.keyboard.press('Escape');
  await expect(page.locator('.status')).toContainText('Nothing selected');

  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export figure' });
  // The page is Nature's 2-column preset: that journal is chosen and the width is fine.
  await expect(dialog.getByRole('combobox', { name: 'Journal' })).toHaveValue('Nature');
  await expect(dialog.getByText(/^Page width \(/)).toHaveCount(0);
  const warning = dialog.getByRole('button', { name: /runs off the page/ });
  await expect(warning).toBeVisible();

  // Cell's widest figure is 174 mm: the 183 mm page is too wide, a page-wide warning.
  await dialog.getByRole('combobox', { name: 'Journal' }).selectOption('Cell');
  await expect(dialog.getByText(/more than Cell's widest figure/)).toBeVisible();

  await warning.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.status')).toContainText('1 selected');
});

test('a clean page says so', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export figure' });
  await expect(dialog.getByText('No problems found.')).toBeVisible();
});

test('swatches that look alike in colour-blind vision are warned about, and selected', async ({
  page,
}) => {
  await page.goto('./');
  await fileMenu(page, 'Templates…');
  const gallery = page.getByRole('dialog', { name: 'Templates and examples' });
  await gallery.getByRole('tab', { name: 'Examples' }).click();
  await gallery.locator('[data-entry="signalling-pathway"]').click();
  await expect(gallery).toBeHidden();

  // Okabe-Ito is colourblind-safe: no warning. The classic palette puts orange beside green.
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export figure' });
  await expect(dialog.getByRole('button', { name: /look alike with/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#palette-choice').selectOption('classic');
  await page.getByRole('button', { name: 'Apply to figure' }).click();

  await page.getByRole('button', { name: 'Export…' }).click();
  const warning = dialog.getByRole('button', {
    name: /look alike with .*(deuteranopia|protanopia)/,
  });
  await expect(warning.first()).toBeVisible();
  await warning.first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.status')).toContainText(/[2-9] selected/);
});
