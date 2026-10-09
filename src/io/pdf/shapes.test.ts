/**
 * Clip shapes and shadings in PDF import (issue 25, note 13): pageToSvg on
 * hand-written operator lists, and the real plots of
 * `scripts/pdf-fixtures/shading.py` (a polar plot; a Gouraud mesh) and
 * `r-gradient.R` (grid's clipping path, linear and radial gradients).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type SvgNode, walkNodes } from '@/render/svgNode';

import { type Imported, importPdf } from '../import';
import { type Pt, makeRegion, windingAt } from '../svg/clipRegion';
import { parsePath, pathPoints } from '../svg/pathData';
import { sanitizeSvg } from '../svg/sanitize';
import { maskPixels } from '../pictureClip';
import { type PdfPageInput, type PdfPageSvg, pageToSvg } from './pageToSvg';
import { MAX_BANDS, averageColour, colourAt, readShading } from './shading';

const OPS = {
  save: 10,
  restore: 11,
  setGState: 9,
  transform: 12,
  clip: 29,
  eoClip: 30,
  setFillRGBColor: 59,
  setFillColorN: 54,
  setStrokeColorN: 53,
  shadingFill: 62,
  constructPath: 91,
  fill: 22,
  stroke: 20,
  endPath: 28,
};

function convert(
  ops: [keyof typeof OPS, unknown[]][],
  extra: Partial<PdfPageInput> = {},
): PdfPageSvg {
  return pageToSvg({
    ops: { fnArray: ops.map(([n]) => OPS[n]), argsArray: ops.map(([, a]) => a) },
    OPS,
    width: 100,
    height: 100,
    viewport: [1, 0, 0, -1, 0, 100],
    font: () => null,
    glyphPath: () => null,
    ...extra,
  });
}

const rect = (x: number, y: number, w: number, h: number): number[] => [
  ...[0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4],
];
/** A circle as four Béziers (pdf.js draw ops), PDF space. */
function circleOps(cx: number, cy: number, r: number): number[] {
  const k = 0.5523 * r;
  return [
    ...[0, cx + r, cy],
    ...[2, cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ...[2, cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ...[2, cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ...[2, cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    4,
  ];
}

const paths = (svg: string): { d: string; attrs: string }[] =>
  [...svg.matchAll(/<path d="([^"]*)" ([^>]*)\/>/g)].map((m) => ({
    d: m[1] ?? '',
    attrs: m[2] ?? '',
  }));
/** The closed rings of path data (straight segments only, as cut output is). */
function rings(d: string): Pt[][] {
  return d
    .split('M')
    .filter(Boolean)
    .map((s) =>
      s
        .replace(/Z/g, '')
        .split('L')
        .map((p): Pt => {
          const [x = 0, y = 0] = p.trim().split(' ').map(Number);
          return [x, y];
        }),
    );
}
const area = (rs: readonly Pt[][]): number =>
  Math.abs(
    rs.reduce((sum, r) => {
      let a = 0;
      for (let i = 0; i < r.length; i++) {
        const p = r[i] ?? [0, 0];
        const q = r[(i + 1) % r.length] ?? p;
        a += p[0] * q[1] - q[0] * p[1];
      }
      return sum + a / 2;
    }, 0),
  );
const lightness = (hex: string): number =>
  parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
const fillOf = (attrs: string): string => /fill="(#[0-9a-f]{6})"/.exec(attrs)?.[1] ?? '';

describe('clip shapes (issue 25)', () => {
  it('cuts fills and lines to a circle exactly, and keeps what is inside as it is', () => {
    const { svg, warnings } = convert([
      ['clip', []],
      ['constructPath', [OPS.endPath, [circleOps(50, 50, 30)], null]],
      ['constructPath', [OPS.fill, [rect(0, 0, 100, 100)], null]],
      ['constructPath', [OPS.stroke, [[0, 0, 50, 1, 100, 50]], null]],
      ['constructPath', [OPS.fill, [rect(45, 45, 10, 10)], null]],
      ['constructPath', [OPS.fill, [rect(0, 0, 10, 10)], null]],
    ]);
    expect(warnings).toEqual([]);
    const [disc, line, small, ...rest] = paths(svg);
    expect(rest).toEqual([]); // the corner square is outside
    const pts = rings(disc?.d ?? '').flat();
    for (const [x, y] of pts) expect(Math.hypot(x - 50, y - 50)).toBeLessThan(30.01);
    // Flattened to within ~0.1 unit of the circle.
    expect(area(rings(disc?.d ?? '')) / (Math.PI * 900)).toBeCloseTo(1, 2);
    const ends = rings(line?.d ?? '')[0] ?? [];
    expect(ends.map(([x]) => Math.round(x * 10) / 10)).toEqual([20, 80]);
    expect(small?.d).toBe('M45 55L55 55L55 45L45 45Z');
  });

  it('an even-odd clip holes what it cuts; a rotated rectangle clips too', () => {
    const { svg } = convert([
      ['eoClip', []],
      [
        'constructPath',
        [OPS.endPath, [[...circleOps(50, 50, 30), ...circleOps(50, 50, 15)]], null],
      ],
      ['constructPath', [OPS.fill, [rect(0, 0, 100, 100)], null]],
    ]);
    const rs = rings(paths(svg)[0]?.d ?? '');
    expect(area([rs[0] ?? []]) - area(rs.slice(1, 2))).toBeGreaterThan(0);
    expect(windingAt([50, 50], rs)).toBe(0);
    expect(windingAt([50, 28], rs)).not.toBe(0);
    expect(windingAt([50, 5], rs)).toBe(0);

    const turned = convert([
      ['transform', [Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, 50, 20]],
      ['clip', []],
      ['constructPath', [OPS.endPath, [rect(0, 0, 40, 40)], null]],
      ['constructPath', [OPS.fill, [rect(-100, -100, 300, 300)], null]],
    ]);
    // The fill becomes the diamond: a 40 × 40 square turned by 45°.
    const diamond = rings(paths(turned.svg)[0]?.d ?? '');
    expect(diamond[0]?.length).toBe(4);
    expect(area(diamond)).toBeCloseTo(1600, 0);
    expect(turned.warnings).toEqual([]);
  });

  it('makes pixels outside a clip shape see-through', () => {
    const px = { width: 4, height: 1, channels: 3 as const, data: new Uint8Array(12).fill(9) };
    const circle = makeRegion(
      [
        Array.from({ length: 64 }, (_, i): Pt => [
          50 + 30 * Math.cos(i / 10.186),
          50 + 30 * Math.sin(i / 10.186),
        ]),
      ],
      false,
    );
    if (!circle) throw new Error('empty');
    // A row of 4 pixels across x 0–100 at y 50, in a circle of radius 30 about (50, 50).
    const r = maskPixels(px, [100, 0, 0, 1, 0, 49.5], [circle]);
    expect(r && [...r.data].filter((_, i) => i % 4 === 3)).toEqual([0, 255, 255, 0]);
    expect(maskPixels(px, [10, 0, 0, 1, 0, 49.5], [circle])).toBeNull();
    expect(maskPixels(px, [10, 0, 0, 1, 45, 49.5], [circle])).toBe(px);
  });
});

describe('shadings (issue 25)', () => {
  const axial = [
    'RadialAxial',
    'axial',
    null,
    [
      [0, '#000000'],
      [1, '#ffffff'],
    ],
    [0, 0],
    [100, 0],
    null,
    null,
  ];
  const radial = [
    'RadialAxial',
    'radial',
    null,
    [
      [0, '#ffffff'],
      [1, '#009e73'],
    ],
    [50, 50],
    [50, 50],
    0,
    20,
  ];
  const pattern = (ir: unknown) => ({ pattern: (id: string) => (id === 'p' ? ir : null) });

  it('reads pdf.js shadings and their colours', () => {
    const sh = readShading(axial);
    expect(sh?.kind).toBe('axial');
    if (sh?.kind !== 'axial') return;
    expect(colourAt(sh.stops, 0.5)).toEqual([127.5, 127.5, 127.5]);
    expect(colourAt(sh.stops, -1)).toEqual([0, 0, 0]); // padded
    expect(averageColour(sh)).toBe('#808080');
    expect(readShading(['Dummy'])).toBeNull();
    expect(readShading(['RadialAxial', 'axial', null, [], [0, 0], [1, 1]])).toBeNull();
    expect(readShading('nonsense')).toBeNull();
  });

  it('fills a path with a linear gradient as bands across it, dark to light', () => {
    const { svg, warnings } = convert(
      [
        ['setFillColorN', ['Shading', 'p', null]],
        ['constructPath', [OPS.fill, [rect(10, 10, 80, 20)], null]],
      ],
      pattern(axial),
    );
    expect(warnings).toEqual([]);
    const bands = paths(svg);
    expect(bands.length).toBeGreaterThan(20);
    expect(bands.length).toBeLessThanOrEqual(MAX_BANDS);
    const ls = bands.map((b) => lightness(fillOf(b.attrs)));
    expect(ls).toEqual([...ls].sort((a, b) => a - b));
    for (const b of bands)
      for (const [x, y] of rings(b.d).flat()) {
        expect(x).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(x).toBeLessThanOrEqual(90 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(70 - 1e-6);
        expect(y).toBeLessThanOrEqual(90 + 1e-6);
      }
    // Together they cover it: each band reaches into the next.
    let x = 10;
    for (const b of bands) {
      const xs = rings(b.d)
        .flat()
        .map((p) => p[0]);
      expect(Math.min(...xs)).toBeLessThanOrEqual(x + 1e-6);
      x = Math.max(...xs);
    }
    expect(x).toBeCloseTo(90, 6);
  });

  it('paints a radial shading (sh) in the clip as discs from the outside in', () => {
    const { svg } = convert(
      [
        ['clip', []],
        ['constructPath', [OPS.endPath, [rect(20, 20, 60, 60)], null]],
        ['shadingFill', ['p']],
      ],
      pattern(radial),
    );
    const ps = paths(svg);
    // Beyond the outer circle the end colour extends (pdf.js stops pad); white in the middle.
    expect(fillOf(ps[0]?.attrs ?? '')).toBe('#009e73');
    expect(rings(ps[0]?.d ?? '')[0]?.length).toBe(4);
    expect(lightness(fillOf(ps[ps.length - 1]?.attrs ?? ''))).toBeGreaterThan(740);
    const radii = ps.slice(1).map(
      (p) =>
        Math.max(
          ...rings(p.d)
            .flat()
            .map(([px]) => px),
        ) - 50,
    );
    expect(radii).toEqual([...radii].sort((a, b) => b - a));
    expect(radii[0]).toBeCloseTo(20, 1);
  });

  it('leaves out what a shading does not extend to, and rings it when see-through', () => {
    const noExtend = [
      'RadialAxial',
      'radial',
      null,
      [
        [0, 'transparent'],
        [1e-6, '#ffffff'],
        [1 - 1e-6, '#000000'],
        [1, 'transparent'],
      ],
      [50, 50],
      [50, 50],
      10,
      20,
    ];
    const { svg } = convert(
      [
        ['setGState', [[['ca', 0.5]]]],
        ['shadingFill', ['p']],
      ],
      pattern(noExtend),
    );
    for (const p of paths(svg)) {
      expect(p.attrs).toContain('fill-rule="evenodd"');
      expect(p.attrs).toContain('fill-opacity="0.5"');
      for (const [x, y] of rings(p.d).flat()) {
        const r = Math.hypot(x - 50, y - 50);
        expect(r).toBeGreaterThan(9.9);
        expect(r).toBeLessThan(20.1);
      }
    }
  });

  it('draws a mesh (Gouraud) shading as a picture of its colours', () => {
    // Two triangles over x 10–90, y 10–50 (PDF): red, green, blue, white corners.
    const pos = new Float32Array([10, 10, 90, 10, 10, 50, 90, 10, 90, 50, 10, 50]);
    const c = [255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0];
    const col = new Uint8Array([...c, 0, 255, 0, 0, 255, 255, 255, 0, 0, 0, 255, 0]);
    const mesh = ['Mesh', 4, pos, col, 6, [10, 10, 90, 50], null, null];
    const { svg, images, warnings } = convert([['shadingFill', ['p']]], pattern(mesh));
    expect(warnings).toEqual([]);
    expect(svg).toContain('<image');
    const px = images[0];
    if (!px) throw new Error('no picture');
    expect([px.width, px.height, px.channels]).toEqual([160, 80, 3]);
    // Bottom left (PDF 10,10) is red; top right (90, 50) white.
    const at = (x: number, y: number) => [
      ...px.data.subarray((y * px.width + x) * 3, (y * px.width + x) * 3 + 3),
    ];
    expect(at(0, 79)[0]).toBeGreaterThan(240);
    expect(at(159, 0)).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(Math.min(...at(159, 0))).toBeGreaterThan(240);
  });

  it('a gradient on lines is its average colour; hatching is grey', () => {
    const lines = convert(
      [
        ['setStrokeColorN', ['Shading', 'p', null]],
        ['constructPath', [OPS.stroke, [[0, 10, 10, 1, 90, 10]], null]],
      ],
      pattern(axial),
    );
    expect(lines.svg).toContain('stroke="#808080"');
    expect(lines.warnings).toEqual(['Gradient lines became their average colour.']);
    const hatch = convert([
      ['setFillColorN', ['TilingPattern', '#ff0000', []]],
      ['constructPath', [OPS.fill, [rect(10, 10, 10, 10)], null]],
    ]);
    expect(hatch.svg).toContain('fill="#808080"');
    expect(hatch.warnings).toEqual(['Hatching and other pattern fills became grey.']);
  });
});

const bytes = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}.pdf`, import.meta.url)));
async function imported(name: string): Promise<Imported> {
  const imp = await importPdf(bytes(name), `${name}.pdf`, () => Promise.resolve(1));
  if (!imp) throw new Error('cancelled');
  return imp;
}
const nodes = (imp: Imported): SvgNode[] =>
  [...walkNodes(sanitizeSvg(imp.asset.kind === 'svgImport' ? imp.asset.svg : '').root)].slice(1);
const points = (n: SvgNode | undefined): [number, number][] =>
  pathPoints(parsePath(String(n?.attrs['d'] ?? '')) ?? []);

describe('real plots with clip shapes and shadings (issue 25)', () => {
  it('matplotlib: a polar plot cut to its circle, a Gouraud mesh as a picture', async () => {
    const imp = await imported('matplotlib-shading');
    expect(imp.warnings).toEqual([]);
    const all = nodes(imp);
    // The polar plot's white disc is the clip.
    const disc = points(all.find((n) => n.attrs['fill'] === '#ffffff'));
    const xs = disc.map((p) => p[0]);
    const ys = disc.map((p) => p[1]);
    const [cx, cy] = [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ];
    const r = (Math.max(...xs) - Math.min(...xs)) / 2;
    const dist = (p: [number, number]) => Math.hypot(p[0] - cx, p[1] - cy);
    // The petals' line runs past the rim: cut at it, so its farthest points are on it.
    const line = points(all.find((n) => n.attrs['stroke'] === '#d55e00'));
    expect(Math.max(...line.map(dist))).toBeLessThan(r + 0.6);
    expect(Math.max(...line.map(dist))).toBeGreaterThan(r - 0.6);
    const fill = points(all.find((n) => n.attrs['fill'] === '#0072b2'));
    expect(Math.max(...fill.map(dist))).toBeLessThan(r + 0.6);
    // The mesh: one picture, right of the polar plot, inside the page.
    const pics = imp.pictures ?? [];
    expect(pics).toHaveLength(1);
    const f = pics[0]?.frame;
    expect(f && f.x > imp.w / 2 && f.x + f.w <= imp.w && f.y + f.h <= imp.h).toBe(true);
  });

  it('R grid: a clipping path cuts the line; gradients become bands', async () => {
    const imp = await imported('r-gradient');
    expect(imp.warnings).toEqual([]);
    const all = nodes(imp);
    const grey = points(all.find((n) => n.attrs['fill'] === '#d9d9d9'));
    const xs = grey.map((p) => p[0]);
    const ys = grey.map((p) => p[1]);
    const [cx, cy] = [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ];
    const r = (Math.max(...xs) - Math.min(...xs)) / 2;
    const line = points(all.find((n) => n.attrs['stroke'] === '#0072b2'));
    expect(line.length).toBe(2);
    for (const p of line) expect(Math.hypot(p[0] - cx, p[1] - cy)).toBeCloseTo(r, 0);
    const fills = new Set(all.map((n) => n.attrs['fill']).filter((c) => c && c !== 'none'));
    // Blue to orange, white to green: tens of colours, the ends among them.
    expect(fills.size).toBeGreaterThan(40);
    expect([...fills]).toEqual(expect.arrayContaining(['#009e73']));
  });
});
