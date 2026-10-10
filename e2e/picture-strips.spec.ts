/**
 * A big picture in a PNG export goes in as strips (note 32). The strips meet
 * without a seam: a picture of grey noise between 100 and 140 drawn at a
 * fractional place and scale, then turned, never shows the white page
 * through its inside.
 */
import { readFileSync } from 'node:fs';

import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

import { exportVia } from './helpers';

const field = (page: Page, name: string) => page.locator('.side').getByLabel(name, { exact: true });

/** Grey noise, 1500 x 1000: about 1.3 M base64 characters, so it is a big picture. */
function noise(): Buffer {
  const png = new PNG({ width: 1500, height: 1000 });
  let s = 7;
  for (let i = 0; i < png.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 100 + (s % 41);
    png.data[i] = v;
    png.data[i + 1] = v;
    png.data[i + 2] = v;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png, { colorType: 0 });
}

const MM = 72 / 25.4;
const BOX = { x: 10.37, y: 12.13, w: 101.3, h: 67.53 }; // mm
const DPI = 600;

/** Pixels well inside the picture (1.5 pt in from its edges) that are not the noise's grey. */
function seamPixels(png: PNG, rotation: number): number {
  const k = DPI / 72;
  const f = { x: BOX.x * MM, y: BOX.y * MM, w: BOX.w * MM, h: BOX.h * MM };
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const a = (-rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  const inset = 1.5;
  let bad = 0;
  let inside = 0;
  for (let py = 0; py < png.height; py += 1) {
    for (let px = 0; px < png.width; px += 1) {
      const dx = (px + 0.5) / k - cx;
      const dy = (py + 0.5) / k - cy;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (Math.abs(lx) > f.w / 2 - inset || Math.abs(ly) > f.h / 2 - inset) continue;
      inside += 1;
      const v = png.data[(py * png.width + px) * 4] ?? 0;
      if (v < 95 || v > 145) bad += 1;
    }
  }
  expect(inside).toBeGreaterThan(1_000_000);
  return bad;
}

test('a big picture in strips shows no seam, placed off the pixel grid or turned', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
  const names = page.locator('.layers .item .name');
  await page.getByTestId('import-input').setInputFiles({
    name: 'noise.png',
    mimeType: 'image/png',
    buffer: noise(),
  });
  const picture = names.filter({ hasText: /^Image$/ });
  await expect(picture).toHaveCount(1);
  await picture.click();
  for (const [name, v] of [
    ['W', BOX.w],
    ['H', BOX.h],
    ['X', BOX.x],
    ['Y', BOX.y],
  ] as const) {
    await field(page, name).fill(String(v));
    await field(page, name).press('Enter');
  }
  await expect(field(page, 'X')).toHaveValue(String(BOX.x));

  for (const rotation of [0, 30]) {
    if (rotation !== 0) {
      await field(page, 'Rotate °').fill(String(rotation));
      await field(page, 'Rotate °').press('Enter');
    }
    const d = await exportVia(page, 'PNG', { dpi: DPI });
    const file = info.outputPath(`strips-${String(rotation)}.png`);
    await d.saveAs(file);
    expect(seamPixels(PNG.sync.read(readFileSync(file)), rotation)).toBe(0);
  }
});
