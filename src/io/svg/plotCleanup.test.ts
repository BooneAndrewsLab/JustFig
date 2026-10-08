/**
 * Plot clean-up (note 12) on real plotting-library output:
 * `fixtures/matplotlib-paths.svg` and `matplotlib-text.svg` are Matplotlib
 * 3.11 (`svg.fonttype` 'path', the default, and 'none'), `r-cairo.svg` is
 * ggplot2 through R's `svg()` (cairo) device, and `r-svglite.svg` is the
 * same plot in svglite 2.1's format (as `ggsave("x.svg")` writes it).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type SvgNode, nodeToSvgString, walkNodes } from '@/render/svgNode';

import { importSvgText } from '../import';
import { parsePath, pathRect } from './pathData';
import { approxTextWidth } from './plotCleanup';
import { sanitizeSvg } from './sanitize';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}.svg`, import.meta.url), 'utf8');

const plot = (text: string) => sanitizeSvg(text, { plot: true });
const all = (root: SvgNode): SvgNode[] => [...walkNodes(root)].slice(1);
const texts = (root: SvgNode): SvgNode[] => all(root).filter((n) => n.tag === 'text');
const label = (n: SvgNode): string => n.children.filter((c) => typeof c === 'string').join('');
const svg = (body: string, vb = '0 0 200 100'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

/** The export subset (CLAUDE.md, note 03). */
const TAGS = new Set([
  'g',
  'path',
  'rect',
  'ellipse',
  'circle',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
]);

function expectSubset(root: SvgNode): void {
  for (const n of all(root)) {
    expect(TAGS.has(n.tag), n.tag).toBe(true);
    for (const k of Object.keys(n.attrs)) expect(k.startsWith('data-'), k).toBe(false);
  }
}

describe('matplotlib', () => {
  it('rebuilds glyph-outline labels as text, keeping position, size and rotation', () => {
    const s = plot(fixture('matplotlib-paths'));
    const t = texts(s.root);
    expect(t.map(label)).toEqual([
      '0',
      '1',
      '2',
      '3',
      'Time (h)',
      '1',
      '2',
      '3',
      '4',
      'Signal (a.u.)',
      'Growth',
      'Wild type',
    ]);
    const time = t[4]?.attrs;
    expect(time).toMatchObject({ x: '107.986', y: '159.598', 'font-size': '10' });
    expect(String(time?.['font-family'])).toMatch(/^DejaVu Sans/);
    expect(t[9]?.attrs['transform']).toBe('rotate(-90 18.398 108.72)');
    expect(t[10]?.attrs['font-size']).toBe('12');
    expectSubset(s.root);
  });

  it('reads the label from the escaped comment and keeps mathtext as outlines', () => {
    const s = plot(
      svg(
        '<defs><path id="DejaVuSans-Bold-61" d="M0 0L500 0L500 500Z"/></defs>' +
          '<g><!-- a &lt; b &amp; "c" --><g transform="translate(10 30) scale(0.1 -0.1)">' +
          '<use xlink:href="#DejaVuSans-Bold-61"/><use xlink:href="#DejaVuSans-Bold-61" transform="translate(60 0)"/></g></g>' +
          '<g><!-- $10^{3}$ --><g transform="translate(10 45) scale(0.1 -0.1)">' +
          '<use xlink:href="#DejaVuSans-Bold-61" transform="translate(0 0.68)"/>' +
          '<use xlink:href="#DejaVuSans-Bold-61" transform="translate(120 38) scale(0.7)"/></g></g>',
        '0 0 100 50',
      ).replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" '),
    );
    const t = texts(s.root);
    expect(t.map(label)).toEqual(['a < b & "c"']);
    expect(t[0]?.attrs).toMatchObject({
      x: '10',
      y: '30',
      'font-size': '10',
      'font-weight': 'bold',
    });
    expect(all(s.root).filter((n) => n.tag === 'path')).toHaveLength(2);
  });

  it('bakes marker and tick transforms and dissolves every wrapper group', () => {
    const s = plot(fixture('matplotlib-paths'));
    expect(all(s.root).filter((n) => n.tag === 'g')).toEqual([]);
    for (const n of all(s.root))
      if (n.tag !== 'text') expect(n.attrs['transform'], n.tag).toBeUndefined();
    // The four data markers sit on the data points.
    const markers = all(s.root).filter(
      (n) => n.tag === 'path' && n.attrs['fill'] === '#1f77b4' && n.attrs['stroke'] === '#1f77b4',
    );
    expect(markers).toHaveLength(5);
    expect(String(markers[0]?.attrs['d'])).toMatch(/^M46\.41 129\.223C/);
  });

  it('drops the white figure background but keeps the axes and legend backgrounds', () => {
    const before = sanitizeSvg(fixture('matplotlib-paths'));
    const s = plot(fixture('matplotlib-paths'));
    const pageRect = (root: SvgNode) =>
      all(root).filter((n) => {
        const segs =
          n.tag === 'path' && n.attrs['fill'] === '#ffffff'
            ? parsePath(String(n.attrs['d']))
            : null;
        const r = segs ? pathRect(segs) : null;
        return r !== null && r.w >= 230 && r.h >= 172;
      });
    expect(pageRect(before.root)).toHaveLength(1);
    expect(pageRect(s.root)).toHaveLength(0);
    expect(all(s.root)[0]?.attrs['fill']).toBe('#ffffff'); // the axes patch
  });

  it('crops the viewBox to the drawing', () => {
    const s = plot(fixture('matplotlib-paths'));
    const [x, y, w, h] = s.viewBox;
    expect(x).toBeGreaterThan(5);
    expect(y).toBeGreaterThan(5);
    expect(x + w).toBeLessThan(225);
    expect(y + h).toBeLessThan(166);
    // …without cutting into the outermost labels.
    expect(x).toBeLessThan(18.4 - 7); // the rotated y label's top
    expect(y + h).toBeGreaterThan(159.6); // the x label's baseline
  });

  it('keeps svg.fonttype none text as it is, minus the no-op rotate(-0)', () => {
    const s = plot(fixture('matplotlib-text'));
    const t = texts(s.root);
    expect(t.map(label)).toContain('Signal (a.u.)');
    expect(t[0]?.attrs).toMatchObject({
      x: '46.410405',
      'font-size': '10px',
      'text-anchor': 'middle',
    });
    expect(t[0]?.attrs['transform']).toBeUndefined();
    expect(String(t[0]?.attrs['font-family'])).toMatch(/^'DejaVu Sans'/);
  });
});

describe('R', () => {
  it('svglite: applies its descendant CSS, drops both background rects, keeps whole labels', () => {
    const s = plot(fixture('r-svglite'));
    const first = all(s.root)[0];
    expect(first?.tag).toBe('rect');
    expect(first?.attrs['fill']).toBe('#ebebeb');
    const lines = all(s.root).filter((n) => n.tag === 'polyline');
    expect(lines.length).toBe(22);
    for (const l of lines) expect(l.attrs['fill']).toBe('none');
    const t = texts(s.root);
    expect(t.map(label)).toEqual(['2', '3', '4', '5', '1', '2', '3', '4', 'Dose (mg)', 'Response']);
    expect(t[9]?.attrs).toMatchObject({
      x: '13.37',
      y: '64.74',
      transform: 'rotate(-90 13.37 64.74)',
    });
    expectSubset(s.root);
  });

  it('cairo svg(): drops the oversized white rects and the white border, bakes glyph placement', () => {
    const s = plot(fixture('r-cairo'));
    const white = all(s.root).filter((n) => n.attrs['fill'] === '#ffffff' && n.tag === 'rect');
    expect(white).toEqual([]);
    expect(all(s.root)[0]?.attrs['fill']).toBe('#ebebeb');
    for (const n of all(s.root)) expect(n.attrs['transform']).toBeUndefined();
    expect(s.viewBox[2]).toBeLessThan(216);
    expectSubset(s.root);
  });
});

describe('text merging', () => {
  it('joins per-word pieces (Illustrator-style matrix placement) with a space', () => {
    const s = plot(
      svg(
        '<rect x="0" y="0" width="200" height="20" fill="#ccc"/>' +
          '<text transform="matrix(1 0 0 1 72 40)" font-family="Arial" font-size="8">Wild</text>' +
          '<text transform="matrix(1 0 0 1 91.3 40)" font-family="Arial" font-size="8">type</text>',
      ),
    );
    const t = texts(s.root);
    expect(t.map(label)).toEqual(['Wild type']);
    expect(t[0]?.attrs).toMatchObject({ x: '72', y: '40' });
  });

  it('joins per-glyph pieces without spaces, and starts a new word after a gap', () => {
    // Arial advances at 10 units: D 7.22, o 5.56, s 5, e 5.56, space 2.78.
    const glyphs: [number, string][] = [
      [10, 'D'],
      [17.22, 'o'],
      [22.78, 's'],
      [27.78, 'e'],
      [36.12, '(mg)'],
    ];
    const s = plot(
      svg(glyphs.map(([x, c]) => `<text x="${x}" y="50" font-size="10">${c}</text>`).join('')),
    );
    expect(texts(s.root).map(label)).toEqual(['Dose (mg)']);
  });

  it('merges rotated pieces along their baseline', () => {
    const s = plot(
      svg(
        '<g transform="translate(20 80) rotate(-90)"><text font-size="10">Signal</text></g>' +
          '<g transform="translate(20 47) rotate(-90)"><text font-size="10">(a.u.)</text></g>',
      ),
    );
    const t = texts(s.root);
    expect(t.map(label)).toEqual(['Signal (a.u.)']);
    expect(t[0]?.attrs['transform']).toBe('rotate(-90 20 80)');
  });

  it('leaves apart: tick labels, other baselines, sizes, colours and centred text', () => {
    const cases = [
      '<text x="10" y="50">0</text><text x="60" y="50">1</text>',
      '<text x="10" y="50">a</text><text x="16" y="70">b</text>',
      '<text x="10" y="50" font-size="10">a</text><text x="16" y="50" font-size="7">2</text>',
      '<text x="10" y="50" fill="red">a</text><text x="16" y="50">b</text>',
      '<text x="10" y="50" text-anchor="middle">a</text><text x="16" y="50" text-anchor="middle">b</text>',
      '<text x="10" y="50">a</text><path d="M0 0L5 5" stroke="#000"/><text x="16" y="50">b</text>',
    ];
    for (const c of cases) expect(texts(plot(svg(c)).root), c).toHaveLength(2);
  });

  it('estimates widths from Helvetica metrics, wider for DejaVu', () => {
    expect(approxTextWidth('Dose', 10)).toBeCloseTo(23.34, 2);
    expect(approxTextWidth('Dose', 10, 'DejaVu Sans')).toBeGreaterThan(25);
    expect(approxTextWidth('abc', 10, 'Courier New')).toBeCloseTo(18, 5);
  });
});

describe('flattening', () => {
  it('scales points, radii, stroke widths and font sizes under a uniform scale', () => {
    const s = plot(
      svg(
        '<g transform="translate(10 5) scale(2)" stroke="#000" stroke-width="0.5">' +
          '<path d="M0 0L10 0" stroke-dasharray="1 2"/><circle cx="5" cy="5" r="1"/>' +
          '<rect x="1" y="1" width="2" height="3"/><line x1="0" y1="0" x2="1" y2="1"/>' +
          '<polyline points="0,0 1,1" fill="none"/><text x="1" y="2" font-size="4" stroke="none">A</text></g>',
      ),
    );
    const [path, circle, rect, line, poly, text] = all(s.root).filter((n) => n.tag !== 'g');
    expect(path?.attrs).toMatchObject({
      d: 'M10 5L30 5',
      'stroke-width': '1',
      'stroke-dasharray': '2 4',
    });
    expect(circle?.attrs).toMatchObject({ cx: '20', cy: '15', r: '2', 'stroke-width': '1' });
    expect(rect?.attrs).toMatchObject({ x: '12', y: '7', width: '4', height: '6' });
    expect(line?.attrs).toMatchObject({ x1: '10', y1: '5', x2: '12', y2: '7' });
    expect(poly?.attrs).toMatchObject({ points: '10,5 12,7' });
    expect(text?.attrs).toMatchObject({ x: '12', y: '9', 'font-size': '8' });
    for (const n of all(s.root)) expect(n.attrs['transform']).toBeUndefined();
  });

  it('turns a rotated rect into a path and arcs into cubics', () => {
    const s = plot(
      svg(
        '<rect transform="rotate(90 50 50)" x="40" y="45" width="20" height="10" fill="#f00"/>' +
          '<path transform="translate(100 0)" d="M0 50a10 10 0 0 1 20 0z" fill="#00f"/>',
      ),
    );
    const [rect, arc] = all(s.root);
    expect(rect?.tag).toBe('path');
    expect(rect?.attrs['d']).toBe('M55 40L55 60L45 60L45 40Z');
    expect(String(arc?.attrs['d'])).toMatch(/^M100 50C.*Z$/);
    expect(String(arc?.attrs['d'])).not.toMatch(/[aA]/);
  });

  it('keeps a matrix where baking would distort a stroke or mirror text', () => {
    const s = plot(
      svg(
        '<path transform="scale(2 1)" d="M0 10L10 10" stroke="#000"/>' +
          '<text transform="scale(1 -1)" x="5" y="-20">A</text>' +
          '<path transform="scale(2 1)" d="M0 30L10 30" fill="#000"/>',
      ),
    );
    const [stroked, mirrored, filled] = all(s.root);
    expect(stroked?.attrs['transform']).toBe('matrix(2 0 0 1 0 0)');
    expect(mirrored?.attrs['transform']).toBe('matrix(1 0 0 -1 0 0)');
    expect(filled?.attrs).toMatchObject({ d: 'M0 30L20 30' });
    expect(filled?.attrs['transform']).toBeUndefined();
  });

  it('moves a lone child out of its group, multiplying opacity', () => {
    const s = plot(
      svg('<g opacity="0.5" fill="#f00"><g><rect width="10" height="10" opacity="0.5"/></g></g>'),
    );
    expect(all(s.root)).toHaveLength(1);
    expect(all(s.root)[0]?.attrs).toMatchObject({ fill: '#ff0000', opacity: '0.25' });
  });

  it('keeps a group with shared opacity over several children', () => {
    const s = plot(
      svg(
        '<g opacity="0.5"><rect width="10" height="10"/><rect x="5" width="10" height="10"/></g>',
      ),
    );
    expect(all(s.root)[0]?.tag).toBe('g');
  });
});

describe('background and cropping', () => {
  it('removes only leading white page rectangles', () => {
    const s = plot(
      svg(
        '<rect width="100%" height="100%" fill="#fff"/><rect x="20" y="20" width="10" height="10" fill="#f00"/>' +
          '<rect x="0" y="0" width="200" height="100" fill="#fff" opacity="0.5"/>',
      ),
    );
    expect(all(s.root).map((n) => n.attrs['fill'])).toEqual(['#ff0000', '#ffffff']);
  });

  it('keeps a coloured page background', () => {
    const s = plot(
      svg('<rect width="200" height="100" fill="#eee"/><circle cx="5" cy="5" r="1"/>'),
    );
    expect(all(s.root)).toHaveLength(2);
    expect(s.viewBox).toEqual([0, 0, 200, 100]);
  });

  it('crops to strokes and text, never beyond the original viewBox', () => {
    const s = plot(svg('<path d="M50 50L150 50" stroke="#000" stroke-width="2"/>'));
    expect(s.viewBox).toEqual([48, 48, 104, 4]);
    const t = plot(svg('<text x="190" y="50" font-size="10">Long label</text>'));
    expect(t.viewBox[0]).toBe(190);
    expect(t.viewBox[0] + t.viewBox[2]).toBe(200);
  });

  it('leaves an empty drawing at its size', () => {
    expect(plot(svg('<rect width="200" height="100" fill="#fff"/>')).viewBox).toEqual([
      0, 0, 200, 100,
    ]);
  });

  it('places imports at the cropped size', () => {
    const r = importSvgText(
      svg('<rect x="50" y="20" width="40" height="20" fill="#000"/>', '0 0 400 200'),
      'p.svg',
    );
    expect([r.w, r.h]).toEqual([30, 15]);
  });
});

describe('sanitiser support for plot output', () => {
  it('expands the font shorthand and treats inherit as unset', () => {
    const s = sanitizeSvg(
      svg(
        '<g fill="#f00"><text style="font: italic bold 12px/14px \'DejaVu Sans\', sans-serif; fill: inherit">a</text></g>',
      ),
    );
    expect(texts(s.root)[0]?.attrs).toMatchObject({
      'font-style': 'italic',
      'font-weight': 'bold',
      'font-size': '12px',
      'font-family': "'DejaVu Sans', sans-serif",
    });
    expect(texts(s.root)[0]?.attrs['fill']).toBeUndefined();
    expect(s.warnings).toEqual([]);
  });

  it('matches descendant, compound and universal selectors', () => {
    const s = sanitizeSvg(
      svg(
        '<style>* { stroke-linecap: butt } .plot g.dots circle { fill: #00f } .other circle { fill: #f00 }</style>' +
          '<g class="plot"><g class="dots"><circle r="1"/></g><circle r="2"/></g>',
      ),
    );
    const circles = all(s.root).filter((n) => n.tag === 'circle');
    expect(circles[0]?.attrs['fill']).toBe('#0000ff');
    expect(circles[1]?.attrs['fill']).toBeUndefined();
    expect(circles[1]?.attrs['stroke-linecap']).toBe('butt');
  });
});

describe('stability', () => {
  for (const name of ['matplotlib-paths', 'matplotlib-text', 'r-cairo', 'r-svglite']) {
    it(`${name}: the cleaned SVG re-sanitises to itself, as rendering does`, () => {
      const s = plot(fixture(name));
      const text = nodeToSvgString(s.root);
      const again = sanitizeSvg(text);
      expect(nodeToSvgString(again.root)).toBe(text);
      expect(again.viewBox).toEqual(s.viewBox);
      expect(nodeToSvgString(plot(fixture(name)).root)).toBe(text);
    });
  }
});
