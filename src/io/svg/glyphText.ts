/**
 * Matplotlib's default SVG output (`svg.fonttype: 'path'`) draws every
 * label as glyph outlines: a `<g transform="translate(…) scale(s -s)">` of
 * `<use>`s pointing at per-glyph `<path>`s, preceded by a comment holding
 * the label (note 12). Glyph ids are not reliable characters (newer
 * versions use glyph indices), so the comment is the text. These runs are
 * rebuilt as real `<text>` so the label stays editable and identifiable.
 *
 * Two steps, because the XML parser drops comments: `markGlyphRuns` moves
 * each `<!-- label -->` that directly precedes a `<g` into a
 * `data-glyph-text` attribute of that group; `rebuildGlyphRuns` then
 * replaces each marked group that is a plain run of glyphs. Anything else
 * (mathtext with scaled glyphs or rules, unknown structure) keeps its
 * outlines.
 */
import { type SvgNode, el } from '@/render/svgNode';

import { angleOf, apply, fmt, parseTransform } from './matrix';
import { ADVANCE_ATTR, approxTextWidth } from './plotCleanup';

export const GLYPH_TEXT_ATTR = 'data-glyph-text';

/** Matplotlib lays glyphs out in units of 1/100 of the font size (`TextToPath.FONT_SCALE`). */
const FONT_SCALE = 100;

/** The comment as matplotlib escaped it (`&amp;`, `&lt;`, `&gt;`) → an attribute value. */
const escapeAttr = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function markGlyphRuns(text: string): string {
  if (!text.includes('<!--')) return text;
  return text.replace(
    /<!-- ([^]*?) -->(\s*)<g\b/g,
    (_m, label: string, ws: string) => `${ws}<g ${GLYPH_TEXT_ATTR}="${escapeAttr(label)}"`,
  );
}

/** `DejaVuSans-Bold` → family and style. */
export function fontFromPsName(ps: string): {
  family: string;
  weight?: string;
  style?: string;
} {
  const i = ps.indexOf('-');
  const base = i < 0 ? ps : ps.slice(0, i);
  const suffix = i < 0 ? '' : ps.slice(i + 1).toLowerCase();
  const KNOWN: Readonly<Record<string, string>> = {
    DejaVuSans: 'DejaVu Sans',
    DejaVuSerif: 'DejaVu Serif',
    DejaVuSansMono: 'DejaVu Sans Mono',
    STIXGeneral: 'STIXGeneral',
    ArialMT: 'Arial',
  };
  const family = KNOWN[base] ?? base.replace(/([a-z])([A-Z])/g, '$1 $2');
  const generic = /mono|courier|cousine/i.test(family)
    ? 'monospace'
    : /serif|times|tinos|stix|roman/i.test(family) && !/sans/i.test(family)
      ? 'serif'
      : 'sans-serif';
  return {
    family: `${family}, ${generic}`,
    ...(suffix.includes('bold') ? { weight: 'bold' } : {}),
    ...(suffix.includes('oblique') || suffix.includes('italic') ? { style: 'italic' } : {}),
  };
}

/** x offset of one glyph `<use>` in run units, or null when it is placed any other way. */
function glyphX(u: SvgNode): number | null {
  if (u.attrs['y'] !== undefined && Number(u.attrs['y']) !== 0) return null;
  const x = Number(u.attrs['x'] ?? 0);
  if (!Number.isFinite(x)) return null;
  const t = u.attrs['transform'];
  if (t === undefined) return x;
  const m = /^\s*translate\(\s*([-+\d.eE]+)(?:[\s,]+([-+\d.eE]+))?\s*\)\s*$/.exec(String(t));
  if (!m || Number(m[2] ?? 0) !== 0) return null;
  return x + Number(m[1]);
}

function rebuild(g: SvgNode, label: string, ids: ReadonlyMap<string, SvgNode>): SvgNode | null {
  // Mathtext (`$…$`) is laid out from TeX-like source the comment cannot reproduce.
  if (label.trim() === '' || /\$.*\$/s.test(label)) return null;
  const uses: SvgNode[] = [];
  for (const c of g.children) {
    if (typeof c === 'string') {
      if (c.trim() !== '') return null;
    } else if (c.tag === 'use') uses.push(c);
    else if (c.tag !== 'defs') return null;
  }
  if (uses.length === 0) return null;
  let font: string | null = null;
  for (const u of uses) {
    const href = String(u.attrs['xlink:href'] ?? u.attrs['href'] ?? '');
    const id = href.startsWith('#') ? href.slice(1) : '';
    const target = ids.get(id);
    if (target?.tag !== 'path') return null;
    const cut = id.lastIndexOf('-');
    if (cut <= 0) return null;
    const ps = decodeURIComponent(id.slice(0, cut));
    if (font !== null && ps !== font) return null;
    font = ps;
  }
  const xs = uses.map(glyphX);
  if (font === null || xs.some((x) => x === null)) return null;
  const m = parseTransform(String(g.attrs['transform'] ?? ''));
  // Glyph space is y-up: the run is a uniform scale with a y flip, possibly rotated.
  if (!m) return null;
  const s = Math.hypot(m[0], m[1]);
  const tol = 1e-6 * Math.max(1, s);
  if (s === 0 || Math.abs(m[2] - m[1]) > tol || Math.abs(m[3] + m[0]) > tol) return null;
  const [x, y] = apply(m, xs[0] ?? 0, 0);
  const angle = angleOf(m);
  const f = fontFromPsName(font);
  // Glyph positions are exact; only the last glyph's own advance is estimated.
  const lastX = xs[xs.length - 1] ?? 0;
  const lastChar = Array.from(label.trimEnd()).pop() ?? '';
  const advance =
    (lastX - (xs[0] ?? 0)) / FONT_SCALE +
    approxTextWidth(lastChar, 1, f.family, f.weight !== undefined);
  const attrs: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(g.attrs))
    if (k !== 'transform' && k !== GLYPH_TEXT_ATTR) attrs[k] = v;
  return el(
    'text',
    {
      ...attrs,
      x: fmt(x),
      y: fmt(y),
      'font-family': f.family,
      'font-size': fmt(s * FONT_SCALE),
      ...(f.weight ? { 'font-weight': f.weight } : {}),
      ...(f.style ? { 'font-style': f.style } : {}),
      [ADVANCE_ATTR]: fmt(advance),
      ...(Math.abs(angle) > 1e-6 ? { transform: `rotate(${fmt(angle)} ${fmt(x)} ${fmt(y)})` } : {}),
    },
    [label],
  );
}

/** The tree with each plain marked glyph run replaced by a `<text>`. */
export function rebuildGlyphRuns(node: SvgNode, ids: ReadonlyMap<string, SvgNode>): SvgNode {
  const label = node.attrs[GLYPH_TEXT_ATTR];
  if (node.tag === 'g' && typeof label === 'string') {
    const t = rebuild(node, label, ids);
    if (t) return t;
  }
  if (!node.children.some((c) => typeof c !== 'string')) return node;
  return el(
    node.tag,
    node.attrs,
    node.children.map((c) => (typeof c === 'string' ? c : rebuildGlyphRuns(c, ids))),
  );
}
