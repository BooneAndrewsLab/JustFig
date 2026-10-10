/**
 * Icons, imported SVGs and images as SvgNodes. Parsed SVG is cached per
 * SVG text. Icon recolouring (note 01): every element with `data-slot`
 * gets its non-`none` fill and stroke replaced by the slot colour, moved
 * in OKLCH lightness by `data-tone`. A `recolor: 'whole'` icon has one slot
 * `all`: each colour keeps its lightness offset from the default.
 */
import { resolvePaint, rgbToOklch, parseHex, shiftLightness } from '@/core/color/color';
import type { Asset, Paint, SlotDef, Swatch } from '@/core/model/types';
import { type SanitizedSvg, sanitizeSvg } from '@/io/svg/sanitize';

import { layoutImportedTexts } from './importedText';
import { type SvgNode, el, num } from './svgNode';
import type { TextMode } from './textNodes';

const parsed = new Map<string, SanitizedSvg>();

export function parsedSvg(svg: string): SanitizedSvg {
  let p = parsed.get(svg);
  if (!p) {
    p = sanitizeSvg(svg);
    if (parsed.size > 500) parsed.clear();
    parsed.set(svg, p);
  }
  return p;
}

/** The slot colours in effect: overrides over defaults, as hex. */
export function slotColors(
  defs: readonly SlotDef[],
  overrides: Readonly<Record<string, Paint>>,
  palette: readonly Swatch[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of defs) {
    const o = overrides[d.id];
    out.set(d.id, o ? resolvePaint(o, palette) : d.default);
  }
  return out;
}

const lightness = (hex: string): number => {
  const c = parseHex(hex);
  return c ? rgbToOklch(c).l : 0;
};

function recolor(
  n: SvgNode,
  colors: ReadonlyMap<string, string>,
  whole: { base: string; to: string } | null,
): SvgNode {
  const slot = n.attrs['data-slot'];
  let attrs = n.attrs;
  if (whole) {
    const next: Record<string, string | number | undefined> = { ...attrs };
    for (const k of ['fill', 'stroke'] as const) {
      const v = attrs[k];
      if (typeof v === 'string' && v.startsWith('#')) {
        next[k] = shiftLightness(whole.to, lightness(v) - lightness(whole.base));
      }
    }
    attrs = next;
  } else if (typeof slot === 'string') {
    const base = colors.get(slot);
    if (base !== undefined) {
      const tone = Number(attrs['data-tone'] ?? 0) || 0;
      const c = shiftLightness(base, tone);
      const next: Record<string, string | number | undefined> = { ...attrs };
      let painted = false;
      for (const k of ['fill', 'stroke'] as const) {
        const v = attrs[k];
        if (v !== undefined && v !== 'none') {
          next[k] = c;
          painted = true;
        }
      }
      if (!painted && n.tag !== 'g') next['fill'] = c;
      attrs = next;
    }
  }
  const children = n.children.map((ch) =>
    typeof ch === 'string' ? ch : recolor(ch, colors, whole),
  );
  return el(n.tag, attrs, children);
}

/** `<g>` mapping a viewBox onto a w×h box. */
function fitted(
  s: SanitizedSvg,
  w: number,
  h: number,
  children: readonly (SvgNode | string)[],
  root: SvgNode = s.root,
): SvgNode {
  const [vx, vy, vw, vh] = s.viewBox;
  const sx = w / vw;
  const sy = h / vh;
  const rootAttrs = Object.fromEntries(Object.entries(root.attrs).filter(([k]) => k !== 'viewBox'));
  return el(
    'g',
    {
      transform: `scale(${num4(sx)} ${num4(sy)})${vx || vy ? ` translate(${num(-vx)} ${num(-vy)})` : ''}`,
      ...rootAttrs,
    },
    children,
  );
}

/** 4 decimals: scale factors need more precision than coordinates. */
const num4 = (v: number): string => String(Math.round(v * 10000) / 10000);

export function iconNode(
  asset: Extract<Asset, { kind: 'icon' }>,
  overrides: Readonly<Record<string, Paint>>,
  palette: readonly Swatch[],
  w: number,
  h: number,
): SvgNode {
  const s = parsedSvg(asset.svg);
  const colors = slotColors(asset.slots, overrides, palette);
  const all = asset.slots[0];
  const whole =
    asset.recolor === 'whole' && all
      ? { base: all.default, to: colors.get(all.id) ?? all.default }
      : null;
  const unchanged = whole?.base === whole?.to && whole !== null;
  const kids = unchanged
    ? s.root.children
    : s.root.children.map((c) => (typeof c === 'string' ? c : recolor(c, colors, whole)));
  return fitted(s, w, h, kids);
}

const laidOut: Record<TextMode, Map<string, SvgNode>> = { outline: new Map(), text: new Map() };

/** An imported SVG with its text laid out in the bundled fonts (note 14), cached per mode. */
export function svgImportNode(svg: string, w: number, h: number, mode: TextMode): SvgNode {
  const s = parsedSvg(svg);
  const cache = laidOut[mode];
  let root = cache.get(svg);
  if (!root) {
    root = layoutImportedTexts(s.root, mode);
    if (cache.size > 500) cache.clear();
    cache.set(svg, root);
  }
  return fitted(s, w, h, root.children, root);
}

/**
 * A procedural object's snapshot (note 04) in a w × h frame. Its viewBox is
 * in frame-local points of a `meta.width` × `meta.height` frame and may reach
 * past it (labels hanging outside, issue 44), so the frame size, not the
 * viewBox, sets the scale. Older snapshots' viewBox is that frame: the same.
 */
export function snapshotNode(
  asset: Extract<Asset, { kind: 'svgImport' }>,
  w: number,
  h: number,
  mode: TextMode,
): SvgNode {
  const { width, height } = asset.meta;
  const fit = svgImportNode(asset.svg, w, h, mode);
  if (!(width > 0 && height > 0)) return fit;
  return el(
    'g',
    { ...fit.attrs, transform: `scale(${num4(w / width)} ${num4(h / height)})` },
    fit.children,
  );
}

/**
 * A big picture as horizontal strips of its own pixel rows (note 32), for the
 * PNG/TIFF rasteriser: Firefox parses many short data URIs far faster than one
 * long one. A strip starts at row `y` and holds `rows` rows; each overlaps the
 * next a little and is drawn under it, so abutting antialiased edges never let
 * the background through (only for opaque pictures).
 */
export interface PictureStrips {
  /** Pixel rows of the whole picture the strips are cut from. */
  readonly height: number;
  readonly strips: readonly { readonly y: number; readonly rows: number; readonly href: string }[];
}

/** Strips placed in the picture's w x h box, edge to edge as the whole picture would be. */
export function stripsNode(p: PictureStrips, w: number, h: number): SvgNode {
  const k = h / p.height;
  return el(
    'g',
    {},
    p.strips.map((s) =>
      el('image', {
        x: 0,
        y: num4(s.y * k), // finer than num(): strip edges must meet
        width: w,
        height: num4(s.rows * k),
        preserveAspectRatio: 'none',
        'xlink:href': s.href,
      }),
    ),
  );
}

/** A picture stretched over w x h; `href` stands in for its data (a working copy, note 30). */
export function imageNode(
  asset: Extract<Asset, { kind: 'image' }>,
  w: number,
  h: number,
  href?: string,
): SvgNode {
  return el('image', {
    x: 0,
    y: 0,
    width: w,
    height: h,
    preserveAspectRatio: 'none',
    'xlink:href': href ?? `data:${asset.mime};base64,${asset.dataBase64}`,
  });
}
