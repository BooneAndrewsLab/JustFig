/**
 * Split channels (note 45, issue 67): the baked pixels of one panel of the row, a single
 * channel of a merge shown grey or tinted in its colour on black, then the merge's levels and
 * crop as for the merge itself (note 21: merge, levels, crop). Async; the edit is pure.
 */
import type { BakedMerge, SplitPart } from '@/core/edits/channels';
import type { Assets, Channel, Image } from '@/core/model/types';

import { type Intensities, bakeMerge, channelIntensities } from './channels';
import { bakeView } from './cropImage';
import { bakeLevels } from './levels';

/** The parts of a split of `pic` (a merge): the pixels of each channel turned on. */
export async function bakeSplit(
  pic: Image,
  channels: readonly { channel: Channel; name: string }[],
  assets: Assets,
  tinted: boolean,
): Promise<SplitPart[]> {
  const whole = assets[pic.levels?.base ?? pic.asset];
  if (whole?.kind !== 'image') throw new Error('The merged picture is missing.');
  const { width, height } = whole.meta;
  const parts: SplitPart[] = [];
  for (const { channel, name } of channels) {
    const src = assets[channel.asset];
    if (src?.kind !== 'image') throw new Error('A channel picture is missing.');
    if (src.meta.width !== width || src.meta.height !== height)
      throw new Error('The channels differ in size from the merge.');
    const px: Intensities = await channelIntensities(src);
    const credit = src.meta.credit;
    const base = await bakeMerge(
      [{ ...channel, on: true, color: tinted ? channel.color : '#ffffff' }],
      () => px,
      { name, ...(credit === undefined ? {} : { credit }), width, height },
    );
    const shown = pic.levels ? await bakeLevels(base.asset, pic.levels) : base;
    const cropped = pic.crop
      ? await bakeView(shown.asset, { turn: pic.turn ?? 0, crop: pic.crop })
      : undefined;
    const baked: BakedMerge = {
      merge: shown,
      ...(shown === base ? {} : { unadjusted: base }),
      ...(cropped ? { cropped } : {}),
    };
    parts.push({ channel, name, baked });
  }
  return parts;
}
