/**
 * The right column's tabs (note 59): one panel at a time, so the Layers list keeps its
 * place whatever the selection puts in the Inspector; chosen by click, arrow keys and
 * shortcut; remembered; and brought to Notes by a note.
 */
import { type Locator, expect, test } from '@playwright/test';

import { sideTab } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

const top = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not visible');
  return b.y;
};

test('the Layers list stays put across selections, and selecting never switches the tab', async ({
  page,
}) => {
  const tabs = page.getByRole('tablist', { name: 'Panels' });
  await expect(tabs.getByRole('tab')).toHaveText(['Inspector', 'Layers', 'Notes']);
  await expect(tabs.getByRole('tab', { name: 'Inspector' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Add Cell' }).click();
  await expect(page.getByRole('region', { name: 'Cell options' })).toBeVisible();
  await page.getByRole('button', { name: 'Convert to shapes' }).click();

  await sideTab(page, 'Layers');
  await expect(page.getByRole('region', { name: 'Cell options' })).toBeHidden();
  const row = (name: string) => page.locator('.layers .item .name', { hasText: name });
  const y0 = await top(row('Cell'));
  // Nothing, the group, then a part inside it: the row never moves and the tab stays.
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.status')).toContainText('Nothing selected');
  expect(await top(row('Cell'))).toBe(y0);
  await row('Cell').click();
  await expect(page.locator('.layers .item.selected .name')).toHaveText('Cell');
  expect(await top(row('Cell'))).toBe(y0);
  await page.locator('.layers').getByRole('button', { name: 'Expand' }).first().click();
  await row('Nucleus').click();
  await expect(page.locator('.layers .item.selected .name')).toHaveText('Nucleus');
  expect(await top(row('Cell'))).toBe(y0);
  await expect(tabs.getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true');

  // The Inspector then shows the part.
  await sideTab(page, 'Inspector');
  await expect(page.getByRole('region', { name: 'Nucleus' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Style' })).toBeVisible();
});

test('tabs work from the keyboard and by shortcut, and are remembered', async ({ page }) => {
  const tab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
  await tab('Inspector').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Layers')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Layers')).toBeFocused();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(tab('Notes')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Notes' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Inspector')).toHaveAttribute('aria-selected', 'true');

  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Alt+l');
  await expect(tab('Layers')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Alt+n');
  await expect(tab('Notes')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Alt+i');
  await expect(tab('Inspector')).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Alt+l');
  await page.reload();
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await expect(tab('Layers')).toHaveAttribute('aria-selected', 'true');
});

test('a note brings the Notes tab to the front and counts on it', async ({ page }) => {
  const tab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
  await page.getByRole('button', { name: 'Add Cell' }).click();
  await page.keyboard.press('n');
  const b = await page.locator('.canvas').boundingBox();
  if (!b) throw new Error('no canvas');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(tab('Notes')).toHaveAttribute('aria-selected', 'true');
  const notes = page.getByRole('region', { name: 'Notes' });
  await notes.getByRole('textbox', { name: 'Note text' }).fill('Check the scale');
  await notes.getByRole('button', { name: 'Add note' }).click();
  await expect(tab('Notes')).toHaveAccessibleName('Notes, 1 open');
  await expect(tab('Notes')).toContainText('1');

  await page.keyboard.press('Alt+i');
  await expect(tab('Inspector')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('note-marker').first().click();
  await expect(tab('Notes')).toHaveAttribute('aria-selected', 'true');
});
