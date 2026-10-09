/**
 * Merged channels (note 21, issue 45): two greyscale channels of one field,
 * one with a scale bar, merged from the keyboard into a green/magenta
 * composite laid out in a row, exported as baked pixels; the merge is then
 * re-edited (a channel turned off) and undone in one step.
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

/** A 120 × 80 greyscale PNG, black with one white quarter (top-left or bottom-right). */
async function channel(page: Page, corner: 'tl' | 'br'): Promise<Buffer> {
  const b64 = await page.evaluate((c) => {
    const cv = document.createElement('canvas');
    cv.width = 120;
    cv.height = 80;
    const g = cv.getContext('2d');
    if (g) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 120, 80);
      g.fillStyle = '#fff';
      g.fillRect(c === 'tl' ? 0 : 60, c === 'tl' ? 0 : 40, 60, 40);
    }
    return cv.toDataURL('image/png').split(',')[1] ?? '';
  }, corner);
  return Buffer.from(b64, 'base64');
}

/** The exported pictures' data URLs. */
const images = (svg: string) =>
  [...svg.matchAll(/<image [^>]*xlink:href="(data:image\/\w+;base64,[^"]+)"/g)].map(
    (m) => m[1] ?? '',
  );

/** Pixels of a data URL at the given points, as [r, g, b]. */
async function pixelsAt(page: Page, url: string, pts: [number, number][]) {
  return page.evaluate(
    async ({ url, pts }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      if (!g) return [];
      g.drawImage(img, 0, 0);
      return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)]);
    },
    { url, pts },
  );
}

test('merges two channels into a re-editable pseudocoloured composite (#45)', async ({ page }) => {
  const input = page.getByTestId('import-input');
  await input.setInputFiles({
    name: 'dapi.png',
    mimeType: 'image/png',
    buffer: await channel(page, 'tl'),
  });
  await side(page).getByRole('button', { name: 'Add scale bar' }).click();
  await input.setInputFiles({
    name: 'gfp.png',
    mimeType: 'image/png',
    buffer: await channel(page, 'br'),
  });

  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  const section = side(page).getByRole('region', { name: 'Channels' });
  await expect(section).toContainText('2 pictures, 120 × 80 px');
  await section.getByRole('button', { name: 'Merge channels…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Merge channels' });
  await expect(dialog.getByRole('status')).toContainText('2 of 2 channels shown, 120 × 80 px');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.dialog')
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);
  // Green and magenta by default; the keyboard reaches every control.
  await expect(dialog.locator('#channel-0-colour')).toHaveValue('#00ff00');
  await expect(dialog.locator('#channel-1-colour')).toHaveValue('#ff00ff');
  await dialog.locator('#channel-1-max').fill('128');
  await expect(dialog.getByLabel('Lay out the channels in a row, the merge last')).toBeChecked();
  await dialog.locator('#channel-1-max').press('Enter');
  await expect(dialog).toBeHidden();

  // The merge is grouped with a copy of the scale bar; the channel's group is untouched.
  await expect(page.locator('.layers .item .name', { hasText: 'Group' })).toHaveCount(2);
  await expect(section).toContainText('A merge of 2 channels (2 shown)');

  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  expect(svg).not.toMatch(/<filter|<mask|mix-blend|feBlend/);
  const shown = images(svg);
  expect(shown).toHaveLength(3);
  const merge = shown[2] ?? '';
  expect(
    await pixelsAt(page, merge, [
      [10, 10],
      [100, 70],
      [100, 10],
    ]),
  ).toEqual([
    [0, 255, 0],
    [255, 0, 255],
    [0, 0, 0],
  ]);

  // Re-edit: turn the green channel off.
  await section.getByRole('button', { name: 'Channels…' }).click();
  const again = page.getByRole('dialog', { name: 'Channels' });
  await again.getByLabel('Show').first().uncheck();
  await again.getByRole('button', { name: 'Apply' }).click();
  await expect(again).toBeHidden();
  await expect(section).toContainText('(1 shown)');
  const off = images(readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8'))[2] ?? '';
  expect(
    await pixelsAt(page, off, [
      [10, 10],
      [100, 70],
    ]),
  ).toEqual([
    [0, 0, 0],
    [255, 0, 255],
  ]);

  // One undo step brings the green back.
  await page.keyboard.press('Control+z');
  await expect(section).toContainText('(2 shown)');
});
