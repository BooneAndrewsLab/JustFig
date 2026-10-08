/**
 * Procedural objects as SvgNodes (note 04): the kind's primitives, merged
 * paths drawn as `<path>`s and labels as our own laid-out text. Cached per
 * primitive list, so a moved object reuses its drawing.
 */
import { frameMatrix, isPlain } from '@/core/geometry/matrix';
import type { Procedural, Swatch } from '@/core/model/types';
import { layoutText } from '@/core/text/layout';
import { type Prim, primData } from '@/procedural/prims';
import { getKind, proceduralPrims, resolveProcedural } from '@/procedural/registry';
import { textPrimObj } from '@/procedural/shapes';
import { pathData } from './path';
import { type SvgNode, el, num } from './svgNode';
import { type TextMode, textNodes } from './textNodes';

function matrixAttr(f: Procedural['frame']): string | undefined {
  if (isPlain(f)) return f.x === 0 && f.y === 0 ? undefined : `translate(${num(f.x)} ${num(f.y)})`;
  return `matrix(${frameMatrix(f)
    .map((v) => String(Math.round(v * 10000) / 10000))
    .join(' ')})`;
}

export function primNodes(
  prims: readonly Prim[],
  mode: TextMode,
  palette: readonly Swatch[],
): SvgNode[] {
  const out: SvgNode[] = [];
  for (const p of prims) {
    if (p.kind === 'path') {
      const stroked = p.stroke !== null && p.sw > 0;
      out.push(
        el('path', {
          d: primData(p),
          fill: p.fill ?? 'none',
          stroke: stroked ? p.stroke : undefined,
          'stroke-width': stroked ? p.sw : undefined,
          'stroke-linecap': stroked && p.cap ? p.cap : undefined,
          'stroke-linejoin': stroked && p.join ? p.join : undefined,
        }),
      );
      continue;
    }
    if (p.text.trim() === '') continue;
    const t = textPrimObj(p);
    const nodes = textNodes(layoutText(t), mode, { palette });
    if (nodes.length > 0) out.push(el('g', { transform: matrixAttr(t.frame) }, nodes));
  }
  return out;
}

const cache = new WeakMap<readonly Prim[], Map<string, SvgNode[]>>();

/**
 * The object's content in frame-local coordinates, or null when its kind
 * is unknown here (the caller then draws the snapshot). On screen a
 * transparent hit area comes first: the frame, or a band along the path.
 */
export function proceduralNodes(
  o: Procedural,
  mode: TextMode,
  screen: boolean,
  palette: readonly Swatch[],
): SvgNode[] | null {
  const prims = proceduralPrims(o, palette);
  if (!prims) return null;
  const key = `${mode}|${String(screen)}`;
  let m = cache.get(prims);
  if (!m) {
    m = new Map();
    cache.set(prims, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  const nodes = primNodes(prims, mode, palette);
  if (screen) {
    const r = resolveProcedural(o);
    const kind = getKind(o.kind);
    const band = r && kind?.overhang ? kind.overhang(r.params) : 0;
    nodes.unshift(
      kind?.usesPath && o.path && o.path.length > 1
        ? el('path', {
            d: pathData(o.path, r?.params['closed'] === true),
            fill: 'none',
            stroke: 'transparent',
            'stroke-width': Math.max(8, band * 2),
            'data-hit': 1,
          })
        : el('rect', {
            x: 0,
            y: 0,
            width: o.frame.w,
            height: o.frame.h,
            fill: 'transparent',
            'data-hit': 1,
          }),
    );
  }
  m.set(key, nodes);
  return nodes;
}
