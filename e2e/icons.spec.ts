/**
 * The Phase 2 icon library in the browser: categories with sprite
 * thumbnails, search, the share-alike opt-in, per-slot recolouring with the
 * "modified" credit, the library's CREDITS.md, and the large preview on
 * hover and keyboard focus.
 */
import { expect, test } from '@playwright/test';

import { fileMenu, iconTile } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./?editor');
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

  await fileMenu(page, 'Attribution…');
  const dialog = page.getByRole('dialog', { name: 'Attribution and licences' });
  await expect(dialog.getByTestId('credit-line')).toContainText(
    'Bioicons: Servier (CC BY 3.0, modified)',
  );
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Reset colours' }).click();
  await fileMenu(page, 'Attribution…');
  await expect(dialog.getByTestId('credit-line')).toContainText('Servier (CC BY 3.0)');
  await expect(dialog.getByTestId('credit-line')).not.toContainText('modified');
});

test('turns a CC BY icon into line art by keyboard, credits it modified, and undoes', async ({
  page,
}) => {
  await (await iconTile(page, 'bi-erythrocyte-5', 'erythrocyte 5')).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await page.getByRole('button', { name: 'Line art' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('canvas').locator('[stroke="#1f2933"]').first()).toBeAttached();
  await expect(inspector).toContainText('modified');
  await page.keyboard.press('Control+z');
  await expect(inspector).not.toContainText('modified');
});

test('shows the library credits', async ({ page }) => {
  await page.getByRole('button', { name: 'Icon credits and licences' }).click();
  const dialog = page.getByRole('dialog', { name: 'Icon credits and licences' });
  await expect(dialog.getByTestId('credits')).toContainText('Icon credits');
  await expect(dialog.getByRole('heading', { name: 'Bioicons' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Health Icons' })).toBeVisible();
  await expect(dialog.locator('a[href^="https://"]').first()).toBeVisible();
});

test('a search lists matching scientific objects first, tagged, and places them', async ({
  page,
}) => {
  const search = page.getByLabel('Search icons');
  await search.fill('plate');
  await expect(page.getByRole('status')).toContainText(/3 adjustable objects, \d+\+? icons/);
  const results = page.getByTestId('icon-results');
  // The objects come before every icon, the title match first, each tagged.
  const first = results.locator('button').first();
  await expect(first).toHaveAttribute('data-kind', 'wellPlate');
  await expect(first).toHaveAccessibleName('Add Well plate (adjustable object)');
  await expect(first.locator('.adjustable-tag')).toHaveText('Adjustable');
  await expect(
    results.locator('.object-tile.tagged[data-kind="petriDish"]:not([data-preset])'),
  ).toBeVisible();
  await expect(results.getByRole('heading', { name: /Icons · fixed drawings/ })).toBeVisible();

  // Enter places it, like a click.
  await first.focus();
  await page.keyboard.press('Enter');
  const side = page.locator('.side');
  await expect(side.getByRole('region', { name: 'Well plate options' })).toBeVisible();

  // Dragging works as from the shelf.
  await results
    .getByRole('button', { name: 'Add Petri dish (adjustable object)' })
    .dragTo(page.getByTestId('canvas'));
  await expect(side.getByRole('region', { name: 'Petri dish options' })).toBeVisible();

  // A query no kind matches lists none.
  await search.fill('pipette');
  await expect(page.getByRole('status')).not.toContainText('adjustable');
  await expect(results.locator('.object-tile')).toHaveCount(0);
});

test('previews an icon large on hover and on keyboard focus', async ({ page }) => {
  const tile = await iconTile(page, 'neuron', 'neuron');
  const preview = page.getByRole('tooltip');
  await tile.hover();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Neuron');
  await expect(preview).toHaveAttribute('data-icon', 'neuron');
  await expect(tile).toHaveAttribute('aria-describedby', 'icon-preview');
  // Drawn from the icon's own SVG, not the sprite sheet, and actually loaded.
  const img = preview.locator('img');
  await expect(img).toHaveAttribute('src', /\.svg$/);
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
  expect((await preview.boundingBox())?.width ?? 0).toBeGreaterThan(150);
  // Leaving the tile closes it.
  await page.mouse.move(700, 15);
  await expect(preview).toHaveCount(0);

  // Keyboard: focus opens it at once, Escape closes it, and so does moving focus away.
  await page.getByLabel('Search icons').focus();
  const focused = page.locator('.icon-tile:focus');
  for (let i = 0; i < 6 && (await focused.count()) === 0; i++) await page.keyboard.press('Tab');
  await expect(focused).toHaveCount(1);
  await expect(preview).toBeVisible();
  const id = await focused.getAttribute('data-icon');
  await expect(preview).toHaveAttribute('data-icon', id ?? '');
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(page.locator(`.icon-tile[data-icon="${id ?? ''}"]`)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(preview).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(preview).toHaveAttribute('data-icon', id ?? '');
  await page.getByLabel('Search icons').focus();
  await expect(preview).toHaveCount(0);
});
