/**
 * Checks before export (note 03, issue 4): warnings, never blockers, about
 * what journals reject. Pure over the figure and a page.
 *
 * Sizes are measured on the renderer's own output (`pageToNode`, screen mode
 * for the `data-id` of each object), so text and lines inside icons, imported
 * plots and procedural objects are measured at the size they are drawn, with
 * every transform applied. Overlap is measured on the text layout instead
 * (the SvgNode carries no glyph widths).
 */
import { resolvePaint } from '@/core/color/color';
import { type Box, apply, boxOfPoints, frameMatrix } from '@/core/geometry/matrix';
import type { Id } from '@/core/model/ids';
import { sameLevels } from '@/core/edits/levels';
import { isLine } from '@/core/model/factory';
import { ownObjects, panelLabels } from '@/core/model/panels';
import type { Doc, Figure, Image, Obj, Page, Paint, Text } from '@/core/model/types';
import { journalColumns, journalMaxHeightMm } from '@/core/presets/pages';
import { layoutText, plainText } from '@/core/text/layout';
import { mmToPt, ptToMm } from '@/core/units';
import { type Matrix, multiply, parseTransform, scaleOf } from '@/io/svg/matrix';
import { len } from '@/io/svg/plotCleanup';
import { imageSize } from '@/io/png';
import { labelText, pageToNode } from '@/render/objectToNode';
import type { SvgNode } from '@/render/svgNode';

import { DEFICIENCY_NAMES, confusions, greyConfusions, hasRedAndGreen } from './colourVision';

export type CheckRule =
  | 'text-size'
  | 'stroke-width'
  | 'overlap'
  | 'journal-width'
  | 'journal-height'
  | 'image-dpi'
  | 'image-levels'
  | 'colour-confusion'
  | 'colour-greyscale'
  | 'channels-red-green';

export interface CheckWarning {
  readonly rule: CheckRule;
  readonly pageId: Id;
  /** What clicking the warning selects (none: a page-wide warning). */
  readonly ids: readonly Id[];
  readonly message: string;
}

export interface CheckOptions {
  /** Journal name (`PAGE_PRESETS[].journal`) whose column widths apply, or null. */
  readonly journal: string | null;
  /** Points; defaults to `minTextFor(journal)`. */
  readonly minTextPt?: number;
  /** Points. */
  readonly minStrokePt?: number;
  readonly minDpi?: number;
}

export const MIN_TEXT_PT = 6;
/** Nature's figure guide asks for 5–7 pt text; others ask for 6 pt or more. */
const JOURNAL_MIN_TEXT: Readonly<Record<string, number>> = { Nature: 5 };
export const MIN_STROKE_PT = 0.25;
export const MIN_DPI = 300;
/** Overlaps and overhangs smaller than this (points) are rounding, not problems. */
export const OVERLAP_TOLERANCE = 0.5;
/** A page up to this much wider than a column is "just too wide" for it. */
const NEAR_COLUMN = 1.15;

export const minTextFor = (journal: string | null): number =>
  (journal === null ? undefined : JOURNAL_MIN_TEXT[journal]) ?? MIN_TEXT_PT;

const fmt = (v: number, digits = 1): string => String(Math.round(v * 10 ** digits) / 10 ** digits);
const mm = (pt: number): string => `${fmt(ptToMm(pt))} mm`;
const columnName = (label: string): string => label.split(', ')[1] ?? label;

/**
 * How much the journal shrinks the page: 1 when it fits the widest column,
 * else that column's width over the page's.
 */
export function journalScale(page: Page, journal: string | null): number {
  if (journal === null) return 1;
  const widest = journalColumns(journal).at(-1);
  if (!widest) return 1;
  const max = mmToPt(widest.wMm);
  return page.size.w > max + OVERLAP_TOLERANCE ? max / page.size.w : 1;
}

/** The page's width against the journal's columns (one warning at most). */
export function checkJournalWidth(page: Page, journal: string | null): CheckWarning[] {
  if (journal === null) return [];
  const cols = journalColumns(journal);
  const widest = cols.at(-1);
  if (!widest) return [];
  const w = page.size.w;
  const base = { rule: 'journal-width' as const, pageId: page.id, ids: [] };
  if (w > mmToPt(widest.wMm) + OVERLAP_TOLERANCE)
    return [
      {
        ...base,
        message: `The page is ${mm(w)} wide, more than ${journal}'s widest figure (${columnName(widest.label)}). It will be shrunk to ${fmt(journalScale(page, journal) * 100, 0)}%, and the sizes below are checked at that scale.`,
      },
    ];
  const over = cols.find((c, i) => {
    const cw = mmToPt(c.wMm);
    return i < cols.length - 1 && w > cw + OVERLAP_TOLERANCE && w <= cw * NEAR_COLUMN;
  });
  if (over)
    return [
      {
        ...base,
        message: `The page is ${mm(w)} wide, just over ${journal}'s ${columnName(over.label)}. Narrow it to fit that column, or it will take a wider one.`,
      },
    ];
  return [];
}

/** The page's height, at the journal's shrink scale, against its published maximum. */
export function checkJournalHeight(page: Page, journal: string | null): CheckWarning[] {
  if (journal === null) return [];
  const max = journalMaxHeightMm(journal);
  if (max === null) return [];
  const k = journalScale(page, journal);
  const h = page.size.h * k;
  if (h <= mmToPt(max) + OVERLAP_TOLERANCE) return [];
  const when = k < 1 ? ' once the journal shrinks it' : '';
  return [
    {
      rule: 'journal-height',
      pageId: page.id,
      ids: [],
      message: `The page is ${mm(h)} tall${when}, over ${journal}'s maximum figure height of ${fmt(max)} mm. Make the page shorter.`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Sizes on the rendered page                                          */
/* ------------------------------------------------------------------ */

interface Inherited {
  readonly owner: Id | null;
  readonly fontSize: number;
  readonly stroke: string;
  readonly strokeWidth: number;
}

const SHAPES = new Set(['path', 'rect', 'ellipse', 'circle', 'line', 'polyline', 'polygon']);

const isInvisible = (paint: string): boolean =>
  paint === 'none' || paint === 'transparent' || paint === '';

/** Pixel size of a base64 PNG or JPEG data URI, read from its first bytes. */
export function dataUriPixels(href: string): { w: number; h: number } | null {
  const m = /^data:image\/[\w.+-]+;base64,/.exec(href);
  if (!m) return null;
  // Enough for the PNG header or the usual JPEG frame marker; a multiple of 4.
  const b64 = href.slice(m[0].length, m[0].length + 65536).replace(/[^A-Za-z0-9+/]/g, '');
  let bin: string;
  try {
    bin = atob(b64.slice(0, b64.length - (b64.length % 4)));
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const s = imageSize(bytes);
  return s ? { w: s.width, h: s.height } : null;
}

interface Smallest {
  /** Smallest value per owner, first seen order. */
  readonly text: Map<Id, number>;
  readonly stroke: Map<Id, number>;
  readonly dpi: Map<Id, number>;
}

const keepMin = (m: Map<Id, number>, id: Id | null, v: number): void => {
  if (id === null || !Number.isFinite(v)) return;
  const was = m.get(id);
  if (was === undefined || v < was) m.set(id, v);
};

function measure(n: SvgNode, inh: Inherited, mat: Matrix, out: Smallest, min: Required<Limits>) {
  if (n.attrs['data-hit'] !== undefined) return;
  const t = n.attrs['transform'];
  const m = t === undefined ? mat : multiply(mat, parseTransform(String(t)) ?? [1, 0, 0, 1, 0, 0]);
  const id = n.attrs['data-id'];
  const here: Inherited = {
    owner: id === undefined ? inh.owner : (String(id) as Id),
    fontSize: len(n.attrs['font-size']) ?? inh.fontSize,
    stroke: n.attrs['stroke'] === undefined ? inh.stroke : String(n.attrs['stroke']),
    strokeWidth: len(n.attrs['stroke-width']) ?? inh.strokeWidth,
  };
  const k = scaleOf(m);
  if (
    (n.tag === 'text' || n.tag === 'tspan') &&
    n.children.some((c) => typeof c === 'string' && c.trim() !== '')
  ) {
    const size = here.fontSize * k;
    if (size < min.text - 1e-6) keepMin(out.text, here.owner, size);
  }
  if (SHAPES.has(n.tag) && !isInvisible(here.stroke) && here.strokeWidth > 0) {
    const w = here.strokeWidth * k;
    if (w < min.stroke - 1e-6) keepMin(out.stroke, here.owner, w);
  }
  if (n.tag === 'image') {
    const href = String(n.attrs['xlink:href'] ?? n.attrs['href'] ?? '');
    const px = dataUriPixels(href);
    const w = len(n.attrs['width']) ?? 0;
    const h = len(n.attrs['height']) ?? 0;
    if (px && w > 0 && h > 0) {
      const sx = Math.hypot(m[0], m[1]);
      const sy = Math.hypot(m[2], m[3]);
      const dpi = Math.min(px.w / ((w * sx) / 72), px.h / ((h * sy) / 72));
      if (dpi < min.dpi - 0.5) keepMin(out.dpi, here.owner, dpi);
    }
  }
  for (const c of n.children) if (typeof c !== 'string') measure(c, here, m, out, min);
}

interface Limits {
  readonly text: number;
  readonly stroke: number;
  readonly dpi: number;
}

/* ------------------------------------------------------------------ */
/* Overlap on the text layout                                          */
/* ------------------------------------------------------------------ */

/** Text as drawn: its owner and the ink boxes of its lines in page coordinates. */
interface TextInk {
  readonly id: Id;
  readonly name: string;
  readonly boxes: readonly Box[];
  readonly bounds: Box;
  /** The panel whose label this is. */
  readonly labelOf?: Id;
}

/** Ink-ish boxes of laid-out lines: ascender to descender of each segment, not the leading. */
function inkBoxes(t: Text, place: (p: { x: number; y: number }) => { x: number; y: number }) {
  const boxes: Box[] = [];
  for (const line of layoutText(t).lines) {
    const segs = line.segments.filter((s) => s.text.trim() !== '');
    if (segs.length === 0) continue;
    const x0 = Math.min(...segs.map((s) => s.x));
    const x1 = Math.max(...segs.map((s) => s.x + s.width));
    const y0 = Math.min(...segs.map((s) => s.y - 0.8 * s.size));
    const y1 = Math.max(...segs.map((s) => s.y + 0.2 * s.size));
    boxes.push(
      boxOfPoints(
        [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ].map(place),
      ),
    );
  }
  return boxes;
}

const union = (bs: readonly Box[]): Box =>
  boxOfPoints(bs.flatMap((b) => [b, { x: b.x + b.w, y: b.y + b.h }]));

const overlapBy = (a: Box, b: Box): number =>
  Math.min(
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  );

/** How far `inner` reaches past `outer`, points (0 or less: inside). */
const overhang = (outer: Box, inner: Box): number =>
  Math.max(
    outer.x - inner.x,
    outer.y - inner.y,
    inner.x + inner.w - (outer.x + outer.w),
    inner.y + inner.h - (outer.y + outer.h),
  );

function quote(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return `“${one.length > 24 ? `${one.slice(0, 23)}…` : one}”`;
}

/** Visible objects of the page's visible layers, depth first. */
function* visible(objs: readonly Obj[]): Generator<Obj> {
  for (const o of objs) {
    if (o.hidden === true) continue;
    yield o;
    if (o.type === 'group' || o.type === 'panel') yield* visible(o.children);
  }
}

const visibleObjects = (page: Page): Obj[] =>
  page.layers.filter((l) => l.visible).flatMap((l) => [...visible(l.children)]);

function textInks(fig: Figure, page: Page, objs: readonly Obj[]): TextInk[] {
  const out: TextInk[] = [];
  const style = fig.doc.panelLabelStyle;
  const labels = panelLabels(page, style.format);
  for (const o of objs) {
    if (o.type === 'text') {
      const m = frameMatrix(o.frame);
      const boxes = inkBoxes(o, (p) => apply(m, p));
      if (boxes.length > 0)
        out.push({
          id: o.id,
          name: quote(o.name !== undefined && o.name !== '' ? o.name : plainText(o)),
          boxes,
          bounds: union(boxes),
        });
    } else if (o.type === 'panel' && o.showLabel) {
      const label = labels.get(o.id) ?? o.label;
      if (label === '') continue;
      const x = o.frame.x + style.offset.x;
      const y = o.frame.y + style.offset.y;
      const boxes = inkBoxes(labelText(label, style), (p) => ({ x: p.x + x, y: p.y + y }));
      if (boxes.length > 0)
        out.push({
          id: o.id,
          name: `panel label ${quote(label)}`,
          boxes,
          bounds: union(boxes),
          labelOf: o.id,
        });
    }
  }
  return out;
}

/**
 * Text that collides: text over other text (ink boxes of lines, not frames,
 * so stacked labels with touching leading pass), text crossing a panel's
 * edge (a per-panel export cuts it), and text running off the page.
 */
export function checkOverlap(fig: Figure, page: Page): CheckWarning[] {
  const objs = visibleObjects(page);
  const inks = textInks(fig, page, objs);
  const out: CheckWarning[] = [];
  const base = { rule: 'overlap' as const, pageId: page.id };
  for (let i = 0; i < inks.length; i += 1) {
    const a = inks[i];
    if (!a) continue;
    for (let j = i + 1; j < inks.length; j += 1) {
      const b = inks[j];
      if (!b || overlapBy(a.bounds, b.bounds) <= OVERLAP_TOLERANCE) continue;
      const hit = a.boxes.some((p) => b.boxes.some((q) => overlapBy(p, q) > OVERLAP_TOLERANCE));
      if (hit)
        out.push({
          ...base,
          ids: a.id === b.id ? [a.id] : [a.id, b.id],
          message: `Text ${a.name} overlaps ${b.name}.`,
        });
    }
  }
  const panels = objs.filter((o) => o.type === 'panel');
  for (const t of inks) {
    for (const p of panels) {
      const box = { x: p.frame.x, y: p.frame.y, w: p.frame.w, h: p.frame.h };
      const own = t.labelOf === p.id;
      if (!own && overlapBy(box, t.bounds) <= OVERLAP_TOLERANCE) continue;
      if (overhang(box, t.bounds) <= OVERLAP_TOLERANCE) continue;
      out.push({
        ...base,
        ids: own ? [p.id] : [t.id],
        message: `Text ${t.name} crosses the edge of ${own ? 'its panel' : 'a panel'}; a per-panel export cuts it off.`,
      });
    }
    const pageBox = { x: 0, y: 0, w: page.size.w, h: page.size.h };
    if (overhang(pageBox, t.bounds) > OVERLAP_TOLERANCE)
      out.push({ ...base, ids: [t.id], message: `Text ${t.name} runs off the page.` });
  }
  return out;
}

/* ------------------------------------------------------------------ */

/**
 * Pictures of one panel shown with different levels or inversion (note 37): compared
 * panels should share one display range. One warning per such panel, selecting its pictures.
 */
export function checkLevels(fig: Figure, page: Page): CheckWarning[] {
  const labels = panelLabels(page, fig.doc.panelLabelStyle.format);
  const out: CheckWarning[] = [];
  for (const p of visibleObjects(page)) {
    if (p.type !== 'panel') continue;
    const pics = [...ownObjects(p.children)].filter(
      (o): o is Image => o.type === 'image' && o.hidden !== true,
    );
    const [first, ...rest] = pics;
    if (!first || rest.every((o) => sameLevels(o, first))) continue;
    const label = labels.get(p.id) ?? p.label;
    out.push({
      rule: 'image-levels',
      pageId: page.id,
      ids: pics.map((o) => o.id),
      message: `The pictures in ${label === '' ? 'a panel' : `panel ${label}`} have different levels. Compared pictures should share one display range: select them and use Same levels.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */

/** One panel's own objects, or the page's objects outside any panel (`panel` null). */
interface Scope {
  readonly panel: Obj | null;
  readonly objs: Obj[];
}

/** The visible objects split by lettered panel (groups are entered, nested panels are their own scope). */
function scopesOf(page: Page): Scope[] {
  const root: Scope = { panel: null, objs: [] };
  const out: Scope[] = [root];
  const walk = (children: readonly Obj[], scope: Scope): void => {
    for (const o of children) {
      if (o.hidden === true) continue;
      if (o.type === 'panel') {
        const own: Scope = { panel: o, objs: [] };
        out.push(own);
        walk(o.children, own);
      } else {
        scope.objs.push(o);
        if (o.type === 'group') walk(o.children, scope);
      }
    }
  };
  for (const l of page.layers) if (l.visible) walk(l.children, root);
  return out;
}

/** The paints an object's fills, strokes, text and slot overrides use. */
function paintsOf(o: Obj): Paint[] {
  switch (o.type) {
    case 'rect':
    case 'ellipse':
    case 'path':
    case 'arrow':
      return [o.style.fill, o.style.stroke].filter((p): p is Paint => p !== null);
    case 'text':
      return o.runs.flatMap((para) => para.map((r) => r.color));
    case 'icon':
    case 'procedural':
      return Object.values(o.slots);
    case 'image':
    case 'group':
    case 'panel':
    case 'embedded':
      return [];
  }
}

interface Used {
  readonly name: string;
  readonly hex: string;
  readonly ids: Id[];
}

/** The linked swatches a scope's objects use, in first-use order (fixed colours are the user's choice). */
function swatchesUsed(doc: Doc, objs: readonly Obj[]): Used[] {
  const by = new Map<string, Used>();
  for (const o of objs)
    for (const p of paintsOf(o)) {
      if (!('swatch' in p)) continue;
      const sw = doc.palette.find((s) => s.id === p.swatch);
      if (!sw) continue;
      const u = by.get(sw.id) ?? { name: sw.name, hex: resolvePaint(p, doc.palette), ids: [] };
      if (!u.ids.includes(o.id)) u.ids.push(o.id);
      by.set(sw.id, u);
    }
  return [...by.values()];
}

const scopeName = (s: Scope, labels: Map<Id, string>): string => {
  if (s.panel === null) return 'the page';
  const label = labels.get(s.panel.id) ?? '';
  return label === '' ? 'a panel' : `panel ${label}`;
};

const merged = <T>(a: readonly T[], b: readonly T[]): T[] => [...new Set([...a, ...b])];

/**
 * Swatches of one panel (or of the page outside panels) that look alike in colour-blind
 * vision (note 46): a pair told apart in normal vision (CIE76 ΔE of 25 or more) whose
 * simulation under deuteranopia, protanopia or tritanopia falls below ΔE 12. One warning
 * per panel, for its worst pair; clicking selects the objects using the two swatches.
 */
export function checkColourConfusion(fig: Figure, page: Page): CheckWarning[] {
  const labels = panelLabels(page, fig.doc.panelLabelStyle.format);
  const out: CheckWarning[] = [];
  for (const s of scopesOf(page)) {
    const used = swatchesUsed(fig.doc, s.objs);
    const found = confusions(used.map((u) => u.hex));
    const worst = found[0];
    const a = worst ? used[worst.a] : undefined;
    const b = worst ? used[worst.b] : undefined;
    if (!worst || !a || !b) continue;
    const more = new Set(found.map((c) => `${String(c.a)}-${String(c.b)}`)).size - 1;
    out.push({
      rule: 'colour-confusion',
      pageId: page.id,
      ids: merged(a.ids, b.ids),
      message: `In ${scopeName(s, labels)}, "${a.name}" and "${b.name}" look alike with ${DEFICIENCY_NAMES[worst.deficiency]}${more > 0 ? `, and ${String(more)} more pair${more > 1 ? 's' : ''} like it` : ''}. Pick colours that differ in lightness too, such as a colourblind-safe palette.`,
    });
  }
  return out;
}

/**
 * Swatches of one panel that a greyscale print renders at nearly the same lightness
 * (ΔL* under 8 though told apart in colour). One warning per panel, for its worst pair.
 */
export function checkGreyscale(fig: Figure, page: Page): CheckWarning[] {
  const labels = panelLabels(page, fig.doc.panelLabelStyle.format);
  const out: CheckWarning[] = [];
  for (const s of scopesOf(page)) {
    const used = swatchesUsed(fig.doc, s.objs);
    const found = greyConfusions(used.map((u) => u.hex));
    const worst = found[0];
    const a = worst ? used[worst.a] : undefined;
    const b = worst ? used[worst.b] : undefined;
    if (!worst || !a || !b) continue;
    out.push({
      rule: 'colour-greyscale',
      pageId: page.id,
      ids: merged(a.ids, b.ids),
      message: `In ${scopeName(s, labels)}, "${a.name}" and "${b.name}" are about equally light, so they look the same in a black-and-white print. Make one lighter or darker.`,
    });
  }
  return out;
}

/** Pictures whose channel merge uses red and green together: suggest magenta and green. */
export function checkRedGreenMerge(page: Page): CheckWarning[] {
  const out: CheckWarning[] = [];
  for (const o of visibleObjects(page)) {
    if (o.type !== 'image' || !o.channels) continue;
    if (!hasRedAndGreen(o.channels.filter((c) => c.on).map((c) => c.color))) continue;
    out.push({
      rule: 'channels-red-green',
      pageId: page.id,
      ids: [o.id],
      message: `${describe(o)} merges a red and a green channel, which people with red-green colour blindness cannot tell apart where they overlap. Use magenta and green instead.`,
    });
  }
  return out;
}

function describe(o: Obj | undefined): string {
  if (!o) return 'An object';
  if (o.name !== undefined && o.name !== '') return quote(o.name);
  switch (o.type) {
    case 'text':
      return `Text ${quote(plainText(o))}`;
    case 'image':
      return 'A picture';
    case 'procedural':
      return `A ${o.kind}`;
    case 'embedded':
      return 'An imported plot';
    case 'path':
      return 'A line';
    case 'rect':
      return 'A rectangle';
    case 'ellipse':
      return 'An ellipse';
    case 'arrow':
      return isLine(o) ? 'A line' : 'An arrow';
    case 'icon':
      return 'An icon';
    case 'group':
      return 'A group';
    case 'panel':
      return 'A panel';
  }
}

/** Every warning for one page, journal width first, then by rule. */
export function checkPage(fig: Figure, page: Page, opts: CheckOptions): CheckWarning[] {
  const k = journalScale(page, opts.journal);
  const limits: Limits = {
    text: opts.minTextPt ?? minTextFor(opts.journal),
    stroke: opts.minStrokePt ?? MIN_STROKE_PT,
    dpi: opts.minDpi ?? MIN_DPI,
  };
  const node = pageToNode(page, fig.doc, fig.assets, { textMode: 'text', screen: true });
  const found: Smallest = { text: new Map(), stroke: new Map(), dpi: new Map() };
  measure(
    node,
    { owner: null, fontSize: 16, stroke: 'none', strokeWidth: 1 },
    [k, 0, 0, k, 0, 0],
    found,
    limits,
  );
  const byId = new Map(visibleObjects(page).map((o) => [o.id, o] as const));
  const scaled = k < 1 ? ' after the journal shrinks it' : '';
  const out: CheckWarning[] = [
    ...checkJournalWidth(page, opts.journal),
    ...checkJournalHeight(page, opts.journal),
  ];
  for (const [id, v] of found.text)
    out.push({
      rule: 'text-size',
      pageId: page.id,
      ids: [id],
      message: `${describe(byId.get(id))} has text ${fmt(v)} pt${scaled}, under ${fmt(limits.text)} pt.`,
    });
  for (const [id, v] of found.stroke)
    out.push({
      rule: 'stroke-width',
      pageId: page.id,
      ids: [id],
      message: `${describe(byId.get(id))} has lines ${fmt(v, 2)} pt wide${scaled}, under ${fmt(limits.stroke, 2)} pt.`,
    });
  for (const [id, v] of found.dpi)
    out.push({
      rule: 'image-dpi',
      pageId: page.id,
      ids: [id],
      message: `${describe(byId.get(id))} is ${fmt(v, 0)} dpi at its placed size${scaled}, under ${fmt(limits.dpi, 0)} dpi.`,
    });
  out.push(...checkLevels(fig, page));
  out.push(...checkOverlap(fig, page));
  out.push(
    ...checkRedGreenMerge(page),
    ...checkColourConfusion(fig, page),
    ...checkGreyscale(fig, page),
  );
  return out;
}
