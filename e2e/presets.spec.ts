/** Presets (note 22): save a selection, place it from My presets, export, delete and import it. */
import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

import { fileMenu, iconTile, pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function at(page: Page, x: number, y: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

async function rect(page: Page, x: number, y: number, w: number, h: number) {
  await page.keyboard.press('r');
  const a = await at(page, x, y);
  const b = await at(page, x + w, y + h);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

const items = (page: Page) => page.locator('.layers .item');

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('a selection saved as a preset is placed, exported, deleted and imported again', async ({
  page,
}) => {
  await rect(page, 40, 60, 60, 40);
  await (await iconTile(page, 'petri-dish', 'petri dish')).click();
  await expect(page.locator('.layers .item .name', { hasText: 'Petri dish' })).toHaveCount(1);
  const before = await items(page).count();
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await page.locator('.side').getByRole('button', { name: 'Save as preset…' }).click();

  const save = page.getByRole('dialog', { name: 'Save as preset' });
  await expect(save.getByLabel('Preset name')).toBeFocused();
  await save.getByLabel('Preset name').fill('Dish and box');
  await page.keyboard.press('Enter');
  await expect(save).toBeHidden();
  await expect(page.locator('.status')).toContainText('Saved preset “Dish and box”');

  // Place it from the gallery, by keyboard: one undo step adds both objects.
  await fileMenu(page, 'Templates…');
  const gallery = page.getByRole('dialog', { name: 'Templates and examples' });
  await gallery.getByRole('tab', { name: 'My presets' }).click();
  const card = gallery.getByRole('button', { name: 'Place Dish and box' });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(gallery).toBeHidden();
  await expect(items(page)).toHaveCount(before + 2);
  await expect(page.locator('.layers .item .name', { hasText: 'Petri dish' })).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(items(page)).toHaveCount(before);

  // Export, then delete, then import the file back.
  await fileMenu(page, 'Templates…');
  await gallery.getByRole('tab', { name: 'My presets' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    gallery.getByRole('button', { name: 'Export all presets' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('presets.jfigpresets');
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  const file = JSON.parse(text) as {
    format: string;
    presets: { name: string }[];
    assets: Record<string, { kind: string; meta: { license: string } }>;
  };
  expect(file.format).toBe('justfig-presets');
  expect(file.presets.map((p) => p.name)).toEqual(['Dish and box']);
  const icons = Object.values(file.assets).filter((a) => a.kind === 'icon');
  expect(icons).toHaveLength(1);
  expect(icons[0]?.meta.license).toBeTruthy();

  await gallery.getByRole('button', { name: 'Delete Dish and box' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this preset?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(gallery.getByText('No presets yet.')).toBeVisible();

  const input = page.getByTestId('preset-import-input');
  await input.setInputFiles({
    name: 'broken.jfigpresets',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"justfig-presets","schemaVersion":1,"presets":[]}'),
  });
  await expect(page.locator('.status')).toContainText('damaged');
  await expect(gallery.getByText('No presets yet.')).toBeVisible();

  await input.setInputFiles({
    name: 'presets.jfigpresets',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(gallery.getByRole('button', { name: 'Place Dish and box' })).toBeVisible();
  await expect(page.locator('.status')).toContainText('Added 1 preset.');
  // Importing it again adds nothing.
  await input.setInputFiles({
    name: 'presets.jfigpresets',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('.status')).toContainText('already here');
  await expect(gallery.locator('.preset-item')).toHaveCount(1);

  await gallery.getByRole('button', { name: 'Place Dish and box' }).click();
  await expect(items(page)).toHaveCount(before + 2);
});
