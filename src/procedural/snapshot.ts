/**
 * Snapshots (note 04): when a figure is saved or copied, every procedural
 * object of a known kind gets an SVG picture of itself as an `svgImport`
 * asset. An app that does not know the kind (an older version, or a sibling)
 * draws that picture instead of dropping the object. Snapshots carry no
 * credit, so they never change the attribution line.
 */
import type { Asset, Figure, Obj, Swatch } from '@/core/model/types';
import { hashAsset } from '@/io/assets';
import { proceduralNodes } from '@/render/procedural';
import { nodeToSvgString } from '@/render/svgNode';

import { resolveProcedural } from './registry';

const cache = new WeakMap<Obj, { hash: string; asset: Asset }>();

function snapshotOf(o: Extract<Obj, { type: 'procedural' }>, palette: readonly Swatch[]) {
  const hit = cache.get(o);
  if (hit) return hit;
  const nodes = proceduralNodes(o, 'outline', false, palette);
  if (!nodes) return null;
  const { w, h } = o.frame;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}" viewBox="0 0 ${String(w)} ${String(h)}">` +
    nodes.map((n) => nodeToSvgString(n)).join('') +
    '</svg>';
  const asset: Asset = {
    kind: 'svgImport',
    svg,
    meta: { name: `${o.kind} snapshot`, width: w, height: h },
  };
  const r = { hash: hashAsset(asset), asset };
  cache.set(o, r);
  return r;
}

/** The objects with fresh snapshots on their procedural objects, and the snapshot assets. */
export function withSnapshots(
  objs: readonly Obj[],
  palette: readonly Swatch[],
): { objs: Obj[]; assets: Record<string, Asset> } {
  const assets: Record<string, Asset> = {};
  const visit = (o: Obj): Obj => {
    if (o.type === 'group' || o.type === 'panel') return { ...o, children: o.children.map(visit) };
    if (o.type !== 'procedural' || !resolveProcedural(o)) return o;
    const s = snapshotOf(o, palette);
    if (!s) return o;
    assets[s.hash] = s.asset;
    return { ...o, snapshot: s.hash };
  };
  return { objs: objs.map(visit), assets };
}

/** A whole figure with snapshots, for saving. */
export function figureWithSnapshots(f: Figure): Figure {
  const extra: Record<string, Asset> = {};
  const pages = f.doc.pages.map((p) => ({
    ...p,
    layers: p.layers.map((l) => {
      const r = withSnapshots(l.children, f.doc.palette);
      Object.assign(extra, r.assets);
      return { ...l, children: r.objs };
    }),
  }));
  return { doc: { ...f.doc, pages }, assets: { ...f.assets, ...extra } };
}
