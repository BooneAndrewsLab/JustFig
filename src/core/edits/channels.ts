/**
 * Merged channels (note 21, issue 45): a picture whose `channels` list the
 * single-channel pictures it is the pseudocoloured merge of. `asset` is the
 * merge, baked beforehand (`io/channels.ts`, asynchronous) and handed in, so
 * these edits stay pure; a crop (note 20) applies to the merge as to any
 * picture, its crop re-baked with it.
 *
 * `mergeChannels` makes a new merged picture from selected channels, beside
 * them (optionally laying them out in a row first); `setChannels` recolours,
 * re-ranges or turns channels of a picture on and off, or pseudocolours one
 * plain picture. Each is one undo step.
 */
import { boundsOf, refit, translateObj } from '../geometry/transform';
import { cloneObjects } from '../model/clone';
import { createText, defaultRun } from '../model/factory';
import { type Id, newId } from '../model/ids';
import { locate, pageObjects } from '../model/tree';
import type {
  Asset,
  AssetHash,
  Assets,
  Channel,
  Frame,
  Image,
  Obj,
  Page,
  Run,
  Text,
} from '../model/types';
import { fitText } from '../text/layout';
import type { CroppedPicture } from './crop';
import { type Edit, EditError, addObjects, updateObjects } from './edits';

/** Colour-blind-safe first (green, magenta), then the usual others. */
export const CHANNEL_COLOURS: readonly { readonly name: string; readonly hex: string }[] = [
  { name: 'Green', hex: '#00ff00' },
  { name: 'Magenta', hex: '#ff00ff' },
  { name: 'Cyan', hex: '#00ffff' },
  { name: 'Yellow', hex: '#ffff00' },
  { name: 'Red', hex: '#ff0000' },
  { name: 'Blue', hex: '#0000ff' },
  { name: 'Grey', hex: '#ffffff' },
];

/** The default colour of the `i`th channel. */
export const channelColour = (i: number): string =>
  CHANNEL_COLOURS[i % CHANNEL_COLOURS.length]?.hex ?? '#ffffff';

/** The space between pictures laid out in a row: 2 mm, in points. */
export const ROW_GAP = (2 / 25.4) * 72;

/**
 * The channels a set of pictures gives a merge, in order: a merged
 * picture's own channels, else the picture itself in the next default
 * colour, full range. Each channel picture once.
 */
export function channelsOf(pics: readonly Image[]): Channel[] {
  const out: Channel[] = [];
  const seen = new Set<AssetHash>();
  const add = (c: Channel) => {
    if (seen.has(c.asset)) return;
    seen.add(c.asset);
    out.push(c);
  };
  for (const o of pics) {
    if (o.channels) o.channels.forEach(add);
    else
      add({
        asset: o.levels?.base ?? o.asset,
        color: channelColour(out.length),
        on: true,
        min: 0,
        max: 255,
      });
  }
  return out;
}

/** The merge's pixels, and its crop's when the picture is cropped. */
export interface BakedMerge {
  readonly merge: CroppedPicture;
  readonly cropped?: CroppedPicture;
  /**
   * The merge before the picture's levels (note 27), which `merge` is then the
   * adjusted form of: needed for a picture that has levels, else absent.
   */
  readonly unadjusted?: CroppedPicture;
}

const assetsOf = (b: BakedMerge): Record<AssetHash, Asset> => ({
  [b.merge.hash]: b.merge.asset,
  ...(b.cropped ? { [b.cropped.hash]: b.cropped.asset } : {}),
  ...(b.unadjusted ? { [b.unadjusted.hash]: b.unadjusted.asset } : {}),
});

/** `o` showing the merge `b` of `channels`, keeping its crop (re-baked). */
function merged(o: Image, channels: readonly Channel[], b: BakedMerge): Image {
  if (channels.length === 0) throw new EditError('A merge needs at least one channel.');
  const { cropped: _c, levels: _l, ...rest } = o;
  if (o.crop && !b.cropped) throw new EditError('The cropped merge is missing.');
  if (o.levels && !b.unadjusted) throw new EditError('The unadjusted merge is missing.');
  return {
    ...rest,
    asset: b.merge.hash,
    ...(o.levels && b.unadjusted ? { levels: { ...o.levels, base: b.unadjusted.hash } } : {}),
    ...(o.crop && b.cropped ? { cropped: b.cropped.hash } : {}),
    channels,
  };
}

/**
 * "Channels" on one picture: shows `channels` merged (`baked`). On a plain
 * picture its own asset is one of the channels, so it is kept. One undo step.
 */
export function setChannels(
  pageId: Id,
  id: Id,
  channels: readonly Channel[],
  baked: BakedMerge,
): Edit {
  const update = updateObjects(pageId, [id], 'Set channels', (o) =>
    o.type === 'image' ? merged(o, channels, baked) : o,
  );
  return {
    label: update.label,
    select: [id],
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      let found = false;
      for (const o of pageObjects(page)) if (o.id === id && o.type === 'image') found = true;
      if (!found) throw new EditError('That picture no longer exists.');
      return update.apply({ ...f, assets: { ...f.assets, ...assetsOf(baked) } });
    },
  };
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const unflipped = (f: Frame): Frame => {
  const { flipX: _x, flipY: _y, ...box } = f;
  return box;
};
const sameBox = (a: Frame, b: Frame): boolean =>
  near(a.x, b.x) &&
  near(a.y, b.y) &&
  near(a.w, b.w) &&
  near(a.h, b.h) &&
  near(a.rotation, b.rotation);

/** Objects over a picture's box in its group: a scale bar, gel labels (notes 18, 19). */
const overlays = (pic: Image, siblings: readonly Obj[]): Obj[] =>
  siblings.filter(
    (s) => s.type === 'procedural' && sameBox(unflipped(s.frame), unflipped(pic.frame)),
  );

/**
 * What moves with a picture: its group, when that holds only the picture and
 * what lies over it (what "Add scale bar" makes), else the picture alone.
 */
function unitOf(page: Page, pic: Image): { unit: Obj; over: Obj[] } {
  const parent = locate(page, pic.id)?.parents.at(-1);
  if (parent?.type === 'group') {
    const over = overlays(pic, parent.children);
    if (over.length + 1 === parent.children.length) return { unit: parent, over };
  }
  return { unit: pic, over: [] };
}

export interface MergeOptions {
  /** Lay the channels out in a row, left to right in order, with the merge last. */
  readonly row: boolean;
}

/**
 * "Merge channels": a new picture, the merge (`baked`) of `channels`, the
 * size, angle and crop of the first source picture and with copies of what
 * lies over it (a scale bar stays calibrated: same pixels across the same
 * box). Placed right of the sources, or at the end of their row. One undo step.
 */
export function mergeChannels(
  pageId: Id,
  sourceIds: readonly Id[],
  channels: readonly Channel[],
  baked: BakedMerge,
  opts: MergeOptions,
): Edit {
  if (sourceIds.length === 0) throw new EditError('Select the channels to merge.');
  const unitId = newId('o');
  const imageId = newId('o');
  return {
    label: 'Merge channels',
    select: [unitId],
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      const pics: Image[] = [];
      for (const id of sourceIds) {
        const loc = locate(page, id);
        if (loc?.obj.type === 'image') pics.push(loc.obj);
      }
      const first = pics[0];
      if (!first) throw new EditError('Those pictures no longer exist.');
      const units: Obj[] = [];
      for (const p of pics) {
        const { unit } = unitOf(page, p);
        if (!units.some((u) => u.id === unit.id)) units.push(unit);
      }
      const head = unitOf(page, first);
      const firstBox = boundsOf([head.unit]);

      const {
        crop: _crop,
        cropped: _cropped,
        channels: _ch,
        levels: _lv,
        name: _n,
        ...base
      } = first;
      const pic: Image = merged(
        { ...base, ...(first.crop ? { crop: first.crop } : {}), id: imageId, name: 'Merge' },
        channels,
        baked,
      );
      let unit: Obj =
        head.over.length === 0
          ? { ...pic, id: unitId }
          : refit({
              id: unitId,
              type: 'group',
              frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
              opacity: 1,
              children: [pic, ...cloneObjects(head.over)],
            });

      // Where everything goes: a row from the first channel's place, or beside them all.
      const moves = new Map<Id, { dx: number; dy: number }>();
      let x: number;
      if (opts.row) {
        x = firstBox.x;
        for (const u of units) {
          const b = boundsOf([u]);
          moves.set(u.id, { dx: x - b.x, dy: firstBox.y - b.y });
          x += b.w + ROW_GAP;
        }
      } else {
        const all = boundsOf(units);
        x = all.x + all.w + ROW_GAP;
      }
      unit = translateObj(unit, x - firstBox.x, 0);

      const layerId = locate(page, head.unit.id)?.layer.id;
      const moved = updateObjects(pageId, [...moves.keys()], 'Merge channels', (o) => {
        const m = moves.get(o.id);
        return m ? translateObj(o, m.dx, m.dy) : o;
      }).apply(f);
      return addObjects(pageId, [unit], assetsOf(baked), layerId).apply(moved);
    },
  };
}

/** A channel's name for a label or the legend: its picture's name without the extension. */
export function channelName(assets: Assets, c: Channel): string {
  const a = assets[c.asset];
  return a?.kind === 'image' ? a.meta.name.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() : '';
}

/** The channels a split makes a picture of: those turned on, with their label names. */
export function splitChannelsOf(pic: Image, assets: Assets): { channel: Channel; name: string }[] {
  return (pic.channels ?? [])
    .filter((c) => c.on)
    .map((channel, i) => ({
      channel,
      name: channelName(assets, channel) || `Channel ${String(i + 1)}`,
    }));
}

/** One panel of a split: a channel and its baked pixels (`merge`: after levels, as `BakedMerge`). */
export interface SplitPart {
  readonly channel: Channel;
  readonly name: string;
  readonly baked: BakedMerge;
}

/** Label size and its inset from the panel's top-left corner, points (note 45). */
export const SPLIT_LABEL = { size: 9, inset: 3 } as const;

const labelText = (x: number, y: number, runs: readonly Run[]): Text =>
  fitText({ ...createText(x, y, [runs]), autoWidth: true });

/**
 * "Split channels" (note 45, issue 67): one picture per channel turned on, each the merge's
 * size, crop and levels (`parts[i].baked`, from the channel's own pixels, grey or tinted),
 * laid out left to right from the merge's place with the merge last, each with a label of
 * the channel's name in its colour, the merge's label all the names in theirs, and the whole
 * row one group. The pictures record each other in `splitSet`. A scale bar over the merge is
 * copied over every panel. One undo step.
 */
export function splitChannels(pageId: Id, id: Id, parts: readonly SplitPart[]): Edit {
  if (parts.length === 0) throw new EditError('Turn on a channel to split.');
  const rowId = newId('o');
  const ids = parts.map(() => newId('o'));
  const label = 'Split channels';
  return {
    label,
    select: [rowId],
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      const merge = locate(page, id)?.obj;
      if (merge?.type !== 'image' || !merge.channels)
        throw new EditError('Select a merged picture.');
      const head = unitOf(page, merge);
      const box = boundsOf([head.unit]);
      const set: Id[] = [...ids, merge.id];

      const { channels: _ch, cropped: _c, levels: _l, name: _n, splitSet: _s, ...base } = merge;
      const units: Obj[] = [];
      const labels: Text[] = [];
      const assets: Record<AssetHash, Asset> = {};
      let x = box.x;
      const place = (unit: Obj, runs: readonly Run[]) => {
        const b = boundsOf([unit]);
        const moved = translateObj(unit, x - b.x, box.y - b.y);
        units.push(moved);
        labels.push(labelText(x + SPLIT_LABEL.inset, box.y + SPLIT_LABEL.inset, runs));
        x += b.w + ROW_GAP;
      };
      const style = (text: string, hex: string): Run =>
        defaultRun(text, { size: SPLIT_LABEL.size, bold: true, color: { hex } });

      parts.forEach((part, i) => {
        const b = part.baked;
        if (merge.levels && !b.unadjusted)
          throw new EditError('The unadjusted picture is missing.');
        if (merge.crop && !b.cropped) throw new EditError('The cropped picture is missing.');
        Object.assign(assets, assetsOf(b));
        const pic: Image = {
          ...base,
          id: ids[i] ?? newId('o'),
          name: part.name,
          asset: b.merge.hash,
          ...(merge.levels && b.unadjusted
            ? { levels: { ...merge.levels, base: b.unadjusted.hash } }
            : {}),
          ...(merge.crop && b.cropped ? { cropped: b.cropped.hash } : {}),
          splitSet: set,
        };
        const unit: Obj =
          head.over.length === 0
            ? pic
            : refit({
                id: newId('o'),
                type: 'group',
                frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
                opacity: 1,
                children: [pic, ...cloneObjects(head.over)],
              });
        place(unit, [style(part.name, part.channel.color)]);
      });

      // The merge last: its own picture (and what lies over it), tagged with the set.
      const tagged = (o: Obj): Obj =>
        o.id === merge.id && o.type === 'image'
          ? { ...o, name: o.name ?? 'Merge', splitSet: set }
          : o;
      const mergeUnit: Obj =
        head.unit.type === 'group'
          ? { ...head.unit, children: head.unit.children.map(tagged) }
          : tagged(head.unit);
      const runs: Run[] = [];
      parts.forEach((part, i) => {
        if (i > 0) runs.push(style(' + ', '#ffffff'));
        runs.push(style(part.name, part.channel.color));
      });
      place(mergeUnit, runs);

      const row = refit({
        id: rowId,
        type: 'group',
        name: 'Split channels',
        frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
        opacity: 1,
        children: [...units, ...labels],
      });
      const replaced = updateObjects(pageId, [head.unit.id], label, () => row).apply(f);
      return { ...replaced, assets: { ...replaced.assets, ...assets } };
    },
  };
}

/**
 * The pictures of the split row `pic` belongs to that are still on the page (itself first, then
 * the rest in the order recorded), unlocked; just `pic` when it has no set or the rest are gone.
 */
export function splitSetOf(page: Page, pic: Image): Image[] {
  const out: Image[] = [pic];
  for (const id of pic.splitSet ?? []) {
    if (id === pic.id) continue;
    const o = locate(page, id)?.obj;
    if (o?.type === 'image' && o.locked !== true) out.push(o);
  }
  return out;
}

/** `pics` and the rest of each one's split row (note 45), each picture once, in order. */
export function withSplitSets(page: Page, pics: readonly Image[]): Image[] {
  const out: Image[] = [];
  const seen = new Set<Id>();
  for (const p of pics)
    for (const o of splitSetOf(page, p))
      if (!seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
  return out;
}
