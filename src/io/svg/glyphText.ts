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
 * replaces each marked group that is a plain run of glyphs, or mathtext in
 * the subset `mathtext.ts` reads (scripts, Greek, operators: issue 22),
 * whose scaled and offset glyphs become tspans. Anything else (fractions,
 * radicals, unknown structure) keeps its outlines.
 */
import { type SvgNode, el } from '@/render/svgNode';

import { type Level, type MathChar, parseMathLabel } from './mathtext';
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

/** Where one glyph `<use>` sits in run units: x, baseline offset (y-up) and scale. */
interface Glyph {
  readonly ps: string;
  readonly x: number;
  readonly dy: number;
  readonly k: number;
}

const NUM = '([-+\\d.eE]+)';
const PLACEMENT = new RegExp(
  `^\\s*(?:translate\\(\\s*${NUM}(?:[\\s,]+${NUM})?\\s*\\))?\\s*(?:scale\\(\\s*${NUM}\\s*\\))?\\s*$`,
);

/** A glyph `<use>`'s font and placement, or null when it is placed any other way. */
function glyphOf(u: SvgNode, ids: ReadonlyMap<string, SvgNode>): Glyph | null {
  const href = String(u.attrs['xlink:href'] ?? u.attrs['href'] ?? '');
  const id = href.startsWith('#') ? href.slice(1) : '';
  if (ids.get(id)?.tag !== 'path') return null;
  const cut = id.lastIndexOf('-');
  if (cut <= 0) return null;
  const ps = decodeURIComponent(id.slice(0, cut));
  const ux = Number(u.attrs['x'] ?? 0);
  const uy = Number(u.attrs['y'] ?? 0);
  const m = PLACEMENT.exec(String(u.attrs['transform'] ?? ''));
  if (!m) return null;
  const k = m[3] === undefined ? 1 : Number(m[3]);
  // `x`/`y` on a scaled `<use>` would be scaled too; matplotlib never writes both.
  if (k !== 1 && (ux !== 0 || uy !== 0)) return null;
  const x = ux + Number(m[1] ?? 0);
  const dy = Number(m[2] ?? 0) - uy;
  if (![x, dy, k].every(Number.isFinite) || k <= 0) return null;
  return { ps, x, dy, k };
}

/** One positioned piece of a mathtext label: same script level, font and scale. */
interface Run {
  readonly level: Level;
  readonly glyph: Glyph;
  text: string;
}

/**
 * Pairs a mathtext label's characters with its glyphs and splits them into
 * runs, or null when they disagree (a glyph count or script level that is
 * not what the source says, more than one baseline per level).
 */
function mathRuns(chars: readonly MathChar[], glyphs: readonly Glyph[]): Run[] | null {
  const drawn = chars.filter((c) => c.glyph);
  if (drawn.length !== glyphs.length) return null;
  const base = glyphs.find((_, j) => drawn[j]?.level === 'base');
  if (!base) return null;
  const tol = 1e-3;
  const runs: Run[] = [];
  let j = 0;
  let pendingSpace = false;
  for (const c of chars) {
    if (!c.glyph) {
      pendingSpace = true;
      continue;
    }
    const g = glyphs[j++];
    if (!g) return null;
    const ok =
      c.level === 'base'
        ? g.k === 1 && Math.abs(g.dy - base.dy) < tol
        : g.k < 1 && (c.level === 'sup' ? g.dy > base.dy + tol : g.dy < base.dy - tol);
    if (!ok) return null;
    const last = runs[runs.length - 1];
    if (
      last?.level === c.level &&
      last.glyph.ps === g.ps &&
      last.glyph.k === g.k &&
      Math.abs(last.glyph.dy - g.dy) < tol
    ) {
      // Mathtext spacing inside a run is a space; a new run is placed where its glyph is.
      if (pendingSpace && !last.text.endsWith(' ') && c.ch !== ' ') last.text += ' ';
      last.text += c.ch;
    } else runs.push({ level: c.level, glyph: g, text: c.ch });
    pendingSpace = false;
  }
  return runs;
}

/** Font attributes of `ps` that differ from the text's own. */
function fontDiff(ps: string, text: ReturnType<typeof fontFromPsName>): Record<string, string> {
  const f = fontFromPsName(ps);
  const out: Record<string, string> = {};
  if (f.family !== text.family) out['font-family'] = f.family;
  if (f.weight !== text.weight) out['font-weight'] = f.weight ?? 'normal';
  if (f.style !== text.style) out['font-style'] = f.style ?? 'normal';
  return out;
}

function rebuild(g: SvgNode, label: string, ids: ReadonlyMap<string, SvgNode>): SvgNode | null {
  if (label.trim() === '') return null;
  const uses: SvgNode[] = [];
  for (const c of g.children) {
    if (typeof c === 'string') {
      if (c.trim() !== '') return null;
    } else if (c.tag === 'use') uses.push(c);
    else if (c.tag !== 'defs') return null; // rules (fraction bars, radicals) are paths
  }
  if (uses.length === 0) return null;
  const glyphs: Glyph[] = [];
  for (const u of uses) {
    const gl = glyphOf(u, ids);
    if (!gl) return null;
    glyphs.push(gl);
  }
  let runs: Run[] | null;
  if (/\$.*\$/s.test(label)) {
    // Mathtext: its common subset, checked glyph by glyph (scripts are scaled and offset).
    const chars = parseMathLabel(label);
    runs = chars && mathRuns(chars, glyphs);
  } else {
    // A plain run: one font, one baseline, glyphs at x offsets.
    const first = glyphs[0];
    runs =
      first && glyphs.every((gl) => gl.ps === first.ps && gl.k === 1 && gl.dy === 0)
        ? [{ level: 'base', glyph: first, text: label }]
        : null;
  }
  const head = runs?.[0];
  if (!runs || !head) return null;
  const m = parseTransform(String(g.attrs['transform'] ?? ''));
  // Glyph space is y-up: the run is a uniform scale with a y flip, possibly rotated.
  if (!m) return null;
  const s = Math.hypot(m[0], m[1]);
  const tol = 1e-6 * Math.max(1, s);
  if (s === 0 || Math.abs(m[2] - m[1]) > tol || Math.abs(m[3] + m[0]) > tol) return null;
  const x0 = head.glyph.x;
  const base = runs.find((r) => r.level === 'base')?.glyph.dy ?? 0;
  const [x, y] = apply(m, x0, base);
  const angle = angleOf(m);
  const size = s * FONT_SCALE;
  const f = fontFromPsName(head.glyph.ps);
  // Glyph positions are exact; only the last glyph's own advance is estimated.
  const lastGlyph = glyphs[glyphs.length - 1] ?? head.glyph;
  const lastRun = runs[runs.length - 1] ?? head;
  const lastChar = Array.from(lastRun.text.trimEnd()).pop() ?? '';
  const lf = fontFromPsName(lastGlyph.ps);
  const advance =
    (lastGlyph.x - x0) / FONT_SCALE +
    lastGlyph.k * approxTextWidth(lastChar, 1, lf.family, lf.weight !== undefined);
  const attrs: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(g.attrs))
    if (k !== 'transform' && k !== GLYPH_TEXT_ATTR) attrs[k] = v;
  // One run is a plain label; several are tspans with explicit x, y and size, in the
  // unrotated frame of the label (export subset: no baseline-shift).
  const children =
    runs.length === 1 && head.level === 'base'
      ? [head.text]
      : runs.map((r) =>
          el(
            'tspan',
            {
              x: fmt(x + s * (r.glyph.x - x0)),
              y: fmt(y - s * (r.glyph.dy - base)),
              ...(r.glyph.k !== 1 ? { 'font-size': fmt(size * r.glyph.k) } : {}),
              ...fontDiff(r.glyph.ps, f),
            },
            [r.text],
          ),
        );
  return el(
    'text',
    {
      ...attrs,
      x: fmt(x),
      y: fmt(y),
      'font-family': f.family,
      'font-size': fmt(size),
      ...(f.weight ? { 'font-weight': f.weight } : {}),
      ...(f.style ? { 'font-style': f.style } : {}),
      [ADVANCE_ATTR]: fmt(advance),
      ...(Math.abs(angle) > 1e-6 ? { transform: `rotate(${fmt(angle)} ${fmt(x)} ${fmt(y)})` } : {}),
    },
    children,
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
