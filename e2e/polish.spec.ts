/** Phase 4: arrow binding, templates, palettes, the shortcut editor, BarelySig import, the guide, keyboard access. */
import { type Page, expect, test } from '@playwright/test';

import { pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function at(page: Page, x: number, y: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

async function rect(page: Page, x: number, y: number, w: number, h: number) {
  await page.keyboard.press('r');
  await drag(page, await at(page, x, y), await at(page, x + w, y + h));
}

const field = (page: Page, name: string) => page.locator('.side').getByLabel(name, { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('an arrow drawn between two objects follows them, and detaches when dragged away', async ({
  page,
}) => {
  await rect(page, 40, 60, 60, 40);
  await rect(page, 240, 60, 60, 40);
  await page.keyboard.press('a');
  const a = await at(page, 70, 80);
  const b = await at(page, 270, 80);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(page.getByTestId('bind-target')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('bound-start')).toBeVisible();
  await expect(page.getByTestId('bound-end')).toBeVisible();
  // The ends sit on the rectangles' facing edges, not at the pointer.
  const x0 = Number(await field(page, 'X').inputValue());
  const w0 = Number(await field(page, 'W').inputValue());
  // Move the second rectangle down: the arrow's end follows.
  await page.locator('.layers .item .name', { hasText: 'Rect' }).first().click();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+ArrowDown');
  await page.locator('.layers .item .name', { hasText: 'Arrow' }).click();
  expect(Number(await field(page, 'H').inputValue())).toBeGreaterThan(5);
  expect(Number(await field(page, 'X').inputValue())).toBeCloseTo(x0, 0);
  expect(Number(await field(page, 'W').inputValue())).toBeCloseTo(w0, 0);
  await expect(page.getByTestId('bound-end')).toBeVisible();
  // Nudging the arrow itself detaches both ends.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bound-start')).toHaveCount(0);
  await expect(page.getByTestId('bound-end')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('bound-end')).toBeVisible();
  await page.getByRole('button', { name: 'Detach the end of the arrow' }).click();
  await expect(page.getByTestId('bound-end')).toHaveCount(0);
  await expect(page.getByTestId('bound-start')).toBeVisible();
});

test('a gallery example opens as a new figure, and a palette recolours it', async ({ page }) => {
  await page.getByRole('button', { name: 'Templates…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Templates and examples' });
  await expect(dialog.locator('.gallery-card')).toHaveCount(3);
  await dialog.getByRole('tab', { name: 'Examples' }).click();
  await dialog.locator('[data-entry="signalling-pathway"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Figure title')).toHaveValue('Signalling pathway');
  await expect(page.locator('.layers .item .name', { hasText: 'Arrow' })).toHaveCount(5);
  const ligand = page.getByLabel('Colour of Ligand');
  await expect(ligand).toHaveValue('#e69f00');
  await page.locator('#palette-choice').selectOption('tol-bright');
  await page.getByRole('button', { name: 'Apply to figure' }).click();
  await expect(ligand).toHaveValue('#4477aa');
  // Colour-vision preview is on screen only.
  await page.getByLabel('Preview as').selectOption('deuteranopia');
  await expect(page.getByTestId('vision')).toHaveAttribute('filter', 'url(#vision-deuteranopia)');
  if (process.env['E2E_OUT'])
    await page.screenshot({
      path: `${process.env['E2E_OUT']}/gallery-${test.info().project.name}.png`,
    });
  await page.locator('#vision').blur();
  await page.keyboard.press('Control+z');
  await expect(ligand).toHaveValue('#e69f00');
});

test('a shortcut moved in Keyboard shortcuts works at once and after a reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Shortcuts…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await dialog.getByRole('button', { name: 'Change the key for Rectangle tool' }).click();
  await page.keyboard.press('Control+w');
  await expect(dialog.getByRole('alert')).toContainText('belongs to the browser');
  await page.keyboard.press('q');
  await expect(dialog.locator('[data-action="tool-rect"] kbd')).toHaveText('Q');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-tool="rect"]')).toHaveAttribute('title', /\(Q\)/);
  await page.keyboard.press('q');
  await expect(page.locator('[data-tool="rect"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await expect(page.locator('[data-tool="rect"]')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await page.keyboard.press('q');
  await expect(page.locator('[data-tool="rect"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Shortcuts…' }).click();
  await page.getByRole('button', { name: 'All back to their defaults' }).click();
  await expect(dialog.locator('[data-action="tool-rect"] kbd')).toHaveText('R');
});

test('a BarelySig SVG imports as its graph, at its size, with its recipe', async ({ page }) => {
  await page
    .getByTestId('import-input')
    .setInputFiles(new URL('../src/io/fixtures/barelysig-figure2.svg', import.meta.url).pathname);
  await expect(page.locator('.side').getByRole('region', { name: 'From BarelySig' })).toBeVisible();
  await expect(page.locator('.layers .item .name', { hasText: 'Figure 2' })).toBeVisible();
  // 70 mm × 60 mm, as BarelySig drew it.
  expect(Number(await field(page, 'W').inputValue())).toBeCloseTo(70, 0);
  expect(Number(await field(page, 'H').inputValue())).toBeCloseTo(60, 0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .bsig for BarelySig' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Figure 2.bsig');
});
