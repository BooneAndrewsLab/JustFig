/**
 * Save in place (note 38). Playwright cannot grant File System Access, so the
 * picker is a stub that writes to memory; the real API is checked by hand.
 */
import { expect, test } from '@playwright/test';

const stubPickers = () => {
  const w = window as unknown as Record<string, unknown>;
  const writes: string[] = [];
  const picks: string[] = [];
  w['__writes'] = writes;
  w['__picks'] = picks;
  w['showSaveFilePicker'] = (o: { suggestedName: string }) => {
    picks.push(o.suggestedName);
    return Promise.resolve({
      name: o.suggestedName,
      createWritable: () =>
        Promise.resolve({
          write: (d: string) => {
            writes.push(d);
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
    });
  };
};

test('without the File System Access API there is no Save as button', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showSaveFilePicker');
    Reflect.deleteProperty(window, 'showOpenFilePicker');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Save as…' })).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.jfig$/);
});

test('Save asks once, then writes the same file; Save as always asks', async ({ page }) => {
  await page.addInitScript(stubPickers);
  await page.goto('/');
  const read = (k: string) => page.evaluate((key) => (window as never)[key] as string[], k);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await read('__writes')).length).toBe(1);
  expect(await read('__picks')).toHaveLength(1);
  await expect(page).toHaveTitle(/\.jfig/);

  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await read('__writes')).length).toBe(2);
  expect(await read('__picks')).toHaveLength(1);

  await page.keyboard.press('Control+Shift+S');
  await expect.poll(async () => (await read('__picks')).length).toBe(2);
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect.poll(async () => (await read('__picks')).length).toBe(3);
});
