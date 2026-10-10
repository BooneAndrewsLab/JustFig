/**
 * Magnified insets (note 44, issue 66). `addInset` is one named edit: the
 * inset (a cropped copy of the source's pixels, baked beforehand, note 20)
 * beside the source at a magnification, an outline box and two connector
 * lines; their places are then solved by `reconcileBindings` (note 06), never
 * here. `setInsetMagnification` resizes an inset keeping its top-left corner.
 * `bakeInset` hands in pixels re-baked after a re-crop (the app applies it
 * without an undo step of its own: it completes the edit that re-cropped).
 */
import { frameBounds } from '../geometry/matrix';
import { refit } from '../geometry/transform';
import { type View, clampCrop, currentView, scaledWidth } from '../geometry/view';
import { createPath, createRect } from '../model/factory';
import { type Id, newId } from '../model/ids';
import { assetSize, insetFrame, magnification } from '../model/inset';
import { findObj, locate, mapPageObjs, pageObjects } from '../model/tree';
import type { Figure, Frame, Image, InsetLink, Obj, Page, Rect4, ShapeStyle } from '../model/types';
import type { CroppedPicture } from './crop';
import { type Edit, EditError, withPage } from './edits';

/** Gap between the source's bounds and a new inset, points. */
export const INSET_GAP = 12;

/** Outline and connector style of a new inset: thin amber, seen on dark pictures and a white page. */
export const INSET_STYLE: ShapeStyle = {
  fill: null,
  stroke: { hex: '#f2b600' },
  strokeWidth: 1,
  cap: 'butt',
  join: 'miter',
};

/**
 * What an inset of `region` (in pixels of what the source shows now, its
 * view) will show of the source's asset: the source's turn, the region
 * offset by the source's crop. What to bake, and what the edit sets.
 */
export function plannedInset(source: Image, size: { w: number; h: number }, region: Rect4): View {
  const sv = currentView(source, { meta: { width: size.w, height: size.h } });
  const c = clampCrop(region, sv.crop.w, sv.crop.h);
  return { turn: sv.turn, crop: { x: sv.crop.x + c.x, y: sv.crop.y + c.y, w: c.w, h: c.h } };
}

/** Whether a picture can have an inset made of it (a PNG or JPEG picture). */
export const canInset = (o: Obj, f: Figure): o is Image =>
  o.type === 'image' && f.assets[o.asset]?.kind === 'image';

export interface InsetOptions {
  /** The region, in pixels of what the source shows (`plannedInset`). */
  readonly region: Rect4;
  /** The region's pixels, from `bakeView(asset, plannedInset(...))`. */
  readonly baked: CroppedPicture;
  /** How many times larger than on the source; default 2. */
  readonly magnification?: number;
}

const findPage = (f: Figure, pageId: Id): Page => {
  const p = f.doc.pages.find((x) => x.id === pageId);
  if (!p) throw new EditError('That page no longer exists.');
  return p;
};

/** "Inset" on a picture: a magnified copy of a region beside it, linked by a box and two lines. */
export function addInset(
  pageId: Id,
  sourceId: Id,
  opts: InsetOptions,
  ids?: {
    inset: Id;
    box: Id;
    lines: readonly [Id, Id];
  },
): Edit {
  const mag = opts.magnification ?? 2;
  if (!(mag > 0) || !Number.isFinite(mag))
    throw new EditError('The magnification must be above 0.');
  const box = createRect({ x: 0, y: 0, w: 1, h: 1, rotation: 0 }, INSET_STYLE);
  const line = () =>
    createPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      false,
      INSET_STYLE,
    );
  const boxObj = { ...box, ...(ids ? { id: ids.box } : {}), name: 'Inset box' };
  const lineObjs = [line(), line()].map((l, i) => ({
    ...l,
    ...(ids ? { id: ids.lines[i] ?? l.id } : {}),
    name: 'Inset line',
  }));
  const insetId = ids?.inset ?? newId('o');
  return {
    label: 'Make inset',
    select: [insetId],
    apply: (f) => {
      const page = findPage(f, pageId);
      const loc = locate(page, sourceId);
      const source = loc?.obj;
      if (!loc || !source || !canInset(source, f))
        throw new EditError('Select a PNG or JPEG picture to make an inset of.');
      const size = assetSize(source, f.assets);
      if (!size) throw new EditError('That picture has no pixels to magnify.');
      const view = plannedInset(source, size, opts.region);
      const b = frameBounds(source.frame);
      const link: InsetLink = {
        source: source.id,
        box: boxObj.id,
        lines: lineObjs.map((l) => l.id),
      };
      const draft: Image = {
        id: insetId,
        type: 'image',
        name: 'Inset',
        opacity: 1,
        asset: source.asset,
        crop: view.crop,
        ...(view.turn === 0 ? {} : { turn: view.turn }),
        cropped: opts.baked.hash,
        frame: {
          x: b.x + b.w + INSET_GAP,
          y: b.y,
          w: 1,
          h: 1,
          rotation: source.frame.rotation,
          ...(source.frame.flipX === true ? { flipX: true } : {}),
          ...(source.frame.flipY === true ? { flipY: true } : {}),
        },
        inset: link,
      };
      const inset: Image = {
        ...draft,
        frame: insetFrame(source, size, draft, view.crop, mag),
      };
      // Beside the source's top-level object (a group with its scale bar), in its panel or layer.
      const host = [...loc.parents].reverse().find((o) => o.type === 'panel');
      const after = loc.parents[host ? loc.parents.indexOf(host) + 1 : 0]?.id ?? source.id;
      const added: Obj[] = [inset, ...lineObjs, boxObj];
      const insert = (objs: readonly Obj[]): Obj[] =>
        objs.flatMap((o) => (o.id === after ? [o, ...added] : [o]));
      const next = withPage(f, pageId, (p) => {
        if (!host)
          return {
            ...p,
            layers: p.layers.map((l) =>
              l.id === loc.layer.id ? { ...l, children: insert(l.children) } : l,
            ),
          };
        return mapPageObjs(p, (o) =>
          o.id === host.id && o.type === 'panel' ? { ...o, children: insert(o.children) } : o,
        );
      });
      return { ...next, assets: { ...next.assets, [opts.baked.hash]: opts.baked.asset } };
    },
  };
}

/** The objects over a picture's box in its group (a scale bar) moved to a new box, recalibrated. */
function overBox(page: Page, pic: Image, was: Frame, wasPx: number, nowPx: number): Map<Id, Obj> {
  const out = new Map<Id, Obj>();
  const same = (a: Frame, b: Frame) =>
    Math.abs(a.x - b.x) < 1e-6 &&
    Math.abs(a.y - b.y) < 1e-6 &&
    Math.abs(a.w - b.w) < 1e-6 &&
    Math.abs(a.h - b.h) < 1e-6;
  for (const g of pageObjects(page)) {
    if (g.type !== 'group' || !g.children.some((c) => c.id === pic.id)) continue;
    for (const sib of g.children)
      if (sib.type === 'procedural' && same(sib.frame, was))
        out.set(sib.id, {
          ...sib,
          frame: { ...sib.frame, w: pic.frame.w, h: pic.frame.h, x: pic.frame.x, y: pic.frame.y },
          params: scaledWidth(sib.params, wasPx, nowPx),
        });
  }
  return out;
}

/** Sets an inset's magnification: it is resized about its top-left corner, with what lies over it. */
export function setInsetMagnification(pageId: Id, insetId: Id, mag: number): Edit {
  return {
    label: 'Inset magnification',
    apply: (f) => {
      if (!(mag > 0) || !Number.isFinite(mag))
        throw new EditError('The magnification must be above 0.');
      const page = findPage(f, pageId);
      const inset = findObj(page, insetId);
      if (inset?.type !== 'image' || !inset.inset || !inset.crop)
        throw new EditError('That inset no longer exists.');
      const source = findObj(page, inset.inset.source);
      const size = source?.type === 'image' ? assetSize(source, f.assets) : null;
      if (source?.type !== 'image' || !size) throw new EditError('The inset has lost its picture.');
      const next: Image = { ...inset, frame: insetFrame(source, size, inset, inset.crop, mag) };
      const over = overBox(page, next, inset.frame, inset.crop.w, inset.crop.w);
      return withPage(f, pageId, (p) =>
        mapPageObjs(p, (o) => {
          if (o.id === insetId) return next;
          const r = over.get(o.id);
          if (r) return r;
          return o.type === 'group' && o.children.some((c) => c.id === insetId) ? refit(o) : o;
        }),
      );
    },
  };
}

/** An inset's current magnification, or null when it is not one (or has lost its source). */
export function insetMagnification(page: Page, inset: Image, f: Figure): number | null {
  const link = inset.inset;
  if (!link) return null;
  const source = findObj(page, link.source);
  const size = source?.type === 'image' ? assetSize(source, f.assets) : null;
  return source?.type === 'image' && size ? magnification(source, size, inset) : null;
}

/**
 * The re-baked pixels of a stale inset (note 44): applied only if the inset
 * still shows what was baked (same asset, turn and crop), else nothing.
 */
export function bakeInset(
  pageId: Id,
  insetId: Id,
  baked: { asset: string; view: View; picture: CroppedPicture },
): Edit {
  return {
    label: 'Bake inset',
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) return f;
      const c = baked.view.crop;
      const state = { hit: false };
      const next = mapPageObjs(page, (o) => {
        if (o.id !== insetId || o.type !== 'image' || !o.inset?.stale || !o.crop) return o;
        if (
          o.asset !== baked.asset ||
          (o.turn ?? 0) !== baked.view.turn ||
          o.crop.x !== c.x ||
          o.crop.y !== c.y ||
          o.crop.w !== c.w ||
          o.crop.h !== c.h
        )
          return o;
        state.hit = true;
        const { stale: _s, ...link } = o.inset;
        return { ...o, cropped: baked.picture.hash, inset: link };
      });
      if (!state.hit) return f;
      return {
        ...f,
        assets: { ...f.assets, [baked.picture.hash]: baked.picture.asset },
        doc: { ...f.doc, pages: f.doc.pages.map((p) => (p.id === pageId ? next : p)) },
      };
    },
  };
}
