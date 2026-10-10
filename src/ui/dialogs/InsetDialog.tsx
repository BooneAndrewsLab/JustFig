/**
 * Make inset (note 44, issue 66): pick a region of the selected picture, by
 * dragging on the preview or typing it in pixels (the keyboard way), and a
 * magnification. The region's pixels are baked first (as a crop, note 20),
 * then one named edit places the inset beside the picture with an outline
 * box and two connector lines, which `reconcileBindings` keeps laid out.
 */
import { type PointerEvent, useRef, useState } from 'react';

import { addInset, canInset, plannedInset } from '@/core/edits/inset';
import { clampCrop, currentView } from '@/core/geometry/view';
import { DEFAULT_MAGNIFICATION } from '@/core/model/inset';
import type { Rect4 } from '@/core/model/types';
import { bakeView } from '@/io/cropImage';

import { analytics } from '../analytics';
import { currentPage, figure, selectedObjects, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

type Fields = Record<'x' | 'y' | 'w' | 'h' | 'mag', string>;

export function InsetDialog({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const fig = figure(s);
  const source = selectedObjects(s).find((o) => canInset(o, fig));
  const asset = source ? fig.assets[source.asset] : undefined;
  const size = asset?.kind === 'image' ? { w: asset.meta.width, h: asset.meta.height } : null;
  const view =
    source && size ? currentView(source, { meta: { width: size.w, height: size.h } }) : null;
  /** What the picture shows now, in its pixels: the region is typed in these. */
  const VW = view?.crop.w ?? 1;
  const VH = view?.crop.h ?? 1;
  const shown =
    source?.crop && source.cropped !== undefined ? fig.assets[source.cropped] : undefined;
  const preview = shown?.kind === 'image' && view ? shown : view?.turn === 0 ? asset : undefined;
  const [fields, setFields] = useState<Fields>(() => {
    const w = Math.max(1, Math.round(VW / 4));
    const h = Math.max(1, Math.round(VH / 4));
    return {
      x: String(Math.round((VW - w) / 2)),
      y: String(Math.round((VH - h) / 2)),
      w: String(w),
      h: String(h),
      mag: String(DEFAULT_MAGNIFICATION),
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const region: Rect4 = clampCrop(
    { x: Number(fields.x), y: Number(fields.y), w: Number(fields.w), h: Number(fields.h) },
    VW,
    VH,
  );
  const mag = Number(fields.mag);
  const ok = source !== undefined && asset?.kind === 'image' && mag > 0 && !busy;
  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
  };

  /** Picture pixels under a pointer on the preview. */
  const pixelAt = (e: PointerEvent): { x: number; y: number } => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));
    return {
      x: clamp(((e.clientX - r.left) / r.width) * VW, VW),
      y: clamp(((e.clientY - r.top) / r.height) * VH, VH),
    };
  };

  const apply = async () => {
    if (!ok || !size) return;
    setBusy(true);
    setError(null);
    try {
      const baked = await bakeView(asset, plannedInset(source, size, region));
      const done = store.edit(
        addInset(currentPage(store.getState()).id, source.id, {
          region,
          baked,
          magnification: mag,
        }),
      );
      if (done) analytics.track('image', 'inset');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Make inset" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        {preview?.kind === 'image' && (
          <svg
            ref={svg}
            className="crop-preview"
            viewBox={`0 0 ${String(VW)} ${String(VH)}`}
            role="img"
            aria-label={`Region of the ${String(VW)} × ${String(VH)} pixel picture to magnify`}
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
              href={`data:${preview.mime};base64,${preview.dataBase64}`}
              width={VW}
              height={VH}
              preserveAspectRatio="none"
            />
            <rect
              x={region.x}
              y={region.y}
              width={region.w}
              height={region.h}
              fill="none"
              stroke="#f2b600"
              strokeWidth={Math.max(VW, VH) / 200}
            />
          </svg>
        )}
        <fieldset>
          <legend>Region (pixels)</legend>
          <div className="row">
            <label htmlFor="inset-x">Left</label>
            <input
              id="inset-x"
              type="number"
              min={0}
              max={VW - 1}
              value={fields.x}
              onChange={(e) => {
                set({ x: e.target.value });
              }}
            />
            <label htmlFor="inset-y">Top</label>
            <input
              id="inset-y"
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
            <label htmlFor="inset-w">Width</label>
            <input
              id="inset-w"
              type="number"
              min={1}
              max={VW}
              value={fields.w}
              onChange={(e) => {
                set({ w: e.target.value });
              }}
            />
            <label htmlFor="inset-h">Height</label>
            <input
              id="inset-h"
              type="number"
              min={1}
              max={VH}
              value={fields.h}
              onChange={(e) => {
                set({ h: e.target.value });
              }}
            />
          </div>
        </fieldset>
        <div className="row">
          <label htmlFor="inset-mag">Magnification (×)</label>
          <input
            id="inset-mag"
            type="number"
            min={0.1}
            step="any"
            value={fields.mag}
            onChange={(e) => {
              set({ mag: e.target.value });
            }}
          />
        </div>
        <p className="note" role="status">
          {source === undefined
            ? 'Select a PNG or JPEG picture to make an inset of.'
            : `${String(region.w)} × ${String(region.h)} of ${String(VW)} × ${String(VH)} pixels, shown ${String(mag > 0 ? mag : '?')}× larger beside the picture.`}
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
            {busy ? 'Making inset…' : 'Make inset'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
