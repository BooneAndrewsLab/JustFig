/**
 * Crop and rotate (note 20, issues 46 and 48): the same part and angle for
 * every selected picture (the channels of one field), in pixels of the first
 * (pictures of other sizes take the same part of themselves). Along the
 * picture's own edges, or level on the page (the pixels turned, resampled).
 * The fields are the keyboard way in; dragging on the preview fills them in.
 * The crop's pixels are re-encoded first, then applied as one named edit.
 */
import { type PointerEvent, useRef, useState } from 'react';

import {
  type CropOptions,
  type CroppedPicture,
  clampCrop,
  cropImages,
  cropTargets,
  flipSign,
  fullCrop,
  pageAngle,
  plannedView,
  sharedSize,
} from '@/core/edits/crop';
import { normAngle } from '@/core/geometry/transform';
import { turnedSize } from '@/core/geometry/turn';
import type { Rect4 } from '@/core/model/types';
import { bakeView } from '@/io/cropImage';

import { analytics } from '../analytics';
import { currentPage, figure, selectedObjects, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

type Fields = Record<'x' | 'y' | 'w' | 'h' | 'rotation', string>;

const fieldsOf = (c: Rect4, rotation: number): Fields => ({
  x: String(c.x),
  y: String(c.y),
  w: String(c.w),
  h: String(c.h),
  rotation: String(Math.round(rotation * 100) / 100),
});

export function CropDialog({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const fig = figure(s);
  const pics = cropTargets(selectedObjects(s), fig.assets);
  const same = sharedSize(pics, fig.assets);
  const first = pics[0];
  const firstAsset = first ? fig.assets[first.asset] : undefined;
  /** The first picture's size in pixels: the crop is typed in its pixels. */
  const W = firstAsset?.kind === 'image' ? firstAsset.meta.width : 1;
  const H = firstAsset?.kind === 'image' ? firstAsset.meta.height : 1;
  const [level, setLevel] = useState(() => first?.crop !== undefined && (first.turn ?? 0) !== 0);
  const [fields, setFields] = useState<Fields>(() =>
    fieldsOf(first?.crop ?? fullCrop(W, H), first ? pageAngle(first) : 0),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const preview = useRef<SVGSVGElement>(null);

  const rotation = Number(fields.rotation);
  const sign = first ? flipSign(first.frame) : 1;
  /** Degrees the first picture's pixels are turned for a level crop (0: along its edges). */
  const turn = level && Number.isFinite(rotation) ? normAngle(sign * rotation) : 0;
  /** The pixels the crop is in: the picture, or it turned (its bounding box). */
  const view = turnedSize(W, H, turn);
  const VW = view.w;
  const VH = view.h;
  const crop = clampCrop(
    { x: Number(fields.x), y: Number(fields.y), w: Number(fields.w), h: Number(fields.h) },
    VW,
    VH,
  );
  const ok = pics.length > 0 && firstAsset?.kind === 'image' && Number.isFinite(rotation) && !busy;

  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
  };

  /** Image pixels under a pointer on the preview. */
  const pixelAt = (e: PointerEvent): { x: number; y: number } => {
    const r = preview.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));
    return {
      x: clamp(((e.clientX - r.left) / r.width) * VW, VW),
      y: clamp(((e.clientY - r.top) / r.height) * VH, VH),
    };
  };

  const apply = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const opts: CropOptions = { crop, size: view, level, rotation };
      const baked: Record<string, CroppedPicture> = {};
      // One encoding per asset and view; a picture already showing it keeps its pixels.
      const byKey = new Map<string, Promise<CroppedPicture>>();
      for (const o of pics) {
        const a = fig.assets[o.asset];
        if (a?.kind !== 'image') continue;
        const v = plannedView(o, a, opts);
        if (!v) continue;
        const kept = o.cropped !== undefined ? fig.assets[o.cropped] : undefined;
        const shown =
          (o.turn ?? 0) === v.turn &&
          o.crop?.x === v.crop.x &&
          o.crop.y === v.crop.y &&
          o.crop.w === v.crop.w &&
          o.crop.h === v.crop.h;
        if (shown && kept?.kind === 'image' && o.cropped !== undefined) {
          baked[o.id] = { hash: o.cropped, asset: kept };
          continue;
        }
        const key = JSON.stringify([o.asset, v]);
        let p = byKey.get(key);
        if (!p) {
          p = bakeView(a, v);
          byKey.set(key, p);
        }
        baked[o.id] = await p;
      }
      const done = store.edit(
        cropImages(
          currentPage(store.getState()).id,
          pics.map((o) => o.id),
          { ...opts, baked },
        ),
        { keepSelection: true },
      );
      if (done) analytics.track('image', level && turn !== 0 ? 'crop-level' : 'crop');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const n = pics.length;
  return (
    <Dialog title="Crop and rotate" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        {firstAsset?.kind === 'image' && (
          <svg
            ref={preview}
            className="crop-preview"
            viewBox={`0 0 ${String(VW)} ${String(VH)}`}
            role="img"
            aria-label={`Crop of the ${String(VW)} × ${String(VH)} pixel picture${turn === 0 ? '' : ', turned'}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = pixelAt(e);
            }}
            onPointerMove={(e) => {
              const a = drag.current;
              if (!a) return;
              const b = pixelAt(e);
              set({
                x: String(Math.min(a.x, b.x)),
                y: String(Math.min(a.y, b.y)),
                w: String(Math.max(1, Math.abs(b.x - a.x))),
                h: String(Math.max(1, Math.abs(b.y - a.y))),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            <image
              href={`data:${firstAsset.mime};base64,${firstAsset.dataBase64}`}
              width={W}
              height={H}
              preserveAspectRatio="none"
              {...(turn === 0
                ? {}
                : {
                    transform: `translate(${String(VW / 2)} ${String(VH / 2)}) rotate(${String(turn)}) translate(${String(-W / 2)} ${String(-H / 2)})`,
                  })}
            />
            <path
              d={`M0 0H${String(VW)}V${String(VH)}H0Z M${String(crop.x)} ${String(crop.y)}v${String(crop.h)}h${String(crop.w)}v${String(-crop.h)}Z`}
              fill="rgb(0 0 0 / 55%)"
              fillRule="evenodd"
            />
            <rect
              x={crop.x}
              y={crop.y}
              width={crop.w}
              height={crop.h}
              fill="none"
              stroke="#fff"
              strokeWidth={Math.max(VW, VH) / 300}
            />
          </svg>
        )}
        <fieldset>
          <legend>Crop (pixels)</legend>
          <div className="row">
            <label htmlFor="crop-x">Left</label>
            <input
              id="crop-x"
              type="number"
              min={0}
              max={VW - 1}
              value={fields.x}
              onChange={(e) => {
                set({ x: e.target.value });
              }}
            />
            <label htmlFor="crop-y">Top</label>
            <input
              id="crop-y"
              type="number"
              min={0}
              max={VH - 1}
              value={fields.y}
              onChange={(e) => {
                set({ y: e.target.value });
              }}
            />
          </div>
          <div className="row">
            <label htmlFor="crop-w">Width</label>
            <input
              id="crop-w"
              type="number"
              min={1}
              max={VW}
              value={fields.w}
              onChange={(e) => {
                set({ w: e.target.value });
              }}
            />
            <label htmlFor="crop-h">Height</label>
            <input
              id="crop-h"
              type="number"
              min={1}
              max={VH}
              value={fields.h}
              onChange={(e) => {
                set({ h: e.target.value });
              }}
            />
          </div>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                set({ x: '0', y: '0', w: String(VW), h: String(VH) });
              }}
            >
              Whole picture
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Rotation</legend>
          <div className="row">
            <label htmlFor="crop-rotation">Angle (°)</label>
            <input
              id="crop-rotation"
              type="number"
              step={1}
              value={fields.rotation}
              onChange={(e) => {
                set({ rotation: e.target.value });
              }}
            />
          </div>
          <div className="row">
            <input
              id="crop-level"
              type="checkbox"
              checked={level}
              onChange={(e) => {
                const on = e.target.checked;
                setLevel(on);
                // The crop is in other pixels now: start from the whole of them.
                const t = on && Number.isFinite(rotation) ? normAngle(sign * rotation) : 0;
                const v = turnedSize(W, H, t);
                set({ x: '0', y: '0', w: String(v.w), h: String(v.h) });
              }}
            />
            <label htmlFor="crop-level">Crop level on the page (resample the turned picture)</label>
          </div>
        </fieldset>
        <p className="note" role="status">
          {n === 0
            ? 'Select PNG or JPEG pictures to crop.'
            : `${String(crop.w)} × ${String(crop.h)} of ${String(VW)} × ${String(VH)} pixels${
                turn === 0 ? '' : ' of the turned picture'
              }${
                n > 1
                  ? same
                    ? `, the same for all ${String(n)} pictures`
                    : `, the same part of each of the ${String(n)} pictures (they differ in size)`
                  : ''
              }. Scale bars grouped with a picture stay calibrated.`}
        </p>
        {error && (
          <p className="note notice-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!ok}>
            {busy ? 'Cropping…' : 'Apply'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
