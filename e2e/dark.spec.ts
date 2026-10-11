/**
 * Dark scheme (note 53): the chrome follows the system setting, the canvas
 * page and previews of figure content stay light, and axe finds no serious
 * contrast problems in dark either. `E2E_OUT=<dir>` saves screenshots.
 */
import { type Page, expect, test } from '@playwright/test';
import { audit, fileMenu, iconTile } from './helpers';

const OUT = process.env['E2E_OUT'];

async function shot(page: Page, name: string) {
  if (OUT) await page.screenshot({ path: `${OUT}/dark-${name}-${test.info().project.name}.png` });
}

const rootBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

const pageFill = (page: Page) =>
  page.getByTestId('vision').locator('> g > rect').first().getAttribute('fill');

test.describe('light system setting', () => {
  test.use({ colorScheme: 'light' });

  test('keeps the light chrome', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.icon-tile').first()).toBeVisible();
    expect(await rootBackground(page)).toBe('rgb(243, 242, 242)');
    expect(await pageFill(page)).toBe('#ffffff');
  });
});

test.describe('dark system setting', () => {
  test.use({ colorScheme: 'dark' });

  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.icon-tile').first()).toBeVisible();
  });

  test('flips the chrome but not the page or the icon tiles', async ({ page }) => {
    expect(await rootBackground(page)).toBe('rgb(26, 25, 24)');
    expect(await pageFill(page)).toBe('#ffffff');
    const tile = await page
      .locator('.icon-tile')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(tile).toBe('rgb(230, 228, 227)');
    await (await iconTile(page, 'neuron', 'neuron')).click();
    await expect(page.locator('[data-layer] > *')).not.toHaveCount(0);
    await page.getByLabel('Search icons').fill('');
    await shot(page, 'editor');
    expect(await audit(page)).toEqual([]);
  });

  test('the dialogs and the icon preview have no serious problems', async ({ page }) => {
    const problems: string[] = [];
    await page.locator('.icon-tile').first().hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await shot(page, 'icon-preview');
    problems.push(...(await audit(page, '.icons-panel')).map((p) => `icons: ${p}`));
    await page.mouse.move(600, 400);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    problems.push(...(await audit(page, '.menu')).map((p) => `File menu: ${p}`));
    await page.keyboard.press('Escape');
    for (const [button, name, inMenu] of [
      ['Templates…', 'templates', true],
      ['Help', 'guide', false],
      ['Export…', 'export', false],
      ['Attribution…', 'attribution', true],
      ['Recent…', 'recent', false],
      ['Versions…', 'versions', true],
    ] as const) {
      if (inMenu) await fileMenu(page, button);
      else await page.getByRole('button', { name: button, exact: true }).click();
      await expect(page.getByRole('dialog').first()).toBeVisible();
      await shot(page, name);
      problems.push(...(await audit(page, '.dialog')).map((p) => `${name}: ${p}`));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Add Well plate' }).click();
    await shot(page, 'well-plate');
    problems.push(...(await audit(page, '.side')).map((p) => `well plate: ${p}`));
    expect(problems).toEqual([]);
  });
});
