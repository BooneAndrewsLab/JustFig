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

import { type SvgNode, el, num } from './svgNode';

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
): SvgNode {
  const [vx, vy, vw, vh] = s.viewBox;
  const sx = w / vw;
  const sy = h / vh;
  const rootAttrs = Object.fromEntries(
    Object.entries(s.root.attrs).filter(([k]) => k !== 'viewBox'),
  );
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

export function svgImportNode(svg: string, w: number, h: number): SvgNode {
  const s = parsedSvg(svg);
  return fitted(s, w, h, s.root.children);
}

export function imageNode(asset: Extract<Asset, { kind: 'image' }>, w: number, h: number): SvgNode {
  return el('image', {
    x: 0,
    y: 0,
    width: w,
    height: h,
    preserveAspectRatio: 'none',
    'xlink:href': `data:${asset.mime};base64,${asset.dataBase64}`,
  });
}
