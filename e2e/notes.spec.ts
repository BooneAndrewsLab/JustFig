/** Review notes (note 24): on an object and on a point, edit, resolve, reply, delete, undo; kept in the file, never exported. */
import { readFileSync } from 'node:fs';

import { type Page, expect, test } from '@playwright/test';

import { exportVia, pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;

async function at(page: Page, x: number, y: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

async function rect(page: Page, x: number, y: number, w: number, h: number) {
  await page.keyboard.press('r');
  const a = await at(page, x, y);
  const z = await at(page, x + w, y + h);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 8 });
  await page.mouse.up();
}

const notes = (page: Page) => page.getByRole('region', { name: 'Notes' });
const markers = (page: Page) => page.getByTestId('note-marker');
const heads = (page: Page) => notes(page).locator('.note-head');

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') return void d.accept();
    throw new Error('window.confirm must not be used');
  });
});

test('notes on an object and on a point: write, follow, edit, resolve, reply, delete, undo', async ({
  page,
}) => {
  await rect(page, 30, 30, 60, 40);
  await notes(page).getByLabel('Your name').fill('PI');
  await notes(page).getByLabel('Your name').blur();

  // The Review note tool on the rectangle pins the note to it.
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  const inRect = await at(page, 60, 50);
  await page.mouse.click(inRect.x, inRect.y);
  await expect(notes(page)).toContainText('New note on Rect');
  await expect(notes(page).getByLabel('Note text')).toBeFocused();
  await page.keyboard.type('Make <b>this</b> bigger');
  await notes(page).getByRole('button', { name: 'Add note' }).click();
  await expect(markers(page)).toHaveCount(1);
  await expect(notes(page).locator('.note-text')).toHaveText('Make <b>this</b> bigger');
  await expect(notes(page)).toContainText('PI ·');
  await expect(notes(page)).toContainText('on Rect');

  // Its marker follows the rectangle when it moves.
  const before = await markers(page).first().boundingBox();
  await page.locator('.layers .item .name', { hasText: 'Rect' }).click();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  const after = await markers(page).first().boundingBox();
  expect((after?.x ?? 0) - (before?.x ?? 0)).toBeGreaterThan(5);

  // The tool on an empty spot pins a note to that point; Escape and Cancel leave no note.
  await page.keyboard.press('n');
  const empty = await at(page, 300, 200);
  await page.mouse.click(empty.x, empty.y);
  await expect(notes(page)).toContainText('New note on the page');
  await page.keyboard.press('Escape');
  await expect(notes(page).getByLabel('Note text')).toHaveCount(0);
  await page.keyboard.press('n');
  await page.mouse.click(empty.x, empty.y);
  await expect(notes(page).getByLabel('Note text')).toBeFocused();
  await page.keyboard.type('Room for a legend');
  await page.keyboard.press('Control+Enter');
  await expect(markers(page)).toHaveCount(2);
  await expect(heads(page)).toHaveCount(2);

  // Edit, resolve, reply, each one undo step.
  await notes(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await notes(page).getByLabel('Edit note text').fill('Room for the legend');
  await notes(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(notes(page).locator('.note-text')).toHaveText('Room for the legend');
  await notes(page).getByLabel('Reply').fill('Will do');
  await notes(page).getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(notes(page).locator('.note-replies li')).toHaveCount(1);
  await notes(page).getByRole('button', { name: 'Resolve' }).click();
  await expect(notes(page).getByRole('button', { name: 'Reopen' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Undo/ }).first()).toHaveAttribute(
    'title',
    /Undo Resolve note/,
  );
  await page.keyboard.press('Control+z');
  await expect(notes(page).getByRole('button', { name: 'Resolve' })).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(notes(page).getByRole('button', { name: 'Reopen' })).toBeVisible();

  // Arrow keys move between notes in the list.
  await heads(page).first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(heads(page).nth(1)).toBeFocused();

  // Deleting the rectangle leaves its note on the page, where it was; undo brings both back.
  await heads(page).first().click();
  await expect(notes(page)).toContainText('on Rect');
  await page.locator('.layers .item .name', { hasText: 'Rect' }).click();
  await page.keyboard.press('Delete');
  await expect(markers(page)).toHaveCount(2);
  await expect(notes(page)).not.toContainText('on Rect');
  await page.keyboard.press('Control+z');
  await expect(notes(page)).toContainText('on Rect');

  // Delete a note; undo restores it.
  await notes(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(markers(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(markers(page)).toHaveCount(2);

  // Hiding the markers keeps the notes listed.
  await notes(page).getByLabel('Show notes on the canvas').uncheck();
  await expect(markers(page)).toHaveCount(0);
  await expect(heads(page)).toHaveCount(2);
  await notes(page).getByLabel('Show notes on the canvas').check();
  await expect(markers(page)).toHaveCount(2);
});

test('notes survive saving and reopening the file, and no export carries them', async ({
  page,
}, info) => {
  await rect(page, 30, 30, 60, 40);
  await page.keyboard.press('Escape');
  await notes(page).getByRole('button', { name: '+ Note' }).click();
  await expect(notes(page).getByLabel('Note text')).toBeFocused();
  await page.keyboard.type('SECRET-REVIEW-NOTE');
  await page.keyboard.press('Control+Enter');
  await expect(markers(page)).toHaveCount(1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const file = info.outputPath('notes.jfig');
  await download.saveAs(file);
  const saved = JSON.parse(readFileSync(file, 'utf8')) as {
    schemaVersion: number;
    document: { notes: { text: string }[] };
  };
  expect(saved.schemaVersion).toBe(2);
  expect(saved.document.notes.map((n) => n.text)).toEqual(['SECRET-REVIEW-NOTE']);

  for (const format of ['SVG', 'PDF'] as const) {
    const out = await exportVia(page, format);
    const path = info.outputPath(`out.${format.toLowerCase()}`);
    await out.saveAs(path);
    expect(readFileSync(path).toString('latin1')).not.toContain('SECRET-REVIEW-NOTE');
  }

  await page.getByRole('button', { name: 'New' }).click();
  await expect(heads(page)).toHaveCount(0);
  await page.getByTestId('open-input').setInputFiles(file);
  await expect(heads(page)).toHaveCount(1);
  await expect(markers(page)).toHaveCount(1);
  await heads(page).first().click();
  await expect(notes(page).locator('.note-text')).toHaveText('SECRET-REVIEW-NOTE');
});
