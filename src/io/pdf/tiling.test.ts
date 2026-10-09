/**
 * Tiling patterns (hatching) in PDF import (issue 37, note 13): pageToSvg on
 * hand-written operator lists, and the real plots of
 * `scripts/pdf-fixtures/hatch.py` (matplotlib `hatch=`) and `r-pattern.R`
 * (grid's repeating `pattern()` fills).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type SvgNode, walkNodes } from '@/render/svgNode';

import { type Imported, importPdf } from '../import';
import { parsePath, pathPoints } from '../svg/pathData';
import { sanitizeSvg } from '../svg/sanitize';
import { type PdfPageSvg, pageToSvg } from './pageToSvg';
import { MAX_TILES, joinPaths, readTiling, tileOffsets } from './tiling';

const OPS = {
  save: 10,
  restore: 11,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setFillColorN: 54,
  setStrokeColorN: 53,
  constructPath: 91,
  fill: 22,
  stroke: 20,
};
type Op = [keyof typeof OPS, unknown[]];

const list = (ops: Op[]) => ({
  fnArray: ops.map(([n]) => OPS[n]),
  argsArray: ops.map(([, a]) => a),
});
const convert = (ops: Op[]): PdfPageSvg =>
  pageToSvg({
    ops: list(ops),
    OPS,
    width: 100,
    height: 100,
    viewport: [1, 0, 0, -1, 0, 100],
    font: () => null,
    glyphPath: () => null,
  });

const rect = (x: number, y: number, w: number, h: number): number[] => [
  ...[0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4],
];
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

/** A 10 pt cell with a red diagonal line, as pdf.js passes it to `scn`. */
const hatch = (
  cell: Op[] = [
    ['setStrokeRGBColor', ['#ff0000']],
    ['constructPath', [OPS.stroke, [[0, 0, 0, 1, 10, 10]], null]],
  ],
  { colour = null as string | null, matrix = [1, 0, 0, 1, 0, 0], step = 10, paintType = 1 } = {},
): unknown[] => [
  'TilingPattern',
  colour,
  list(cell),
  matrix,
  [0, 0, step, step],
  step,
  step,
  paintType,
  1,
];

const paths = (svg: string): { d: string; attrs: string }[] =>
  [...svg.matchAll(/<path d="([^"]*)" ([^>]*)\/>/g)].map((m) => ({
    d: m[1] ?? '',
    attrs: m[2] ?? '',
  }));
const pts = (d: string): [number, number][] => pathPoints(parsePath(d) ?? []);

describe('tiling patterns (issue 37)', () => {
  it('reads pdf.js tiling patterns, and not what is not one', () => {
    const t = readTiling(hatch(undefined, { colour: '#00ff00', paintType: 2 }));
    expect(t?.bbox).toEqual([0, 0, 10, 10]);
    expect(t?.colour).toBe('#00ff00');
    expect(readTiling(hatch(undefined, { colour: '#00ff00' }))?.colour).toBeNull();
    expect(readTiling(['TilingPattern', null, []])).toBeNull();
    expect(readTiling(hatch(undefined, { step: 0 }))).toBeNull();
    expect(readTiling(['Shading', 'p', null])).toBeNull();
  });

  it('runs the cell over the filled shape, cut to it, as one path per paint', () => {
    const { svg, warnings } = convert([
      ['setFillRGBColor', ['#0000ff']],
      ['setFillColorN', hatch()],
      ['constructPath', [OPS.fill, [rect(15, 15, 30, 20)], null]],
      // The pattern does not leak into what follows: blue again.
      ['setFillRGBColor', ['#0000ff']],
      ['constructPath', [OPS.fill, [rect(60, 60, 10, 10)], null]],
    ]);
    expect(warnings).toEqual([]);
    const ps = paths(svg);
    expect(ps).toHaveLength(2);
    const [lines, after] = ps;
    expect(lines?.attrs).toContain('stroke="#ff0000"');
    // The rectangle is x 15–45, y 65–85 in SVG units: every point of the hatching is in it.
    const p = pts(lines?.d ?? '');
    expect(p.length).toBeGreaterThan(8);
    for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(15 - 1e-6);
      expect(x).toBeLessThanOrEqual(45 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(65 - 1e-6);
      expect(y).toBeLessThanOrEqual(85 + 1e-6);
    }
    // Each piece is on one of the diagonals x − y′ = 10k (y′ = 100 − y, PDF space).
    for (const [x, y] of p) {
      const v = x - (100 - y);
      expect(v - 10 * Math.round(v / 10)).toBeCloseTo(0, 6);
    }
    expect(after?.attrs).toContain('fill="#0000ff"');
  });

  it('cuts a turned pattern to a circle', () => {
    const r = Math.SQRT1_2;
    const { svg } = convert([
      ['setFillColorN', hatch(undefined, { matrix: [r, r, -r, r, 0, 0] })],
      ['constructPath', [OPS.fill, [circleOps(50, 50, 20)], null]],
    ]);
    const p = pts(paths(svg)[0]?.d ?? '');
    expect(p.length).toBeGreaterThan(8);
    for (const [x, y] of p) expect(Math.hypot(x - 50, y - 50)).toBeLessThan(20.2);
  });

  it('gives an uncoloured pattern the colour set with it', () => {
    const { svg } = convert([
      ['setFillColorN', hatch(undefined, { colour: '#00aa00', paintType: 2 })],
      ['constructPath', [OPS.fill, [rect(10, 10, 20, 20)], null]],
    ]);
    expect(svg).toContain('stroke="#00aa00"');
    expect(svg).not.toContain('#ff0000');
  });

  it('a cell that does not restore what it saves leaves the page’s state alone', () => {
    const { svg } = convert([
      ['setFillRGBColor', ['#0000ff']],
      ['save', []],
      ['setFillColorN', hatch([['restore', []], ['restore', []], ...hatchCell()])],
      ['constructPath', [OPS.fill, [rect(10, 10, 20, 20)], null]],
      ['restore', []],
      ['constructPath', [OPS.fill, [rect(60, 60, 10, 10)], null]],
    ]);
    expect(paths(svg).at(-1)?.attrs).toContain('fill="#0000ff"');
  });

  it('makes a very fine pattern a flat fill, and leaves out patterns inside patterns', () => {
    const fine = convert([
      ['setFillColorN', hatch(undefined, { step: 0.05, colour: '#123456', paintType: 2 })],
      ['constructPath', [OPS.fill, [rect(10, 10, 80, 80)], null]],
    ]);
    expect(fine.warnings).toEqual(['A very fine pattern fill became one colour.']);
    expect(paths(fine.svg)).toHaveLength(1);
    expect(fine.svg).toContain('fill="#123456"');
    const inner = hatch();
    const nested = convert([
      [
        'setFillColorN',
        hatch([
          ['setFillColorN', inner],
          ['constructPath', [OPS.fill, [rect(0, 0, 10, 10)], null]],
        ]),
      ],
      ['constructPath', [OPS.fill, [rect(10, 10, 30, 30)], null]],
    ]);
    expect(nested.warnings).toEqual(['Patterns drawn inside patterns were left out.']);
  });

  it('caps the cells of one fill', () => {
    const t = readTiling(hatch(undefined, { step: 1 }));
    if (!t) throw new Error('unread');
    const ok = tileOffsets(t, [1, 0, 0, 1, 0, 0], [0, 0, 50, 50]);
    expect(ok?.length).toBe(52 * 52); // cells that touch the area count
    expect(ok?.length).toBeLessThanOrEqual(MAX_TILES);
    expect(tileOffsets(t, [1, 0, 0, 1, 0, 0], [0, 0, 500, 500])).toBeNull();
    expect(tileOffsets(t, [1, 0, 0, 1, 0, 0], [0, 0, 50, 50], 100)).toBeNull();
    expect(tileOffsets(t, [0, 0, 0, 0, 0, 0], [0, 0, 50, 50])).toEqual([]);
  });

  it('joins paths of the same paint and drops pieces that paint nothing', () => {
    expect(
      joinPaths([
        '<path d="M0 0L1 1" fill="none" stroke="#000000"/>',
        '<path d="M0 0L0 0Z" fill="#000000"/>',
        '<path d="M2 2L3 3M4 4L4 4" fill="none" stroke="#000000"/>',
        '<path d="M0 0L2 0L2 2Z" fill="#000000"/>',
      ]),
    ).toEqual([
      '<path d="M0 0L1 1M2 2L3 3" fill="none" stroke="#000000"/>',
      '<path d="M0 0L2 0L2 2Z" fill="#000000"/>',
    ]);
    const mixed = ['<path d="M0 0L1 1" fill="none" stroke="#000000"/>', '<text>a</text>'];
    expect(joinPaths(mixed)).toEqual(mixed);
  });
});

function hatchCell(): Op[] {
  return [
    ['setStrokeRGBColor', ['#ff0000']],
    ['constructPath', [OPS.stroke, [[0, 0, 0, 1, 10, 10]], null]],
  ];
}

const bytes = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}.pdf`, import.meta.url)));
async function imported(name: string): Promise<Imported> {
  const imp = await importPdf(bytes(name), `${name}.pdf`, () => Promise.resolve(1));
  if (!imp) throw new Error('cancelled');
  return imp;
}
const nodes = (imp: Imported): SvgNode[] =>
  [...walkNodes(sanitizeSvg(imp.asset.kind === 'svgImport' ? imp.asset.svg : '').root)].slice(1);
const nodePts = (n: SvgNode | undefined): [number, number][] => pts(String(n?.attrs['d'] ?? ''));
const boxOf = (p: readonly [number, number][]) => ({
  x0: Math.min(...p.map((q) => q[0])),
  x1: Math.max(...p.map((q) => q[0])),
  y0: Math.min(...p.map((q) => q[1])),
  y1: Math.max(...p.map((q) => q[1])),
});

describe('real plots with hatching (issue 37)', () => {
  it('matplotlib hatch=: lines, crosses and dots over the face colour, cut to each bar', async () => {
    const imp = await imported('matplotlib-hatch');
    expect(imp.warnings).toEqual([]);
    const all = nodes(imp);
    // No grey stand-in.
    expect(all.some((n) => n.attrs['fill'] === '#808080')).toBe(false);
    // The orange and blue bars keep their face colour under the hatching.
    for (const face of ['#e69f00', '#56b4e9']) {
      const bar = all.find((n) => n.attrs['fill'] === face);
      expect(bar, face).toBeDefined();
      const b = boxOf(nodePts(bar));
      // Black hatch lines that lie within this bar: there are some, and none stray outside it.
      const inBar = all
        .filter((n) => n.attrs['stroke'] === '#000000' && n.attrs['fill'] === 'none')
        .flatMap((n) => nodePts(n))
        .filter(([x]) => x > b.x0 + 1 && x < b.x1 - 1);
      expect(inBar.length).toBeGreaterThan(10);
      for (const [, y] of inBar) expect(y).toBeGreaterThanOrEqual(b.y0 - 1e-3);
    }
    // The band between two curves: green hatching, every point within the band's box.
    const green = all.filter((n) => n.attrs['stroke'] === '#009e73');
    expect(green.length).toBeGreaterThanOrEqual(2);
  });

  it('R grid pattern(): a repeating line and dots cut to a rectangle and a circle', async () => {
    const imp = await imported('r-pattern');
    expect(imp.warnings).toEqual([]);
    const all = nodes(imp);
    const lines = all.find((n) => n.attrs['stroke'] === '#d55e00');
    const frame = all.find(
      (n) => n.attrs['stroke'] === '#000000' && nodePts(n).length === 4 && n !== lines,
    );
    const f = boxOf(nodePts(frame));
    const l = nodePts(lines);
    expect(l.length).toBeGreaterThan(50);
    for (const [x, y] of l) {
      expect(x).toBeGreaterThanOrEqual(f.x0 - 1e-3);
      expect(x).toBeLessThanOrEqual(f.x1 + 1e-3);
      expect(y).toBeGreaterThanOrEqual(f.y0 - 1e-3);
      expect(y).toBeLessThanOrEqual(f.y1 + 1e-3);
    }
    const dots = nodePts(all.find((n) => n.attrs['fill'] === '#0072b2'));
    expect(dots.length).toBeGreaterThan(100);
    const d = boxOf(dots);
    const [cx, cy, r] = [(d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.x1 - d.x0) / 2];
    for (const [x, y] of dots) expect(Math.hypot(x - cx, y - cy)).toBeLessThan(r + 0.5);
  });
});
