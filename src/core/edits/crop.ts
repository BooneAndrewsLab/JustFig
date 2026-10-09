/**
 * Crop and rotate pictures (note 20, issue 46): one named edit applies the
 * same crop, in pixels, and the same rotation to a set of pictures, such as
 * the channels of one field. The crop's pixels are re-encoded beforehand
 * (`io/cropImage.ts`, asynchronous) and handed in, so the edit stays pure.
 *
 * The frame keeps the picture's scale (points per pixel): it shrinks or grows
 * with the crop and moves so the pixels kept stay where they were on the
 * page. Objects grouped over the picture's box (a scale bar, gel labels,
 * notes 18 and 19) follow its new box, and an `imageWidth` param (the scale
 * bar's calibration) is scaled with the crop's width so the bar stays true.
 */
import { apply as applyMat, frameMatrix } from '../geometry/matrix';
import { normAngle } from '../geometry/transform';
import type { Id } from '../model/ids';
import { pageObjects } from '../model/tree';
import type { Asset, AssetHash, Assets, Frame, Image, Obj, Rect4 } from '../model/types';
import { type Edit, EditError, updateObjects } from './edits';

export type ImageAsset = Extract<Asset, { kind: 'image' }>;

/** A crop's pixels as their own asset. */
export interface CroppedPicture {
  readonly hash: AssetHash;
  readonly asset: ImageAsset;
}

/** All of a picture `w` × `h` pixels. */
export const fullCrop = (w: number, h: number): Rect4 => ({ x: 0, y: 0, w, h });

/** What a picture shows, in pixels of its asset. */
export const visibleRect = (o: Image, a: ImageAsset): Rect4 =>
  o.crop ?? fullCrop(a.meta.width, a.meta.height);

/** A crop as whole pixels inside a `w` × `h` picture, at least one pixel each way. */
export function clampCrop(c: Rect4, w: number, h: number): Rect4 {
  const int = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  const x = int(c.x, 0, w - 1);
  const y = int(c.y, 0, h - 1);
  return { x, y, w: int(c.w, 1, w - x), h: int(c.h, 1, h - y) };
}

export const isFullCrop = (c: Rect4, w: number, h: number): boolean =>
  c.x === 0 && c.y === 0 && c.w === w && c.h === h;

/**
 * The frame that shows `next` of a picture now showing `was` in `f`: same
 * points per pixel, same rotation and flips, the kept pixels in place.
 */
export function cropFrame(f: Frame, was: Rect4, next: Rect4): Frame {
  const kx = was.w > 0 ? f.w / was.w : 0;
  const ky = was.h > 0 ? f.h / was.h : 0;
  const w = next.w * kx;
  const h = next.h * ky;
  // The new box's centre, in the old frame's own (unflipped, unrotated) coordinates.
  const c = applyMat(frameMatrix(f), {
    x: (next.x - was.x) * kx + w / 2,
    y: (next.y - was.y) * ky + h / 2,
  });
  return { ...f, x: c.x - w / 2, y: c.y - h / 2, w, h };
}

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
  /** Pixels of each picture's asset; null shows the whole picture. Undefined: unchanged. */
  readonly crop?: Rect4 | null;
  /** The crop's pixels for each picture id (from `cropPicture`), needed when `crop` is set. */
  readonly baked?: Readonly<Record<Id, CroppedPicture>>;
  /** Degrees, the same for every picture. Undefined: unchanged. */
  readonly rotation?: number;
}

/**
 * "Crop and rotate" on a set of pictures (PNG/JPEG): each shows the same
 * pixel rectangle at the same rotation. One undo step.
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
  const planned = (pageObjs: Iterable<Obj>, assets: Assets) => {
    /** Each picture's next state, and its old box for what lies over it. */
    const next = new Map<Id, { obj: Image; was: Frame; wasPx: number; nowPx: number }>();
    const want = new Set(ids);
    for (const o of pageObjs) {
      if (!want.has(o.id) || o.type !== 'image') continue;
      const a = assets[o.asset];
      if (a?.kind !== 'image') throw new EditError('Only PNG and JPEG pictures can be cropped.');
      const was = visibleRect(o, a);
      let obj: Image = o;
      let to = was;
      if (crop !== undefined) {
        to = clampCrop(crop ?? fullCrop(a.meta.width, a.meta.height), a.meta.width, a.meta.height);
        const { crop: _c, cropped: _p, ...rest } = o;
        if (isFullCrop(to, a.meta.width, a.meta.height)) obj = rest;
        else {
          const b = baked[o.id];
          if (!b) throw new EditError('The cropped picture is missing.');
          obj = { ...rest, crop: to, cropped: b.hash };
        }
        obj = { ...obj, frame: cropFrame(o.frame, was, to) };
      }
      if (rotation !== undefined && Number.isFinite(rotation))
        obj = { ...obj, frame: { ...obj.frame, rotation: normAngle(rotation) } };
      next.set(o.id, { obj, was: o.frame, wasPx: was.w, nowPx: to.w });
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
      /** Objects over a picture's old box, and what they become. */
      const over = new Map<Id, Obj>();
      for (const o of pageObjects(page)) {
        if (o.type !== 'group') continue;
        for (const pic of o.children) {
          const n = next.get(pic.id);
          if (!n) continue;
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
        }
      }
      const added: Record<AssetHash, Asset> = {};
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

/** Params with an `imageWidth` (pixels) scaled from `was` to `now` pixels shown. */
function scaledWidth(params: unknown, was: number, now: number): unknown {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return params;
  const p = params as Record<string, unknown>;
  const iw = p['imageWidth'];
  if (typeof iw !== 'number' || !(was > 0) || was === now) return params;
  return { ...p, imageWidth: Math.max(1, Math.round((iw * now) / was)) };
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
