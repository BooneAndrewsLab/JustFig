/** Durable storage (note 02): a failed autosave shows a persistent banner until a save works. */
import { type Page, expect, test } from '@playwright/test';

import { pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function rect(page: Page, x: number, y: number, w: number, h: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  await page.keyboard.press('r');
  await page.mouse.move(b.x + x * k, b.y + y * k);
  await page.mouse.down();
  await page.mouse.move(b.x + (x + w) * k, b.y + (y + h) * k, { steps: 8 });
  await page.mouse.up();
}

test('a full browser store shows the banner with a download, and clears on the next save', async ({
  page,
}) => {
  // Writes to IndexedDB throw a quota error while the flag is set.
  await page.addInitScript(() => {
    const proto = IDBObjectStore.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with its own `this` below
    const orig = proto.put;
    proto.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if ((window as unknown as { __full?: boolean }).__full) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return orig.call(this, value, key);
    };
  });
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  const banner = page.getByRole('alert').filter({ hasText: 'Not saved in this browser' });

  await page.getByLabel('Figure title').fill('Figure A');
  await page.getByLabel('Figure title').blur();
  await expect(page.getByLabel('Figure title')).toHaveValue('Figure A');
  await page.evaluate(() => {
    (window as unknown as { __full?: boolean }).__full = true;
  });
  await rect(page, 30, 30, 40, 40);
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toContainText('Figure A');

  // Keyboard reachable, and it downloads the figure.
  const button = banner.getByRole('button', { name: 'Download a copy' });
  await button.focus();
  await expect(button).toBeFocused();
  const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(file.suggestedFilename().replaceAll('_', ' ')).toBe('Figure A.jfig');

  // Space is back: the next save succeeds and the banner goes.
  await page.evaluate(() => {
    (window as unknown as { __full?: boolean }).__full = false;
  });
  await rect(page, 90, 30, 40, 40);
  await expect(banner).toBeHidden({ timeout: 10_000 });
});
