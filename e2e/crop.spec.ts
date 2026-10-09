/**
 * Crop and rotate (note 20, issue 46): two channels of one field, a PNG and a
 * JPEG, cropped and turned together from the keyboard, with the scale bar
 * grouped over one of them, exported as their re-encoded pixels, and undone
 * in one step.
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

/** A 120 × 80 picture, white in its top-left quarter: base64 PNG or JPEG. */
async function channel(page: Page, mime: string): Promise<Buffer> {
  const b64 = await page.evaluate((m) => {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 80;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#123';
      g.fillRect(0, 0, 120, 80);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 60, 40);
    }
    return c.toDataURL(m, 0.95).split(',')[1] ?? '';
  }, mime);
  return Buffer.from(b64, 'base64');
}

/** Width and height of a PNG or JPEG. */
function sizeOf(bytes: Buffer): [number, number] {
  if (bytes[0] === 0x89) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  let i = 2;
  while (i + 9 < bytes.length) {
    const marker = bytes[i + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return [0, 0];
}

const images = (svg: string) =>
  [...svg.matchAll(/<image [^>]*xlink:href="data:(image\/\w+);base64,([^"]+)"/g)].map((m) => ({
    mime: m[1],
    size: sizeOf(Buffer.from(m[2] ?? '', 'base64')),
  }));

test('crops and turns two channels together, keeping the scale bar calibrated (#46)', async ({
  page,
}) => {
  const input = page.getByTestId('import-input');
  await input.setInputFiles({
    name: 'dapi.png',
    mimeType: 'image/png',
    buffer: await channel(page, 'image/png'),
  });
  await side(page).getByRole('button', { name: 'Add scale bar' }).click();
  await input.setInputFiles({
    name: 'gfp.jpg',
    mimeType: 'image/jpeg',
    buffer: await channel(page, 'image/jpeg'),
  });
  await expect(page.locator('.layers .item .name', { hasText: 'Group' })).toHaveCount(1);
  await expect(page.locator('.layers .item .name', { hasText: 'Image' })).toHaveCount(1);

  // Both: the second picture, and the group of the first with its bar.
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  const section = side(page).getByRole('region', { name: 'Crop and rotate' });
  await expect(section).toContainText('2 pictures, 120 × 80 px');
  await section.getByRole('button', { name: 'Crop and rotate…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Crop and rotate' });
  await expect(dialog.getByLabel('Left')).toBeFocused();
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.dialog')
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);
  await dialog.getByLabel('Width').fill('60');
  await dialog.getByLabel('Height').fill('40');
  await dialog.getByLabel('Angle (°)').fill('90');
  await expect(dialog.getByRole('status')).toContainText(
    '60 × 40 of 120 × 80 pixels, the same for all 2 pictures',
  );
  await dialog.getByLabel('Angle (°)').press('Enter');
  await expect(dialog).toBeHidden();
  await expect(section).toContainText('2 cropped');

  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  const shown = images(svg);
  expect(shown.map((i) => i.mime).sort()).toEqual(['image/jpeg', 'image/png']);
  for (const i of shown) expect(i.size).toEqual([60, 40]);
  expect(svg).not.toMatch(/clipPath|<mask|<svg[^>]*>[\s\S]*<svg/);

  // The bar's calibration followed the crop.
  await page.locator('.layers').getByRole('button', { name: 'Expand' }).first().click();
  await page.locator('.layers .item .name', { hasText: 'Scale bar' }).click();
  await expect(side(page).getByLabel('Image width')).toHaveValue('60');

  // One undo step brings both whole pictures back, unturned.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  const back = images(readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8'));
  for (const i of back) expect(i.size).toEqual([120, 80]);
});

test('crops a turned picture level on the page, with a smaller one alike (#48)', async ({
  page,
}) => {
  const input = page.getByTestId('import-input');
  await input.setInputFiles({
    name: 'big.png',
    mimeType: 'image/png',
    buffer: await channel(page, 'image/png'),
  });
  // The same field at half the resolution.
  const small = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 60;
    c.height = 40;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#123';
      g.fillRect(0, 0, 60, 40);
    }
    return c.toDataURL('image/png').split(',')[1] ?? '';
  });
  await input.setInputFiles({
    name: 'small.png',
    mimeType: 'image/png',
    buffer: Buffer.from(small, 'base64'),
  });
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  const section = side(page).getByRole('region', { name: 'Crop and rotate' });
  await expect(section).toContainText('2 pictures of different sizes');
  await section.getByRole('button', { name: 'Crop and rotate…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Crop and rotate' });
  await dialog.getByLabel('Angle (°)').fill('90');
  await dialog.getByLabel('Crop level on the page (resample the turned picture)').check();
  // The turned picture is 80 × 120 pixels.
  await expect(dialog.getByRole('status')).toContainText(
    '80 × 120 of 80 × 120 pixels of the turned',
  );
  await dialog.getByLabel('Width').fill('40');
  await dialog.getByLabel('Height').fill('60');
  await expect(dialog.getByRole('status')).toContainText('the same part of each of the 2 pictures');
  await dialog.getByLabel('Height').press('Enter');
  await expect(dialog).toBeHidden();
  await expect(section).toContainText('2 cropped');

  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  const sizes = images(svg)
    .map((i) => i.size)
    .sort((a, b) => b[0] - a[0]);
  expect(sizes).toEqual([
    [40, 60],
    [20, 30],
  ]);
  expect(svg).not.toMatch(/clipPath|<mask|rotate\(90/);

  // Reopened, the dialog shows the level crop to change it.
  await section.getByRole('button', { name: 'Crop and rotate…' }).click();
  await expect(
    dialog.getByLabel('Crop level on the page (resample the turned picture)'),
  ).toBeChecked();
  await expect(dialog.getByLabel('Angle (°)')).toHaveValue('90');
  await expect(dialog.getByLabel('Width')).toHaveValue('40');
});
