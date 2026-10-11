/** The front page (note 57): shown while no figure is on screen. The only spec that opens './' without ?editor. */
import { readFileSync } from 'node:fs';

import { type Page, expect, test } from '@playwright/test';

import { audit, downloadFallback } from './helpers';

const heading = (page: Page) =>
  page.getByRole('heading', { name: 'Figures for papers, posters and grants.' });
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open figures' }).getByRole('tab');
const title = (page: Page) => page.getByLabel('Figure title');
const logo = (page: Page) => page.getByRole('button', { name: /front page/i });

async function addRect(page: Page) {
  await page.keyboard.press('r');
  const b = await page.getByTestId('page').boundingBox();
  if (!b) throw new Error('page not visible');
  await page.mouse.move(b.x + 40, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + 100, { steps: 6 });
  await page.mouse.up();
}

/** Starts in the editor, names the figure and draws in it, so it is kept and not untouched. */
async function touched(page: Page, name: string) {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await title(page).fill(name);
  await title(page).blur();
  await addRect(page);
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(1);
}

test('a first visit shows the front page, and its buttons leave it', async ({ page }) => {
  await page.goto('./');
  await expect(heading(page)).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to your figures' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recent figures' })).toBeHidden();
  await expect(page.locator('.landing-foot')).toContainText('MIT licence');

  await page.getByRole('button', { name: 'New figure' }).click();
  await expect(heading(page)).toBeHidden();
  await expect(tabs(page)).toHaveCount(1);
});

test('a template card and the example each start a figure', async ({ page }) => {
  await page.goto('./');
  const card = page.locator('.home-type .type-open').first();
  const name = (await card.textContent()) ?? '';
  await card.click();
  await expect(heading(page)).toBeHidden();
  await expect(tabs(page)).toHaveCount(1);
  await expect(page.locator('.layers .item').first()).toBeVisible();
  expect(name).not.toBe('');

  await logo(page).click();
  await expect(heading(page)).toBeVisible();
  await page.getByRole('button', { name: 'Try an example' }).click();
  await expect(heading(page)).toBeHidden();
  await expect(tabs(page)).toHaveCount(2);
});

test('More templates opens the Templates dialog over the front page', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More templates and examples…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(heading(page)).toBeVisible();
});

test('closing the last tab shows it again, a reload stays on it, and Recent opens the figure', async ({
  page,
}) => {
  await touched(page, 'Kept figure');
  await page.keyboard.press('Alt+w');
  await expect(heading(page)).toBeVisible();

  await page.goto('./');
  await expect(heading(page)).toBeVisible();
  const recent = page.getByRole('region', { name: 'Recent figures' });
  await expect(recent.getByText('Kept figure')).toBeVisible();
  await recent.getByRole('button', { name: 'Open Kept figure' }).click();
  await expect(heading(page)).toBeHidden();
  await expect(title(page)).toHaveValue('Kept figure');
});

test('the logo returns with the tabs kept, and Back to your figures restores the front tab', async ({
  page,
}) => {
  await touched(page, 'Figure A');
  await logo(page).click();
  await expect(heading(page)).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);

  const recent = page.getByRole('region', { name: 'Recent figures' });
  await expect(recent.getByText('Open now')).toBeVisible();
  await page.getByRole('button', { name: 'Back to your figures' }).click();
  await expect(heading(page)).toBeHidden();
  await expect(tabs(page)).toHaveCount(1);
  await expect(title(page)).toHaveValue('Figure A');

  // Choosing the open figure in Recent brings its tab forward and leaves the front page.
  await logo(page).click();
  await page.getByRole('button', { name: 'Open Figure A' }).click();
  await expect(heading(page)).toBeHidden();
  await expect(title(page)).toHaveValue('Figure A');
  await expect(tabs(page)).toHaveCount(1);
});

test('Open… reads a figure file, and a dropped file opens too', async ({ page }, info) => {
  await downloadFallback(page);
  await touched(page, 'From a file');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const file = info.outputPath('from-a-file.jfig');
  await download.saveAs(file);
  await page.keyboard.press('Alt+w');
  await expect(heading(page)).toBeVisible();

  await page.getByTestId('open-input').setInputFiles(file);
  await expect(heading(page)).toBeHidden();
  await expect(title(page)).toHaveValue('From a file');

  // Back on the front page, an SVG dropped on the window is imported.
  await page.keyboard.press('Alt+w');
  await expect(heading(page)).toBeVisible();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="30" height="30"/></svg>',
        ],
        'dropped.svg',
        { type: 'image/svg+xml' },
      ),
    );
    document.body.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(heading(page)).toBeHidden();
  await expect(tabs(page)).toHaveCount(1);
  expect(readFileSync(file).length).toBeGreaterThan(0);
});

test('keys: Ctrl+O and ? act, editing keys do nothing, and Tab reaches New figure', async ({
  page,
}) => {
  await page.goto('./');
  await expect(heading(page)).toBeVisible();
  await page.keyboard.press('r');
  await page.keyboard.press('Control+a');
  await expect(heading(page)).toBeVisible();

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.keyboard.press('Shift+O');
  await expect(page.getByRole('dialog', { name: 'Recent figures' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Keyboard only: Tab to New figure and press Enter.
  const create = page.getByRole('button', { name: 'New figure' });
  for (let i = 0; i < 8 && !(await create.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(create).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toBeHidden();
  await expect(tabs(page)).toHaveCount(1);
});

test('the front page has no serious accessibility problems', async ({ page }) => {
  await page.goto('./');
  await expect(heading(page)).toBeVisible();
  await expect(page.locator('.home-thumb img').first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
});
