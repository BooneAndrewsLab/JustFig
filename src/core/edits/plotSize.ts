/**
 * Resizing imported plots without scaling their text, line widths and tick
 * lengths (note 17, issue 3). Like restyling (note 16) it rewrites the plot's
 * `svgImport` asset copy-on-write: a new content-addressed asset only the
 * resized objects point at, the old one dropped once nothing uses it
 * (`swapAssets`, shared with restyling, as is `growFrame`, which keeps a
 * restyled plot's bounds around its text: issue 30).
 *
 * `keepPlotText(before, after, pageId)` is a pass over a resize: every plot
 * whose frame changed size between the two figures is redrawn for its new
 * size from its asset in `before`, so a drag recomputed from its start bakes
 * once per step from the original, never from an earlier step. Pictures in
 * the plot's group that lay over it (an imported plot's embedded pictures,
 * issue 24) follow the panel under them instead of scaling with the group,
 * and so does a see-through picture's backdrop (issue 35): an `svgImport`
 * right under a picture with the same box, which is not a plot of its own.
 */
import { hashAsset } from '@/io/assets';
import { fmt } from '@/io/svg/matrix';
import type { ViewBox } from '@/io/svg/plotCleanup';
import {
  type PlotLayout,
  growthFor,
  mapPlotBox,
  plotLayout,
  resizePlot,
} from '@/io/svg/plotResize';
import { type PlotParts, plotParts } from '@/io/svg/plotRoles';
import { parsedSvg } from '@/render/assets';
import { type SvgNode, el, nodeToSvgString } from '@/render/svgNode';

import { apply, center, frameMatrix, invert } from '../geometry/matrix';
import { refit } from '../geometry/transform';
import type { Id } from '../model/ids';
import { mapPageObjs, pageObjects, usedAssets } from '../model/tree';
import type { Asset, Figure, Frame, Obj } from '../model/types';

/** How resizing treats imported plots: keep their text and line sizes, or scale everything. */
export type PlotSizing = 'keep' | 'scale';

export type SvgImportAsset = Extract<Asset, { kind: 'svgImport' }>;

function cached<T>(cache: Map<string, T>, svg: string, make: () => T): T {
  if (cache.has(svg)) return cache.get(svg) as T;
  const v = make();
  if (cache.size > 200) cache.clear();
  cache.set(svg, v);
  return v;
}

const partsCache = new Map<string, PlotParts>();
const layoutCache = new Map<string, PlotLayout | null>();

/** The roles of a stored plot's text and strokes (note 16), cached per asset. */
export function partsOf(svg: string): PlotParts {
  return cached(partsCache, svg, () => {
    const s = parsedSvg(svg);
    return plotParts(s.root, s.viewBox);
  });
}

function layoutOf(svg: string): PlotLayout | null {
  return cached(layoutCache, svg, () => {
    const s = parsedSvg(svg);
    return plotLayout(s.root, s.viewBox, partsOf(svg));
  });
}

/** The stored form of a plot's tree: what `parsedSvg` gives back for it. */
export const plotSvg = (root: SvgNode, vb: ViewBox): string =>
  nodeToSvgString(
    el(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', ...root.attrs, viewBox: vb.map(fmt).join(' ') },
      root.children,
    ),
  );

/**
 * The frame that shows viewBox `next` at the scale `f` shows `vb`, with the
 * part they share in the same place on the page (rotation and flips kept).
 */
export function growFrame(f: Frame, vb: ViewBox, next: ViewBox): Frame {
  const kx = f.w / vb[2];
  const ky = f.h / vb[3];
  const w = next[2] * kx;
  const h = next[3] * ky;
  const m = frameMatrix(f);
  const ox = (next[0] - vb[0]) * kx;
  const oy = (next[1] - vb[1]) * ky;
  // Where the new frame's top-left (in its own coordinates) lands on the page, then its centre.
  const px = m[0] * ox + m[2] * oy + m[4];
  const py = m[1] * ox + m[3] * oy + m[5];
  const cx = px + (m[0] * w) / 2 + (m[2] * h) / 2;
  const cy = py + (m[1] * w) / 2 + (m[3] * h) / 2;
  return { ...f, x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * A plot redrawn for a new frame size with its text, line widths and tick
 * lengths unchanged on the page; null when it has nothing to scale. The size
 * asked for wins: a plot made narrower than a label leaves the label wider
 * than its frame (as a label wider than the whole plot always was).
 */
export function resizedPlot(
  asset: SvgImportAsset,
  before: Frame,
  after: Frame,
): SvgImportAsset | null {
  return resizing(asset, before, after)?.asset ?? null;
}

/** A plot's resize: the new asset and what moving pictures over it needs. */
interface Resizing {
  readonly asset: SvgImportAsset;
  readonly layout: PlotLayout;
  readonly growth: readonly [number, number];
  readonly from: ViewBox;
  readonly to: ViewBox;
}

function resizing(asset: SvgImportAsset, before: Frame, after: Frame): Resizing | null {
  const s = parsedSvg(asset.svg);
  const layout = layoutOf(asset.svg);
  const [, , vw, vh] = s.viewBox;
  if (!layout || vw <= 0 || vh <= 0 || before.w <= 0 || before.h <= 0) return null;
  const [sx, sy] = growthFor(
    s.viewBox,
    layout,
    (after.w * vw) / before.w,
    (after.h * vh) / before.h,
  );
  const r = resizePlot(s.root, s.viewBox, layout, sx, sy);
  return {
    asset: { ...asset, svg: plotSvg(r.root, r.viewBox) },
    layout,
    growth: [sx, sy],
    from: s.viewBox,
    to: r.viewBox,
  };
}

/**
 * A picture that lay over a plot (`was` its frame, issue 24) where the
 * plot's resize from `before` to `after` takes it: with the panel or band
 * under it (`mapPlotBox`). Null when it is not over the plot or not turned
 * the same way (it then just scales with its group).
 */
function followPlot(pic: Frame, before: Frame, after: Frame, r: Resizing): Frame | null {
  if (
    Math.abs(pic.rotation - before.rotation) > 1e-6 ||
    (pic.flipX ?? false) !== (before.flipX ?? false)
  )
    return null;
  const [fx, fy] = [r.from[2] / before.w, r.from[3] / before.h];
  const c = apply(invert(frameMatrix(before)), center(pic));
  const hw = pic.w / 2;
  const hh = pic.h / 2;
  const tol = 0.01 * Math.max(before.w, before.h);
  if (c.x - hw < -tol || c.y - hh < -tol || c.x + hw > before.w + tol || c.y + hh > before.h + tol)
    return null;
  const b = mapPlotBox(r.layout, r.growth[0], r.growth[1], [
    r.from[0] + (c.x - hw) * fx,
    r.from[1] + (c.y - hh) * fy,
    r.from[0] + (c.x + hw) * fx,
    r.from[1] + (c.y + hh) * fy,
  ]);
  const [gx, gy] = [after.w / r.to[2], after.h / r.to[3]];
  const p = apply(frameMatrix(after), {
    x: ((b[0] + b[2]) / 2 - r.to[0]) * gx,
    y: ((b[1] + b[3]) / 2 - r.to[1]) * gy,
  });
  const w = (b[2] - b[0]) * gx;
  const h = (b[3] - b[1]) * gy;
  return { ...pic, x: p.x - w / 2, y: p.y - h / 2, w, h };
}

/**
 * The figure with `added` assets in and the `replaced` ones out once nothing
 * uses them (copy-on-write: an unchanged copy of a plot keeps its asset).
 */
export function swapAssets(
  f: Figure,
  added: Readonly<Record<string, Asset>>,
  replaced: ReadonlySet<string>,
): Figure {
  if (replaced.size === 0 && Object.keys(added).length === 0) return f;
  const used = usedAssets(f.doc);
  const assets = Object.fromEntries(
    Object.entries({ ...f.assets, ...added }).filter(([h]) => !replaced.has(h) || used.has(h)),
  );
  return { ...f, assets };
}

const sameSize = (a: Frame, b: Frame): boolean =>
  Math.abs(a.w - b.w) <= 1e-9 * Math.max(1, a.w) && Math.abs(a.h - b.h) <= 1e-9 * Math.max(1, a.h);

const sameBox = (a: Frame, b: Frame): boolean =>
  Math.abs(a.x - b.x) < 1e-6 &&
  Math.abs(a.y - b.y) < 1e-6 &&
  Math.abs(a.w - b.w) < 1e-6 &&
  Math.abs(a.h - b.h) < 1e-6;

/**
 * Whether a group's child `i` is a see-through picture's backdrop (issue
 * 35): an imported SVG right under a raster picture with the same box.
 */
function isBackdrop(children: readonly Obj[], i: number, assets: Figure['assets']): boolean {
  const o = children[i];
  const next = children[i + 1];
  return (
    o?.type === 'image' &&
    next?.type === 'image' &&
    assets[o.asset]?.kind === 'svgImport' &&
    assets[next.asset]?.kind === 'image' &&
    sameBox(o.frame, next.frame)
  );
}

/**
 * `after` (a resize of `before`) with every imported plot on the page whose
 * frame changed size redrawn to keep its text and line sizes.
 */
export function keepPlotText(before: Figure, after: Figure, pageId: Id): Figure {
  const pb = before.doc.pages.find((p) => p.id === pageId);
  const pa = after.doc.pages.find((p) => p.id === pageId);
  if (!pb || !pa || pb === pa) return after;
  const old = new Map<Id, Obj>();
  /** The group each object is in, before. */
  const parent = new Map<Id, Obj>();
  /** Backdrops of see-through pictures, before: they follow, never resize as plots. */
  const backdrops = new Set<Id>();
  for (const o of pageObjects(pb)) {
    if (o.type === 'image') old.set(o.id, o);
    if (o.type === 'group')
      o.children.forEach((c, i) => {
        parent.set(c.id, o);
        if (isBackdrop(o.children, i, before.assets)) backdrops.add(c.id);
      });
  }
  const added: Record<string, Asset> = {};
  const replaced = new Set<string>();
  const changed = new Map<Id, string>();
  /** Pictures grouped with a resized plot, over it (issue 24): their new frames. */
  const follow = new Map<Id, Frame>();
  for (const o of pageObjects(pa)) {
    if (o.type !== 'image') continue;
    const was = old.get(o.id);
    if (was?.type !== 'image' || was.asset !== o.asset || sameSize(was.frame, o.frame)) continue;
    if (backdrops.has(o.id)) continue;
    const asset = before.assets[o.asset];
    if (asset?.kind !== 'svgImport') continue;
    const r = resizing(asset, was.frame, o.frame);
    if (!r) continue;
    const hash = hashAsset(r.asset);
    added[hash] = r.asset;
    replaced.add(o.asset);
    changed.set(o.id, hash);
    const g = parent.get(o.id);
    for (const pic of g?.type === 'group' ? g.children : []) {
      if (pic.type !== 'image') continue;
      if (before.assets[pic.asset]?.kind !== 'image' && !backdrops.has(pic.id)) continue;
      const f = followPlot(pic.frame, was.frame, o.frame, r);
      if (f) follow.set(pic.id, f);
    }
  }
  if (changed.size === 0) return after;
  const page = mapPageObjs(pa, (o) => {
    const h = changed.get(o.id);
    if (h !== undefined && o.type === 'image') return { ...o, asset: h };
    const f = follow.get(o.id);
    if (f) return { ...o, frame: f };
    return o.type === 'group' && o.children.some((c) => follow.has(c.id)) ? refit(o) : o;
  });
  const next: Figure = {
    ...after,
    doc: { ...after.doc, pages: after.doc.pages.map((p) => (p.id === pageId ? page : p)) },
  };
  return swapAssets(next, added, replaced);
}
