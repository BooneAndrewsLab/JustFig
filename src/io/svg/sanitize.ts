/**
 * SVG sanitiser and normaliser (notes 01 and 03): any SVG text → a tree in
 * the export subset. Used for imported SVGs and, defensively, for every
 * icon placed; the Phase 2 icon pipeline starts from this module (copied),
 * adding transform flattening, viewBox cropping and slot clustering.
 *
 * - Elements outside the allow-list are dropped with their content
 *   (script, foreignObject, image, filter, mask, clipPath, …) and logged.
 *   A plot's embedded PNG and JPEG pictures are the exception: plot cleanup
 *   takes them out of the tree, to be placed as pictures of their own
 *   (issue 24); linked ones are dropped.
 * - `<style>` rules (tag, .class, #id, `*` and descendant selectors) and
 *   `style=` are resolved into presentation attributes; the `font`
 *   shorthand is expanded and `inherit` means "not set".
 * - `<use>` is inlined (as a <g> with its x/y translate); `<defs>` dropped.
 * - Gradient paints become their average stop colour.
 * - Event handlers, ids, classes, external references and unknown
 *   attributes are dropped; `currentColor` becomes black.
 * - With `plot: true` (file imports, note 12) matplotlib's glyph-outline
 *   labels are rebuilt as text first and the result is cleaned up as a plot
 *   afterwards (`plotCleanup.ts`): transforms baked, background dropped,
 *   split text merged, viewBox cropped.
 */
import { type SvgNode, el, nodeToSvgString, walkNodes } from '@/render/svgNode';
import { parseXml } from '@/render/xml';

import { markGlyphRuns, rebuildGlyphRuns } from './glyphText';
import { ADVANCE_ATTR, cleanupPlot } from './plotCleanup';
import type { PlotImage } from './plotImages';

export interface SanitizedSvg {
  /** `<svg viewBox>` root with only allowed content. */
  readonly root: SvgNode;
  readonly viewBox: readonly [number, number, number, number];
  /** What was removed or approximated, for the import report. */
  readonly warnings: readonly string[];
  /** A plot's embedded pictures, taken out of the tree (`plot: true` only). */
  readonly images?: readonly PlotImage[];
}

export class SvgImportError extends Error {
  override readonly name = 'SvgImportError';
}

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['svg', 'g', 'a', 'switch']);
const TEXT = new Set(['text', 'tspan']);
const DROP_SILENT = new Set([
  'title',
  'desc',
  'metadata',
  'defs',
  'style',
  'linearGradient',
  'radialGradient',
  'symbol',
]);

const PRESENTATION = [
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
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
];
const PRESENTATION_SET = new Set(PRESENTATION);

const GEOMETRY: Readonly<Record<string, readonly string[]>> = {
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  text: ['x', 'y', 'xml:space'],
  tspan: ['x', 'y', 'dy'],
};

const KEEP_DATA = ['data-slot', 'data-tone', 'data-part'];

/** An embedded picture a plot may keep: PNG or JPEG data, nothing fetched. */
const PICTURE_HREF = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

interface Compound {
  readonly tag?: string;
  readonly id?: string;
  readonly classes: readonly string[];
}

interface CssRule {
  /** Compound selectors joined by descendant combinators, outermost first. */
  readonly sel: readonly Compound[];
  readonly decls: Readonly<Record<string, string>>;
}

/** `font: [style] [weight] size[/line-height] family` → longhands. */
function expandFont(decls: Record<string, string>): Record<string, string> {
  const font = decls['font'];
  if (font === undefined) return decls;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(decls)) {
    if (k !== 'font') {
      out[k] = v;
      continue;
    }
    const m =
      /^\s*((?:(?:normal|italic|oblique|bold|bolder|lighter|small-caps|[1-9]00)\s+)*)([\d.]+(?:px|pt|em|%)?)(?:\/\S+)?\s+(.+)$/i.exec(
        font,
      );
    if (!m) continue;
    const words = (m[1] ?? '').toLowerCase().split(/\s+/);
    const style = words.find((w) => w === 'italic' || w === 'oblique');
    const weight = words.find((w) => /^(bold|bolder|lighter|[1-9]00)$/.test(w));
    out['font-style'] = style ?? 'normal';
    out['font-weight'] = weight ?? 'normal';
    out['font-size'] = m[2] ?? '';
    out['font-family'] = (m[3] ?? '').trim();
  }
  return out;
}

export function parseDecls(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part
      .slice(i + 1)
      .replace(/!important/i, '')
      .trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function parseCompound(s: string): Compound | null {
  if (s === '*') return { classes: [] };
  const m = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/.exec(s);
  if (!m || s === '') return null;
  const parts = (m[2] ?? '').match(/[.#][\w-]+/g) ?? [];
  const id = parts.find((p) => p.startsWith('#'))?.slice(1);
  return {
    ...(m[1] && m[1] !== '*' ? { tag: m[1] } : {}),
    ...(id !== undefined ? { id } : {}),
    classes: parts.filter((p) => p.startsWith('.')).map((p) => p.slice(1)),
  };
}

function parseCss(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const decls = expandFont(parseDecls(m[2] ?? ''));
    for (const sel of (m[1] ?? '').split(',')) {
      // Descendant combinators only; child/sibling combinators and pseudo-classes are skipped.
      const words = sel.trim().split(/\s+/);
      const parts = words.map(parseCompound).filter((p) => p !== null);
      if (parts.length > 0 && parts.length === words.length) rules.push({ sel: parts, decls });
    }
  }
  return rules;
}

function matchesCompound(c: Compound, n: SvgNode): boolean {
  const a = n.attrs;
  if (c.tag !== undefined && n.tag !== c.tag) return false;
  if (c.id !== undefined && a['id'] !== c.id) return false;
  const cls = String(a['class'] ?? '').split(/\s+/);
  return c.classes.every((k) => cls.includes(k));
}

/** Whether `n`, below `ancestors` (outermost first), matches the rule's selector. */
function matches(sel: readonly Compound[], n: SvgNode, ancestors: readonly SvgNode[]): boolean {
  const last = sel[sel.length - 1];
  if (!last || !matchesCompound(last, n)) return false;
  let i = ancestors.length - 1;
  for (let j = sel.length - 2; j >= 0; j--) {
    const c = sel[j];
    if (!c) return false;
    for (; i >= 0; i--) {
      const a = ancestors[i];
      if (a && matchesCompound(c, a)) break;
    }
    if (i < 0) return false;
    i--;
  }
  return true;
}

const NAMED: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
};

function hex2(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');
}

/** A colour value in the subset: #rrggbb, 'none', or null when unusable. */
export function normalizeColor(v: string, gradients: ReadonlyMap<string, string>): string | null {
  const s = v.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return 'none';
  if (s === 'currentcolor') return '#000000';
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s.slice(1).replace(/./g, (c) => c + c)}`;
  const rgb = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/.exec(s);
  if (rgb) {
    const ch = (v: string | undefined, pct: string | undefined) =>
      hex2(pct === '%' ? (Number(v) * 255) / 100 : Number(v));
    return `#${ch(rgb[1], rgb[2])}${ch(rgb[3], rgb[4])}${ch(rgb[5], rgb[6])}`;
  }
  const url = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(s);
  if (url) return gradients.get(url[1] ?? '') ?? 'none';
  return NAMED[s] ?? null;
}

function gradientColors(root: SvgNode, ids: ReadonlyMap<string, SvgNode>): Map<string, string> {
  const out = new Map<string, string>();
  const stopsOf = (g: SvgNode, depth = 0): SvgNode[] => {
    const own = g.children.filter((c): c is SvgNode => typeof c !== 'string' && c.tag === 'stop');
    if (own.length > 0 || depth > 4) return own;
    const href = String(g.attrs['href'] ?? g.attrs['xlink:href'] ?? '');
    const target = href.startsWith('#') ? ids.get(href.slice(1)) : undefined;
    return target ? stopsOf(target, depth + 1) : [];
  };
  for (const n of walkNodes(root)) {
    if (n.tag !== 'linearGradient' && n.tag !== 'radialGradient') continue;
    const id = n.attrs['id'];
    if (typeof id !== 'string') continue;
    let r = 0;
    let g = 0;
    let b = 0;
    let k = 0;
    for (const s of stopsOf(n)) {
      const style = parseDecls(String(s.attrs['style'] ?? ''));
      const c = normalizeColor(
        style['stop-color'] ?? String(s.attrs['stop-color'] ?? '#000000'),
        new Map(),
      );
      if (!c || c === 'none') continue;
      r += parseInt(c.slice(1, 3), 16);
      g += parseInt(c.slice(3, 5), 16);
      b += parseInt(c.slice(5, 7), 16);
      k += 1;
    }
    if (k > 0) out.set(id, `#${hex2(r / k)}${hex2(g / k)}${hex2(b / k)}`);
  }
  return out;
}

function numberList(s: string): number[] {
  return s
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((x) => Number.isFinite(x));
}

/** Width/height attribute in user units (px, pt, mm, cm, in; % ignored). */
function length(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const m = /^\s*([\d.]+)\s*(px|pt|mm|cm|in)?\s*$/.exec(String(v));
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? 'px';
  const k: Record<string, number> = { px: 1, pt: 4 / 3, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
  return n * (k[unit] ?? 1);
}

export interface SanitizeOptions {
  /** Clean the result up as an imported plot (note 12). */
  readonly plot?: boolean;
}

export function sanitizeSvg(text: string, opts: SanitizeOptions = {}): SanitizedSvg {
  let parsed: SvgNode;
  try {
    parsed = parseXml(opts.plot === true ? markGlyphRuns(text) : text);
  } catch (e: unknown) {
    throw new SvgImportError(
      `This is not a readable SVG file (${e instanceof Error ? e.message : 'parse error'}).`,
    );
  }
  if (parsed.tag !== 'svg' && !parsed.tag.endsWith(':svg'))
    throw new SvgImportError('This is not an SVG file.');
  const warnings = new Set<string>();
  const ids = new Map<string, SvgNode>();
  const css: CssRule[] = [];
  for (const n of walkNodes(parsed)) {
    const id = n.attrs['id'];
    if (typeof id === 'string') ids.set(id, n);
    if (n.tag === 'style')
      css.push(...parseCss(n.children.filter((c) => typeof c === 'string').join('')));
  }
  const gradients = gradientColors(parsed, ids);
  // Glyph references resolve through `ids`, which still holds the original defs.
  if (opts.plot === true) parsed = rebuildGlyphRuns(parsed, ids);

  /** Element → its own presentation values (attr < CSS < style=). */
  const own = (n: SvgNode, ancestors: readonly SvgNode[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(n.attrs))
      if (PRESENTATION_SET.has(k) && v !== undefined) out[k] = String(v);
    for (const r of css) if (matches(r.sel, n, ancestors)) Object.assign(out, r.decls);
    Object.assign(out, expandFont(parseDecls(String(n.attrs['style'] ?? ''))));
    return Object.fromEntries(
      Object.entries(out).filter(([, v]) => v.trim().toLowerCase() !== 'inherit'),
    );
  };

  const clean = (
    n: SvgNode,
    depth: number,
    useDepth: number,
    ancestors: readonly SvgNode[] = [],
  ): SvgNode | null => {
    const tag = n.tag.includes(':') ? '' : n.tag;
    if (depth > 64) return null;
    if (tag === 'use') {
      const href = String(n.attrs['href'] ?? n.attrs['xlink:href'] ?? '');
      const target = href.startsWith('#') ? ids.get(href.slice(1)) : undefined;
      if (!target || useDepth > 8) {
        warnings.add('Removed a reference to something outside the file.');
        return null;
      }
      const inner = clean(
        target.tag === 'symbol' ? { ...target, tag: 'g' } : target,
        depth + 1,
        useDepth + 1,
        [...ancestors, n],
      );
      if (!inner) return null;
      const x = Number(n.attrs['x'] ?? 0) || 0;
      const y = Number(n.attrs['y'] ?? 0) || 0;
      const t = [n.attrs['transform'], x || y ? `translate(${String(x)} ${String(y)})` : undefined]
        .filter((s) => s !== undefined)
        .join(' ');
      return el('g', { ...pres(n, ancestors), ...(t ? { transform: t } : {}) }, [inner]);
    }
    if (tag === 'image' && opts.plot === true) {
      const href = String(n.attrs['href'] ?? n.attrs['xlink:href'] ?? '').replace(/\s+/g, '');
      if (!PICTURE_HREF.test(href)) {
        warnings.add('Removed a picture linked from outside the file.');
        return null;
      }
      const a: Record<string, string> = { href };
      for (const k of ['x', 'y', 'width', 'height', 'preserveAspectRatio', 'transform']) {
        const v = n.attrs[k];
        if (v !== undefined) a[k] = String(v);
      }
      const op = pres(n, ancestors)['opacity'];
      if (op !== undefined) a['opacity'] = op;
      return el('image', a, []);
    }
    if (!(CONTAINERS.has(tag) || SHAPES.has(tag) || TEXT.has(tag))) {
      if (!DROP_SILENT.has(tag) && tag !== '')
        warnings.add(`Removed unsupported <${n.tag}> content.`);
      return null;
    }
    const attrs: Record<string, string> = {};
    for (const k of GEOMETRY[tag] ?? []) {
      const v = n.attrs[k];
      if (v !== undefined) attrs[k] = String(v);
    }
    const tr = n.attrs['transform'];
    if (typeof tr === 'string' && tag !== 'svg') attrs['transform'] = tr;
    Object.assign(attrs, pres(n, ancestors));
    for (const k of KEEP_DATA) {
      const v = n.attrs[k];
      if (v !== undefined) attrs[k] = String(v);
    }
    // The source's run width, for plot cleanup only (which drops it again).
    const adv = n.attrs[ADVANCE_ATTR];
    if (opts.plot === true && tag === 'text' && adv !== undefined && Number.isFinite(Number(adv)))
      attrs[ADVANCE_ATTR] = String(adv);
    const children: (SvgNode | string)[] = [];
    for (const c of n.children) {
      if (typeof c === 'string') {
        if (TEXT.has(tag)) children.push(c);
        continue;
      }
      const k = clean(c, depth + 1, useDepth, [...ancestors, n]);
      if (k) children.push(k);
    }
    if (tag === 'svg' && depth > 0) {
      // A nested <svg>: kept as a group at its x/y; its own viewport clipping is not.
      const x = Number(n.attrs['x'] ?? 0) || 0;
      const y = Number(n.attrs['y'] ?? 0) || 0;
      return el(
        'g',
        x || y ? { ...attrs, transform: `translate(${String(x)} ${String(y)})` } : attrs,
        children,
      );
    }
    return el(tag === 'a' || tag === 'switch' ? 'g' : tag, attrs, children);
  };

  const pres = (n: SvgNode, ancestors: readonly SvgNode[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, raw] of Object.entries(own(n, ancestors))) {
      if (!PRESENTATION_SET.has(k)) continue;
      if (k === 'fill' || k === 'stroke') {
        const c = normalizeColor(raw, gradients);
        if (c === null) {
          warnings.add(`Replaced an unsupported colour (${raw}).`);
          out[k] = '#000000';
        } else {
          if (raw.includes('url('))
            warnings.add('Gradients were replaced by their average colour.');
          out[k] = c;
        }
      } else if (/^[\w\s.,#%"'()-]*$/.test(raw) && !raw.includes('url(') && !raw.includes('var(')) {
        out[k] = raw;
      }
    }
    return out;
  };

  const vb = numberList(String(parsed.attrs['viewBox'] ?? ''));
  const w = length(parsed.attrs['width']);
  const h = length(parsed.attrs['height']);
  let viewBox: [number, number, number, number];
  if (vb.length === 4 && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0) {
    viewBox = [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 1, vb[3] ?? 1];
  } else if (w && h) {
    viewBox = [0, 0, w, h];
  } else {
    throw new SvgImportError('This SVG has no size (no viewBox, width or height).');
  }
  const body = clean(parsed, 0, 0);
  const root = el(
    'svg',
    { viewBox: viewBox.map(String).join(' '), ...pres(parsed, []) },
    body ? body.children : [],
  );
  if (opts.plot === true) {
    // Sanitised once more, so the stored SVG is exactly what rendering will parse it into.
    const c = cleanupPlot(root, viewBox);
    const tidy = sanitizeSvg(nodeToSvgString(c.root));
    return { root: tidy.root, viewBox: tidy.viewBox, warnings: [...warnings], images: c.images };
  }
  return { root, viewBox, warnings: [...warnings] };
}
