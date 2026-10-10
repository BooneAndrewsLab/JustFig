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
 * (or an identity), as they were. `baked.adjusted` is needed unless removing; an identity
 * that comes with one is kept as the levels (a 16-bit source, note 43).
 */
export function setLevels(
  pageId: Id,
  id: Id,
  levels: LevelsInput | null,
  baked: BakedLevels,
): Edit {
  // An identity with a baked picture is kept: the unadjusted source of a 16-bit picture
  // (note 43) is never shown, so its "reset" is a bake too.
  const remove = levels === null || (isIdentity(levels) && !baked.adjusted);
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

/** A picture's levels as a setting (the identity when it has none). */
export const levelsOf = (o: Image): LevelsInput =>
  o.levels
    ? { min: o.levels.min, max: o.levels.max, invert: o.levels.invert }
    : { min: 0, max: 255, invert: false };

/** Whether two pictures show the same levels (none counts as the identity). */
export const sameLevels = (a: Image, b: Image): boolean => {
  const [x, y] = [levelsOf(a), levelsOf(b)];
  return x.min === y.min && x.max === y.max && x.invert === y.invert;
};

/** One picture to bring to the shared levels, with its pixels baked beforehand. */
export interface LevelsTarget {
  readonly id: Id;
  readonly baked: BakedLevels;
}

/**
 * The pictures "Same levels" changes and the setting it copies (note 37): the first picture's
 * levels (the identity when it has none) for each other picture that differs. Give it the
 * pictures only (`cropTargets`); `null` when fewer than two are given or none differs.
 */
export function levelsToMatch(
  pics: readonly Image[],
): { levels: LevelsInput; targets: Image[] } | null {
  const [ref, ...rest] = pics;
  if (!ref) return null;
  const targets = rest.filter((o) => !sameLevels(o, ref));
  return targets.length === 0 ? null : { levels: levelsOf(ref), targets };
}

/**
 * "Same levels": gives each target picture the levels (and inversion) `levels`, each baked
 * from its own unadjusted pixels. One undo step. An identity setting resets the targets.
 */
export function matchLevels(
  pageId: Id,
  levels: LevelsInput,
  targets: readonly LevelsTarget[],
  label = 'Same levels',
): Edit {
  const edits = targets.map((t) => setLevels(pageId, t.id, levels, t.baked));
  return {
    label,
    apply: (f) => edits.reduce((acc, e) => e.apply(acc), f),
  };
}
