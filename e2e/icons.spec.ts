/**
 * The Phase 2 icon library in the browser: categories with sprite
 * thumbnails, search, the share-alike opt-in, per-slot recolouring with the
 * "modified" credit, and the library's CREDITS.md.
 */
import { expect, test } from '@playwright/test';

import { iconTile } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('browses categories with sprite thumbnails', async ({ page }) => {
  const first = page.locator('.icon-tile .icon-thumb').first();
  await expect(first).toHaveCSS('background-image', /thumbs\/cells-0/);
  const select = page.getByLabel('Icon category');
  await select.selectOption('lab');
  await expect(page.locator('.icon-tile[data-icon="petri-dish"]')).toBeVisible();
  // The sprite sheet actually loads.
  const loaded = await page.evaluate(async () => {
    const el = document.querySelector('.icon-tile .icon-thumb');
    const bg = el ? getComputedStyle(el).backgroundImage : '';
    const url = /url\("([^"]+)"\)/.exec(bg)?.[1];
    if (!url) return false;
    const r = await fetch(url);
    return r.ok && (r.headers.get('content-type') ?? '').includes('webp');
  });
  expect(loaded).toBe(true);
});

test('searches the whole library quickly', async ({ page }) => {
  const search = page.getByLabel('Search icons');
  await search.fill('mitochondria');
  await expect(page.getByRole('status')).toContainText(/\d+\+? icons/);
  const n = await page.locator('.icon-tile').count();
  expect(n).toBeGreaterThan(3);
  // Once the index is loaded, a new query answers fast (the index query itself is < 100 ms;
  // this bounds the whole round trip through React and the shard fetches).
  const t0 = Date.now();
  await search.fill('neuron');
  await expect(page.locator('.icon-tile[data-icon="neuron"]')).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000);
  await search.fill('zzzzqqqq');
  await expect(page.getByRole('status')).toContainText('No icons match');
});

test('hides share-alike icons until the user opts in', async ({ page }) => {
  await page.getByLabel('Search icons').fill('epithelial cell');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.locator('.icon-tile[data-icon="bi-epithelial-cell"]')).toHaveCount(0);
  await page.getByLabel('Show share-alike (CC BY-SA) icons').check();
  const tile = page.locator('.icon-tile[data-icon="bi-epithelial-cell"]');
  await expect(tile).toBeVisible();
  await expect(tile.locator('.sa-badge')).toHaveText('SA');
  // The choice is remembered.
  await page.reload();
  await expect(page.getByLabel('Show share-alike (CC BY-SA) icons')).toBeChecked();
  await page.getByLabel('Show share-alike (CC BY-SA) icons').uncheck();
});

test('recolours a CC BY icon per slot and credits it as modified', async ({ page }) => {
  await (await iconTile(page, 'bi-erythrocyte-5', 'erythrocyte 5')).click();
  await expect(page.locator('.layers .item .name', { hasText: 'Erythrocyte 5' })).toHaveCount(1);
  // Slot controls in the Inspector, one per colour family.
  await expect(page.getByLabel('Primary', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Outline', { exact: true })).toBeVisible();
  const recoloured = page.getByTestId('canvas').locator('path[fill="#0072b2"]');
  await expect(recoloured).toHaveCount(0);
  await page.getByRole('button', { name: 'Primary #0072b2' }).click();
  await expect(recoloured.first()).toBeAttached();
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('modified');

  await page.getByRole('button', { name: 'Attribution' }).click();
  const dialog = page.getByRole('dialog', { name: 'Attribution and licences' });
  await expect(dialog.getByTestId('credit-line')).toContainText(
    'Bioicons: Servier (CC BY 3.0, modified)',
  );
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Reset colours' }).click();
  await page.getByRole('button', { name: 'Attribution' }).click();
  await expect(dialog.getByTestId('credit-line')).toContainText('Servier (CC BY 3.0)');
  await expect(dialog.getByTestId('credit-line')).not.toContainText('modified');
});

test('shows the library credits', async ({ page }) => {
  await page.getByRole('button', { name: 'Icon credits and licences' }).click();
  const dialog = page.getByRole('dialog', { name: 'Icon credits and licences' });
  await expect(dialog.getByTestId('credits')).toContainText('Icon credits');
  await expect(dialog.getByRole('heading', { name: 'Bioicons' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Health Icons' })).toBeVisible();
  await expect(dialog.locator('a[href^="https://"]').first()).toBeVisible();
});
