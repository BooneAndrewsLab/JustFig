/**
 * Pictures inside imported SVG plots (issue 24): taken out of the plot with
 * their placement, and what the plot drew under them cut where they are;
 * cut to their SVG clip paths (issue 36); backdrops of turned and
 * overlapping see-through pictures (issue 40).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { walkNodes } from '@/render/svgNode';

import { importSvgText } from '../import';
import { base64, decodePng, encodePng, encodePngSync, fromBase64, hasClearPixels } from '../png';
import { contains, makeRegion } from './clipRegion';
import { IDENTITY, apply, parseTransform } from './matrix';
import { sanitizeSvg } from './sanitize';

/** 8 × 8 RGB: opaque. */
const OPAQUE =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAH0lEQVR42mNgKNoERM/mMwARChunBBYhMBu3BB3sAABJt1UhTDnhuAAAAABJRU5ErkJggg==';
const href = (b64: string) => `data:image/png;base64,${b64}`;
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 80">${body}</svg>`;
const nodes = (s: string) => {
  const r = importSvgText(s, 'p.svg');
  const tree = sanitizeSvg(r.asset.kind === 'svgImport' ? r.asset.svg : '').root;
  return { r, all: [...walkNodes(tree)].slice(1) };
};

describe('plot pictures', () => {
  it('takes an opaque picture out, holes the background around it and drops what it hides', () => {
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#eeeeee"/>' +
          '<path d="M20 20L30 30" stroke="#ff0000"/>' +
          `<image x="10" y="10" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(OPAQUE)}"/>` +
          '<path d="M20 25L30 35" stroke="#0000ff"/>',
      ),
    );
    expect(r.warnings).toEqual([]);
    expect(r.pictures?.map((p) => p.frame)).toEqual([
      { x: 7.5, y: 7.5, w: 30, h: 30, rotation: 0 },
    ]);
    expect(r.pictures?.[0]?.asset).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(all.some((n) => n.tag === 'image')).toBe(false);
    // The grey background: a ring around the picture.
    const ring = all.find((n) => n.attrs['fill'] === '#eeeeee');
    expect(ring?.attrs['fill-rule']).toBe('evenodd');
    expect(String(ring?.attrs['d']).match(/M/g)).toHaveLength(2);
    // The red line was under the picture (gone), the blue one over it (kept).
    expect(all.some((n) => n.attrs['stroke'] === '#ff0000')).toBe(false);
    expect(all.some((n) => n.attrs['stroke'] === '#0000ff')).toBe(true);
  });

  it('moves what lies under a see-through picture to its backdrop (issue 35)', async () => {
    const rgba = base64(
      await encodePng({ width: 2, height: 2, channels: 4, data: new Uint8Array(16).fill(128) }),
    );
    const { r, all } = nodes(
      svg(
        '<rect x="10" y="10" width="40" height="40" fill="#ffffff" stroke="#000000"/>' +
          '<path d="M20 20L30 30" stroke="#ff0000"/>' +
          `<image x="10" y="10" width="40" height="40" xlink:href="${href(rgba)}"/>` +
          '<rect x="70" y="10" width="20" height="20" fill="#ffffff" stroke="#000000"/>' +
          `<image x="60" y="10" width="40" height="20" xlink:href="${href(OPAQUE)}"/>`,
      ),
    );
    // Under the see-through picture: in its backdrop, out of the plot.
    expect(all.some((n) => n.attrs['stroke'] === '#ff0000')).toBe(false);
    const back = r.pictures?.[0]?.backdrop;
    expect(back?.frame).toEqual(r.pictures?.[0] && { ...r.pictures[0].frame, rotation: 0 });
    const under = [...walkNodes(sanitizeSvg(back?.asset.svg ?? '').root)].slice(1);
    expect(under.map((n) => [n.tag, n.attrs['fill'], n.attrs['stroke']])).toEqual([
      ['rect', '#ffffff', 'none'],
      // (a whole shape under it, copied as it was: the fill a straight line never shows)
      ['path', '#000000', '#ff0000'],
    ]);
    expect(r.pictures?.[1]?.backdrop).toBeUndefined();
    // Under both, exactly their size: only the outlines are left.
    expect(all.filter((n) => n.attrs['fill-rule'] === 'evenodd')).toHaveLength(0);
    expect(
      all.filter((n) => n.attrs['fill'] === 'none' && n.attrs['stroke'] === '#000000'),
    ).toHaveLength(2);
    // `xMidYMid meet`: the square picture is drawn 20 × 20, centred.
    const [a, b] = (r.pictures ?? []).map((p) => p.frame);
    expect(b && a && [b.x - a.x, b.y - a.y, b.w, b.h]).toEqual([45, 0, 15, 15]);
  });

  it('gives a see-through picture on a grey panel a backdrop of the panel and the grid', async () => {
    const rgba = base64(
      await encodePng({ width: 2, height: 2, channels: 4, data: new Uint8Array(16).fill(128) }),
    );
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#ebebeb"/>' +
          '<path d="M0 30L100 30" stroke="#ffffff" fill="none"/>' +
          '<path d="M0 30Q50 0 100 30" stroke="#00ff00" fill="none"/>' +
          `<image x="20" y="20" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(rgba)}"/>` +
          '<path d="M0 40L100 40" stroke="#0000ff"/>',
      ),
    );
    const pic = r.pictures?.[0];
    expect(pic?.backdrop?.frame).toEqual(pic && { ...pic.frame, rotation: 0 });
    const under = [...walkNodes(sanitizeSvg(pic?.backdrop?.asset.svg ?? '').root)].slice(1);
    expect(under.map((n) => [n.tag, n.attrs['fill'], n.attrs['stroke']])).toEqual([
      ['rect', '#ebebeb', 'none'],
      ['path', 'none', '#ffffff'],
      // The curve's dip under it (issue 42).
      ['path', 'none', '#00ff00'],
    ]);
    expect(under[1]?.attrs['d']).toBe('M20 30L60 30');
    // In the plot: the panel holed, the grid line and the curve cut, the line drawn after kept.
    expect(all.find((n) => n.attrs['fill'] === '#ebebeb')?.attrs['fill-rule']).toBe('evenodd');
    expect(all.find((n) => n.attrs['stroke'] === '#ffffff')?.attrs['d']).toBe(
      'M0 30L20 30M60 30L100 30',
    );
    expect(String(all.find((n) => n.attrs['stroke'] === '#00ff00')?.attrs['d'])).toMatch(
      /^M0 30L[^M]*M[^M]*L100 30$/,
    );
    expect(all.some((n) => n.attrs['stroke'] === '#0000ff')).toBe(true);
  });

  it('counts a PNG whose alpha is all opaque as opaque', async () => {
    const data = new Uint8Array(64).fill(255);
    data[3] = 254;
    const clear = await encodePng({ width: 4, height: 4, channels: 4, data });
    const full = await encodePng({
      width: 4,
      height: 4,
      channels: 4,
      data: new Uint8Array(64).fill(255),
    });
    expect(hasClearPixels(clear)).toBe(true);
    expect(hasClearPixels(full)).toBe(false);
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#eeeeee"/>' +
          `<image x="0" y="0" width="100" height="80" preserveAspectRatio="none" xlink:href="${href(base64(full))}"/>`,
      ),
    );
    expect(r.pictures?.[0]?.backdrop).toBeUndefined();
    expect(all.some((n) => n.attrs['fill'] === '#eeeeee')).toBe(false);
  });

  it('drops a linked picture and places a mirrored one with a flip', () => {
    const { r } = nodes(
      svg(
        '<rect width="100" height="80" fill="#eeeeee"/>' +
          '<image href="https://example.org/a.png" width="10" height="10"/>' +
          `<image transform="scale(1 -1) translate(0 -80)" x="0" y="0" width="20" height="10" preserveAspectRatio="none" href="${href(OPAQUE)}"/>`,
      ),
    );
    expect(r.warnings).toEqual(['Removed a picture linked from outside the file.']);
    expect(r.pictures?.[0]?.frame).toEqual({
      x: 0,
      y: 52.5,
      w: 15,
      h: 7.5,
      rotation: 0,
      flipY: true,
    });
  });

  it('matplotlib SVG: the heatmap, the rasterized layer and the colour bar', () => {
    const imp = importSvgText(
      readFileSync(new URL('./fixtures/matplotlib-images.svg', import.meta.url), 'utf8'),
      'matplotlib-images.svg',
    );
    expect(imp.warnings).toEqual([]);
    const pics = imp.pictures ?? [];
    expect(pics.map((p) => [p.asset.meta.width, p.asset.meta.height])).toEqual([
      [126, 126],
      [163, 116],
      [5, 100],
    ]);
    // matplotlib stores its rows bottom first and mirrors them back.
    for (const p of pics) {
      expect(p.frame.flipY).toBe(true);
      expect(p.frame.x + p.frame.w).toBeLessThan(imp.w);
    }
    expect(pics[0]?.asset.meta.name).toBe('matplotlib-images.svg (picture 1)');
  });
});

describe('turned and overlapping see-through pictures (issue 40)', () => {
  const rgba = base64(
    encodePngSync({ width: 2, height: 2, channels: 4, data: new Uint8Array(16).fill(128) }),
  );
  /** The rings of a path of straight closed rings, and whether a point is in them (even-odd). */
  const filledAt = (d: unknown, x: number, y: number): boolean => {
    const rings = String(d)
      .split('M')
      .filter((r) => r.trim() !== '')
      .map((r) => {
        const v = (r.match(/-?[\d.]+/g) ?? []).map(Number);
        return v.flatMap((_, i) => (i % 2 === 0 ? [[v[i] ?? 0, v[i + 1] ?? 0] as const] : []));
      });
    const region = makeRegion(rings, true);
    return region !== null && contains(region, [x, y]);
  };
  const backdropOf = (p: { backdrop?: { asset: { svg: string } } } | undefined) =>
    [...walkNodes(sanitizeSvg(p?.backdrop?.asset.svg ?? '').root)].slice(1);

  it('gives a turned see-through picture a backdrop in its own frame', () => {
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#ebebeb"/>' +
          '<path d="M0 40L100 40" stroke="#ffffff" fill="none"/>' +
          `<image x="40" y="30" width="20" height="20" preserveAspectRatio="none" transform="rotate(45 50 40)" xlink:href="${href(rgba)}"/>`,
      ),
    );
    const pic = r.pictures?.[0];
    expect(pic?.frame.rotation).toBeCloseTo(45, 6);
    // Placed with the picture's own frame, turned with it.
    expect(pic?.backdrop?.frame).toEqual(pic?.frame);
    expect(sanitizeSvg(pic?.backdrop?.asset.svg ?? '').root.attrs['viewBox']).toBe('0 0 20 20');
    // What was under it, in plot units, turned into its frame by one group.
    const [turn, ...under] = backdropOf(pic);
    expect(turn?.tag).toBe('g');
    const m = parseTransform(String(turn?.attrs['transform'])) ?? IDENTITY;
    expect(under.map((n) => [n.tag, n.attrs['fill'], n.attrs['stroke']])).toEqual([
      ['path', '#ebebeb', 'none'],
      ['path', 'none', '#ffffff'],
    ]);
    // The grid line runs along the picture's diagonal: in its frame, corner to corner.
    expect(under[1]?.attrs['d']).toBe('M35.858 40L64.142 40');
    for (const [[x, y], at] of [
      [
        [35.858, 40],
        [0, 20],
      ],
      [
        [64.142, 40],
        [20, 0],
      ],
    ] as const) {
      const [u, v] = apply(m, x, y);
      expect(u).toBeCloseTo(at[0], 2);
      expect(v).toBeCloseTo(at[1], 2);
    }
    expect(filledAt(under[0]?.attrs['d'], 50, 40)).toBe(true);
    expect(filledAt(under[0]?.attrs['d'], 40, 31)).toBe(false);
    // In the plot: cut where the turned square is, the panel holed with its shape.
    expect(all.find((n) => n.attrs['stroke'] === '#ffffff')?.attrs['d']).toBe(
      'M0 40L35.858 40M64.142 40L100 40',
    );
    const panel = all.find((n) => n.attrs['fill'] === '#ebebeb')?.attrs['d'];
    expect(filledAt(panel, 50, 40)).toBe(false);
    expect(filledAt(panel, 40, 31)).toBe(true); // inside the box, outside the turned square
  });

  it('leaves out of a backdrop the part over an earlier picture', () => {
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#ebebeb"/>' +
          '<path d="M0 30L100 30" stroke="#ffffff" fill="none"/>' +
          `<image x="10" y="10" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(rgba)}"/>` +
          `<image x="30" y="20" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(rgba)}"/>`,
      ),
    );
    const [a, b] = (r.pictures ?? []).map(backdropOf);
    expect(a?.map((n) => [n.tag, n.attrs['d']])).toEqual([
      ['rect', undefined],
      ['path', 'M10 30L50 30'],
    ]);
    // The second one's backdrop does not cover the first picture.
    expect(b?.map((n) => n.tag)).toEqual(['path', 'path']);
    expect(filledAt(b?.[0]?.attrs['d'], 60, 50)).toBe(true);
    expect(filledAt(b?.[0]?.attrs['d'], 40, 30)).toBe(false);
    expect(b?.[1]?.attrs['d']).toBe('M50 30L70 30');
    // The plot: the line cut under both, the panel holed under both (the overlap too).
    expect(all.find((n) => n.attrs['stroke'] === '#ffffff')?.attrs['d']).toBe(
      'M0 30L10 30M70 30L100 30',
    );
    const panel = all.find((n) => n.attrs['fill'] === '#ebebeb')?.attrs['d'];
    for (const [x, y] of [
      [20, 20],
      [40, 30],
      [60, 50],
    ] as const)
      expect(filledAt(panel, x, y)).toBe(false);
    expect(filledAt(panel, 5, 5)).toBe(true);
  });

  it('holes a background once where two opaque pictures overlap', () => {
    const { all } = nodes(
      svg(
        '<rect x="0" y="0" width="100" height="80" fill="#ebebeb"/>' +
          `<image x="10" y="10" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(OPAQUE)}"/>` +
          `<image x="30" y="20" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(OPAQUE)}"/>`,
      ),
    );
    const panel = all.find((n) => n.attrs['fill'] === '#ebebeb')?.attrs['d'];
    // Even-odd filled the overlap of two holes back in, over both pictures.
    expect(filledAt(panel, 40, 30)).toBe(false);
    expect(filledAt(panel, 5, 5)).toBe(true);
  });

  it('matplotlib SVG: a turned picture and two overlapping ones, over the grid', () => {
    const imp = importSvgText(
      readFileSync(new URL('./fixtures/matplotlib-see-through.svg', import.meta.url), 'utf8'),
      'matplotlib-see-through.svg',
    );
    expect(imp.warnings).toEqual([]);
    const pics = imp.pictures ?? [];
    expect(pics).toHaveLength(3);
    expect(pics[0]?.frame.rotation).toBeCloseTo(-30, 4);
    expect(pics[0]?.backdrop?.frame).toEqual(pics[0]?.frame);
    for (const p of pics)
      expect(backdropOf(p).some((n) => n.attrs['stroke'] === '#ffffff')).toBe(true);
    // Plot units → the picture frames' points, and whether a point is well inside a frame.
    const plot = sanitizeSvg(imp.asset.kind === 'svgImport' ? imp.asset.svg : '').root;
    const vb = String(plot.attrs['viewBox']).split(' ').map(Number);
    const k = imp.w / (vb[2] ?? 1);
    const within = (f: (typeof pics)[number]['frame'], x: number, y: number): boolean => {
      const px = (x - (vb[0] ?? 0)) * k - (f.x + f.w / 2);
      const py = (y - (vb[1] ?? 0)) * k - (f.y + f.h / 2);
      const t = (-f.rotation * Math.PI) / 180;
      const u = px * Math.cos(t) - py * Math.sin(t);
      const v = px * Math.sin(t) + py * Math.cos(t);
      return Math.abs(u) < f.w / 2 - 0.1 && Math.abs(v) < f.h / 2 - 0.1;
    };
    /** Midpoints (and ends) of every straight piece of the white grid left in the plot. */
    const gridPoints = [...walkNodes(plot)]
      .filter((n) => n.attrs['stroke'] === '#ffffff')
      .flatMap((n) =>
        [
          ...String(n.attrs['d']).matchAll(
            /M\s*([-\d.]+)[\s,]+([-\d.]+)\s*L\s*([-\d.]+)[\s,]+([-\d.]+)/g,
          ),
        ].map((m) => {
          const [x0, y0, x1, y1] = m.slice(1).map(Number) as [number, number, number, number];
          return [(x0 + x1) / 2, (y0 + y1) / 2] as const;
        }),
      );
    expect(gridPoints.length).toBeGreaterThan(20);
    // No grid line crosses a picture: what was under them is in their backdrops.
    for (const p of pics)
      for (const [x, y] of gridPoints) expect(within(p.frame, x, y)).toBe(false);
  });
});

describe('curves and fills partly under a picture (issue 42)', () => {
  const rgba = base64(
    encodePngSync({ width: 2, height: 2, channels: 4, data: new Uint8Array(16).fill(128) }),
  );
  /** The points of straight path data. */
  const ptsOf = (d: unknown): [number, number][] => {
    const v = (String(d).match(/-?[\d.]+/g) ?? []).map(Number);
    return v.flatMap((_, i) =>
      i % 2 === 0 ? [[v[i] ?? 0, v[i + 1] ?? 0] as [number, number]] : [],
    );
  };
  const byPaint = <T extends { attrs: Record<string, unknown> }>(
    ns: readonly T[],
    fill: string,
    stroke: string,
  ) => ns.find((n) => n.attrs['fill'] === fill && n.attrs['stroke'] === stroke);
  // A filled, outlined circle half under the picture (x 10–50) and a curve across it.
  const shapes =
    '<circle cx="10" cy="30" r="8" fill="#ff0000" stroke="#000000"/>' +
    '<path d="M0 60C20 0 40 0 60 60" fill="none" stroke="#00ff00"/>';

  it('cuts them where an opaque picture is, a filled outline into its fill and its outline', () => {
    const { r, all } = nodes(
      svg(
        shapes +
          `<image x="10" y="10" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(OPAQUE)}"/>`,
      ),
    );
    expect(r.warnings).toEqual([]);
    expect(r.pictures?.[0]?.backdrop).toBeUndefined();
    const fill = byPaint(all, '#ff0000', 'none');
    const outline = byPaint(all, 'none', '#000000');
    expect(fill?.tag).toBe('path');
    expect(outline?.tag).toBe('path');
    // Only the left half is left; the outline is open where it was cut (no stroked cut edge).
    for (const d of [fill?.attrs['d'], outline?.attrs['d']])
      for (const [x] of ptsOf(d)) expect(x).toBeLessThanOrEqual(10.001);
    expect(String(outline?.attrs['d'])).not.toMatch(/Z/);
    expect(Math.min(...ptsOf(fill?.attrs['d']).map(([x]) => x))).toBeCloseTo(2, 1);
    // The curve: its ends outside the picture, nothing of it inside.
    const curve = all.find((n) => n.attrs['stroke'] === '#00ff00');
    const pts = ptsOf(curve?.attrs['d']);
    expect(pts[0]).toEqual([0, 60]);
    expect(pts[pts.length - 1]).toEqual([60, 60]);
    for (const [x, y] of pts)
      expect(x <= 10.001 || x >= 49.999 || y <= 10.001 || y >= 49.999).toBe(true);
  });

  it('moves the parts under a see-through picture into its backdrop', () => {
    const { r, all } = nodes(
      svg(
        shapes +
          `<image x="10" y="10" width="40" height="40" preserveAspectRatio="none" xlink:href="${href(rgba)}"/>`,
      ),
    );
    const under = [
      ...walkNodes(sanitizeSvg(r.pictures?.[0]?.backdrop?.asset.svg ?? '').root),
    ].slice(1);
    expect(under.map((n) => [n.tag, n.attrs['fill'], n.attrs['stroke']])).toEqual([
      ['path', '#ff0000', 'none'],
      ['path', 'none', '#000000'],
      ['path', 'none', '#00ff00'],
    ]);
    for (const n of under)
      for (const [x, y] of ptsOf(n.attrs['d'])) {
        expect(x).toBeGreaterThanOrEqual(9.999);
        expect(x).toBeLessThanOrEqual(50.001);
        expect(y).toBeGreaterThanOrEqual(9.999);
      }
    expect(Math.max(...ptsOf(under[0]?.attrs['d']).map(([x]) => x))).toBeCloseTo(18, 1);
    // What is left in the plot meets it.
    expect(
      Math.max(...ptsOf(byPaint(all, '#ff0000', 'none')?.attrs['d']).map(([x]) => x)),
    ).toBeCloseTo(10, 3);
  });

  it('cuts along a turned picture, and leaves out of a backdrop what is over an earlier one', () => {
    const { r, all } = nodes(
      svg(
        '<rect x="0" y="35" width="100" height="10" fill="#0000ff"/>' +
          '<path d="M0 40Q50 30 100 40" fill="none" stroke="#00ff00"/>' +
          `<image x="10" y="20" width="30" height="40" preserveAspectRatio="none" xlink:href="${href(rgba)}"/>` +
          `<image x="50" y="30" width="20" height="20" preserveAspectRatio="none" transform="rotate(45 60 40)" xlink:href="${href(rgba)}"/>` +
          `<image x="30" y="20" width="30" height="40" preserveAspectRatio="none" xlink:href="${href(rgba)}"/>`,
      ),
    );
    const [first, turned, last] = (r.pictures ?? []).map((p) =>
      [...walkNodes(sanitizeSvg(p.backdrop?.asset.svg ?? '').root)].slice(1),
    );
    // A little inside the turned picture (half its diagonal is 14.142).
    const turnedQuad = makeRegion(
      [
        [
          [60, 40 - 14.1],
          [60 + 14.1, 40],
          [60, 40 + 14.1],
          [60 - 14.1, 40],
        ],
      ],
      false,
    );
    expect(turnedQuad).not.toBeNull();
    /** Whether a point is in the (non-zero) fill of straight closed path data. */
    const filledAt = (d: unknown, x: number, y: number): boolean => {
      const rings = String(d)
        .split('M')
        .filter((t) => t.trim() !== '')
        .map((t) => ptsOf(t));
      const region = makeRegion(rings, false);
      return region !== null && contains(region, [x, y]);
    };
    // The bar in the plot: cut out under all three pictures, kept beside them.
    const bar = all.find((n) => n.attrs['fill'] === '#0000ff');
    expect(bar?.tag).toBe('path');
    for (const [x, y, kept] of [
      [5, 40, true],
      [25, 40, false],
      [50, 40, false],
      [65, 40, false],
      [72, 40, false],
      [72, 36, true],
      [90, 40, true],
    ] as const)
      expect(filledAt(bar?.attrs['d'], x, y)).toBe(kept);
    // The curve in the plot: nothing of it left inside a picture.
    const curve = all.find((n) => n.attrs['stroke'] === '#00ff00');
    expect(String(curve?.attrs['d']).match(/M/g)).toHaveLength(2);
    for (const [x, y] of ptsOf(curve?.attrs['d'])) {
      expect(x > 10.001 && x < 59.999 && y > 20.001 && y < 59.999).toBe(false);
      expect(turnedQuad !== null && contains(turnedQuad, [x, y])).toBe(false);
    }
    // Each backdrop holds the bar's and the curve's pieces under it.
    const paints = [
      ['#0000ff', 'none'],
      ['none', '#00ff00'],
    ];
    expect(first?.map((n) => [n.attrs['fill'], n.attrs['stroke']])).toEqual(paints);
    expect(filledAt(first?.[0]?.attrs['d'], 25, 40)).toBe(true);
    // The turned one: in its own frame, by one group.
    expect(turned?.[0]?.tag).toBe('g');
    expect(turned?.slice(1).map((n) => [n.attrs['fill'], n.attrs['stroke']])).toEqual(paints);
    // The last overlaps both earlier ones: its pieces leave them out.
    expect(last?.map((n) => [n.attrs['fill'], n.attrs['stroke']])).toEqual(paints);
    for (const [x, y, kept] of [
      [42, 37, true],
      [35, 40, false],
      [55, 40, false],
    ] as const)
      expect(filledAt(last?.[0]?.attrs['d'], x, y)).toBe(kept);
    for (const [x, y] of ptsOf(last?.[1]?.attrs['d'])) {
      expect(x).toBeGreaterThanOrEqual(39.999);
      expect(turnedQuad !== null && contains(turnedQuad, [x, y])).toBe(false);
    }
  });
});

describe('clipped plot pictures (issue 36)', () => {
  /** 10 × 10 RGB, each pixel's red its column × 20 and green its row × 20. */
  const grid = base64(
    encodePngSync({
      width: 10,
      height: 10,
      channels: 3,
      data: Uint8Array.from({ length: 300 }, (_, i) =>
        i % 3 === 0 ? (Math.floor(i / 3) % 10) * 20 : i % 3 === 1 ? Math.floor(i / 30) * 20 : 0,
      ),
    }),
  );
  const pixelsOf = (p: { asset: { kind: string } } | undefined) => {
    const a = p?.asset as { dataBase64?: string } | undefined;
    return decodePng(fromBase64(a?.dataBase64 ?? ''));
  };
  // A tick at the origin keeps the plot's crop from moving it.
  const clipped = (clip: string, inner: string) =>
    svg(
      `<defs><clipPath id="c">${clip}</clipPath></defs>${inner}<path d="M0 0L1 1" stroke="#000000"/>`,
    );

  it('crops a picture to a rectangular clip on its group, to whole pixels', () => {
    const { r } = nodes(
      clipped(
        '<rect x="20" y="30" width="50" height="40"/>',
        `<g clip-path="url(#c)"><image width="100" height="100" preserveAspectRatio="none" xlink:href="${href(grid)}"/></g>`,
      ),
    );
    expect(r.warnings).toEqual([]);
    const pic = r.pictures?.[0];
    expect([pic?.asset.meta.width, pic?.asset.meta.height]).toEqual([5, 4]);
    expect(pic?.frame).toEqual({ x: 15, y: 22.5, w: 37.5, h: 30, rotation: 0 });
    const px = pixelsOf(pic);
    // The first pixel left is column 2, row 3 of the original.
    expect([px?.data[0], px?.data[1]]).toEqual([40, 60]);
    expect(px?.channels).toBe(3);
  });

  it('maps a clip through the transforms between its group and the picture', () => {
    const { r } = nodes(
      clipped(
        '<rect x="20" y="0" width="30" height="80"/>',
        `<g transform="translate(-10 0)" clip-path="url(#c)"><g transform="scale(2)">` +
          `<image width="50" height="40" preserveAspectRatio="none" xlink:href="${href(grid)}"/></g></g>`,
      ),
    );
    // Clip x 20..50 in the outer group's space is 10..40 on the page: picture columns 1..4.
    const pic = r.pictures?.[0];
    expect([pic?.asset.meta.width, pic?.asset.meta.height]).toEqual([3, 10]);
    expect(pic?.frame.x).toBeCloseTo(7.5);
    expect(pic?.frame.w).toBeCloseTo(22.5);
  });

  it('makes the pixels outside a circular clip see-through and gives the picture a backdrop', () => {
    const { r } = nodes(
      clipped(
        '<circle cx="50" cy="50" r="40"/>',
        '<rect width="100" height="80" fill="#eeeeee"/>' +
          `<image width="100" height="100" preserveAspectRatio="none" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    const pic = r.pictures?.[0];
    const px = pixelsOf(pic);
    expect([px?.width, px?.height, px?.channels]).toEqual([10, 10, 4]);
    expect(px?.data[3]).toBe(0); // corner: outside the circle
    expect(px?.data[(5 * 10 + 5) * 4 + 3]).toBe(255); // centre: inside
    expect(pic?.backdrop).toBeDefined();
  });

  it('drops a picture its clip leaves nothing of, and keeps one wholly inside unchanged', () => {
    const out = nodes(
      clipped(
        '<rect x="200" y="0" width="10" height="10"/>',
        `<rect width="100" height="80" fill="#eeeeee"/><image width="10" height="10" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    expect(out.r.pictures ?? []).toEqual([]);
    const inside = nodes(
      clipped(
        '<rect x="0" y="0" width="50" height="50"/>',
        `<image x="5" y="5" width="10" height="10" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    const a = inside.r.pictures?.[0]?.asset as { dataBase64?: string } | undefined;
    expect(a?.dataBase64).toBe(grid);
  });

  it('places a clipped JPEG, or a picture under an unreadable clip, whole with a warning', () => {
    // The smallest JPEG header imageSize reads: SOI, then SOF0 (8 bit, 2 × 2).
    const jpeg = base64(
      Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 2, 0, 2, 1, 1, 0x11, 0, 0xff, 0xd9]),
    );
    const j = nodes(
      clipped(
        '<rect x="0" y="0" width="5" height="5"/>',
        `<image width="10" height="10" clip-path="url(#c)" xlink:href="data:image/jpeg;base64,${jpeg}"/>`,
      ),
    );
    expect(j.r.warnings).toEqual([
      'A clipped picture in a format that cannot be cut here was placed whole.',
    ]);
    expect(j.r.pictures?.[0]?.frame.w).toBe(7.5);
    const t = nodes(
      clipped(
        '<text x="0" y="10">A</text>',
        `<image width="10" height="10" clip-path="url(#c)" xlink:href="${href(grid)}"/>`,
      ),
    );
    expect(t.r.warnings).toEqual([
      'A picture clipped to a shape that could not be read was placed whole.',
    ]);
  });

  it('matplotlib SVG: a zoomed heatmap cut to its axes, a heatmap cut to a circle', () => {
    const imp = importSvgText(
      readFileSync(new URL('./fixtures/matplotlib-clipped.svg', import.meta.url), 'utf8'),
      'matplotlib-clipped.svg',
    );
    expect(imp.warnings).toEqual([]);
    const [zoomed, round] = imp.pictures ?? [];
    // 26 × 21 pixels written under a 25 × 20 pixel axes box: one column and row cut.
    expect([zoomed?.asset.meta.width, zoomed?.asset.meta.height]).toEqual([25, 20]);
    // The axes box (42.08, 32.62, 114.1 × 91.28 px) at 0.75 pt per px, less the crop's origin.
    expect(zoomed?.frame.w).toBeCloseTo(114.097 * 0.75, 2);
    expect(zoomed?.frame.h).toBeCloseTo(91.2775 * 0.75, 2);
    expect(zoomed?.backdrop).toBeUndefined();
    const px = pixelsOf(round);
    expect(px?.channels).toBe(4);
    expect(px?.data[3]).toBe(0);
    expect(round?.backdrop).toBeDefined();
  });
});
