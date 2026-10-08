/** Text and lines across a selection, inside imported plots too (issue 11, note 16), from the keyboard. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

import { exportVia } from './helpers';

const fixture = (name: string) =>
  fileURLToPath(new URL(`../src/io/svg/fixtures/${name}.svg`, import.meta.url));

const side = (page: Page) => page.locator('.side');
const section = (page: Page) => page.getByRole('region', { name: 'Text and lines' });
const images = (page: Page) => page.locator('.layers .item .name', { hasText: 'Image' });

async function importPlot(page: Page, name: string, count: number) {
  await page.getByTestId('import-input').setInputFiles(fixture(name));
  await expect(images(page)).toHaveCount(count);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('tick labels of two plots to 7 pt Tinos from the keyboard, one undo step each', async ({
  page,
}) => {
  await importPlot(page, 'matplotlib-text', 1);
  await importPlot(page, 'matplotlib-paths', 2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  await expect(page.locator('.status')).toContainText('2 selected');
  await expect(section(page)).toBeVisible();

  const target = section(page).getByLabel('Text', { exact: true });
  await target.focus();
  await target.selectOption('tick');
  const size = section(page).getByLabel('Text size (pt)');
  const before = await size.inputValue();
  await size.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('7');
  await page.keyboard.press('Tab');
  await expect(size).toHaveValue('7');
  const font = section(page).getByLabel('Font of the text');
  await font.focus();
  await font.selectOption('tinos');
  await expect(font).toHaveValue('tinos');

  // Each plot on its own shows 7 pt Tinos tick labels; titles kept their size.
  for (const n of [0, 1]) {
    await images(page).nth(n).click();
    await section(page).getByLabel('Text', { exact: true }).selectOption('tick');
    await expect(section(page).getByLabel('Text size (pt)')).toHaveValue('7');
    await expect(section(page).getByLabel('Font of the text')).toHaveValue('tinos');
    await section(page).getByLabel('Text', { exact: true }).selectOption('label');
    await expect(section(page).getByLabel('Text size (pt)')).not.toHaveValue('7');
  }
  // The export draws them in Tinos (text mode keeps text as text).
  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  expect(svg).toContain('Tinos');

  // Font then size: two undo steps back to the plot as imported.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+a');
  await section(page).getByLabel('Text', { exact: true }).selectOption('tick');
  await expect(section(page).getByLabel('Text size (pt)')).toHaveValue(before);
  await expect(section(page).getByLabel('Font of the text')).toHaveValue('arimo');
});

test('Same text and lines copies the first plot’s styles, and the section passes axe', async ({
  page,
}) => {
  await importPlot(page, 'r-svglite', 1);
  await importPlot(page, 'matplotlib-text', 2);
  // Layers list the top-most first: the ggplot plot (imported first) is the second.
  await images(page).nth(1).click();
  const tick = section(page).getByLabel('Text', { exact: true });
  await tick.selectOption('tick');
  const refSize = await section(page).getByLabel('Text size (pt)').inputValue();
  await section(page).getByLabel('Lines', { exact: true }).selectOption('tick');
  const refWidth = await section(page).getByLabel('Line width (pt)').inputValue();
  await images(page)
    .nth(0)
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.status')).toContainText('2 selected');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.side')
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);

  const match = side(page).getByRole('button', { name: 'Same text and lines' });
  await match.focus();
  await page.keyboard.press('Enter');
  await images(page).nth(0).click();
  await section(page).getByLabel('Text', { exact: true }).selectOption('tick');
  await expect(section(page).getByLabel('Text size (pt)')).toHaveValue(refSize);
  await section(page).getByLabel('Lines', { exact: true }).selectOption('tick');
  await expect(section(page).getByLabel('Line width (pt)')).toHaveValue(refWidth);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Control+z');
  await expect(section(page).getByLabel('Text size (pt)')).not.toHaveValue(refSize);
});
