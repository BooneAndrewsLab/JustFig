/**
 * Saved versions of a figure (note 23): restoring one is a single edit, so
 * Undo brings back what was there before.
 */
import { docObjects } from '../model/tree';
import type { Figure } from '../model/types';

import type { Edit } from './edits';

/**
 * Replaces the figure's pages, settings and assets with a saved version's. The
 * document id stays the open figure's, so autosave keeps writing the same row.
 */
export function restoreVersion(name: string, saved: Figure): Edit {
  return {
    label: `Restore version “${name}”`,
    select: [],
    apply: (f) => ({ doc: { ...saved.doc, id: f.doc.id }, assets: saved.assets }),
  };
}

/**
 * A `.jfig` file opened over the same figure, already open in a tab (note 25):
 * the tab takes the file's content as one step, so Undo brings back what it had.
 */
export function openOver(fileName: string, saved: Figure): Edit {
  return {
    label: `Open “${fileName}”`,
    select: [],
    apply: (f) => ({ doc: { ...saved.doc, id: f.doc.id }, assets: saved.assets }),
  };
}

/** Pages and objects (nested ones too) of a figure, for the comparison's summary line. */
export function figureCounts(f: Figure): { pages: number; objects: number } {
  return { pages: f.doc.pages.length, objects: [...docObjects(f.doc)].length };
}
