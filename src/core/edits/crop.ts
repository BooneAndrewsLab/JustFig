/**
 * Crop and rotate pictures (note 20, issues 46 and 48): one named edit
 * applies the same crop and the same angle to a set of pictures, such as the
 * channels of one field. The crop is the same part of each picture (scaled
 * to its pixel size), along its own edges or, `level`, along the page: the
 * pixels turned by the angle, resampled. The crop's pixels are re-encoded
 * beforehand (`io/cropImage.ts`, asynchronous) and handed in, so the edit
 * stays pure.
 *
 * The frame keeps the picture's scale (points per pixel): it shrinks or grows
 * with the crop and moves so the pixels kept stay where they were on the
 * page. Objects grouped over the picture's box (a scale bar, gel labels,
 * notes 18 and 19) follow its new box, and an `imageWidth` param (the scale
 * bar's calibration) is scaled with the crop's width so the bar stays true.
 * A see-through picture's backdrop (issue 35) is cut to the picture's new
 * box (`io/cropBackdrop.ts`, synchronous).
 */
import { cutBackdrop } from '@/io/cropBackdrop';

import { apply as applyMat, frameMatrix, invert } from '../geometry/matrix';
import {
  type View,
  clampCrop,
  currentView,
  flipSign,
  fullCrop,
  pageAngle,
  scaledWidth,
  viewFrame,
} from '../geometry/view';
import { toTurned, turnedSize } from '../geometry/turn';
import { normAngle } from '../geometry/transform';
import type { Id } from '../model/ids';
import { pageObjects } from '../model/tree';
import type { Asset, AssetHash, Assets, Frame, Image, Obj, Rect4 } from '../model/types';
import { type Edit, EditError, updateObjects } from './edits';

export {
  type View,
  clampCrop,
  currentView,
  flipSign,
  fullCrop,
  pageAngle,
  scaledWidth,
  viewFrame,
  visibleRect,
} from '../geometry/view';

export type ImageAsset = Extract<Asset, { kind: 'image' }>;

/** A crop's pixels as their own asset. */
export interface CroppedPicture {
  readonly hash: AssetHash;
  readonly asset: ImageAsset;
}

/**
 * The same part of a picture `to` pixels in size as `c` is of one `from`
 * (issue 48: pictures of different pixel sizes cropped together), edges
 * rounded to whole pixels.
 */
export function scaledCrop(
  c: Rect4,
  from: { w: number; h: number },
  to: { w: number; h: number },
): Rect4 {
  if ((from.w === to.w && from.h === to.h) || !(from.w > 0 && from.h > 0)) return c;
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  const x0 = Math.round(c.x * sx);
  const y0 = Math.round(c.y * sy);
  return {
    x: x0,
    y: y0,
    w: Math.max(1, Math.round((c.x + c.w) * sx) - x0),
    h: Math.max(1, Math.round((c.y + c.h) * sy) - y0),
  };
}

export const isFullCrop = (c: Rect4, w: number, h: number): boolean =>
  c.x === 0 && c.y === 0 && c.w === w && c.h === h;

/**
 * The frame that shows `next` of a picture now showing `was` in `f`, both in
 * its own pixels: same points per pixel, rotation and flips, the kept pixels
 * in place.
 */
export const cropFrame = (f: Frame, was: Rect4, next: Rect4): Frame =>
  viewFrame(f, { w: 0, h: 0 }, { turn: 0, crop: was }, { turn: 0, crop: next });

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const sameBox = (a: Frame, b: Frame): boolean =>
  near(a.x, b.x) &&
  near(a.y, b.y) &&
  near(a.w, b.w) &&
  near(a.h, b.h) &&
  near(a.rotation, b.rotation);
const unflipped = (f: Frame): Frame => {
  const { flipX: _x, flipY: _y, ...box } = f;
  return box;
};

export interface CropOptions {
  /**
   * The crop, in pixels of a picture `size` in size (its view: turned, when
   * `level`); null shows the whole picture. Undefined: unchanged.
   */
  readonly crop?: Rect4 | null;
  /**
   * The size `crop` is in pixels of (the first picture's view); every picture
   * shows the same part of its own. Default: each picture's own view size.
   */
  readonly size?: { readonly w: number; readonly h: number };
  /**
   * Crop level on the page (issue 48): the pixels turned by the angle,
   * resampled, the frame then level. Default: as the picture is now.
   */
  readonly level?: boolean;
  /** The crop's pixels for each picture id (from `bakeView`), needed when `crop` is set. */
  readonly baked?: Readonly<Record<Id, CroppedPicture>>;
  /** Degrees on the page, the same for every picture. Undefined: unchanged. */
  readonly rotation?: number;
}

/**
 * What a picture will show with `opts` (`crop` set): its turn and crop, or
 * null for all of it, unturned. What to bake for it, and what the edit sets.
 */
export function plannedView(o: Image, a: ImageAsset, opts: CropOptions): View | null {
  const { width: W, height: H } = a.meta;
  const s = flipSign(o.frame);
  const r = opts.rotation;
  const angle = r !== undefined && Number.isFinite(r) ? r : pageAngle(o);
  const level = opts.level ?? (o.crop !== undefined && (o.turn ?? 0) !== 0);
  let turn = level ? normAngle(s * angle) : 0;
  if (Math.abs(turn) < 1e-9) turn = 0;
  const v = turnedSize(W, H, turn);
  const crop =
    opts.crop === null || opts.crop === undefined
      ? fullCrop(v.w, v.h)
      : clampCrop(scaledCrop(opts.crop, opts.size ?? v, v), v.w, v.h);
  return turn === 0 && isFullCrop(crop, W, H) ? null : { turn, crop };
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * A see-through picture's backdrop (issue 35) following its picture `pic`
 * (already in its new state, showing `view` of a `size` picture): the same
 * box, its own flips, cut from the whole backdrop to what lies under the
 * picture now (turned with it for a level crop). The cut is a new asset.
 */
function followBackdrop(
  back: Image,
  asset: Extract<Asset, { kind: 'svgImport' }>,
  pic: Image,
  size: { w: number; h: number },
  view: View,
  added: Record<AssetHash, Asset>,
): Image {
  // Where the whole backdrop is: on the whole picture (it was made that way), in its own flips.
  const whole = viewFrame(pic.frame, size, view, { turn: 0, crop: fullCrop(size.w, size.h) });
  const bw: Frame = {
    ...unflipped(whole),
    ...(back.frame.flipX === true ? { flipX: true } : {}),
    ...(back.frame.flipY === true ? { flipY: true } : {}),
  };
  const frame: Frame = {
    ...unflipped(pic.frame),
    ...(back.frame.flipX === true ? { flipX: true } : {}),
    ...(back.frame.flipY === true ? { flipY: true } : {}),
  };
  const { width: W, height: H } = asset.meta;
  const { crop: _c, cropped: _p, turn: _t, ...rest } = back;
  if (!(W > 0 && H > 0 && bw.w > 0 && bw.h > 0)) return { ...rest, frame };
  let turn = normAngle(flipSign(bw) * (bw.rotation - pic.frame.rotation));
  if (Math.abs(turn) < 1e-9) turn = 0;
  const toWhole = invert(frameMatrix(bw));
  const onPage = frameMatrix(pic.frame);
  const pts = [
    [0, 0],
    [pic.frame.w, 0],
    [0, pic.frame.h],
    [pic.frame.w, pic.frame.h],
  ].map(([x = 0, y = 0]) => {
    const l = applyMat(toWhole, applyMat(onPage, { x, y }));
    return toTurned(W, H, turn, { x: (l.x * W) / bw.w, y: (l.y * H) / bw.h });
  });
  const x0 = round6(Math.min(...pts.map((p) => p.x)));
  const y0 = round6(Math.min(...pts.map((p) => p.y)));
  const crop: Rect4 = {
    x: x0,
    y: y0,
    w: round6(Math.max(...pts.map((p) => p.x))) - x0,
    h: round6(Math.max(...pts.map((p) => p.y))) - y0,
  };
  if (turn === 0 && near(crop.x, 0) && near(crop.y, 0) && near(crop.w, W) && near(crop.h, H))
    return { ...rest, frame };
  const cut = cutBackdrop(asset, turn, crop);
  added[cut.hash] = cut.asset;
  return { ...rest, frame, crop, ...(turn === 0 ? {} : { turn }), cropped: cut.hash };
}

/**
 * "Crop and rotate" on a set of pictures (PNG/JPEG): each shows the same
 * part of itself at the same angle. One undo step.
 */
export function cropImages(pageId: Id, ids: readonly Id[], opts: CropOptions): Edit {
  if (ids.length === 0) throw new EditError('Select pictures to crop.');
  const { crop, baked = {}, rotation } = opts;
  const label =
    crop === undefined
      ? 'Rotate pictures'
      : rotation === undefined
        ? 'Crop pictures'
        : 'Crop and rotate';
  interface Next {
    obj: Image;
    was: Frame;
    wasPx: number;
    nowPx: number;
    size: { w: number; h: number };
    view: View;
  }
  const planned = (pageObjs: Iterable<Obj>, assets: Assets) => {
    /** Each picture's next state, and its old box for what lies over it. */
    const next = new Map<Id, Next>();
    const want = new Set(ids);
    for (const o of pageObjs) {
      if (!want.has(o.id) || o.type !== 'image') continue;
      const a = assets[o.asset];
      if (a?.kind !== 'image') throw new EditError('Only PNG and JPEG pictures can be cropped.');
      const size = { w: a.meta.width, h: a.meta.height };
      const was = currentView(o, a);
      let obj: Image = o;
      let to = was;
      if (crop !== undefined) {
        const v = plannedView(o, a, opts);
        to = v ?? { turn: 0, crop: fullCrop(size.w, size.h) };
        const { crop: _c, cropped: _p, turn: _t, ...rest } = o;
        if (!v) obj = rest;
        else {
          const b = baked[o.id];
          if (!b) throw new EditError('The cropped picture is missing.');
          obj = {
            ...rest,
            crop: v.crop,
            ...(v.turn === 0 ? {} : { turn: v.turn }),
            cropped: b.hash,
          };
        }
        obj = { ...obj, frame: viewFrame(o.frame, size, was, to) };
      }
      if (rotation !== undefined && Number.isFinite(rotation))
        obj = {
          ...obj,
          frame: { ...obj.frame, rotation: normAngle(rotation - flipSign(o.frame) * to.turn) },
        };
      next.set(o.id, { obj, was: o.frame, wasPx: was.crop.w, nowPx: to.crop.w, size, view: to });
    }
    if (next.size === 0) throw new EditError('Those pictures no longer exist.');
    return next;
  };
  return {
    label,
    select: ids,
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      const next = planned(pageObjects(page), f.assets);
      const added: Record<AssetHash, Asset> = {};
      /** Objects over a picture's old box, or its backdrop under it, and what they become. */
      const over = new Map<Id, Obj>();
      for (const o of pageObjects(page)) {
        if (o.type !== 'group') continue;
        o.children.forEach((pic, i) => {
          const n = next.get(pic.id);
          if (!n) return;
          const oldBox = unflipped(n.was);
          const newBox = unflipped(n.obj.frame);
          for (const sib of o.children) {
            if (sib.type !== 'procedural' || !sameBox(unflipped(sib.frame), oldBox)) continue;
            over.set(sib.id, {
              ...sib,
              frame: newBox,
              params: scaledWidth(sib.params, n.wasPx, n.nowPx),
            });
          }
          const back = o.children[i - 1];
          const ba = back?.type === 'image' ? f.assets[back.asset] : undefined;
          if (
            back?.type === 'image' &&
            ba?.kind === 'svgImport' &&
            !next.has(back.id) &&
            sameBox(unflipped(back.frame), oldBox)
          )
            over.set(back.id, followBackdrop(back, ba, n.obj, n.size, n.view, added));
        });
      }
      for (const id of next.keys()) {
        const b = baked[id];
        if (b) added[b.hash] = b.asset;
      }
      const withAssets = { ...f, assets: { ...f.assets, ...added } };
      return updateObjects(
        pageId,
        [...next.keys(), ...over.keys()],
        label,
        (o) => next.get(o.id)?.obj ?? over.get(o.id) ?? o,
      ).apply(withAssets);
    },
  };
}

/**
 * The PNG/JPEG pictures a crop applies to in a selection: selected pictures,
 * and the pictures directly inside selected groups (a picture grouped with
 * its scale bar), unlocked, in selection order.
 */
export function cropTargets(sel: readonly Obj[], assets: Assets): Image[] {
  const out: Image[] = [];
  const take = (o: Obj) => {
    if (o.type === 'image' && o.locked !== true && assets[o.asset]?.kind === 'image') out.push(o);
  };
  for (const o of sel) {
    if (o.type === 'group') o.children.forEach(take);
    else take(o);
  }
  return out;
}

/** The pixel size the pictures share, or null when they differ (or there are none). */
export function sharedSize(
  pics: readonly Image[],
  assets: Assets,
): { w: number; h: number } | null {
  let size: { w: number; h: number } | null = null;
  for (const o of pics) {
    const a = assets[o.asset];
    if (a?.kind !== 'image') return null;
    if (size && (size.w !== a.meta.width || size.h !== a.meta.height)) return null;
    size = { w: a.meta.width, h: a.meta.height };
  }
  return size;
}
