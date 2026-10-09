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
import { type Id, newId } from '../model/ids';
import { locate, pageObjects } from '../model/tree';
import type { Asset, AssetHash, Channel, Frame, Image, Obj, Page } from '../model/types';
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
    else add({ asset: o.asset, color: channelColour(out.length), on: true, min: 0, max: 255 });
  }
  return out;
}

/** The merge's pixels, and its crop's when the picture is cropped. */
export interface BakedMerge {
  readonly merge: CroppedPicture;
  readonly cropped?: CroppedPicture;
}

const assetsOf = (b: BakedMerge): Record<AssetHash, Asset> => ({
  [b.merge.hash]: b.merge.asset,
  ...(b.cropped ? { [b.cropped.hash]: b.cropped.asset } : {}),
});

/** `o` showing the merge `b` of `channels`, keeping its crop (re-baked). */
function merged(o: Image, channels: readonly Channel[], b: BakedMerge): Image {
  if (channels.length === 0) throw new EditError('A merge needs at least one channel.');
  const { cropped: _c, ...rest } = o;
  if (o.crop && !b.cropped) throw new EditError('The cropped merge is missing.');
  return {
    ...rest,
    asset: b.merge.hash,
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

      const { crop: _crop, cropped: _cropped, channels: _ch, name: _n, ...base } = first;
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
