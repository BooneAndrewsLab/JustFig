/** Several figures open at once, in tabs (note 25). */
import { type Page, expect, test } from '@playwright/test';

import { fileMenu, iconTile, pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function rect(page: Page, x: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  await page.keyboard.press('r');
  await page.mouse.move(b.x + x * k, b.y + 30 * k);
  await page.mouse.down();
  await page.mouse.move(b.x + (x + 30) * k, b.y + 60 * k, { steps: 6 });
  await page.mouse.up();
}

const rects = (page: Page) => page.locator('.layers .item .name', { hasText: 'Rect' });
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open figures' }).getByRole('tab');
const title = (page: Page) => page.getByLabel('Figure title');

async function setTitle(page: Page, name: string) {
  await title(page).fill(name);
  await title(page).blur();
}

/** Figure A with two rectangles, then figure B (New) with one, B in front. */
async function twoFigures(page: Page) {
  await setTitle(page, 'Figure A');
  await rect(page, 20);
  await rect(page, 80);
  await expect(rects(page)).toHaveCount(2);
  await fileMenu(page, 'New');
  await expect(tabs(page)).toHaveCount(2);
  await expect(rects(page)).toHaveCount(0);
  await setTitle(page, 'Figure B');
  await rect(page, 20);
  await expect(rects(page)).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  page.on('dialog', (d) => {
    // Leaving with figures never saved to a file asks (on purpose); nothing else may.
    if (d.type() !== 'beforeunload') throw new Error('window.confirm must not be used');
    void d.accept();
  });
});

test('two figures in tabs: switch by mouse and keyboard, each with its own undo and zoom', async ({
  page,
}) => {
  await expect(tabs(page)).toHaveCount(1);
  await twoFigures(page);
  await expect(tabs(page).nth(0)).toHaveAccessibleName('Figure A, unsaved');
  await expect(tabs(page).nth(1)).toHaveAccessibleName('Figure B, unsaved');
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');

  // B zoomed in; A keeps its own zoom.
  await page.keyboard.press('Shift+Equal');
  const zoomB = await page.getByTitle('Fit page').textContent();
  await page.keyboard.press('Alt+1');
  await expect(title(page)).toHaveValue('Figure A');
  await expect(rects(page)).toHaveCount(2);
  await expect(page.getByTitle('Fit page')).not.toHaveText(zoomB ?? '');
  // Undo in A takes A's last rectangle, never B's.
  await page.keyboard.press('Control+z');
  await expect(rects(page)).toHaveCount(1);
  await page.keyboard.press('Alt+2');
  await expect(title(page)).toHaveValue('Figure B');
  await expect(rects(page)).toHaveCount(1);
  await expect(page.getByTitle('Fit page')).toHaveText(zoomB ?? '');

  // The strip itself: Tab reaches the front tab, arrows move and bring forward.
  await tabs(page).nth(1).focus();
  await expect(tabs(page).nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs(page).nth(0)).toBeFocused();
  await expect(title(page)).toHaveValue('Figure A');
  await expect(tabs(page).nth(0)).toHaveAttribute('tabindex', '0');
  await expect(tabs(page).nth(1)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(tabs(page).nth(1)).toBeFocused();
  await expect(title(page)).toHaveValue('Figure B');

  // Move the front tab left with the keyboard, and back by dragging.
  await page.keyboard.press('Alt+Shift+PageUp');
  await expect(tabs(page).nth(0)).toHaveAccessibleName('Figure B, unsaved');
  await tabs(page)
    .nth(0)
    .dragTo(tabs(page).nth(1), { targetPosition: { x: 60, y: 5 } });
  await expect(tabs(page).nth(0)).toHaveAccessibleName('Figure A, unsaved');
  await expect(tabs(page).nth(1)).toHaveAccessibleName('Figure B, unsaved');
});

test('copy in one figure, paste in another: the icon brings its asset along', async ({ page }) => {
  await setTitle(page, 'Source');
  await (await iconTile(page, 'petri-dish', 'petri dish')).click();
  const icons = page.locator('.layers .item .name', { hasText: /petri/i });
  await expect(icons).toHaveCount(1);
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: 'Add a figure tab' }).click();
  await expect(tabs(page)).toHaveCount(2);
  await setTitle(page, 'Target');
  await expect(icons).toHaveCount(0);
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+v');
  await expect(icons).toHaveCount(1);

  // The pasted icon is credited in the receiving figure.
  await fileMenu(page, 'Attribution…');
  const dialog = page.getByRole('dialog', { name: 'Attribution' });
  await expect(dialog).toContainText(/petri/i);
  await page.keyboard.press('Escape');

  // And it is kept with the figure: after a reload, both tabs are back, Target in front.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(tabs(page)).toHaveCount(2);
  await expect(title(page)).toHaveValue('Target');
  await expect(icons).toHaveCount(1);
});

test('reload reopens the open figures in order with the front one in front', async ({ page }) => {
  await twoFigures(page);
  await page.keyboard.press('Alt+1');
  await expect(title(page)).toHaveValue('Figure A');
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(0)).toContainText('Figure A');
  await expect(tabs(page).nth(1)).toContainText('Figure B');
  await expect(title(page)).toHaveValue('Figure A');
  await expect(rects(page)).toHaveCount(2);
  await page.keyboard.press('Alt+2');
  await expect(rects(page)).toHaveCount(1);
});

test('closing an unsaved tab keeps the figure; opening it again brings its tab forward', async ({
  page,
}) => {
  await twoFigures(page);
  // No waiting for autosave: closing writes it first.
  await page.getByRole('tab', { name: 'Figure B, unsaved' }).locator('.tabstrip-close').click();
  await expect(tabs(page)).toHaveCount(1);
  await expect(title(page)).toHaveValue('Figure A');

  await page.getByRole('button', { name: 'Recent…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recent figures' });
  await expect(dialog.locator('.recent-row')).toHaveCount(2);
  // Figure A is open, so it can't be deleted; B is closed, so it can.
  await expect(dialog.getByRole('button', { name: 'Delete Figure A' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Delete Figure B' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Open Figure B' }).click();
  await expect(dialog).toBeHidden();
  await expect(tabs(page)).toHaveCount(2);
  await expect(title(page)).toHaveValue('Figure B');
  await expect(rects(page)).toHaveCount(1);

  // Opening A again brings its tab forward rather than a second copy.
  await page.keyboard.press('Shift+O');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Open Figure A' }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(title(page)).toHaveValue('Figure A');

  // Alt+W closes the front tab; Delete on a focused tab closes that one.
  await page.keyboard.press('Alt+w');
  await expect(tabs(page)).toHaveCount(1);
  await expect(title(page)).toHaveValue('Figure B');
  await tabs(page).first().focus();
  await expect(tabs(page).first()).toBeFocused();
  await page.keyboard.press('Delete');
  // The last tab closed leaves an empty New figure, which the next figure opened takes over.
  await expect(tabs(page)).toHaveCount(1);
  await expect(rects(page)).toHaveCount(0);
  await page.keyboard.press('Shift+O');
  await dialog.getByRole('button', { name: 'Open Figure B' }).click();
  await expect(tabs(page)).toHaveCount(1);
  await expect(title(page)).toHaveValue('Figure B');
});
