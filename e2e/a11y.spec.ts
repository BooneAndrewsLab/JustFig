/** Accessibility (note 09): axe finds no serious or critical problems in the main screen and the dialogs. */
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

async function audit(page: Page, include?: string) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) b = b.include(include);
  const r = await b.analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return bad.map(
    (v) =>
      `${v.id}: ${v.help} — ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 5)
        .join(' | ')}`,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('the editor has no serious accessibility problems', async ({ page }) => {
  expect(await audit(page)).toEqual([]);
  // Icon search results with tagged scientific objects above the icons.
  await page.getByLabel('Search icons').fill('plate');
  await expect(page.locator('.object-tile.tagged').first()).toBeVisible();
  expect(await audit(page, '.icons-panel')).toEqual([]);
});

test('the dialogs and the Inspector of each kind of selection have none either', async ({
  page,
}) => {
  const problems: string[] = [];
  for (const [button, name] of [
    ['Templates…', 'Templates and examples'],
    ['Shortcuts…', 'Keyboard shortcuts'],
    ['Export…', 'Export figure'],
    ['Attribution', 'Attribution'],
    ['Recent…', 'Recent figures'],
  ] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    problems.push(...(await audit(page, '.dialog')).map((p) => `${name}: ${p}`));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Add Well plate' }).click();
  problems.push(...(await audit(page, '.side')).map((p) => `well plate: ${p}`));
  // Arrange in grid needs a selection: the well plate just added is one.
  await page.keyboard.press('Shift+G');
  await expect(page.getByRole('dialog', { name: 'Arrange in grid' })).toBeVisible();
  problems.push(...(await audit(page, '.dialog')).map((p) => `Arrange in grid: ${p}`));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Save as preset, then the gallery's My presets tab with that preset in it.
  await page.locator('.side').getByRole('button', { name: 'Save as preset…' }).click();
  await expect(page.getByRole('dialog', { name: 'Save as preset' })).toBeVisible();
  problems.push(...(await audit(page, '.dialog')).map((p) => `Save as preset: ${p}`));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Templates…', exact: true }).click();
  await page.getByRole('tab', { name: 'My presets' }).click();
  await expect(page.locator('.preset-item')).toHaveCount(1);
  problems.push(...(await audit(page, '.dialog')).map((p) => `My presets: ${p}`));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the well map, the layers, the pages and the dialogs work from the keyboard', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add Well plate' }).click();
  const grid = page.getByRole('application', { name: /Wells/ });
  await grid.focus();
  await expect(page.locator('#wellmap-status')).toHaveText('A1: empty');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('#wellmap-status')).toContainText('B2: #');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.wellmap + p, .wellmap .note').first()).toContainText('3 of 96');
  // The plate did not move: the arrows belonged to the grid.
  await page.keyboard.press('Delete');
  await expect(page.locator('.wellmap .note').first()).toContainText('2 of 96');
  // One undo step per run of keys.
  await page.locator('.layers button.name').first().focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.wellmap .note').first()).toContainText('0 of 96');

  // Select from the layers list with the keyboard.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.status')).toContainText('Nothing selected');
  await page.locator('.layers button.name').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.status')).toContainText('1 selected');

  // A second page, reached with the arrow keys.
  await page.getByRole('button', { name: 'Add page' }).click();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await tabs.nth(1).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toBeFocused();

  // A dialog keeps focus inside, and gives it back.
  const opener = page.getByRole('button', { name: 'Shortcuts…' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  for (let i = 0; i < 80; i += 1) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
