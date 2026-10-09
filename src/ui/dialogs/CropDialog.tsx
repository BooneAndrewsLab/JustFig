/**
 * Crop and rotate (note 20, issue 46): the same pixel rectangle and angle for
 * every selected picture (the channels of one field). The fields are the
 * keyboard way in; dragging on the preview fills them in. The crop's pixels
 * are re-encoded first, then applied as one named edit.
 */
import { type PointerEvent, useRef, useState } from 'react';

import {
  type CroppedPicture,
  clampCrop,
  cropImages,
  cropTargets,
  fullCrop,
  isFullCrop,
  sharedSize,
} from '@/core/edits/crop';
import type { Rect4 } from '@/core/model/types';
import { cropPicture } from '@/io/cropImage';

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
  const size = sharedSize(pics, fig.assets);
  const first = pics[0];
  const firstAsset = first ? fig.assets[first.asset] : undefined;
  const [fields, setFields] = useState<Fields>(() =>
    fieldsOf(first?.crop ?? fullCrop(size?.w ?? 1, size?.h ?? 1), first?.frame.rotation ?? 0),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const preview = useRef<SVGSVGElement>(null);

  const W = size?.w ?? 1;
  const H = size?.h ?? 1;
  const crop = clampCrop(
    { x: Number(fields.x), y: Number(fields.y), w: Number(fields.w), h: Number(fields.h) },
    W,
    H,
  );
  const rotation = Number(fields.rotation);
  const ok = pics.length > 0 && size !== null && Number.isFinite(rotation) && !busy;

  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
  };

  /** Image pixels under a pointer on the preview. */
  const pixelAt = (e: PointerEvent): { x: number; y: number } => {
    const r = preview.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));
    return {
      x: clamp(((e.clientX - r.left) / r.width) * W, W),
      y: clamp(((e.clientY - r.top) / r.height) * H, H),
    };
  };

  const apply = async () => {
    if (!ok) return;
    const whole = isFullCrop(crop, W, H);
    setBusy(true);
    setError(null);
    try {
      const baked: Record<string, CroppedPicture> = {};
      if (!whole) {
        // One encoding per asset; a picture already showing this crop keeps its pixels.
        const byAsset = new Map<string, Promise<CroppedPicture>>();
        for (const o of pics) {
          const a = fig.assets[o.asset];
          if (a?.kind !== 'image') continue;
          const kept = o.cropped !== undefined ? fig.assets[o.cropped] : undefined;
          const same =
            o.crop?.x === crop.x &&
            o.crop.y === crop.y &&
            o.crop.w === crop.w &&
            o.crop.h === crop.h;
          if (same && kept?.kind === 'image' && o.cropped !== undefined) {
            baked[o.id] = { hash: o.cropped, asset: kept };
            continue;
          }
          let p = byAsset.get(o.asset);
          if (!p) {
            p = cropPicture(a, crop);
            byAsset.set(o.asset, p);
          }
          baked[o.id] = await p;
        }
      }
      const done = store.edit(
        cropImages(
          currentPage(store.getState()).id,
          pics.map((o) => o.id),
          { crop: whole ? null : crop, baked, rotation },
        ),
        { keepSelection: true },
      );
      if (done) analytics.track('image', 'crop');
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
        {size && firstAsset?.kind === 'image' && (
          <svg
            ref={preview}
            className="crop-preview"
            viewBox={`0 0 ${String(W)} ${String(H)}`}
            role="img"
            aria-label={`Crop of the ${String(W)} × ${String(H)} pixel picture`}
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
            />
            <path
              d={`M0 0H${String(W)}V${String(H)}H0Z M${String(crop.x)} ${String(crop.y)}v${String(crop.h)}h${String(crop.w)}v${String(-crop.h)}Z`}
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
              strokeWidth={Math.max(W, H) / 300}
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
              max={W - 1}
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
              max={H - 1}
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
              max={W}
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
              max={H}
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
                set({ x: '0', y: '0', w: String(W), h: String(H) });
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
        </fieldset>
        <p className="note" role="status">
          {n === 0
            ? 'Select PNG or JPEG pictures to crop.'
            : size === null
              ? 'The pictures differ in size in pixels: crop them one at a time.'
              : `${String(crop.w)} × ${String(crop.h)} of ${String(W)} × ${String(H)} pixels${
                  n > 1 ? `, the same for all ${String(n)} pictures` : ''
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
