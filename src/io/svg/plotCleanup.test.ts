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
    // Centred on the axes again (note 15): exactly where fonttype 'none' puts it.
    const time = t[4]?.attrs;
    expect(time).toMatchObject({
      x: '128.882',
      y: '159.598',
      'font-size': '10',
      'text-anchor': 'middle',
    });
    expect(String(time?.['font-family'])).toMatch(/^DejaVu Sans/);
    expect(t[9]?.attrs['transform']).toBe('rotate(-90 18.398 78.459)');
    expect(t[10]?.attrs['font-size']).toBe('12');
    expectSubset(s.root);
  });

  it('reads the label from the escaped comment and keeps unsupported mathtext as outlines', () => {
    const s = plot(
      svg(
        '<defs><path id="DejaVuSans-Bold-61" d="M0 0L500 0L500 500Z"/></defs>' +
          '<g><!-- a &lt; b &amp; "c" --><g transform="translate(10 30) scale(0.1 -0.1)">' +
          '<use xlink:href="#DejaVuSans-Bold-61"/><use xlink:href="#DejaVuSans-Bold-61" transform="translate(60 0)"/></g></g>' +
          '<g><!-- $\\sqrt{3}$ --><g transform="translate(10 45) scale(0.1 -0.1)">' +
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

  it('rebuilds mathtext labels (log ticks, Greek, operators) as text with script tspans', () => {
    const s = plot(fixture('matplotlib-log'));
    expectSubset(s.root);
    const t = texts(s.root);
    const flat = (n: SvgNode): string =>
      n.children.map((c) => (typeof c === 'string' ? c : flat(c))).join('');
    expect(t.map(flat)).toEqual([
      '100',
      '101',
      '102',
      '103',
      '104',
      'Dose (μM)',
      '102',
      '104',
      '106',
      'Signal ×103',
      'α1 response, Δ = −2',
    ]);
    // 10^3: one label centred on its tick, the exponent flowing on as a tspan at 0.7 size,
    // raised by its source offset (no position of its own, so it stays joined in any font).
    const tick = t[3];
    expect(tick?.attrs).toMatchObject({
      x: '173.176',
      y: '145.521',
      'font-size': '10',
      'text-anchor': 'middle',
    });
    expect(tick?.children).toEqual([
      '10',
      { tag: 'tspan', attrs: { 'font-size': '7', dy: '-4.13' }, children: ['3'] },
    ]);
    // Subscripts go down and come back; italic math letters keep their style, upright text
    // resets it.
    const title = t[10];
    expect(title?.attrs).toMatchObject({ 'font-size': '12', 'font-style': 'italic' });
    const [one, rest] = (title?.children ?? []).filter((c) => typeof c !== 'string');
    expect(one?.attrs).toEqual({ 'font-size': '8.4', 'font-style': 'normal', dy: '1.8' });
    expect(rest?.attrs).toEqual({ 'font-style': 'normal', dy: '-1.8' });
    expect(t[5]?.children).toEqual([
      'Dose (',
      { tag: 'tspan', attrs: { 'font-style': 'italic' }, children: ['μ'] },
      'M)',
    ]);
    // The rotated y label keeps its angle about its new anchor.
    expect(t[9]?.attrs['transform']).toMatch(/^rotate\(-90 /);
    // The fraction keeps its outlines: two scaled glyphs and its bar.
    expect(nodeToSvgString(s.root)).not.toMatch(/baseline-shift|dominant-baseline|<use/);
    expect(t.some((n) => /^[12]$/.test(flat(n)))).toBe(false);
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

const anchorOf = (n: SvgNode | undefined): string => String(n?.attrs['text-anchor'] ?? 'start');
const xOf = (n: SvgNode | undefined): number => Number(n?.attrs['x']);
/** A label as matplotlib's path glyphs and the PDF importer leave it: start-anchored, source width known. */
const lbl = (x: number, y: number, s: string, adv?: number, extra = ''): string =>
  `<text x="${x}" y="${y}" font-size="10" font-family="Arial"${adv === undefined ? '' : ` data-advance="${adv}"`} ${extra}>${s}</text>`;

describe('label alignment', () => {
  it('matplotlib path glyphs get the anchors and positions fonttype none writes', () => {
    const paths = texts(plot(fixture('matplotlib-paths')).root);
    const none = texts(plot(fixture('matplotlib-text')).root);
    expect(paths.map(anchorOf)).toEqual(none.map(anchorOf));
    expect(paths.map(anchorOf)).toEqual([
      ...Array<string>(5).fill('middle'),
      ...Array<string>(4).fill('end'),
      'middle',
      'middle',
      'start',
    ]);
    // Within the last glyph's estimated advance (y tick labels) or exact.
    for (const [i, n] of paths.entries()) expect(Math.abs(xOf(n) - xOf(none[i]))).toBeLessThan(0.2);
  });

  it('centres a label under a tick on the tick, and right-aligns one ending at a tick', () => {
    const s = plot(
      svg(
        '<path d="M50 60V64M30 40H26" stroke="#000"/>' +
          lbl(47, 76, '10', 0.6) + // centre 50
          lbl(14, 43, '0.5', 0.9), // ends at 23, tick starts at 26
      ),
    );
    const [x, y] = texts(s.root);
    expect([anchorOf(x), xOf(x)]).toEqual(['middle', 50]);
    expect([anchorOf(y), xOf(y)]).toEqual(['end', 23]);
    expectSubset(s.root);
  });

  it('centres axis titles on a spine, rotated ones included', () => {
    const s = plot(
      svg(
        '<path d="M40 10V80H190" fill="none" stroke="#000"/>' +
          lbl(95, 98, 'Time', 3) + // centre 110, spine 40–190 → 115: off by 0.5 em
          lbl(100, 98, 'Time', 3) +
          lbl(20, 60, 'Signal', 2, 'transform="rotate(-90 20 60)"'), // centre y 50, spine 10–80 → 45
        '0 0 200 120',
      ),
    );
    const [off, on, rotated] = texts(s.root);
    expect(anchorOf(off)).toBe('start');
    expect([anchorOf(on), xOf(on)]).toEqual(['middle', 115]);
    expect(anchorOf(rotated)).toBe('start');
    const s2 = plot(
      svg(
        '<path d="M40 10V80H190" fill="none" stroke="#000"/>' +
          lbl(20, 55, 'Signal', 2, 'transform="rotate(-90 20 55)"'),
        '0 0 200 120',
      ),
    );
    const r = texts(s2.root)[0];
    expect(anchorOf(r)).toBe('middle');
    expect(r?.attrs).toMatchObject({ x: '20', y: '45', transform: 'rotate(-90 20 45)' });
  });

  it('keeps legend labels at start: a handle before them, or a left-aligned column', () => {
    // Line handle before the label, frame edge just after it.
    const handle = plot(
      svg('<path d="M10 37H30M80 20V70" stroke="#000"/>' + lbl(38, 40, 'Wild type', 4)),
    );
    expect(anchorOf(texts(handle.root)[0])).toBe('start');
    // Marker handles leave no line before them; the column gives it away.
    const column = plot(
      svg(
        '<circle cx="25" cy="37" r="3"/><circle cx="25" cy="54" r="3"/>' +
          '<path d="M80 20V70" stroke="#000"/>' +
          lbl(40, 40, 'a', 0.6) +
          lbl(40, 57, 'mutant', 3.5), // ends at 75, frame at 80
      ),
    );
    expect(texts(column.root).map(anchorOf)).toEqual(['start', 'start']);
  });

  it('keeps start when unsure: nothing nearby, both centre and end, or an unusual angle', () => {
    const s = plot(
      svg(
        lbl(10, 20, 'alone', 2.5) +
          // Centred under a tick and ending at another line at its height.
          '<path d="M60 50V54M80 60V70" stroke="#000"/>' +
          lbl(40, 66, 'both', 2) +
          '<path d="M150 50V54" stroke="#000"/>' +
          lbl(140, 66, 'tilted', 2, 'transform="rotate(-45 140 66)"'),
      ),
    );
    expect(texts(s.root).map(anchorOf)).toEqual(['start', 'start', 'start']);
  });

  it('estimates the width when the source did not give it, with more tolerance', () => {
    const w = approxTextWidth('100', 10, 'Arial');
    const s = plot(svg('<path d="M50 60V64" stroke="#000"/>' + lbl(50 - w / 2 + 0.5, 76, '100')));
    expect([anchorOf(texts(s.root)[0]), xOf(texts(s.root)[0])]).toEqual(['middle', 50]);
  });

  it('joins runs of mixed style and scripts (PDF mathtext) into one flowing label', () => {
    const s = plot(
      svg(
        lbl(10, 50, 'Signal', 2.78) +
          lbl(40.5, 50, 'μ', 0.58, 'font-style="italic"') +
          lbl(46.3, 50, 'V', 0.67) +
          lbl(70, 50, '10', 1.1) +
          lbl(81, 46, '3', 0.6, 'font-size="7"'),
      ),
    );
    const t = texts(s.root);
    expect(t).toHaveLength(2);
    expect(t[0]?.children).toEqual([
      'Signal ',
      { tag: 'tspan', attrs: { 'font-style': 'italic' }, children: ['μ'] },
      'V',
    ]);
    expect(t[0]?.attrs).toMatchObject({ x: '10', y: '50', 'font-size': '10' });
    expect(t[1]?.children).toEqual([
      '10',
      { tag: 'tspan', attrs: { 'font-size': '7', dy: '-4' }, children: ['3'] },
    ]);
  });

  it('anchors a label of several runs as one, on its combined source width', () => {
    // 10³ under a tick at x = 50: "10" from 43, its exponent ending at 57.
    const tick = '<path d="M50 60V64" stroke="#000"/>';
    const s = plot(svg(tick + lbl(43, 76, '10', 1.1) + lbl(54, 72, '3', 0.43, 'font-size="7"')));
    const [t] = texts(s.root);
    expect([anchorOf(t), xOf(t), t?.attrs['y']]).toEqual(['middle', 50, '76']);
    expect(t?.children[1]).toMatchObject({ tag: 'tspan', attrs: { dy: '-4' } });
    // A rotated mathtext axis title (PDF runs) centres on its spine as one label.
    const spine = '<path d="M30 10V90" stroke="#000"/>';
    const r = plot(
      svg(
        spine +
          lbl(20, 71.5, 'Signal', 2.78, 'transform="rotate(-90 20 71.5)"') +
          lbl(20, 41, 'μ', 0.58, 'transform="rotate(-90 20 41)" font-style="italic"') +
          lbl(20, 35.2, 'V', 0.67, 'transform="rotate(-90 20 35.2)"'),
      ),
    );
    const [y] = texts(r.root);
    expect([anchorOf(y), y?.attrs['transform']]).toEqual(['middle', 'rotate(-90 20 50)']);
  });

  it('keeps runs apart that are not one line of one label', () => {
    const cases = [
      // A smaller run on the same baseline is not a script.
      lbl(10, 50, '10', 1.1) + lbl(21, 50, '3', 0.6, 'font-size="7"'),
      // Raised too far: a stacked line, not a superscript.
      lbl(10, 50, '10', 1.1) + lbl(21, 42, '3', 0.6, 'font-size="7"'),
      // A same-size run off the baseline.
      lbl(10, 50, 'a', 0.6) + lbl(16, 46, 'b', 0.6, 'font-style="italic"'),
      // Too far along, or another colour.
      lbl(10, 50, 'a', 0.6) + lbl(30, 50, 'b', 0.6, 'font-style="italic"'),
      lbl(10, 50, 'a', 0.6) + lbl(16, 50, 'b', 0.6, 'font-style="italic" fill="#ff0000"'),
    ];
    for (const c of cases) expect(texts(plot(svg(c)).root), c).toHaveLength(2);
    // Positioned tspans whose runs do not read as one line keep their positions.
    const far = plot(
      svg(
        '<text x="10" y="50" font-size="10"><tspan x="10" y="50">a</tspan>' +
          '<tspan x="40" y="50" font-style="italic">b</tspan></text>',
      ),
    );
    expect(texts(far.root)[0]?.children[1]).toMatchObject({ attrs: { x: '40', y: '50' } });
  });

  it('aligns the lines of a multi-line label as one block (matplotlib glyphs)', () => {
    const t = texts(plot(fixture('matplotlib-multiline')).root);
    const at = (s: string, i = 0): [string, number] => {
      const n = t.filter((n) => label(n) === s)[i];
      return [anchorOf(n), xOf(n)];
    };
    // Three-line x tick labels: every line centred on its tick, the third far from it.
    for (const [first, ...rest] of [
      [at('WT'), at('day 1'), at('rep A')],
      [at('mutant'), at('day 1', 1), at('rep A', 1)],
      [at('WT', 1), at('day 14'), at('rep B')],
    ]) {
      expect(first?.[0]).toBe('middle');
      expect(rest).toEqual([first, first]);
    }
    expect(at('time point')).toEqual(at('Genotype and'));
    expect(at('Genotype and')[0]).toBe('middle');
    // Two-line y tick labels end together, on the first line's end.
    expect(at('siRNA')).toEqual(at('control'));
    expect(at('A')).toEqual(at('knockdown'));
    expect(at('control')[0]).toBe('end');
    // Left-aligned title, annotation and legend keep start.
    for (const s of ['Treated cells', 'n = 3', 'left aligned', 'note', 'replicate', 'mean'])
      expect(at(s)[0], s).toBe('start');
  });

  it('gives every line of a label the alignment one line has evidence for', () => {
    const tick = '<path d="M50 60V64" stroke="#000"/>';
    // "WT / day 14 / rep B" centred under a tick: only the first line is near it.
    for (const pitch of [9, 12]) {
      const s = plot(
        svg(
          tick +
            lbl(44, 76, 'WT', 1.2) +
            lbl(35, 76 + pitch, 'day 14', 3) +
            lbl(38, 76 + 2 * pitch, 'rep B', 2.4),
        ),
      );
      expect(texts(s.root).map((n) => [anchorOf(n), xOf(n)])).toEqual([
        ['middle', 50],
        ['middle', 50],
        ['middle', 50],
      ]);
    }
    // A left-aligned stack whose first line happens to centre on the tick stays start.
    const left = plot(svg(tick + lbl(44, 76, 'WT', 1.2) + lbl(44, 88, 'day 14', 3)));
    expect(texts(left.root).map(anchorOf)).toEqual(['start', 'start']);
    // Start evidence on any line (a legend handle) keeps the block at start.
    const handle = plot(
      svg(
        tick +
          '<path d="M20 85H42" stroke="#000"/>' +
          lbl(44, 76, 'WT', 1.2) +
          lbl(44, 88, 'day', 1.2),
      ),
    );
    expect(texts(handle.root).map(anchorOf)).toEqual(['start', 'start']);
  });

  it('does not join lines of another style, size or pitch into one label', () => {
    const tick = '<path d="M50 60V64" stroke="#000"/>';
    const second = [
      lbl(35, 88, 'day 14', 3, 'fill="#ff0000"'),
      lbl(35, 88, 'day 14', 3, 'font-style="italic"'),
      lbl(38.5, 88, 'day 14', 3.3, 'font-size="9"'),
      lbl(35, 96, 'day 14', 3), // 2 em: another label
    ];
    for (const c of second) {
      const s = plot(svg(tick + lbl(44, 76, 'WT', 1.2) + c));
      expect(texts(s.root).map(anchorOf), c).toEqual(['middle', 'start']);
    }
  });

  it('re-sanitises to itself and never stores the source width', () => {
    const s = plot(svg('<path d="M50 60V64" stroke="#000"/>' + lbl(47, 76, '10', 0.6)));
    const again = sanitizeSvg(nodeToSvgString(s.root));
    expect(nodeToSvgString(again.root)).toBe(nodeToSvgString(s.root));
    expect(nodeToSvgString(s.root)).not.toContain('data-advance');
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
  for (const name of [
    'matplotlib-paths',
    'matplotlib-text',
    'matplotlib-log',
    'matplotlib-multiline',
    'r-cairo',
    'r-svglite',
  ]) {
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
