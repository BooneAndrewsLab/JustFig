import { beforeAll, describe, expect, it } from 'vitest';

import { walkNodes } from '@/render/svgNode';
import { loadTestFonts } from '@/test/fonts';

import { buildTorture } from './fixtures/torture';
import { exportRoot } from './svg';

// The export subset (note 03): plain SVG 1.1 presentation attributes that
// svg2pdf, Safari's rasteriser and Firefox all handle.
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
  'image',
]);
const ATTRS = new Set([
  'transform',
  'opacity',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'd',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'xml:space',
  'preserveAspectRatio',
  'xlink:href',
]);
const FORBIDDEN_VALUE = /url\(|var\(|javascript:|expression\(/i;

beforeAll(loadTestFonts);

describe('export subset', () => {
  for (const textMode of ['text', 'outline'] as const) {
    it(`holds for the torture fixture (${textMode})`, () => {
      const fig = buildTorture();
      const page = fig.doc.pages[0];
      if (!page) throw new Error('no page');
      const { node } = exportRoot(fig, page, { textMode, footer: true, background: true });
      const problems: string[] = [];
      for (const n of walkNodes(node)) {
        if (!TAGS.has(n.tag)) problems.push(`<${n.tag}>`);
        for (const [k, v] of Object.entries(n.attrs)) {
          if (v === undefined || k.startsWith('data-')) continue;
          if (!ATTRS.has(k)) problems.push(`${n.tag}@${k}`);
          if (typeof v === 'string' && FORBIDDEN_VALUE.test(v)) problems.push(`${n.tag}@${k}=${v}`);
          if (k === 'xlink:href' && typeof v === 'string' && !v.startsWith('data:image/'))
            problems.push(`external ${v}`);
        }
      }
      expect([...new Set(problems)]).toEqual([]);
    });
  }
});
