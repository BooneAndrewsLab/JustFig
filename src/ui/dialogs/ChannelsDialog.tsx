/**
 * Merge channels (note 21, issue 45): pick a colour, a display range and
 * on/off for each channel, see the merge, then bake it (in the browser) and
 * apply one named edit. With several pictures selected it makes a new merged
 * picture beside them (optionally laying them out in a row); with one it sets
 * that picture's channels, so a merge can be recoloured later.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { CHANNEL_COLOURS, channelsOf, mergeChannels, setChannels } from '@/core/edits/channels';
import { type CroppedPicture, cropTargets, sharedSize } from '@/core/edits/crop';
import type { Channel } from '@/core/model/types';
import { bakeMerge, blendChannels, channelIntensities, downsample, layersOf } from '@/io/channels';
import type { Intensities } from '@/io/channels';
import { bakeView } from '@/io/cropImage';
import { bakeLevels } from '@/io/levels';

import { analytics } from '../analytics';
import { currentPage, figure, selectedObjects, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

const PREVIEW_SIDE = 320;

export function ChannelsDialog({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const fig = figure(s);
  const pics = cropTargets(selectedObjects(s), fig.assets);
  const size = sharedSize(pics, fig.assets);
  const merging = pics.length > 1;
  const first = pics[0];
  const [channels, setList] = useState<Channel[]>(() =>
    !merging && first?.channels ? [...first.channels] : channelsOf(pics),
  );
  const [row, setRow] = useState(true);
  const [pixels, setPixels] = useState<ReadonlyMap<string, Intensities> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const assets = fig.assets;

  // Decode each channel once.
  const hashes = channels.map((c) => c.asset).join(',');
  useEffect(() => {
    const run = { live: true };
    void (async () => {
      try {
        const out = new Map<string, Intensities>();
        for (const h of hashes.split(',')) {
          const a = assets[h];
          if (a?.kind !== 'image') throw new Error('A channel picture is missing.');
          out.set(h, await channelIntensities(a));
        }
        if (run.live) setPixels(out);
      } catch (e: unknown) {
        if (run.live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      run.live = false;
    };
  }, [hashes, assets]);

  const small = useMemo(
    () =>
      pixels
        ? new Map([...pixels].map(([h, p]) => [h, downsample(p, PREVIEW_SIDE)] as const))
        : null,
    [pixels],
  );

  useEffect(() => {
    const c = canvas.current;
    const any = small?.values().next().value;
    if (!c || !small || !any) return;
    const px = blendChannels(
      any.width,
      any.height,
      layersOf(channels, (h) => small.get(h)),
    );
    c.width = px.width;
    c.height = px.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(px.width, px.height);
    for (let i = 0, j = 0; i < px.width * px.height; i++, j += 3) {
      img.data[i * 4] = px.data[j] ?? 0;
      img.data[i * 4 + 1] = px.data[j + 1] ?? 0;
      img.data[i * 4 + 2] = px.data[j + 2] ?? 0;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [small, channels]);

  const set = (i: number, patch: Partial<Channel>) => {
    setList((l) => l.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  };

  const nameOf = (c: Channel) => {
    const a = assets[c.asset];
    return a && a.kind !== 'icon' ? a.meta.name : 'Channel';
  };

  const ok =
    first !== undefined && size !== null && pixels !== null && channels.length > 0 && !busy;

  const apply = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      // A credit typed on an earlier merge stays with it.
      const was = assets[first.levels?.base ?? first.asset];
      const credit =
        !merging && first.channels && was?.kind === 'image' ? was.meta.credit : undefined;
      const merge = await bakeMerge(channels, (h) => pixels.get(h), {
        name: channels.map(nameOf).join(' + '),
        ...(credit === undefined ? {} : { credit }),
        width: size.w,
        height: size.h,
      });
      // A picture with levels (note 27) keeps them: merge, then levels, then crop.
      const shown = !merging && first.levels ? await bakeLevels(merge.asset, first.levels) : merge;
      const cropped: CroppedPicture | undefined = first.crop
        ? await bakeView(shown.asset, { turn: first.turn ?? 0, crop: first.crop })
        : undefined;
      const baked = {
        merge: shown,
        ...(shown === merge ? {} : { unadjusted: merge }),
        ...(cropped ? { cropped } : {}),
      };
      const pageId = currentPage(store.getState()).id;
      const done = merging
        ? store.edit(
            mergeChannels(
              pageId,
              pics.map((o) => o.id),
              channels,
              baked,
              { row },
            ),
          )
        : store.edit(setChannels(pageId, first.id, channels, baked));
      if (done) analytics.track('image', merging ? 'merge' : 'channels');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const on = channels.filter((c) => c.on).length;
  return (
    <Dialog title={merging ? 'Merge channels' : 'Channels'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        <canvas
          ref={canvas}
          className="channels-preview"
          role="img"
          aria-label={`Preview of the merge of ${String(on)} ${on === 1 ? 'channel' : 'channels'}`}
        />
        {channels.map((c, i) => {
          const id = `channel-${String(i)}`;
          const preset = CHANNEL_COLOURS.find((p) => p.hex === c.color.toLowerCase());
          return (
            <fieldset key={c.asset}>
              <legend>{nameOf(c)}</legend>
              <div className="row">
                <input
                  id={`${id}-on`}
                  type="checkbox"
                  checked={c.on}
                  onChange={(e) => {
                    set(i, { on: e.target.checked });
                  }}
                />
                <label htmlFor={`${id}-on`}>Show</label>
                <label htmlFor={`${id}-colour`}>Colour</label>
                <select
                  id={`${id}-colour`}
                  value={preset?.hex ?? 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') set(i, { color: e.target.value });
                  }}
                >
                  {CHANNEL_COLOURS.map((p) => (
                    <option key={p.hex} value={p.hex}>
                      {p.name}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
                <input
                  type="color"
                  className="swatch"
                  aria-label={`Custom colour of ${nameOf(c)}`}
                  value={c.color}
                  onChange={(e) => {
                    set(i, { color: e.target.value });
                  }}
                />
              </div>
              <div className="row">
                <label htmlFor={`${id}-min`}>Black at</label>
                <input
                  id={`${id}-min`}
                  type="number"
                  min={0}
                  max={254}
                  value={c.min}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (Number.isFinite(v)) set(i, { min: Math.min(254, Math.max(0, v)) });
                  }}
                />
                <label htmlFor={`${id}-max`}>Full at</label>
                <input
                  id={`${id}-max`}
                  type="number"
                  min={1}
                  max={255}
                  value={c.max}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (Number.isFinite(v)) set(i, { max: Math.min(255, Math.max(1, v)) });
                  }}
                />
              </div>
            </fieldset>
          );
        })}
        {merging && (
          <div className="row">
            <input
              id="channels-row"
              type="checkbox"
              checked={row}
              onChange={(e) => {
                setRow(e.target.checked);
              }}
            />
            <label htmlFor="channels-row">Lay out the channels in a row, the merge last</label>
          </div>
        )}
        <p className="note" role="status">
          {first === undefined
            ? 'Select PNG or JPEG pictures to merge.'
            : size === null
              ? 'The pictures differ in size in pixels: merge the channels of one field.'
              : pixels === null && error === null
                ? 'Reading the channels…'
                : `${String(on)} of ${String(channels.length)} ${
                    channels.length === 1 ? 'channel' : 'channels'
                  } shown, ${String(size.w)} × ${String(size.h)} px${
                    merging ? '. The merge is a new picture beside them.' : '.'
                  }`}
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
            {busy ? 'Merging…' : merging ? 'Merge' : 'Apply'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
