/**
 * Procedural objects (note 04): placing one from the Objects shelf, the
 * generated Inspector, painting wells, turning a drawn line into a bilayer,
 * Convert to shapes, pasting a PlasmidPop map (note 05) and editing it, and
 * drag timing for a full 1536-well plate and a 2,000-lipid bilayer.
 */
import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

import { exportVia, pageBox } from './helpers';

const PAGE_W = (183 / 25.4) * 72;
const FRAGMENT = readFileSync(
  new URL('../src/io/fixtures/plasmidpop-pbr322.fragment.json', import.meta.url),
  'utf8',
);

async function at(page: Page, x: number, y: number) {
  const b = await pageBox(page);
  const k = b.width / PAGE_W;
  return { x: b.x + x * k, y: b.y + y * k };
}

const side = (page: Page) => page.locator('.side');

async function paste(page: Page, text: string) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./?editor');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

test('a well plate from the shelf: generated Inspector, painting, Convert to shapes', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add Well plate' }).click();
  const section = side(page).getByRole('region', { name: 'Well plate options' });
  await expect(section).toBeVisible();
  await section.getByLabel('Wells', { exact: true }).selectOption('384');
  await expect(page.locator('.wellmap-grid rect[data-well="P24"]')).toHaveCount(1);
  const well = page.locator('.wellmap-grid rect[data-well="B3"]');
  await well.click();
  await expect(well).toHaveAttribute('fill', /#[0-9a-f]{6}/);
  expect(await well.getAttribute('fill')).not.toBe('#ffffff');
  await expect(page.getByText('1 of 384 wells coloured')).toBeVisible();
  // Paste from a spreadsheet: words become categories.
  await page.getByRole('button', { name: 'Paste from spreadsheet…' }).click();
  await page.getByLabel('Spreadsheet cells').fill('ctrl\tdrug\ndrug\tctrl');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('list', { name: 'Pasted values' })).toContainText('drug');
  await expect(page.getByText('5 of 384 wells coloured')).toBeVisible();
  // One undo step per paint stroke and per paste.
  await page.keyboard.press('Control+z');
  await expect(page.getByText('1 of 384 wells coloured')).toBeVisible();
  // A CSV file opens into the same box (review, then Apply), through the same parser.
  await page.getByTestId('wellmap-file-input').setInputFiles({
    name: 'plate.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFF,1,2\r\nA,"x, y",#ff0000\r\n'),
  });
  await expect(page.getByLabel('Spreadsheet cells')).toHaveValue(/x, y/);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('list', { name: 'Pasted values' })).toContainText('x, y');
  await expect(page.getByText('3 of 384 wells coloured')).toBeVisible();
  await page.getByTestId('wellmap-file-input').setInputFiles({
    name: 'plate.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('PK'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a .csv' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('1 of 384 wells coloured')).toBeVisible();
  await page.getByRole('button', { name: 'Convert to shapes' }).click();
  await expect(side(page).getByRole('region', { name: 'Well plate options' })).toBeHidden();
  await expect(page.locator('.layers .item .name', { hasText: 'Well plate' })).toHaveCount(1);
  // Undo brings the plate back (as a plate, not shapes).
  await page.keyboard.press('Control+z');
  await page.locator('.layers .item .name', { hasText: 'Well plate' }).click();
  await expect(side(page).getByRole('region', { name: 'Well plate options' })).toBeVisible();
});

test('kind presets: placed from the shelf and search, applied from Start from… (note 58)', async ({
  page,
}) => {
  // The shelf: a Media preset places a dish with the default pattern.
  await page.locator('.object-presets[data-kind="petriDish"] > summary').click();
  await page.getByRole('button', { name: 'Add Petri dish: YPD', exact: true }).click();
  const section = side(page).getByRole('region', { name: 'Petri dish options' });
  await expect(section).toBeVisible();
  const colonies = section.getByLabel('Colonies', { exact: true });
  await expect(colonies).toHaveValue('random');
  // Start from… from the keyboard: Enter opens on the first item, one undo step per choice.
  const trigger = section.getByRole('button', { name: 'Start from…' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Petri dish starting points' });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await menu.getByRole('menuitem', { name: 'Single-colony streak' }).click();
  await expect(menu).toBeHidden();
  await expect(colonies).toHaveValue('streak');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute(
    'title',
    /Apply preset Single-colony streak/,
  );
  await page.keyboard.press('Control+z');
  await expect(colonies).toHaveValue('random');
  // Search finds a preset by name, tagged Adjustable; dragging drops it.
  await page.getByLabel('Search icons').fill('checkerboard');
  const tile = page.getByTestId('icon-results').getByRole('button', {
    name: 'Add Well plate: Drug-combination checkerboard (adjustable object)',
  });
  await tile.dragTo(page.getByTestId('canvas'));
  await expect(side(page).getByRole('region', { name: 'Well plate options' })).toBeVisible();
  await expect(page.getByText('96 of 96 wells coloured')).toBeVisible();
});

test('the plate map wizard, from the keyboard: placed from the shelf, applied in the Inspector (note 58)', async ({
  page,
}) => {
  // The shelf: the defaults, Enter on each step (8 conditions in triplicate, controls in 1 and 12).
  await page.locator('.object-presets[data-kind="wellPlate"] > summary').click();
  await page.locator('.object-presets').getByRole('button', { name: 'Plate map wizard…' }).click();
  const wizard = page.getByRole('dialog', { name: 'Plate map wizard' });
  await expect(wizard.getByLabel('Wells')).toBeFocused();
  await expect(wizard.getByText('Step 1 of 3')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(wizard.getByLabel('Conditions')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(wizard.getByText('Step 3 of 3')).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'Add' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(wizard).toBeHidden();
  const section = side(page).getByRole('region', { name: 'Well plate options' });
  await expect(section).toBeVisible();
  await expect(page.getByText('40 of 96 wells coloured')).toBeVisible();
  // The Inspector: a 384-well plate, 10 conditions in duplicate, no controls; Back keeps answers.
  await section.getByRole('button', { name: 'Plate map wizard…' }).click();
  await wizard.getByLabel('Wells').selectOption('384');
  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard.getByLabel('Conditions').fill('10');
  await wizard.getByLabel('Replicates', { exact: true }).fill('2');
  await page.keyboard.press('Enter');
  await wizard.getByRole('button', { name: 'Back' }).click();
  await expect(wizard.getByLabel('Conditions')).toHaveValue('10');
  await page.keyboard.press('Enter');
  await wizard.getByLabel('Controls', { exact: true }).selectOption('none');
  await expect(wizard.getByLabel('Controls fill')).toHaveCount(0);
  await wizard.getByRole('button', { name: 'Apply' }).click();
  await expect(wizard).toBeHidden();
  await expect(page.getByText('20 of 384 wells coloured')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute(
    'title',
    /Plate map wizard/,
  );
  await page.keyboard.press('Control+z');
  await expect(page.getByText('40 of 96 wells coloured')).toBeVisible();
});

test('a drawn line becomes a lipid bilayer that follows it', async ({ page }) => {
  await page.keyboard.press('l');
  const a = await at(page, 60, 200);
  const b = await at(page, 360, 260);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await side(page).getByRole('button', { name: 'Lipid bilayer' }).click();
  const section = side(page).getByRole('region', { name: 'Lipid bilayer options' });
  await expect(section).toBeVisible();
  await section.getByLabel('Head size').fill('4');
  const sel = page.locator('[data-layer] > g').last();
  await expect(sel.locator('path')).toHaveCount(3);
  await section.getByLabel('Closed (vesicle)').check();
  await expect(section.getByLabel('Closed (vesicle)')).toBeChecked();
});

test('a PlasmidPop map pastes (or opens) as an editable plasmid map', async ({ page }, info) => {
  if (info.project.name === 'chromium') await paste(page, FRAGMENT);
  // Firefox drops the data of a synthetic paste event; the same fragment opened as a file
  // takes the same import path (added to the page, centred in the view).
  else
    await page.getByTestId('open-input').setInputFiles({
      name: 'pBR322.jfig',
      mimeType: 'application/json',
      buffer: Buffer.from(FRAGMENT),
    });
  const section = side(page).getByRole('region', { name: 'Plasmid map options' });
  await expect(section).toBeVisible();
  const name = section.getByLabel('Name', { exact: true }).first();
  await expect(name).toHaveValue('SYNPBR322');
  await expect(section.getByRole('list', { name: 'Features' }).locator('li')).toHaveCount(48);
  await name.fill('pBR322 edited');
  // Edit one feature (the 8th, tet, is long; short ones carry no label): open it and rename it.
  await section.getByRole('list', { name: 'Features' }).locator('li .item-title').nth(7).click();
  const feature = section.getByRole('list', { name: 'Features' }).locator('li.open');
  await feature.getByLabel('Name', { exact: true }).fill('MyOrigin');
  await expect(
    section.getByRole('list', { name: 'Features' }).locator('li .item-title').nth(7),
  ).toContainText('MyOrigin');
  const svg = await exportVia(page, 'SVG');
  const text = readFileSync(await svg.path(), 'utf8');
  expect(text).toContain('pBR322 edited');
  expect(text).toContain('MyOrigin');
});

/**
 * Drags an object across the page and reports frame timing measured in the
 * page (requestAnimationFrame intervals while the pointer moves).
 */
async function dragTiming(page: Page, from: { x: number; y: number }, steps: number) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __on: boolean };
    w.__frames = [];
    w.__on = true;
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const lt = window as unknown as { __long: number[] };
    lt.__long = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) lt.__long.push(e.duration);
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      // No long-task timing in this browser.
    }
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 1; i <= steps; i += 1) await page.mouse.move(from.x + i * 2, from.y + i);
  await page.mouse.up();
  const total = Date.now() - t0;
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __on: boolean };
    w.__on = false;
    return w.__frames.slice(1);
  });
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  const sorted = [...frames].sort((x, y) => x - y);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    moves: steps,
    totalMs: total,
    perMoveMs: total / steps,
    frames: frames.length,
    median: p(0.5),
    p95: p(0.95),
    max: p(1),
    longTasks: long.length,
    longTaskMs: Math.round(long.reduce((x, y) => x + y, 0)),
  };
}

test('dragging a full 1536-well plate and a 2,000-lipid bilayer', async ({ page }, info) => {
  // A full plate: 1536 wells in seven colours, pasted as a spreadsheet block.
  await page.getByRole('button', { name: 'Add Well plate' }).click();
  const section = side(page).getByRole('region', { name: 'Well plate options' });
  await section.getByLabel('Wells', { exact: true }).selectOption('1536');
  const rows = Array.from({ length: 32 }, (_, r) =>
    Array.from({ length: 48 }, (_, c) => String((r * 7 + c) % 7)).join('\t'),
  ).join('\n');
  await page.getByRole('button', { name: 'Paste from spreadsheet…' }).click();
  await page.getByLabel('Spreadsheet cells').fill(rows);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('1536 of 1536 wells coloured')).toBeVisible();
  const plate = await page.locator('[data-layer] > g').last().boundingBox();
  if (!plate) throw new Error('no plate');
  const plateT = await dragTiming(
    page,
    { x: plate.x + plate.width / 2, y: plate.y + plate.height / 2 },
    60,
  );

  // 1,000 positions × 2 leaflets along a long line.
  await page.keyboard.press('Escape');
  await page.keyboard.press('l');
  const a = await at(page, 20, 420);
  const b = await at(page, 500, 420);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await side(page).getByRole('button', { name: 'Lipid bilayer' }).click();
  const bl = side(page).getByRole('region', { name: 'Lipid bilayer options' });
  await bl.getByLabel('Head size').fill('1');
  // Stretch the line to about 1,020 pt: about 1,000 positions, two lipids each.
  const unitsPerPt = Number(await side(page).getByLabel('W', { exact: true }).inputValue()) / 480;
  await side(page)
    .getByLabel('W', { exact: true })
    .fill(String(Math.round(1020 * unitsPerPt)));
  const lipids = await page.evaluate(() => {
    const g = [...document.querySelectorAll('[data-layer] > g')].pop();
    const heads = g?.querySelectorAll('path')[2]?.getAttribute('d') ?? '';
    return (heads.match(/M/g) ?? []).length;
  });
  expect(lipids).toBeGreaterThanOrEqual(1900);
  const bb = await page.locator('[data-layer] > g').last().boundingBox();
  if (!bb) throw new Error('no bilayer');
  const bilayerT = await dragTiming(page, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }, 60);

  const report = { browser: info.project.name, plate: plateT, bilayer: { lipids, ...bilayerT } };
  console.warn(`PERF ${JSON.stringify(report)}`);
  await info.attach('drag-timing', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  // Generous: catches a regression to per-well DOM nodes, not a 60 fps claim.
  expect(plateT.perMoveMs).toBeLessThan(100);
  expect(bilayerT.perMoveMs).toBeLessThan(100);
});

test('Label gel lanes groups a picture with labels, outlined where they hang (#44)', async ({
  page,
}) => {
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 80;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#222';
      g.fillRect(0, 0, 120, 80);
    }
    return c.toDataURL('image/png').split(',')[1] ?? '';
  });
  await page.getByTestId('import-input').setInputFiles({
    name: 'gel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.locator('.layers .item .name', { hasText: 'Image' })).toHaveCount(1);
  await side(page).getByRole('button', { name: 'Label gel lanes' }).click();
  // The labels are selected in a group with the picture, with their generated Inspector.
  await expect(side(page).getByRole('region', { name: 'Gel lane labels options' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('1 selected: Gel lane labels');
  await expect(page.locator('.layers .item .name', { hasText: 'Group' })).toHaveCount(1);
  // The selection's handles stay on the picture; a dashed outline takes in the labels above it.
  const drawn = await page.locator('[data-drawn-outline]').boundingBox();
  const handle = await page.locator('[data-handle="n"]').boundingBox();
  expect(drawn && handle && drawn.y < handle.y).toBe(true);
  // One undo step takes the labels away and leaves the picture.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.layers .item .name', { hasText: 'Group' })).toHaveCount(0);
  await expect(page.locator('.layers .item .name', { hasText: 'Image' })).toHaveCount(1);
  await expect(page.locator('[data-drawn-outline]')).toHaveCount(0);
});
