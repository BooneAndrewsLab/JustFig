/**
 * The one renderer (note 03): document objects → SvgNode, pure and
 * memoised per immutable object. The canvas and every export call this.
 */
import { resolvePaint } from '@/core/color/color';
import { frameMatrix, isPlain } from '@/core/geometry/matrix';
import type { Id } from '@/core/model/ids';
import type {
  Arrow,
  AssetHash,
  Assets,
  Frame,
  Obj,
  Page,
  PanelLabelStyle,
  Paint,
  Panel,
  ShapeStyle,
  Swatch,
  Text,
} from '@/core/model/types';
import { layoutText } from '@/core/text/layout';
import { panelLabels } from '@/core/model/panels';

import { endDirections, headLength, headShape, inset, shortened } from './arrows';
import {
  type PictureStrips,
  iconNode,
  imageNode,
  snapshotNode,
  stripsNode,
  svgImportNode,
} from './assets';
import { pathData } from './path';
import { proceduralNodes } from './procedural';
import { type AttrValue, type SvgNode, el, num } from './svgNode';

import { type TextMode, textNodes } from './textNodes';

export { type PictureStrips, type TextMode, textNodes };

/**
 * A stand-in for a picture's pixels (note 30): the screen's working copy of a
 * big picture, or a raster export's copy at the output's pixel size. The
 * asset's own data when it returns undefined; a grey box while it is null
 * (the copy is not ready yet). Only the href changes: the object is drawn as always.
 * A raster export may hand a big picture in as strips instead (note 32); `frame`
 * is the drawing object's, so it can leave out strips outside a band.
 */
export type ImageHref = (
  hash: AssetHash,
  asset: Extract<Assets[string], { kind: 'image' }>,
  frame: Frame,
) => string | null | undefined | PictureStrips;

export interface RenderCtx {
  readonly palette: readonly Swatch[];
  readonly assets: Assets;
  readonly textMode: TextMode;
  /** Screen rendering: `data-id` on objects and wide transparent hit strokes on lines. */
  readonly screen: boolean;
  readonly labelStyle: PanelLabelStyle;
  /** Panel labels in effect (auto labels resolved), by panel id. */
  readonly labels: ReadonlyMap<Id, string>;
  readonly imageHref?: ImageHref | undefined;
}

type Attrs = Record<string, AttrValue | undefined>;

const paintHex = (p: Paint | null, ctx: RenderCtx): string =>
  p === null ? 'none' : resolvePaint(p, ctx.palette);

function strokeAttrs(s: ShapeStyle, ctx: RenderCtx): Attrs {
  if (s.stroke === null || s.strokeWidth <= 0) return { stroke: 'none' };
  return {
    stroke: paintHex(s.stroke, ctx),
    'stroke-width': s.strokeWidth,
    'stroke-linecap': s.cap,
    'stroke-linejoin': s.join,
    'stroke-dasharray': s.dash && s.dash.length > 0 ? s.dash.map(num).join(' ') : undefined,
  };
}

const styleAttrs = (s: ShapeStyle, ctx: RenderCtx): Attrs => ({
  fill: paintHex(s.fill, ctx),
  ...strokeAttrs(s, ctx),
});

function transformOf(o: Obj): string | undefined {
  const f = o.frame;
  if (isPlain(f)) return f.x === 0 && f.y === 0 ? undefined : `translate(${num(f.x)} ${num(f.y)})`;
  const m = frameMatrix(f);
  return `matrix(${m.map((v) => String(Math.round(v * 10000) / 10000)).join(' ')})`;
}

function arrowNodes(a: Arrow, ctx: RenderCtx): SvgNode[] {
  const s = a.style;
  const sw = s.strokeWidth;
  const color = paintHex(s.stroke, ctx);
  const dirs = endDirections(a.nodes);
  const ls = headLength(a.start, sw);
  const le = headLength(a.end, sw);
  const body = shortened(a.nodes, inset(a.start, ls, sw), inset(a.end, le, sw), dirs);
  const out: SvgNode[] = [];
  if (ctx.screen) out.push(hitStroke(pathData(a.nodes, false), sw));
  out.push(el('path', { d: pathData(body, false), fill: 'none', ...strokeAttrs(s, ctx) }));
  const first = a.nodes[0];
  const last = a.nodes[a.nodes.length - 1];
  const heads: [typeof a.start, typeof first, typeof dirs.start][] = [
    [a.start, first, dirs.start],
    [a.end, last, dirs.end],
  ];
  for (const [h, tip, dir] of heads) {
    if (!tip || s.stroke === null) continue;
    const shape = headShape(h, tip, dir, sw);
    if (!shape) continue;
    out.push(
      shape.stroked
        ? el('path', {
            d: shape.d,
            fill: 'none',
            stroke: color,
            'stroke-width': sw,
            'stroke-linecap': h.kind === 'bar' ? 'butt' : 'round',
            'stroke-linejoin': 'round',
          })
        : el('path', { d: shape.d, fill: color }),
    );
  }
  return out;
}

function hitStroke(d: string, sw: number): SvgNode {
  return el('path', {
    d,
    fill: 'none',
    stroke: 'transparent',
    'stroke-width': Math.max(8, sw + 6),
    'data-hit': 1,
  });
}

/** A panel label as a text object at the origin (drawn at the panel's top-left plus the style offset). */
export function labelText(label: string, style: PanelLabelStyle): Text {
  return {
    id: '' as Id,
    type: 'text',
    frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
    opacity: 1,
    runs: [
      [
        {
          text: label,
          font: style.font,
          size: style.size,
          ...(style.bold ? { bold: true } : {}),
          color: { hex: '#000000' },
        },
      ],
    ],
    align: 'left',
    lineHeight: 1,
    autoWidth: true,
  };
}

function panelNodes(p: Panel, ctx: RenderCtx): SvgNode[] {
  const out: SvgNode[] = [];
  const f = p.frame;
  if (ctx.screen)
    out.push(
      el('rect', { x: f.x, y: f.y, width: f.w, height: f.h, fill: 'transparent', 'data-hit': 1 }),
    );
  if (p.showBorder)
    out.push(
      el('rect', {
        x: f.x,
        y: f.y,
        width: f.w,
        height: f.h,
        fill: 'none',
        stroke: '#1f2933',
        'stroke-width': 0.75,
      }),
    );
  for (const c of p.children) {
    const n = objectToNode(c, ctx);
    if (n) out.push(n);
  }
  const label = ctx.labels.get(p.id) ?? p.label;
  if (p.showLabel && label !== '') {
    const t = labelText(label, ctx.labelStyle);
    const nodes = textNodes(layoutText(t), ctx.textMode, ctx);
    const x = f.x + ctx.labelStyle.offset.x;
    const y = f.y + ctx.labelStyle.offset.y;
    out.push(el('g', { transform: `translate(${num(x)} ${num(y)})` }, nodes));
  }
  return out;
}

function placeholder(w: number, h: number): SvgNode {
  return el('rect', {
    x: 0,
    y: 0,
    width: w,
    height: h,
    fill: 'none',
    stroke: '#9aa5b1',
    'stroke-width': 1,
    'stroke-dasharray': '4 3',
  });
}

/**
 * Pictures drawn, counted so the memo knows which objects drew one: only
 * those depend on `imageHref` (a new hook redraws them alone).
 */
let hrefCalls = 0;

function picture(
  hash: AssetHash,
  a: Extract<Assets[string], { kind: 'image' }>,
  frame: Frame,
  ctx: RenderCtx,
): SvgNode {
  const { w, h } = frame;
  hrefCalls += 1; // with or without a hook: a later hook changes what it draws
  const href = ctx.imageHref?.(hash, a, frame);
  if (href === null) return el('rect', { x: 0, y: 0, width: w, height: h, fill: '#e4e7eb' });
  if (typeof href === 'object') return stripsNode(href, w, h);
  return imageNode(a, w, h, href);
}

function content(o: Obj, ctx: RenderCtx): SvgNode[] {
  const { w, h } = o.frame;
  switch (o.type) {
    case 'rect':
      return [
        el('rect', {
          x: 0,
          y: 0,
          width: w,
          height: h,
          rx: o.rx > 0 ? Math.min(o.rx, w / 2, h / 2) : undefined,
          ...styleAttrs(o.style, ctx),
        }),
      ];
    case 'ellipse':
      return [
        el('ellipse', { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, ...styleAttrs(o.style, ctx) }),
      ];
    case 'path': {
      const d = pathData(o.nodes, o.closed);
      const fill = o.closed ? paintHex(o.style.fill, ctx) : 'none';
      const hit = ctx.screen && !o.closed ? [hitStroke(d, o.style.strokeWidth)] : [];
      return [...hit, el('path', { d, fill, ...strokeAttrs(o.style, ctx) })];
    }
    case 'arrow':
      return arrowNodes(o, ctx);
    case 'text': {
      const nodes = textNodes(layoutText(o), ctx.textMode, ctx);
      return ctx.screen
        ? [
            el('rect', { x: 0, y: 0, width: w, height: h, fill: 'transparent', 'data-hit': 1 }),
            ...nodes,
          ]
        : nodes;
    }
    case 'icon': {
      const a = ctx.assets[o.asset];
      return a?.kind === 'icon' ? [iconNode(a, o.slots, ctx.palette, w, h)] : [placeholder(w, h)];
    }
    case 'image': {
      // A crop draws its own re-encoded pixels (note 20): the export subset cannot clip.
      const c = o.crop && o.cropped !== undefined ? ctx.assets[o.cropped] : undefined;
      if (c?.kind === 'image' && o.cropped !== undefined)
        return [picture(o.cropped, c, o.frame, ctx)];
      // A see-through picture's backdrop cut with its picture's crop (issue 48).
      if (c?.kind === 'svgImport') return [svgImportNode(c.svg, w, h, ctx.textMode)];
      const a = ctx.assets[o.asset];
      if (a?.kind === 'image') return [picture(o.asset, a, o.frame, ctx)];
      if (a?.kind === 'svgImport') return [svgImportNode(a.svg, w, h, ctx.textMode)];
      return [placeholder(w, h)];
    }
    case 'procedural': {
      const nodes = proceduralNodes(o, ctx.textMode, ctx.screen, ctx.palette);
      if (nodes) return nodes;
      const a = o.snapshot === undefined ? undefined : ctx.assets[o.snapshot];
      return a?.kind === 'svgImport' ? [snapshotNode(a, w, h, ctx.textMode)] : [placeholder(w, h)];
    }
    case 'embedded': {
      const a = ctx.assets[o.snapshot];
      return a?.kind === 'svgImport'
        ? [svgImportNode(a.svg, w, h, ctx.textMode)]
        : [placeholder(w, h)];
    }
    case 'group':
    case 'panel':
      return [];
  }
}

interface Memo {
  readonly node: SvgNode | null;
  readonly palette: readonly Swatch[];
  readonly assets: Assets;
  /** A panel's resolved label (it depends on the page's other panels). */
  readonly label: string | undefined;
  readonly labelStyle: PanelLabelStyle;
  readonly imageHref: ImageHref | undefined;
  /** It (or an object in it) drew a picture through `imageHref`. */
  readonly usesHref: boolean;
}

const memos = new Map<string, WeakMap<Obj, Memo>>();

function build(o: Obj, ctx: RenderCtx): SvgNode | null {
  if (o.hidden === true) return null;
  const opacity = o.opacity < 1 ? o.opacity : undefined;
  const id = ctx.screen ? o.id : undefined;
  // Locked objects let clicks through to what is under them (screen only).
  const pe = ctx.screen && o.locked === true ? 'none' : undefined;
  if (o.type === 'group') {
    const kids = o.children
      .map((c) => objectToNode(c, ctx))
      .filter((n): n is SvgNode => n !== null);
    return el('g', { 'data-id': id, opacity, 'pointer-events': pe }, kids);
  }
  if (o.type === 'panel')
    return el('g', { 'data-id': id, opacity, 'pointer-events': pe }, panelNodes(o, ctx));
  return el(
    'g',
    { 'data-id': id, transform: transformOf(o), opacity, 'pointer-events': pe },
    content(o, ctx),
  );
}

/** An object as an SvgNode, or null when hidden. Memoised per object and render mode. */
export function objectToNode(o: Obj, ctx: RenderCtx): SvgNode | null {
  const key = `${ctx.textMode}|${String(ctx.screen)}`;
  let memo = memos.get(key);
  if (!memo) {
    memo = new WeakMap();
    memos.set(key, memo);
  }
  const hit = memo.get(o);
  const label = o.type === 'panel' ? ctx.labels.get(o.id) : undefined;
  if (
    hit?.palette === ctx.palette &&
    hit.assets === ctx.assets &&
    hit.label === label &&
    hit.labelStyle === ctx.labelStyle &&
    (hit.imageHref === ctx.imageHref || !hit.usesHref)
  ) {
    if (hit.usesHref) hrefCalls += 1; // a group holding it depends on the hook too
    return hit.node;
  }
  const before = hrefCalls;
  const node = build(o, ctx);
  memo.set(o, {
    node,
    palette: ctx.palette,
    assets: ctx.assets,
    label,
    labelStyle: ctx.labelStyle,
    imageHref: ctx.imageHref,
    usesHref: hrefCalls !== before,
  });
  return node;
}

export interface PageRenderOptions {
  readonly textMode: TextMode;
  readonly screen: boolean;
  /** Draw the page background (off for a transparent PNG). */
  readonly background?: boolean;
  /** Pictures' stand-ins (screen working copies, a raster export's copies), see `ImageHref`. */
  readonly imageHref?: ImageHref | undefined;
}

export function renderCtx(
  page: Page,
  doc: { palette: readonly Swatch[]; panelLabelStyle: PanelLabelStyle },
  assets: Assets,
  opts: PageRenderOptions,
): RenderCtx {
  return {
    palette: doc.palette,
    assets,
    textMode: opts.textMode,
    screen: opts.screen,
    labelStyle: doc.panelLabelStyle,
    labels: panelLabels(page, doc.panelLabelStyle.format),
    imageHref: opts.imageHref,
  };
}

/** The page's content (background and visible layers) as one `<g>`. */
export function pageToNode(
  page: Page,
  doc: { palette: readonly Swatch[]; panelLabelStyle: PanelLabelStyle },
  assets: Assets,
  opts: PageRenderOptions,
): SvgNode {
  const ctx = renderCtx(page, doc, assets, opts);
  const children: SvgNode[] = [];
  if (page.background !== null && opts.background !== false)
    children.push(
      el('rect', {
        x: 0,
        y: 0,
        width: page.size.w,
        height: page.size.h,
        fill: paintHex(page.background, ctx),
      }),
    );
  for (const l of page.layers) {
    if (!l.visible) continue;
    const kids = l.children
      .map((c) => objectToNode(c, ctx))
      .filter((n): n is SvgNode => n !== null);
    children.push(el('g', { 'data-layer': ctx.screen ? l.id : undefined }, kids));
  }
  return el('g', {}, children);
}
