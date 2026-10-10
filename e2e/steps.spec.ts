/** Numbered steps (note 48): badges numbered in reading order that renumber when a step moves. */
import AxeBuilder from '@axe-core/playwright';
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

/** Each badge's number and X (mm), left to right on the page, read from the Inspector. */
async function badgesLeftToRight(page: Page): Promise<{ x: number; n: string }[]> {
  const items = page.locator('.layers .item .name', { hasText: 'Step' });
  await expect(items).toHaveCount(3);
  const found: { x: number; n: string }[] = [];
  for (let i = 0; i < 3; i += 1) {
    await items.nth(i).click();
    const note = page.locator('.side section[aria-label="Step"] .note');
    await expect(note).toBeVisible();
    const n = /Step (\d+)/.exec((await note.textContent()) ?? '')?.[1] ?? '?';
    const x = Number(await page.locator('.side').getByLabel('X', { exact: true }).inputValue());
    found.push({ x, n });
  }
  return found.sort((a, b) => a.x - b.x);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('number three rectangles from the keyboard; moving the first to the end renumbers them', async ({
  page,
}) => {
  await rect(page, 20, 60, 60, 40);
  await rect(page, 120, 60, 60, 40);
  await rect(page, 220, 60, 60, 40);
  await page.keyboard.press('Control+a');
  await expect(page.locator('.status')).toContainText('3 selected');
  await expect(page.getByRole('button', { name: 'Number steps' })).toBeVisible();
  await page.keyboard.press('Shift+N');
  await expect(page.locator('.layers .item .name', { hasText: 'Step' })).toHaveCount(3);
  const before = await badgesLeftToRight(page);
  expect(before.map((b) => b.n)).toEqual(['1', '2', '3']);
  expect(before[0]?.x ?? 99).toBeLessThan(10);

  // The Step section passes axe.
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.side')
    .analyze();
  expect(
    r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id),
  ).toEqual([]);

  // Drag the first rectangle (by its middle, clear of its badge) past the third.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await drag(page, await at(page, 50, 85), await at(page, 350, 85));
  const after = await badgesLeftToRight(page);
  expect(after.map((b) => b.n)).toEqual(['1', '2', '3']);
  // The moved rectangle's badge went with it: the last one, now 3, is past the others.
  expect(after[2]?.x ?? 0).toBeGreaterThan(100);
});
