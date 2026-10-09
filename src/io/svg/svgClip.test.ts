/**
 * Shapes in imported SVG plots cut to their clip paths (issue 41): a line
 * running past zoomed axes ends at their edge instead of crossing the figure.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type SvgNode, walkNodes } from '@/render/svgNode';

import { importSvgText } from '../import';
import { parsePath, pathPoints } from './pathData';
import { sanitizeSvg } from './sanitize';
import { CLIP_ATTR } from './svgClip';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 80">${body}</svg>`;
const RECT =
  '<defs><clipPath id="c"><rect x="10" y="10" width="50" height="40"/></clipPath></defs>';
const CIRCLE = '<defs><clipPath id="o"><circle cx="50" cy="40" r="20"/></clipPath></defs>';

const imported = (s: string) => {
  const r = importSvgText(s, 'p.svg');
  const tree = sanitizeSvg(r.asset.kind === 'svgImport' ? r.asset.svg : '').root;
  return { r, all: [...walkNodes(tree)].slice(1) };
};
const points = (n: SvgNode | undefined): [number, number][] =>
  pathPoints(parsePath(String(n?.attrs['d'] ?? '')) ?? []);
const within = (pts: readonly [number, number][], b: readonly number[], tol = 1e-6) =>
  pts.every(
    ([x, y]) =>
      x >= (b[0] ?? 0) - tol &&
      x <= (b[2] ?? 0) + tol &&
      y >= (b[1] ?? 0) - tol &&
      y <= (b[3] ?? 0) + tol,
  );
const byStroke = (all: readonly SvgNode[], c: string) => all.filter((n) => n.attrs['stroke'] === c);

describe('shapes cut to SVG clip paths', () => {
  it('cuts a line running past a rectangular clip at its edges', () => {
    const { r, all } = imported(
      svg(
        RECT +
          '<path d="M0 30L100 30" stroke="#ff0000" fill="none" clip-path="url(#c)"/>' +
          '<path d="M20 20L30 30" stroke="#0000ff" fill="none" clip-path="url(#c)"/>' +
          '<path d="M70 60L90 70" stroke="#00ff00" fill="none" clip-path="url(#c)"/>',
      ),
    );
    expect(r.warnings).toEqual([]);
    expect(all.some((n) => n.attrs[CLIP_ATTR] !== undefined)).toBe(false);
    const red = byStroke(all, '#ff0000');
    expect(red).toHaveLength(1);
    const pts = points(red[0]);
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(10, 6);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(60, 6);
    // Wholly inside: kept as it was; wholly outside: gone.
    expect(points(byStroke(all, '#0000ff')[0])).toEqual([
      [20, 20],
      [30, 30],
    ]);
    expect(byStroke(all, '#00ff00')).toEqual([]);
  });

  it('cuts fills as rings and strokes as open pieces, through use and transforms', () => {
    const { all } = imported(
      svg(
        RECT +
          '<defs><path id="m" d="M-10 -10H10V10H-10Z" fill="#00ff00" stroke="#0000ff"/></defs>' +
          '<g clip-path="url(#c)">' +
          '<g transform="translate(5 0)"><use xlink:href="#m" x="55" y="30"/></g>' +
          '<rect x="0" y="40" width="100" height="5" fill="#ff00ff"/>' +
          '</g>',
      ),
    );
    // The square at (60, 30) is cut at x = 60: its fill a closed ring, its stroke open.
    const fill = all.find((n) => n.attrs['fill'] === '#00ff00');
    expect(fill?.attrs['stroke'] ?? 'none').toBe('none');
    expect(within(points(fill), [50, 20, 60, 40])).toBe(true);
    expect(String(fill?.attrs['d'])).toMatch(/Z$/);
    const stroke = byStroke(all, '#0000ff')[0];
    expect(stroke?.attrs['fill']).toBe('none');
    expect(within(points(stroke), [50, 20, 60, 40])).toBe(true);
    expect(String(stroke?.attrs['d'])).not.toMatch(/Z/);
    const bar = all.find((n) => n.attrs['fill'] === '#ff00ff');
    expect(within(points(bar), [10, 40, 60, 45])).toBe(true);
  });

  it('cuts to a circular clip, keeping only what is inside it', () => {
    const { all } = imported(
      svg(CIRCLE + '<path d="M0 40L100 40M0 0L10 5" stroke="#ff0000" clip-path="url(#o)"/>'),
    );
    const pts = points(byStroke(all, '#ff0000')[0]);
    expect(pts).toHaveLength(2);
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(30, 1);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(70, 1);
  });

  it('keeps a shape under an unreadable clip whole, with a warning', () => {
    const { r, all } = imported(
      svg(
        '<defs><clipPath id="b" clipPathUnits="objectBoundingBox"><rect width="0.5" height="1"/></clipPath></defs>' +
          '<path d="M0 30L100 30" stroke="#ff0000" clip-path="url(#b)"/>',
      ),
    );
    expect(points(byStroke(all, '#ff0000')[0])).toEqual([
      [0, 30],
      [100, 30],
    ]);
    expect(r.warnings).toContain(
      'A drawing clipped to a shape that could not be read was kept whole.',
    );
  });

  it('cuts a huge line under a detailed clip shape to the shape’s box, with a warning', () => {
    // A star of 400 points and a line of 60 000: too much to cut exactly.
    const star = Array.from({ length: 400 }, (_, i) => {
      const a = (i / 400) * 2 * Math.PI;
      const rad = i % 2 ? 10 : 20;
      return `${(50 + rad * Math.cos(a)).toFixed(3)} ${(40 + rad * Math.sin(a)).toFixed(3)}`;
    }).join(' ');
    const line = Array.from({ length: 60000 }, (_, i) => `${((i / 60000) * 100).toFixed(4)} 40`);
    const t = performance.now();
    const { r, all } = imported(
      svg(
        `<defs><clipPath id="s"><polygon points="${star}"/></clipPath></defs>` +
          `<path d="M${line.join('L')}" stroke="#ff0000" fill="none" clip-path="url(#s)"/>`,
      ),
    );
    expect(performance.now() - t).toBeLessThan(10000);
    expect(r.warnings).toContain(
      'A very detailed clipped line was cut to the box around its clip.',
    );
    expect(within(points(byStroke(all, '#ff0000')[0]), [30, 20, 70, 60], 0.01)).toBe(true);
  });

  it('matplotlib SVG: the close-up’s line, plotted whole, stays inside its axes', () => {
    const text = readFileSync(
      new URL('./fixtures/matplotlib-connected.svg', import.meta.url),
      'utf8',
    );
    // The axes' clip rectangles, overview first.
    const clips = [
      ...text.matchAll(
        /<clipPath[^>]*>\s*<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
      ),
    ].map((m) => {
      const [x, y, w, h] = m.slice(1).map(Number);
      return [x ?? 0, y ?? 0, (x ?? 0) + (w ?? 0), (y ?? 0) + (h ?? 0)];
    });
    expect(clips).toHaveLength(2);
    const { all } = imported(text);
    // The two lines are the plot's only strokes in matplotlib's first colour.
    const lines = byStroke(all, '#1f77b4')
      .map(points)
      .sort((a, b) => (a[0]?.[0] ?? 0) - (b[0]?.[0] ?? 0));
    expect(lines).toHaveLength(2);
    lines.forEach((pts, i) => {
      expect(within(pts, clips[i] ?? [], 0.01)).toBe(true);
    });
    // The close-up's runs from one side of its axes to the other.
    const xs = (lines[1] ?? []).map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(clips[1]?.[0] ?? NaN, 2);
    expect(Math.max(...xs)).toBeCloseTo(clips[1]?.[2] ?? NaN, 2);
  });
});
