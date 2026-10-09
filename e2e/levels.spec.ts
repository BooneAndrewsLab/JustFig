/**
 * Levels and invert (note 27, issue 51): one dim picture, its black point raised and then
 * inverted from the keyboard, exported as baked pixels; reset brings the original back, and a
 * drag of a slider is one undo step, and Invert another.
 */
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

import { exportVia } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

const side = (page: Page) => page.locator('.side');

/** A 120 × 80 PNG: grey 64 with a white top-left quarter. */
async function dim(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = 120;
    cv.height = 80;
    const g = cv.getContext('2d');
    if (g) {
      g.fillStyle = 'rgb(64,64,64)';
      g.fillRect(0, 0, 120, 80);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 60, 40);
    }
    return cv.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(b64, 'base64');
}

const exported = async (page: Page): Promise<string> => {
  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  expect(svg).not.toMatch(/<filter|<mask|mix-blend|feColorMatrix|feComponentTransfer/);
  const m = /<image [^>]*xlink:href="(data:image\/\w+;base64,[^"]+)"/.exec(svg);
  return m?.[1] ?? '';
};

/** Grey values of the exported picture at the top-left and bottom-right. */
async function greys(page: Page, url: string) {
  return page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    if (!g) return [];
    g.drawImage(img, 0, 0);
    return [g.getImageData(10, 10, 1, 1).data[0], g.getImageData(100, 70, 1, 1).data[0]];
  }, url);
}

test('adjusts levels and inverts a picture from the keyboard, re-editable (#51)', async ({
  page,
}) => {
  await page.getByTestId('import-input').setInputFiles({
    name: 'blot.png',
    mimeType: 'image/png',
    buffer: await dim(page),
  });
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  const section = side(page).getByRole('region', { name: 'Levels' });
  await expect(section).toContainText('whole picture');

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.side')
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);

  const black = section.getByLabel('Black at (levels)');
  await black.focus();
  await expect(black).toBeFocused();
  for (let i = 0; i < 64; i++) await page.keyboard.press('ArrowRight');
  await expect(section.locator('output').first()).toHaveText('64');
  const reset = section.getByRole('button', { name: 'Reset levels' });
  await expect(reset).toBeEnabled();
  // The bake lands once the keys stop: the grey 64 is now black, the white stays white.
  await expect.poll(async () => greys(page, await exported(page))).toEqual([255, 0]);

  const invert = section.getByLabel('Invert');
  await invert.focus();
  await expect(invert).toBeFocused();
  await page.keyboard.press('Space');
  await expect(invert).toBeChecked();
  await expect.poll(async () => greys(page, await exported(page))).toEqual([0, 255]);

  // Re-editing works from the original pixels: back to the full range, inverted only.
  await black.focus();
  await expect(black).toBeFocused();
  await page.keyboard.press('Home');
  await expect.poll(async () => greys(page, await exported(page))).toEqual([0, 191]);

  // Each slider drag and each Invert is its own undo step: three steps back to the original.
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+z');
  await expect(invert).toBeChecked();
  await expect.poll(async () => greys(page, await exported(page))).toEqual([0, 255]);
  await page.keyboard.press('Control+z');
  await expect(invert).not.toBeChecked();
  await expect.poll(async () => greys(page, await exported(page))).toEqual([255, 0]);
  await page.keyboard.press('Control+z');
  await expect(reset).toBeDisabled();
  await expect.poll(async () => greys(page, await exported(page))).toEqual([255, 64]);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Shift+z');
  await expect(invert).toBeChecked();
  await expect.poll(async () => greys(page, await exported(page))).toEqual([0, 191]);

  await reset.click();
  await expect(invert).not.toBeChecked();
  await expect(reset).toBeDisabled();
  await expect.poll(async () => greys(page, await exported(page))).toEqual([255, 64]);
});
