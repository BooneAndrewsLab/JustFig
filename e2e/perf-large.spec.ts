/**
 * Large-figure performance baseline (issue 55, note 29): about 500 mixed
 * objects, two imported multi-panel plots, a well plate, a plasmid map and a
 * 20 Mpx micrograph. Measures the first render after opening the saved
 * figure (the micrograph's working copy shown, note 30), drag frame time (one object, then the whole selection) and SVG,
 * PDF and PNG export time. Logs one `PERF {json}` line per browser.
 *
 * The budgets are generous (note 29 lists the numbers they are set from):
 * they catch a 3-5x regression such as a per-object cost on every frame,
 * not run-to-run noise or a slow CI runner.
 */
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { type Page, expect, test } from '@playwright/test';

import { exportVia, pageBox } from './helpers';

const here = (p: string) => new URL(p, import.meta.url);
const plot = (name: string) => fileURLToPath(here(`../src/io/svg/fixtures/${name}.svg`));
const side = (page: Page) => page.locator('.side');

const BUDGET = {
  openMs: 15_000,
  dragOneMedianMs: 50,
  dragAllMedianMs: 50,
  dragP95Ms: 150,
  svgMs: 8_000,
  pdfMs: 15_000,
  pngMs: 15_000,
};

const OBJECTS = 480;
/** 20 Mpx in every browser (Firefox had 6.25 Mpx before the working copies of note 30). */
const MICROGRAPH = { w: 5000, h: 4000 };

/** About 480 shapes, texts, arrows, paths and icons laid over the page; the assets are v2.jfig's. */
function baseFigure(): string {
  const v2 = JSON.parse(readFileSync(here('../src/io/fixtures/v2.jfig'), 'utf8')) as {
    document: { title: string; pages: { layers: { children: unknown[] }[] }[] };
    assets: Record<string, { kind: string }>;
  };
  const icon = Object.keys(v2.assets).find((k) => v2.assets[k]?.kind === 'icon');
  if (!icon) throw new Error('fixture has no icon');
  const id = (i: number) => `o_${i.toString(16).padStart(16, '0')}`;
  const style = (fill: string | null) => ({
    cap: 'round',
    fill: fill ? { hex: fill } : null,
    join: 'round',
    stroke: { hex: '#1f2933' },
    strokeWidth: 0.75,
  });
  const colours = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9'];
  const children: unknown[] = [];
  for (let i = 0; i < OBJECTS; i += 1) {
    const x = 10 + (i % 24) * 21;
    const y = 10 + Math.floor(i / 24) * 18;
    const f = (w: number, h: number) => ({ x, y, w, h, rotation: 0 });
    const fill = colours[i % colours.length] ?? '#0072b2';
    const common = { id: id(i + 1), opacity: 1 };
    switch (i % 6) {
      case 0:
        children.push({ ...common, type: 'rect', rx: 2, frame: f(18, 14), style: style(fill) });
        break;
      case 1:
        children.push({ ...common, type: 'ellipse', frame: f(16, 14), style: style(fill) });
        break;
      case 2:
        children.push({
          ...common,
          type: 'text',
          align: 'left',
          autoWidth: true,
          lineHeight: 1.2,
          frame: f(18, 12),
          runs: [[{ color: { hex: '#1f2933' }, font: 'arimo', size: 8, text: `n${String(i)}` }]],
        });
        break;
      case 3:
        children.push({
          ...common,
          type: 'arrow',
          frame: f(18, 8),
          nodes: [
            { x: 0, y: 0 },
            { x: 18, y: 8 },
          ],
          start: { kind: 'none', size: 4 },
          end: { kind: 'triangle', size: 3 },
          style: { ...style(null), strokeWidth: 1 },
        });
        break;
      case 4:
        children.push({
          ...common,
          type: 'path',
          closed: true,
          frame: f(18, 14),
          nodes: [
            { x: 0, y: 14 },
            { x: 9, y: 0, out: { x: 14, y: 4 } },
            { x: 18, y: 14 },
          ],
          style: style(fill),
        });
        break;
      default:
        children.push({
          ...common,
          type: 'icon',
          asset: icon,
          frame: f(16, 16),
          lockAspect: true,
          slots: { s1: { hex: fill } },
        });
    }
  }
  const doc = structuredClone(v2.document);
  doc.title = 'Perf large';
  const layer = doc.pages[0]?.layers[0];
  if (!layer) throw new Error('fixture has no layer');
  layer.children = children;
  return JSON.stringify({ ...v2, document: { ...doc, notes: [] } });
}

/** A grey 8-bit PNG of `w` x `h` pixels with a gradient and some noise (about 20 Mpx). */
function micrograph(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = (crcTable[(c ^ x) & 255] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const raw = Buffer.alloc((w + 1) * h);
  let seed = 12345;
  for (let y = 0; y < h; y += 1) {
    const row = y * (w + 1);
    for (let x = 0; x < w; x += 1) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      raw[row + 1 + x] = ((x + y) >> 5) + ((seed >>> 24) & 15);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Frame intervals (requestAnimationFrame) while dragging from a point, as in procedural.spec.ts. */
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
  const sorted = [...frames].sort((x, y) => x - y);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    perMoveMs: Math.round(total / steps),
    frames: frames.length,
    median: Math.round(p(0.5)),
    p95: Math.round(p(0.95)),
    max: Math.round(p(1)),
  };
}

const frameDone = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            r();
          }),
        ),
      ),
  );

test('a large figure: first render, drag frames, export times', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.goto('./');
  await expect(page.locator('.icon-tile').first()).toBeVisible();

  const names = page.locator('.layers .item .name');
  // Build it: the generated objects, two plots, a well plate, a plasmid map, the micrograph.
  await page.getByTestId('open-input').setInputFiles({
    name: 'perf.jfig',
    mimeType: 'application/json',
    buffer: Buffer.from(baseFigure()),
  });
  await expect(page.locator('.topbar .title')).toHaveValue('Perf large');
  for (const name of ['matplotlib-subplots', 'r-facets']) {
    const before = await names.count();
    await page.getByTestId('import-input').setInputFiles(plot(name));
    await expect.poll(() => names.count()).toBeGreaterThan(before);
  }
  await page.getByRole('button', { name: 'Add Well plate' }).click();
  await page.getByTestId('open-input').setInputFiles({
    name: 'pBR322.jfig',
    mimeType: 'application/json',
    buffer: readFileSync(here('../src/io/fixtures/plasmidpop-pbr322.fragment.json')),
  });
  await expect(side(page).getByRole('region', { name: 'Plasmid map options' })).toBeVisible();
  const size = MICROGRAPH;
  const png = micrograph(size.w, size.h);
  const before = await names.count();
  await page.getByTestId('import-input').setInputFiles({
    name: 'micrograph.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect.poll(() => names.count()).toBeGreaterThan(before);

  // Save, close, and time opening it again.
  const [saved] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const file = info.outputPath('perf-large.jfig');
  await saved.saveAs(file);
  const objects = await names.count();
  page.once('dialog', (d) => void d.accept());
  await page.keyboard.press('Alt+w');
  await expect(page.locator('.layers .layer-head ~ ul .name')).toHaveCount(0);
  const t0 = Date.now();
  await page.getByTestId('open-input').setInputFiles(file);
  await expect(names).toHaveCount(objects, { timeout: 60_000 });
  // The canvas shows the micrograph's working copy (a blob URL), not its 16 MB data URI.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('g[data-id] image')].some((i) =>
        (i.getAttribute('xlink:href') ?? '').startsWith('blob:'),
      ),
    null,
    { timeout: 60_000 },
  );
  await frameDone(page);
  const openMs = Date.now() - t0;

  // Drag one object, then everything selected.
  await page.keyboard.press('Escape');
  const b = await pageBox(page);
  const one = await dragTiming(page, { x: b.x + b.width * 0.07, y: b.y + b.height * 0.04 }, 40);
  await page.keyboard.press('Control+a');
  const all = await dragTiming(page, { x: b.x + b.width * 0.07, y: b.y + b.height * 0.04 }, 40);

  // Export.
  const exp: Record<string, number> = {};
  for (const format of ['SVG', 'PDF', 'PNG'] as const) {
    const t = Date.now();
    const d = await exportVia(page, format, format === 'PNG' ? { dpi: 150 } : {});
    const path = await d.path();
    exp[format] = Date.now() - t;
    // SVG and PDF carry every pixel of the micrograph (16 MB), not the working copy (4 Mpx).
    const least = { SVG: png.length, PDF: png.length / 2, PNG: 1000 }[format];
    expect(statSync(path).size).toBeGreaterThan(least);
  }

  const report = {
    browser: info.project.name,
    objects,
    micrographMpx: (size.w * size.h) / 1e6,
    micrographBytes: png.length,
    openMs,
    dragOne: one,
    dragAll: all,
    exportMs: exp,
  };
  console.warn(`PERF ${JSON.stringify(report)}`);
  await info.attach('perf-large', {
    body: JSON.stringify({ ...report, budget: BUDGET }, null, 2),
    contentType: 'application/json',
  });

  expect(openMs).toBeLessThan(BUDGET.openMs);
  expect(one.median).toBeLessThan(BUDGET.dragOneMedianMs);
  expect(all.median).toBeLessThan(BUDGET.dragAllMedianMs);
  expect(one.p95).toBeLessThan(BUDGET.dragP95Ms);
  expect(all.p95).toBeLessThan(BUDGET.dragP95Ms);
  expect(exp['SVG']).toBeLessThan(BUDGET.svgMs);
  expect(exp['PDF']).toBeLessThan(BUDGET.pdfMs);
  expect(exp['PNG']).toBeLessThan(BUDGET.pngMs);
});
