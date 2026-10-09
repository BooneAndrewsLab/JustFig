/**
 * Levels and invert for one picture (note 27, issue 51). `Image.levels` is the
 * recipe and `Image.asset` the baked result of `levels.base`, so changing or
 * removing the levels never compounds. The pixels are baked beforehand
 * (`io/levels.ts`, asynchronous) and handed in, so the edit stays pure. A crop
 * (note 20) is of the adjusted picture, re-baked with it. One undo step; a
 * slider drag coalesces by the caller's key.
 */
import type { Id } from '../model/ids';
import { pageObjects } from '../model/tree';
import type { Asset, Image, Levels } from '../model/types';
import type { CroppedPicture } from './crop';
import { type Edit, EditError, updateObjects } from './edits';

/** The setting, without the base. */
export type LevelsInput = Pick<Levels, 'min' | 'max' | 'invert'>;

/** Nothing to change: the whole range, not inverted. */
export const isIdentity = (l: LevelsInput): boolean => l.min <= 0 && l.max >= 255 && !l.invert;

/** What the edit needs baked: the adjusted picture, and its crop when cropped. */
export interface BakedLevels {
  readonly adjusted?: CroppedPicture;
  readonly cropped?: CroppedPicture;
}

/**
 * "Levels": shows the picture's unadjusted pixels through `levels`, or, `null`
 * (or an identity), as they were. `baked.adjusted` is needed unless removing.
 */
export function setLevels(
  pageId: Id,
  id: Id,
  levels: LevelsInput | null,
  baked: BakedLevels,
): Edit {
  const remove = levels === null || isIdentity(levels);
  const update = updateObjects(pageId, [id], remove ? 'Reset levels' : 'Set levels', (o) => {
    if (o.type !== 'image') return o;
    const base = o.levels?.base ?? o.asset;
    const { levels: _l, cropped: _c, ...rest } = o;
    let next: Image;
    if (remove || !baked.adjusted) {
      if (!remove) throw new EditError('The adjusted picture is missing.');
      next = { ...rest, asset: base };
    } else {
      next = {
        ...rest,
        asset: baked.adjusted.hash,
        levels: { min: levels.min, max: levels.max, invert: levels.invert, base },
      };
    }
    if (o.crop) {
      if (!baked.cropped) throw new EditError('The cropped picture is missing.');
      next = { ...next, cropped: baked.cropped.hash };
    }
    return next;
  });
  return {
    label: update.label,
    select: [id],
    apply: (f) => {
      const page = f.doc.pages.find((p) => p.id === pageId);
      if (!page) throw new EditError('That page no longer exists.');
      let found = false;
      for (const o of pageObjects(page)) if (o.id === id && o.type === 'image') found = true;
      if (!found) throw new EditError('That picture no longer exists.');
      const assets: Record<string, Asset> = { ...f.assets };
      for (const b of [baked.adjusted, baked.cropped]) if (b) assets[b.hash] = b.asset;
      return update.apply({ ...f, assets });
    },
  };
}
