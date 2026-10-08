/**
 * Text inside imported SVGs (plots, fragments, snapshots) laid out with our
 * fonts (note 14). Each `<text>` is mapped to Arimo, Tinos or Cousine
 * (`io/svg/plotFonts.ts`), measured with opentype.js and placed with
 * explicit x/y per segment, as `textNodes` does for our own text: glyph
 * outlines in outline mode, `<text>`/`<tspan>` in the bundled family in
 * text mode. Both modes share one layout, so they match. The stored asset
 * keeps the plot's own font names; only the rendering changes.
 *
 * Covers what the sanitiser keeps: `x`/`y` (lists too: each listed
 * position starts a new chunk), nested `<tspan>`s, `font-*`, `text-anchor`
 * per chunk, `xml:space` and paints. Kerning off, like all our text.
 */
import type { FontId } from '@/core/model/types';
import { FAMILY_NAME, getFont } from '@/core/text/fonts';
import { len, numList } from '@/io/svg/plotCleanup';
import { bundledFont, isBold, isItalic } from '@/io/svg/plotFonts';

import { type SvgNode, el } from './svgNode';
import type { TextMode } from './textNodes';

type Attrs = Record<string, string | number>;

const FONT_ATTRS = new Set([
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
]);
const POSITION_ATTRS = new Set(['x', 'y', 'xml:space']);
const PAINT_ATTRS = [
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
];

/** Inherited font properties, as written in the SVG. */
interface FontCtx {
  readonly family: string;
  readonly size: number;
  readonly weight: string;
  readonly style: string;
  readonly anchor: string;
}

const ROOT_FONT: FontCtx = {
  family: '',
  size: 16,
  weight: 'normal',
  style: 'normal',
  anchor: 'start',
};

function inheritFont(f: FontCtx, a: SvgNode['attrs']): FontCtx {
  const s = a['font-size'] === undefined ? null : len(a['font-size']);
  return {
    family: a['font-family'] === undefined ? f.family : String(a['font-family']),
    size: s !== null && s >= 0 ? s : f.size,
    weight: a['font-weight'] === undefined ? f.weight : String(a['font-weight']),
    style: a['font-style'] === undefined ? f.style : String(a['font-style']),
    anchor: a['text-anchor'] === undefined ? f.anchor : String(a['text-anchor']),
  };
}

/** The resolved style one character is drawn in. */
interface Style {
  readonly font: FontId;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly size: number;
  readonly anchor: string;
  /** Paint set on tspans inside the text (the text's own stays on the wrapper). */
  readonly paint: Readonly<Attrs>;
  /** Equality key of everything above but the anchor. */
  readonly key: string;
}

function styleOf(f: FontCtx, paint: Readonly<Attrs>): Style {
  const font = bundledFont(f.family);
  const bold = isBold(f.weight);
  const italic = isItalic(f.style);
  return {
    font,
    bold,
    italic,
    size: f.size,
    anchor: f.anchor,
    paint,
    key: JSON.stringify([font, bold, italic, f.size, paint]),
  };
}

interface Char {
  readonly ch: string;
  readonly style: Style;
  readonly x: number | undefined;
  readonly y: number | undefined;
}

/** An element's position lists and how many of its characters were placed. */
interface Positions {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  count: number;
}

/** Characters of a `<text>` in order, whitespace handled as browsers do. */
function collectChars(text: SvgNode, base: FontCtx): Char[] {
  const preserve = text.attrs['xml:space'] === 'preserve';
  const out: Char[] = [];
  let lastSpace = true; // collapses leading space when not preserving
  const walk = (n: SvgNode, f: FontCtx, paint: Readonly<Attrs>, stack: Positions[]): void => {
    const pos: Positions = {
      xs: numList(n.attrs['x']) ?? [],
      ys: numList(n.attrs['y']) ?? [],
      count: 0,
    };
    const st = [...stack, pos];
    const style = styleOf(f, paint);
    for (const c of n.children) {
      if (typeof c !== 'string') {
        if (c.tag !== 'tspan') continue;
        const own: Attrs = { ...paint };
        for (const k of PAINT_ATTRS) {
          const v = c.attrs[k];
          if (v !== undefined) own[k] = v;
        }
        walk(c, inheritFont(f, c.attrs), own, st);
        continue;
      }
      for (const raw of c.replace(/[\t\r\n]/g, ' ')) {
        if (!preserve && raw === ' ' && lastSpace) continue;
        lastSpace = raw === ' ';
        let x: number | undefined;
        let y: number | undefined;
        for (let i = st.length - 1; i >= 0; i--) {
          const p = st[i];
          if (!p) continue;
          x ??= p.xs[p.count];
          y ??= p.ys[p.count];
        }
        for (const p of st) p.count++;
        out.push({ ch: raw, style, x, y });
      }
    }
  };
  walk(text, base, {}, []);
  if (!preserve) while (out.length > 0 && out[out.length - 1]?.ch === ' ') out.pop();
  return out;
}

export interface PlacedSegment {
  readonly text: string;
  /** Left end of the segment's baseline, after the anchor. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly style: Style;
}

const OPTS = { kerning: false, features: {} };

const fontOf = (s: Style) => getFont(s.font, { bold: s.bold, italic: s.italic });

/**
 * Lays out one imported `<text>` with the bundled fonts: chunks start at
 * the first character and wherever a position is given; each is shifted by
 * its own `text-anchor`. Coordinates stay in the text's user space.
 */
export function layoutImportedText(text: SvgNode, inherited: FontCtx = ROOT_FONT): PlacedSegment[] {
  const chars = collectChars(text, inheritFont(inherited, text.attrs));
  const out: PlacedSegment[] = [];
  let cx = 0;
  let cy = 0;
  let chunk: { start: number; x0: number; anchor: string } | null = null;
  const closeChunk = (): void => {
    if (!chunk) return;
    const w = cx - chunk.x0;
    const dx = chunk.anchor === 'middle' ? -w / 2 : chunk.anchor === 'end' ? -w : 0;
    if (dx !== 0)
      for (let i = chunk.start; i < out.length; i++) {
        const s = out[i];
        if (s) out[i] = { ...s, x: s.x + dx };
      }
  };
  let joinable = false;
  for (const c of chars) {
    if (chunk === null || c.x !== undefined || c.y !== undefined) {
      closeChunk();
      if (c.x !== undefined) cx = c.x;
      if (c.y !== undefined) cy = c.y;
      chunk = { start: out.length, x0: cx, anchor: c.style.anchor };
      joinable = false;
    }
    const adv = fontOf(c.style).getAdvanceWidth(c.ch, c.style.size, OPTS);
    const last = out[out.length - 1];
    if (joinable && last?.style.key === c.style.key)
      out[out.length - 1] = { ...last, text: last.text + c.ch, width: last.width + adv };
    else out.push({ text: c.ch, x: cx, y: cy, width: adv, style: c.style });
    joinable = true;
    cx += adv;
  }
  closeChunk();
  return out.filter((s) => s.text.trim() !== '');
}

/** The text's own attributes that still apply once fonts and positions are resolved. */
function wrapperAttrs(n: SvgNode): Attrs {
  const out: Attrs = {};
  for (const [k, v] of Object.entries(n.attrs))
    if (v !== undefined && !FONT_ATTRS.has(k) && !POSITION_ATTRS.has(k)) out[k] = v;
  return out;
}

function textToNodes(n: SvgNode, f: FontCtx, mode: TextMode): SvgNode[] {
  const segs = layoutImportedText(n, f);
  if (segs.length === 0) return [];
  const wrapper = wrapperAttrs(n);
  if (mode === 'text') {
    const spans = segs.map((s) =>
      el(
        'tspan',
        {
          x: s.x,
          y: s.y,
          'font-family': FAMILY_NAME[s.style.font],
          'font-size': s.style.size,
          'font-weight': s.style.bold ? 'bold' : undefined,
          'font-style': s.style.italic ? 'italic' : undefined,
          ...s.style.paint,
        },
        [s.text],
      ),
    );
    return [el('text', { ...wrapper, 'xml:space': 'preserve' }, spans)];
  }
  const paths: SvgNode[] = [];
  for (const s of segs) {
    const d = fontOf(s.style).getPath(s.text, s.x, s.y, s.style.size, OPTS).toPathData(2);
    if (d !== '') paths.push(el('path', { d, ...s.style.paint }));
  }
  if (paths.length === 0) return [];
  return Object.keys(wrapper).length === 0 ? paths : [el('g', wrapper, paths)];
}

/**
 * The tree with every `<text>` laid out in the bundled fonts, and font
 * attributes elsewhere (which nothing reads any more) dropped.
 */
export function layoutImportedTexts(
  node: SvgNode,
  mode: TextMode,
  f: FontCtx = ROOT_FONT,
): SvgNode {
  const inner = inheritFont(f, node.attrs);
  const children: (SvgNode | string)[] = [];
  for (const c of node.children) {
    if (typeof c === 'string') children.push(c);
    else if (c.tag === 'text') children.push(...textToNodes(c, inner, mode));
    else children.push(layoutImportedTexts(c, mode, inner));
  }
  const attrs: Attrs = {};
  for (const [k, v] of Object.entries(node.attrs))
    if (v !== undefined && !FONT_ATTRS.has(k)) attrs[k] = v;
  return el(node.tag, attrs, children);
}
