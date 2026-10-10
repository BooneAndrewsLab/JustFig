/**
 * TIFF import (note 43, issue 65): a 16-bit ImageJ TIFF with its pixel size comes in
 * calibrated (a scale bar placed on it takes the pixel size without typing), and a
 * two-channel stack opens the Merge channels dialog with its channels.
 */
import { type Page, expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();
});

const side = (page: Page) => page.locator('.side');

const W = 40;
const H = 30;

/**
 * A little-endian, uncompressed, 16-bit grey TIFF in ImageJ's layout: one IFD, then every
 * picture's samples back to back. `xres` is pixels per unit.
 */
function tiff(pictures: number[][], description: string, xres: number, compression = 1): Buffer {
  const desc = Buffer.from(`${description}\0`, 'latin1');
  const entries = 12;
  const ifdAt = 8;
  const ifdSize = 2 + entries * 12 + 4;
  const descAt = ifdAt + ifdSize;
  const resAt = descAt + desc.length + (desc.length % 2);
  const dataAt = resAt + 16;
  const size = W * H * 2;
  const out = Buffer.alloc(dataAt + size * pictures.length);
  out.write('II', 0, 'latin1');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(ifdAt, 4);
  out.writeUInt16LE(entries, ifdAt);
  let at = ifdAt + 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    out.writeUInt16LE(tag, at);
    out.writeUInt16LE(type, at + 2);
    out.writeUInt32LE(count, at + 4);
    if (type === 3) out.writeUInt16LE(value, at + 8);
    else out.writeUInt32LE(value, at + 8);
    at += 12;
  };
  entry(256, 4, 1, W);
  entry(257, 4, 1, H);
  entry(258, 3, 1, 16);
  entry(259, 3, 1, compression);
  entry(262, 3, 1, 1);
  entry(270, 2, desc.length, descAt);
  entry(273, 4, 1, dataAt);
  entry(277, 3, 1, 1);
  entry(278, 4, 1, H);
  entry(279, 4, 1, size);
  entry(282, 5, 1, resAt);
  entry(283, 5, 1, resAt + 8);
  out.writeUInt32LE(0, at);
  desc.copy(out, descAt);
  for (const o of [resAt, resAt + 8]) {
    out.writeUInt32LE(Math.round(xres * 1000), o);
    out.writeUInt32LE(1000, o + 4);
  }
  pictures.forEach((p, k) => {
    p.forEach((v, i) => out.writeUInt16LE(v, dataAt + k * size + i * 2));
  });
  return out;
}

/** 12-bit-looking data: a ramp across, up to 4000. */
const ramp = (k: number): number[] =>
  Array.from({ length: W * H }, (_, i) => Math.round(((i % W) / (W - 1)) * 4000) / (k + 1));

test('a 16-bit ImageJ TIFF comes in calibrated and a scale bar on it needs no typing (#65)', async ({
  page,
}) => {
  await page.getByTestId('import-input').setInputFiles({
    name: 'cells.tif',
    mimeType: 'image/tiff',
    buffer: tiff([ramp(0)], 'ImageJ=1.54f\nunit=micron\n', 15.3846),
  });
  const image = side(page).getByRole('region', { name: 'Image' }).filter({ hasText: 'cells.tif' });
  await expect(image).toContainText('Pixel size 0.065 µm/px, from the file');
  // Levels work over the picture's whole 16-bit range.
  await expect(side(page).getByLabel('Full at (levels)')).toHaveValue('255');

  await image.getByRole('button', { name: 'Add scale bar' }).click();
  const pixelSize = side(page).getByLabel('Pixel size');
  await expect(pixelSize).toBeVisible();
  expect(Number(await pixelSize.inputValue())).toBeCloseTo(0.065, 4);
  await expect(side(page).getByLabel('Image width')).toHaveValue('40');
});

test('a two-channel stack opens Merge channels with both channels (#65)', async ({ page }) => {
  await page.getByTestId('import-input').setInputFiles({
    name: 'stack.tif',
    mimeType: 'image/tiff',
    buffer: tiff([ramp(0), ramp(1)], 'ImageJ=1.54f\nimages=2\nchannels=2\nunit=micron\n', 10),
  });
  const dialog = page.getByRole('dialog', { name: 'Merge channels' });
  await expect(dialog.getByRole('status')).toContainText('2 of 2 channels shown, 40 × 30 px');
  await expect(dialog.locator('#channel-0-colour')).toHaveValue('#00ff00');
  await dialog.locator('#channel-1-max').press('Enter');
  await expect(dialog).toBeHidden();
  await expect(side(page).getByRole('region', { name: 'Channels' })).toContainText(
    'A merge of 2 channels',
  );
});

test('a TIFF that cannot be read says why (#65)', async ({ page }) => {
  await page.getByTestId('import-input').setInputFiles({
    name: 'jpeg.tif',
    mimeType: 'image/tiff',
    buffer: tiff([ramp(0)], 'x', 1, 7),
  });
  await expect(page.getByText(/JPEG compression cannot be imported/)).toBeVisible();
});
