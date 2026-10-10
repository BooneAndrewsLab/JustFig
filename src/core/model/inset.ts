/**
 * Magnified insets (note 44, issue 66): a picture showing a region of
 * another, an outline box on the source, and connector lines from the box's
 * corners to the inset's. The link lives on the inset (`Image.inset`); the
 * region is the inset's own `crop` in pixels of the source's asset (turned by
 * `turn`), so the inset is an ordinary cropped picture (note 20) and exports
 * as a plain `<image>`.
 *
 * `reconcileInsets(before, after)` runs inside `reconcileBindings` after every
 * edit (note 06), never in an edit: the box is laid on the source over the
 * region, and the lines from the box to the inset; a box the user moved or
 * resized (the source unchanged) re-crops the inset instead, keeping its
 * magnification and top-left corner, and marks it `stale` for the app to
 * re-bake its pixels (asynchronous, `ui/insetBaker.ts`). Deleting the source,
 * the box or the inset removes the box and lines and drops the link.
 * Re-solving is idempotent: unchanged geometry keeps object identity.
 */
import { apply, center, corners, frameMatrix, invert, boxOfPoints } from '../geometry/matrix';
import { refit } from '../geometry/transform';
import { fromTurned, toTurned, turnedSize } from '../geometry/turn';
import { type View, clampCrop, currentView, scaledWidth, viewFrame } from '../geometry/view';
import { localise } from './factory';
import type { Id } from './ids';
import { mapPageObjs, pageObjects } from './tree';
import type {
  Assets,
  Figure,
  Frame,
  Image,
  InsetLink,
  Obj,
  Page,
  PathObj,
  Rect,
  Rect4,
  Vec2,
} from './types';

/** Default magnification of a new inset. */
export const DEFAULT_MAGNIFICATION = 2;

interface Size {
  readonly w: number;
  readonly h: number;
}

/** The pixel size of a picture's asset, if it is a raster picture. */
export function assetSize(o: Image, assets: Assets): Size | null {
  const a = assets[o.asset];
  return a?.kind === 'image' && a.meta.width > 0 && a.meta.height > 0
    ? { w: a.meta.width, h: a.meta.height }
    : null;
}

const viewOf = (o: Image, size: Size): View =>
  currentView(o, { meta: { width: size.w, height: size.h } });

/** The inset's view of the source's pixels, or null when it has no crop. */
const insetView = (inset: Image): View | null =>
  inset.crop ? { turn: inset.turn ?? 0, crop: inset.crop } : null;

const unflip = (f: Frame): Frame => {
  const { flipX: _x, flipY: _y, ...box } = f;
  return box;
};

/** Where the region `inset` shows lies on its source: the outline box's frame. */
export function boxFrame(source: Image, size: Size, inset: Image): Frame | null {
  const v = insetView(inset);
  if (!v) return null;
  return unflip(viewFrame(source.frame, size, viewOf(source, size), v));
}

/** Points per pixel of a picture's view, across and down. */
function scaleOf(o: Image, size: Size): Vec2 {
  const v = viewOf(o, size);
  return { x: v.crop.w > 0 ? o.frame.w / v.crop.w : 0, y: v.crop.h > 0 ? o.frame.h / v.crop.h : 0 };
}

/**
 * The region (in the inset's view pixels) under a box frame on the source:
 * its centre mapped back through the source's view, its size divided by the
 * source's points per pixel, clamped to whole pixels on the picture.
 */
export function regionOfBox(source: Image, size: Size, box: Frame, turn: number): Rect4 | null {
  const sv = viewOf(source, size);
  const k = scaleOf(source, size);
  if (!(k.x > 0 && k.y > 0)) return null;
  const local = apply(invert(frameMatrix(source.frame)), center(box));
  const pv = { x: local.x / k.x + sv.crop.x, y: local.y / k.y + sv.crop.y };
  const pi = toTurned(size.w, size.h, turn, fromTurned(size.w, size.h, sv.turn, pv));
  const w = box.w / k.x;
  const h = box.h / k.y;
  const t = turnedSize(size.w, size.h, turn);
  return clampCrop({ x: pi.x - w / 2, y: pi.y - h / 2, w, h }, t.w, t.h);
}

/** How many times larger the inset shows its pixels than the source does (across). */
export function magnification(source: Image, size: Size, inset: Image): number {
  const ks = scaleOf(source, size).x;
  const v = insetView(inset);
  if (!v || !(ks > 0) || !(v.crop.w > 0)) return 1;
  return inset.frame.w / v.crop.w / ks;
}

/** The inset frame showing `crop` at magnification `mag`, its top-left corner kept. */
export function insetFrame(
  source: Image,
  size: Size,
  inset: Image,
  crop: Rect4,
  mag: number,
): Frame {
  const k = scaleOf(source, size);
  return { ...inset.frame, w: crop.w * k.x * mag, h: crop.h * k.y * mag };
}

/**
 * The connector lines: the two box corners facing the inset to the two inset
 * corners facing the box, paired along the other axis. The side is the one
 * with the larger gap between their bounds, so the lines swap corners when
 * the inset moves to another side of the source.
 */
export function connectorEnds(box: Frame, inset: Frame): [Vec2, Vec2][] {
  const bc = corners(box);
  const ic = corners(inset);
  const bb = boxOfPoints(bc);
  const ib = boxOfPoints(ic);
  const gapX = Math.max(ib.x - (bb.x + bb.w), bb.x - (ib.x + ib.w));
  const gapY = Math.max(ib.y - (bb.y + bb.h), bb.y - (ib.y + ib.h));
  const d = { x: center(ib).x - center(bb).x, y: center(ib).y - center(bb).y };
  const across = gapX >= gapY;
  const along = (p: Vec2) => (across ? p.x : p.y);
  const other = (p: Vec2) => (across ? p.y : p.x);
  const s = (across ? d.x : d.y) >= 0 ? 1 : -1;
  const facing = (pts: Vec2[], sign: number) =>
    [...pts]
      .sort((a, b) => sign * (along(b) - along(a)))
      .slice(0, 2)
      .sort((a, b) => other(a) - other(b));
  const [b0, b1] = facing(bc, s);
  const [i0, i1] = facing(ic, -s);
  if (!b0 || !b1 || !i0 || !i1) return [];
  return [
    [b0, i0],
    [b1, i1],
  ];
}

// --- reconciling -----------------------------------------------------------------

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const sameFrame = (a: Frame, b: Frame): boolean =>
  near(a.x, b.x) &&
  near(a.y, b.y) &&
  near(a.w, b.w) &&
  near(a.h, b.h) &&
  near(a.rotation, b.rotation);
const sameRect = (a: Rect4, b: Rect4 | undefined): boolean =>
  b?.x === a.x && b.y === a.y && b.w === a.w && b.h === a.h;

function pathEnds(o: PathObj): [Vec2, Vec2] | null {
  const m = frameMatrix(o.frame);
  const a = o.nodes[0];
  const b = o.nodes[o.nodes.length - 1];
  return a && b && o.nodes.length === 2 ? [apply(m, a), apply(m, b)] : null;
}

function laidLine(o: PathObj, p: Vec2, q: Vec2): PathObj {
  const ends = pathEnds(o);
  if (
    ends &&
    near(ends[0].x, p.x) &&
    near(ends[0].y, p.y) &&
    near(ends[1].x, q.x) &&
    near(ends[1].y, q.y)
  )
    return o;
  const { f, local } = localise([p, q]);
  return { ...o, frame: f, nodes: local };
}

function nearestPair(l: PathObj, pairs: [Vec2, Vec2][]): [Vec2, Vec2] | undefined {
  const at = pathEnds(l);
  if (!at) return pairs[0];
  const d = (p: [Vec2, Vec2]) =>
    Math.hypot(p[0].x - at[0].x, p[0].y - at[0].y) + Math.hypot(p[1].x - at[1].x, p[1].y - at[1].y);
  return [...pairs].sort((a, b) => d(a) - d(b))[0];
}

function index(page: Page | undefined): Map<Id, Obj> {
  const m = new Map<Id, Obj>();
  if (page) for (const o of pageObjects(page)) m.set(o.id, o);
  return m;
}

const withoutLink = (o: Image): Image => {
  const { inset: _drop, ...rest } = o;
  return rest;
};

/** What lies over a picture's box in its group (a scale bar) follows a new box (note 20). */
function followOver(
  page: Page,
  was: Frame,
  now: Image,
  wasPx: number,
  nowPx: number,
  out: Map<Id, Obj>,
) {
  if (sameFrame(was, now.frame) && wasPx === nowPx) return;
  for (const g of pageObjects(page)) {
    if (g.type !== 'group' || !g.children.some((c) => c.id === now.id)) continue;
    for (const sib of g.children)
      if (sib.type === 'procedural' && sameFrame(unflip(sib.frame), unflip(was)))
        out.set(sib.id, {
          ...sib,
          frame: unflip(now.frame),
          params: scaledWidth(sib.params, wasPx, nowPx),
        });
  }
}

function reconcilePage(before: Page | undefined, page: Page, assets: Assets): Page {
  const now = index(page);
  const was = index(before);
  const insets: Image[] = [];
  for (const o of now.values()) if (o.type === 'image' && o.inset) insets.push(o);
  const gone: InsetLink[] = [];
  for (const o of was.values())
    if (o.type === 'image' && o.inset && !now.has(o.id)) gone.push(o.inset);
  if (insets.length === 0 && gone.length === 0) return page;

  const remove = new Set<Id>();
  const out = new Map<Id, Obj>();
  for (const l of gone) {
    remove.add(l.box);
    l.lines.forEach((id) => remove.add(id));
  }
  for (const inset of insets) {
    const link = inset.inset;
    if (!link) continue;
    const s = now.get(link.source);
    const b = now.get(link.box);
    const size = s?.type === 'image' ? assetSize(s, assets) : null;
    if (s?.type !== 'image' || b?.type !== 'rect' || !size || !inset.crop || s.id === inset.id) {
      // The source or the box is gone: the inset stays as a plain cropped picture.
      remove.add(link.box);
      link.lines.forEach((id) => remove.add(id));
      out.set(inset.id, withoutLink(inset));
      continue;
    }
    const lines = link.lines.filter((id) => now.get(id)?.type === 'path');
    const iWas = was.get(inset.id);
    const sWas = was.get(s.id);
    const bWas = was.get(b.id);
    const fresh =
      iWas?.type !== 'image' || iWas.inset?.source !== link.source || iWas.inset.box !== link.box;
    let next: Image = inset;
    let stale = link.stale === true;
    // The source's pixels changed (levels, channels): the inset shows them too.
    if (!fresh && sWas?.type === 'image' && sWas.asset !== s.asset && inset.asset !== s.asset) {
      const { levels: _l, channels: _c, ...rest } = next;
      const t = turnedSize(size.w, size.h, next.turn ?? 0);
      next = { ...rest, asset: s.asset, crop: clampCrop(inset.crop, t.w, t.h) };
      stale = true;
    }
    // The box alone moved or resized on an unchanged source: re-crop the inset.
    if (!fresh && sWas === s && bWas !== b && bWas?.type === 'rect') {
      const crop = regionOfBox(s, size, b.frame, inset.turn ?? 0);
      if (crop && !sameRect(crop, inset.crop)) {
        const mag = magnification(s, size, next);
        const wasFrame = next.frame;
        const wasPx = next.crop?.w ?? crop.w;
        next = { ...next, crop, frame: insetFrame(s, size, next, crop, mag) };
        stale = true;
        followOver(page, wasFrame, next, wasPx, crop.w, out);
      }
    }
    const nextLink: InsetLink = {
      source: link.source,
      box: link.box,
      lines,
      ...(stale ? { stale: true } : {}),
    };
    const sameLink = lines.length === link.lines.length && (link.stale === true) === stale;
    if (!sameLink) next = { ...next, inset: nextLink };
    if (next !== inset) out.set(inset.id, next);

    const bf = boxFrame(s, size, next);
    if (bf && !sameFrame(bf, b.frame)) out.set(b.id, { ...b, frame: bf } satisfies Rect);
    const boxNow = bf ?? b.frame;
    const ends = connectorEnds(boxNow, next.frame);
    lines.forEach((id, i) => {
      const l = now.get(id);
      if (l?.type !== 'path') return;
      // Both lines: in order. One left (the other deleted): the pair nearest it.
      const e = lines.length === ends.length ? ends[i] : nearestPair(l, ends);
      if (!e) return;
      const laid = laidLine(l, e[0], e[1]);
      if (laid !== l) out.set(id, laid);
    });
  }
  if (remove.size === 0 && out.size === 0) return page;
  return mapPageObjs(page, (o) => {
    if (remove.has(o.id)) return null;
    const r = out.get(o.id);
    if (r) return r;
    // A group whose children changed gets its frame recomputed.
    const old = now.get(o.id);
    return o.type === 'group' && old?.type === 'group' && o.children !== old.children
      ? refit(o)
      : o;
  });
}

/** Lays out every inset's box and lines after an edit turned `before` into `after` (note 44). */
export function reconcileInsets(before: Figure, after: Figure): Figure {
  const pages = after.doc.pages.map((p) =>
    reconcilePage(
      before.doc.pages.find((q) => q.id === p.id),
      p,
      after.assets,
    ),
  );
  if (pages.every((p, i) => p === after.doc.pages[i])) return after;
  return { ...after, doc: { ...after.doc, pages } };
}

/** An inset link remapped to copies (paste, duplicate): kept only when its source and box were copied. */
export function remapInset(o: Image, ids: ReadonlyMap<Id, Id>): Image {
  const link = o.inset;
  if (!link) return o;
  const source = ids.get(link.source);
  const box = ids.get(link.box);
  if (source === undefined || box === undefined) return withoutLink(o);
  const lines = link.lines.flatMap((id) => {
    const to = ids.get(id);
    return to === undefined ? [] : [to];
  });
  return { ...o, inset: { ...link, source, box, lines } };
}
