/**
 * Magnified inset (note 44, issue 66): made from the keyboard in its dialog,
 * exported as two plain pictures, its box and lines following the source when
 * it moves, its magnification typed, and the move undone in one step.
 */
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

import { exportVia, pick } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

const side = (page: Page) => page.locator('.side');
const layer = (page: Page, name: RegExp) => page.locator('.layers .item .name', { hasText: name });

/** A 120 × 80 PNG, white in its top-left quarter. */
async function picture(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
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
    return c.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(b64, 'base64');
}

const pngSizes = (svg: string) =>
  [...svg.matchAll(/<image [^>]*xlink:href="data:image\/png;base64,([^"]+)"/g)].map((m) => {
    const b = Buffer.from(m[1] ?? '', 'base64');
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  });

/** The X field of the object selected in the Layers panel. */
async function xOf(page: Page, name: RegExp, nth = 0): Promise<number> {
  await pick(page, layer(page, name).nth(nth));
  return Number(await side(page).getByLabel('X', { exact: true }).inputValue());
}

test('makes a linked inset whose box and lines follow the picture (#66)', async ({ page }) => {
  await page.getByTestId('import-input').setInputFiles({
    name: 'cells.png',
    mimeType: 'image/png',
    buffer: await picture(page),
  });
  const section = side(page).getByRole('region', { name: 'Magnified inset' });
  await section.getByRole('button', { name: 'Make inset…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Make inset' });
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
  await dialog.getByLabel('Left').fill('10');
  await dialog.getByLabel('Top').fill('10');
  await dialog.getByLabel('Width').fill('30');
  await dialog.getByLabel('Height').fill('20');
  await expect(dialog.getByRole('status')).toContainText('30 × 20 of 120 × 80 pixels, shown 2×');
  await dialog.getByLabel('Height').press('Enter');
  await expect(dialog).toBeHidden();

  await expect(layer(page, /^Inset$/)).toHaveCount(1);
  await expect(layer(page, /^Inset box$/)).toHaveCount(1);
  await expect(layer(page, /^Inset line$/)).toHaveCount(2);
  await expect(section).toContainText('pixels 10, 10, 30 × 20');
  await expect(section.getByLabel('Magnification')).toHaveValue('2');

  // Exported: the whole picture and the region's own pixels, no clipping.
  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  expect(pngSizes(svg).sort()).toEqual([
    [120, 80],
    [30, 20],
  ]);
  expect(svg).not.toMatch(/clipPath|<mask|<filter/);

  const box = await xOf(page, /^Inset box$/);
  const line = await xOf(page, /^Inset line$/);
  const inset = await xOf(page, /^Inset$/);

  // Move the picture: the box and the lines follow it, the inset stays.
  const source = await xOf(page, /^Image$|cells/);
  await side(page)
    .getByLabel('X', { exact: true })
    .fill(String(source - 20));
  await side(page).getByLabel('X', { exact: true }).press('Tab');
  await expect.poll(() => xOf(page, /^Inset box$/)).toBeCloseTo(box - 20, 1);
  expect(await xOf(page, /^Inset line$/)).toBeCloseTo(line - 20, 1);
  expect(await xOf(page, /^Inset$/)).toBeCloseTo(inset, 1);

  // Typing a magnification resizes the inset.
  await pick(page, layer(page, /^Inset$/));
  const w = Number(await side(page).getByLabel('W', { exact: true }).inputValue());
  await section.getByLabel('Magnification').fill('3');
  await section.getByLabel('Magnification').press('Tab');
  await expect
    .poll(async () => Number(await side(page).getByLabel('W', { exact: true }).inputValue()))
    .toBeCloseTo(w * 1.5, 0);

  // Undo the magnification, then the move: one step each, and the lines go back.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(() => xOf(page, /^Inset box$/)).toBeCloseTo(box, 1);
  expect(await xOf(page, /^Inset line$/)).toBeCloseTo(line, 1);

  // Moving the box shows another region: the inset is re-cut from the picture's pixels.
  await pick(page, layer(page, /^Inset box$/));
  await side(page)
    .getByLabel('X', { exact: true })
    .fill(String(box + 10));
  await side(page).getByLabel('X', { exact: true }).press('Tab');
  await pick(page, layer(page, /^Inset$/));
  await expect(section).not.toContainText('pixels 10, 10');
  await expect(section).not.toContainText('Updating');
  const recut = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  expect(pngSizes(recut).sort()).toEqual([
    [120, 80],
    [30, 20],
  ]);
});
