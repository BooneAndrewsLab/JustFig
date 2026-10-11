/** Crash recovery (note 26): a render error leaves the figures recoverable. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { fileMenu, pageBox } from './helpers';

test('an injected render error shows the recovery screen; download and reload keep the tabs', async ({
  page,
}) => {
  page.on('dialog', (d) => {
    if (d.type() !== 'beforeunload') throw new Error('window.confirm must not be used');
    void d.accept();
  });
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  const title = page.getByLabel('Figure title');
  const tabs = page.getByRole('tablist', { name: 'Open figures' }).getByRole('tab');

  await title.fill('Crash A');
  await title.blur();
  const b = await pageBox(page);
  await page.keyboard.press('r');
  await page.mouse.move(b.x + 40, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + 100, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.layers .item .name', { hasText: 'Rect' })).toHaveCount(1);
  await fileMenu(page, 'New');
  await expect(tabs).toHaveCount(2);
  await title.fill('Crash B');
  await title.blur();
  await expect(title).toHaveValue('Crash B');

  // Break the next render, then change something so one happens.
  await page.evaluate(() => {
    (window as unknown as { __justfigCrash?: string }).__justfigCrash = 'test';
  });
  await title.fill('Crash B edited');

  const recovery = page.getByRole('alertdialog');
  await expect(recovery).toBeVisible();
  await expect(recovery).toBeFocused();
  await expect(recovery).toContainText('TypeError');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );

  // Keyboard: Tab reaches a download button; Enter downloads the figure.
  const button = recovery.getByRole('button', { name: 'Download a copy of Crash B edited' });
  await button.focus();
  await expect(button).toBeFocused();
  const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(file.suggestedFilename().replaceAll('_', ' ')).toBe('Crash B edited.jfig');
  expect(readFileSync(await file.path(), 'utf8')).toContain('Crash B edited');
  await expect(recovery.getByRole('button', { name: 'Download a copy of Crash A' })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __justfigCrash?: string }).__justfigCrash = '';
  });
  await recovery.getByRole('button', { name: 'Save and reload' }).click();
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await expect(tabs).toHaveCount(2);
  await expect(page.getByRole('tab', { name: /Crash A/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Crash B edited/ })).toBeVisible();
});

test('an uncaught error shows a status message and keeps the app', async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('boom');
    }, 0);
  });
  await expect(page.locator('.status .notice-error')).toContainText('Something went wrong');
  await expect(page.getByLabel('Figure title')).toBeVisible();
});
