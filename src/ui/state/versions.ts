/**
 * Saved versions of the open figure (note 23): a named copy of the whole
 * figure, kept in this browser beside it, to restore or compare later. Not
 * the procedural objects' fallback pictures (`src/procedural/snapshot.ts`).
 */
import { restoreVersion } from '@/core/edits/version';
import type { Figure } from '@/core/model/types';
import { readJfig, writeJfig } from '@/io/jfig';
import {
  type NamedSummary,
  StoreFullError,
  cleanName,
  getStorage,
  getVersionStore,
} from '@/io/storage';

import { analytics } from '../analytics';
import { APP, flushCurrent } from './session';
import { figure, store } from './store';

export const UNTITLED_VERSION = 'Untitled version';

/** A name to start from: today's date. */
export function suggestedVersionName(now = new Date()): string {
  return `Version of ${now.toLocaleDateString()}`;
}

/** Saves the open figure as a named version. False when nothing was saved. */
export async function saveVersion(name: string): Promise<boolean> {
  const clean = cleanName(name, UNTITLED_VERSION);
  try {
    // The figure itself must be kept too: its versions hang off its row.
    // The figure in front now, even if another tab comes forward while this is written (note 25).
    const s = store.getState();
    const f = figure(s);
    await flushCurrent();
    const storage = getStorage();
    if ((await storage.text(f.doc.id)) === null)
      await storage.save(f, APP, { downloaded: s.downloaded === f });
    await getVersionStore().add([{ name: clean, text: writeJfig(f, APP) }], { owner: f.doc.id });
  } catch (e: unknown) {
    store.notify(e instanceof StoreFullError ? e.message : 'Could not save the version.', 'error');
    return false;
  }
  store.notify(`Saved version “${clean}”.`);
  analytics.track('version', 'save');
  return true;
}

/** The open figure's saved versions, newest first. */
export async function listVersions(): Promise<NamedSummary[]> {
  return getVersionStore().list(figure(store.getState()).doc.id);
}

/** A saved version as a figure, or null when it is gone or this version of the app can't read it. */
export async function loadVersion(id: string): Promise<{ name: string; figure: Figure } | null> {
  const r = await getVersionStore().get(id);
  if (!r) return null;
  try {
    const { doc, assets } = readJfig(r.text);
    return { name: r.name, figure: { doc, assets } };
  } catch {
    return null;
  }
}

/**
 * Makes the open figure what the version was, as one undo step. Autosave is
 * flushed first, so the browser's copy holds what is replaced.
 */
export async function restoreSavedVersion(id: string): Promise<boolean> {
  // Into the tab it was asked for, whichever is in front once the version is read (note 25).
  const tab = store.getState().front;
  await flushCurrent();
  const v = await loadVersion(id);
  if (!v) {
    store.notify('That version can no longer be read (it may be from a newer version).', 'error');
    return false;
  }
  if (!store.edit(restoreVersion(v.name, v.figure), { tab })) return false;
  store.notify(`Restored “${v.name}”. Undo brings back what you had.`);
  analytics.track('version', 'restore');
  return true;
}

export async function renameVersion(id: string, name: string): Promise<void> {
  const clean = cleanName(name, '');
  if (clean) await getVersionStore().rename(id, clean);
}

export async function deleteVersion(id: string): Promise<void> {
  await getVersionStore().remove(id);
}
