/**
 * Resizing an imported plot keeps its text and line sizes (issue 3, note 17):
 * from the keyboard (Inspector W and H), by dragging a handle (one undo step,
 * timed), plain scaling when switched off, and axe on the Inspector.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

import { exportVia } from './helpers';

const fixture = (name: string) =>
  fileURLToPath(new URL(`../src/io/svg/fixtures/${name}.svg`, import.meta.url));

const side = (page: Page) => page.locator('.side');
const styles = (page: Page) => page.getByRole('region', { name: 'Text and lines' });
const keep = (page: Page) => side(page).getByLabel('Keep plot text and line sizes');
const field = (page: Page, name: string) => side(page).getByLabel(name, { exact: true });

async function importPlot(page: Page, name: string) {
  await page.getByTestId('import-input').setInputFiles(fixture(name));
  await expect(page.locator('.layers .item .name', { hasText: 'Image' })).toHaveCount(1);
}

/** The tick label size and tick width the Inspector shows for the selected plot. */
async function tickLook(page: Page): Promise<[string, string]> {
  await styles(page).getByLabel('Text', { exact: true }).selectOption('tick');
  await styles(page).getByLabel('Lines', { exact: true }).selectOption('tick');
  return [
    await styles(page).getByLabel('Text size (pt)').inputValue(),
    await styles(page).getByLabel('Line width (pt)').inputValue(),
  ];
}

async function blur(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('W and H from the keyboard keep text and line sizes; off, they scale; axe', async ({
  page,
}) => {
  await importPlot(page, 'matplotlib-paths');
  await expect(keep(page)).toBeChecked();
  const look = await tickLook(page);
  const w0 = Number(await field(page, 'W').inputValue());

  const w = field(page, 'W');
  await w.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(String(Math.round(w0 * 1.6)));
  await page.keyboard.press('Tab');
  const h = field(page, 'H');
  await h.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('120');
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => Number(await field(page, 'W').inputValue()))
    .toBe(Math.round(w0 * 1.6));
  await expect.poll(async () => Number(await field(page, 'H').inputValue())).toBe(120);
  expect(await tickLook(page)).toEqual(look);

  // The export draws it within the export subset.
  const svg = readFileSync(await (await exportVia(page, 'SVG')).path(), 'utf8');
  for (const bad of ['<marker', 'vector-effect', '<style', 'foreignObject', 'var(--'])
    expect(svg).not.toContain(bad);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.side')
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);

  // Two undo steps (W, then H) give back the plot as imported.
  await blur(page);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => Number(await field(page, 'W').inputValue())).toBe(w0);

  // Switched off (from the keyboard), W scales everything, text included.
  await keep(page).focus();
  await page.keyboard.press('Space');
  await expect(keep(page)).not.toBeChecked();
  await w.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(String(w0 * 2));
  await page.keyboard.press('Tab');
  await expect.poll(async () => Number(await field(page, 'W').inputValue())).toBe(w0 * 2);
  const [size] = await tickLook(page);
  expect(Number(size)).toBeGreaterThan(Number(look[0]) * 1.3);
  // The choice is remembered (after the autosave, so the reload finds the figure).
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator('.layers .item .name', { hasText: 'Image' }).first().click();
  await expect(keep(page)).not.toBeChecked();
});

/** Drags the bottom-right handle by `steps` moves; the time from each move to the next frame. */
async function dragHandle(page: Page, steps: number): Promise<number[]> {
  const hb = await page.locator('[data-handle="se"]').boundingBox();
  if (!hb) throw new Error('no handle');
  const from = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const times: number[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t0 = await page.evaluate(() => performance.now());
    await page.mouse.move(from.x + i * 4, from.y + i * 3);
    times.push(
      await page.evaluate(
        (t) =>
          new Promise<number>((r) =>
            requestAnimationFrame(() => {
              r(performance.now() - t);
            }),
          ),
        t0,
      ),
    );
  }
  await page.mouse.up();
  return times.sort((a, b) => a - b);
}

const stats = (t: readonly number[]) => ({
  medianMs: Math.round(t[Math.floor(t.length / 2)] ?? 0),
  p95Ms: Math.round(t[Math.floor(t.length * 0.95)] ?? 0),
});

test('dragging a handle keeps text and line sizes in one undo step', async ({ page }, info) => {
  await importPlot(page, 'matplotlib-paths');
  const look = await tickLook(page);
  const w0 = Number(await field(page, 'W').inputValue());

  const kept = await dragHandle(page, 40);
  expect(Number(await field(page, 'W').inputValue())).toBeGreaterThan(w0 * 1.3);
  expect(await tickLook(page)).toEqual(look);
  await blur(page);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => Number(await field(page, 'W').inputValue())).toBe(w0);

  // The same drag scaling everything, for comparison.
  await keep(page).uncheck();
  const scaled = await dragHandle(page, 40);
  await page.keyboard.press('Control+z');
  const report = { browser: info.project.name, keep: stats(kept), scale: stats(scaled) };
  console.warn(`PERF plot resize ${JSON.stringify(report)}`);
  await info.attach('plot-resize-timing', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
});
