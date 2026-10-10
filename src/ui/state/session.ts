/**
 * What the menus and shortcuts do with files, the clipboard, icons and
 * exports: everything that reaches outside the store. Saving writes back to
 * a kept file handle where the browser allows (note 38), else downloads;
 * autosave keeps a copy in IndexedDB.
 */
import { BRAND } from '@/brand';
import {
  type Spacing,
  addObjects,
  allIds,
  deleteObjects,
  spaceObjects,
  spacingBetween,
  swapPositions,
  updateDoc,
} from '@/core/edits/edits';
import { placeImport } from '@/core/edits/placeImport';
import { openOver } from '@/core/edits/version';
import { boundsOf } from '@/core/geometry/transform';
import { cloneObjects } from '@/core/model/clone';
import { createDoc, createText, defaultRun, frame } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import { objectAssets } from '@/core/model/tree';
import type { Assets, Figure, Obj, Swatch } from '@/core/model/types';
import { fitText } from '@/core/text/layout';
import { exportPanelsZip } from '@/export/panels';
import { exportPdf } from '@/export/pdf';
import { exportPng, exportTiff } from '@/export/raster';
import { exportSvg } from '@/export/svg';
import type { IconEntry } from '@/icons/manifest';
import { HttpIconLibrary, type IconLibrary } from '@/icons/library';
import { isBarelySigSvg, readBarelySigSvg } from '@/io/barelysig';
import { importFile } from '@/io/import';
import {
  type Fragment,
  JfigError,
  readFragment,
  readJfig,
  writeFragment,
  writeJfig,
} from '@/io/jfig';
import { drawnBoundsIn } from '@/procedural/bounds';
import { convertObjects, createProcedural } from '@/procedural/edits';
import { getKind } from '@/procedural/registry';
import { figureWithSnapshots, withSnapshots } from '@/procedural/snapshot';
import {
  MAX_PRESETS_FILE_CHARS,
  type Preset,
  PRESETS_EXT,
  UNTITLED_PRESET,
  readPresetText,
  readPresetsFile,
  writePresetText,
  writePresetsFile,
} from '@/io/presets';
import {
  type FigureSummary,
  StoreFullError,
  requestPersistence,
  cleanName,
  getPresetStore,
  getHandles,
  getStorage,
} from '@/io/storage';
import {
  type FileHandleLike,
  type FsHost,
  type PickerType,
  canOpenWithPicker,
  canSaveInPlace,
  ensureWritable,
  isHandleLost,
  pickOpenHandle,
  pickSaveHandle,
  writeToHandle,
} from '@/io/fileHandles';
import { bakedSwatches } from '@/palette/recolor';

import { analytics } from '../analytics';
import { Autosaver } from './autosave';
import { keptTabs, rememberTabs, rememberedTabs, reopenTabs } from './openTabs';
import { choosePdfPage } from './pdfPagePicker';
import { currentPage, figure, selectedObjects, store } from './store';
import { renderThumbnail } from './thumbnail';

export const APP = { name: BRAND.name, version: __APP_VERSION__ };

let library: IconLibrary | null = null;
export function getLibrary(): IconLibrary {
  library ??= new HttpIconLibrary(`${import.meta.env.BASE_URL}${BRAND.iconLibraryPath}`);
  return library;
}

export function download(bytes: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

export const safeName = (title: string): string =>
  title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .slice(0, 80) || 'figure';

let saver: Autosaver | null = null;

/** Restores the open figures from the browser and starts autosaving. */
export async function startSession(): Promise<void> {
  const storage = getStorage();
  try {
    const kept = await Promise.race([
      keptTabs(storage, rememberedTabs()),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 1500);
      }),
    ]);
    if (kept) {
      reopenTabs(store, kept);
      void loadHandles(store.getState().tabs.map((t) => figure(t).doc.id));
    }
  } catch {
    // A wedged IndexedDB must not block the app.
  }
  saver = new Autosaver(store, storage, APP, undefined, renderThumbnail, {
    unsaved: (ids) => {
      store.setUnsaved(ids);
    },
    firstSave: () => {
      void requestPersistence();
    },
  });
  rememberTabs(store);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saver?.flush();
  });
}

/**
 * Writes every changed figure to the browser now: anything that closes a tab
 * or replaces its figure goes through here first. The pending figures are
 * taken at once, so the store may drop them before the write finishes.
 */
export async function flushCurrent(): Promise<void> {
  await saver?.flush();
}

/** Downloads the open figure with this document id as a `.jfig`, for the unsaved banner (note 02). */
export function downloadCopy(id: string): void {
  const tab = store.getState().tabs.find((t) => figure(t).doc.id === id);
  if (!tab) return;
  const f = figure(tab);
  download(
    writeJfig(figureWithSnapshots(f), APP),
    `${safeName(f.doc.title)}${BRAND.fileExt}`,
    BRAND.mime,
  );
  store.markDownloaded(tab.key);
  analytics.track('file', 'download');
}

/** A new empty figure in a tab of its own (an untouched one is reused). */
export function newFigure(): void {
  void flushCurrent();
  store.open({ doc: createDoc(), assets: {} }, { fresh: true });
}

/** A new figure from a gallery entry (note 08), in a tab of its own. */
export function openGallery(e: { build: () => Figure }): void {
  void flushCurrent();
  store.open(e.build());
}

/** Closes a tab; its figure is written to the browser first and stays in Recent figures. */
export function closeTab(key: string): void {
  const t = store.getState().tabs.find((x) => x.key === key);
  if (!t) return;
  void flushCurrent();
  store.close(key);
  analytics.trackOnce('tabs', 'close');
}

/** Ids of the figures open in tabs. */
export const openIds = (): ReadonlySet<string> =>
  new Set<string>(store.getState().tabs.map((t) => figure(t).doc.id));

// --- Presets (note 22) -------------------------------------------------------------

export interface KeptPreset extends Preset {
  readonly id: string;
  readonly updatedAt: number;
}

/** Saves the selection as a named preset in this browser. False when nothing was saved. */
export async function savePreset(name: string): Promise<boolean> {
  const s = store.getState();
  const objs = selectedObjects(s);
  if (objs.length === 0) return false;
  const fig = figure(s);
  // Swatch links are baked: another figure's palette does not have these swatches.
  const frag = selectionFragment(bakedSwatches(objs, fig.doc.palette), fig.assets, []);
  const clean = cleanName(name, UNTITLED_PRESET);
  try {
    await getPresetStore().add([{ name: clean, text: writePresetText(frag) }]);
  } catch (e: unknown) {
    store.notify(e instanceof StoreFullError ? e.message : 'Could not save the preset.', 'error');
    return false;
  }
  store.notify(`Saved preset “${clean}”. Find it in Templates… under My presets.`);
  analytics.track('preset', 'save');
  return true;
}

/** Every saved preset this version can read, newest first. */
export async function listPresets(): Promise<KeptPreset[]> {
  const rows = await getPresetStore().all();
  return rows.flatMap((r) => {
    try {
      return [{ id: r.id, name: r.name, updatedAt: r.updatedAt, fragment: readPresetText(r.text) }];
    } catch {
      // A row this version can't read (newer app, or damaged) is left for the newer app.
      return [];
    }
  });
}

/** Adds a preset to the current page, centred in the view, as one undo step. */
export function placePreset(p: Preset): void {
  importFragment(p.fragment, { at: viewCenter() }, `Place ${p.name}`);
  analytics.track('preset', 'place');
}

export async function renamePreset(id: string, name: string): Promise<void> {
  const clean = cleanName(name, '');
  if (clean) await getPresetStore().rename(id, clean);
}

export async function deletePreset(id: string): Promise<void> {
  await getPresetStore().remove(id);
}

/** Downloads presets as one file to share, named after `name`. */
export function exportPresets(presets: readonly Preset[], name: string): void {
  if (presets.length === 0) return;
  download(writePresetsFile(presets, APP), `${safeName(name)}${PRESETS_EXT}`, BRAND.mime);
  analytics.track('preset', 'export');
}

/**
 * Adds the presets in a shared file to this browser's (all or none). One
 * already kept under the same name with the same content is skipped.
 * Returns how many were added, or null when the file was refused.
 */
export async function importPresets(file: File): Promise<number | null> {
  try {
    if (file.size > MAX_PRESETS_FILE_CHARS)
      throw new JfigError('This presets file is too large to import.');
    const incoming = readPresetsFile(await file.text());
    const kept = new Set((await getPresetStore().all()).map((r) => `${r.name}\n${r.text}`));
    const rows = incoming
      .map((p) => ({ name: p.name, text: writePresetText(p.fragment) }))
      .filter((r) => !kept.has(`${r.name}\n${r.text}`));
    await getPresetStore().add(rows);
    analytics.track('preset', 'import');
    const n = rows.length;
    store.notify(
      n === 0
        ? 'Those presets are already here.'
        : `Added ${String(n)} preset${n === 1 ? '' : 's'}.`,
    );
    return n;
  } catch (e: unknown) {
    store.notify(
      e instanceof JfigError || e instanceof StoreFullError
        ? e.message
        : 'Could not import that file.',
      'error',
    );
    return null;
  }
}

// --- Recent figures (note 02) -----------------------------------------------------

export async function listRecent(): Promise<FigureSummary[]> {
  await flushCurrent();
  return getStorage().list();
}

/** The id of the figure on the canvas. */
export const currentId = (): string => figure(store.getState()).doc.id;

/** Opens a kept figure: its tab comes forward if it is open, else it opens in a tab. */
export async function openRecent(id: string): Promise<boolean> {
  const open = store.tabOf(id);
  if (open !== undefined) {
    store.activate(open);
    return true;
  }
  await flushCurrent();
  const kept = await getStorage().load(id);
  if (!kept) {
    store.notify('That figure can no longer be opened (it may be from a newer version).', 'error');
    return false;
  }
  saver?.markSaved(kept);
  store.open(kept, { hasFile: kept.downloaded });
  analytics.track('file', 'open-recent');
  return true;
}

export async function renameRecent(id: string, title: string): Promise<void> {
  const name = title.trim();
  if (!name) return;
  const tab = store.tabOf(id);
  if (tab !== undefined) {
    // Open in a tab, front or not: the tab is renamed, and autosave writes it.
    store.edit(
      updateDoc('Rename figure', (d) => ({ ...d, title: name })),
      { coalesce: 'title', tab },
    );
    await flushCurrent();
  } else {
    await getStorage().rename(id, name, APP);
  }
}

export async function deleteRecent(id: string): Promise<void> {
  // A figure open in a tab is not deleted: autosave would only write it back.
  if (store.tabOf(id) !== undefined) return;
  await getStorage().remove(id);
  liveHandles.delete(id);
}

export async function downloadRecent(id: string): Promise<void> {
  const tab = store.getState().tabs.find((t) => figure(t).doc.id === id);
  if (tab) {
    await flushCurrent();
    const f = figure(tab);
    download(
      writeJfig(figureWithSnapshots(f), APP),
      `${safeName(f.doc.title)}${BRAND.fileExt}`,
      BRAND.mime,
    );
    store.markDownloaded(tab.key);
    analytics.track('file', 'download');
    return;
  }
  const kept = await getStorage().load(id);
  if (!kept) {
    store.notify('That figure can no longer be read.', 'error');
    return;
  }
  download(
    writeJfig(figureWithSnapshots(kept), APP),
    `${safeName(kept.doc.title)}${BRAND.fileExt}`,
    BRAND.mime,
  );
}

/** The same file content: compared as written (canonical key order, the assets kept). */
const sameFigure = (a: Figure, b: Figure): boolean =>
  writeJfig(figureWithSnapshots(a), APP) === writeJfig(figureWithSnapshots(b), APP);

export async function openFile(file: File, handle?: FileHandleLike): Promise<void> {
  try {
    if (!file.name.toLowerCase().endsWith(BRAND.fileExt) && file.type !== BRAND.mime) {
      await importToCanvas(file);
      return;
    }
    const text = await file.text();
    // A fragment (objects from a sibling app or a copy) is added to the page, not opened.
    const frag = readFragment(text);
    if (frag) {
      importFragment(frag, { at: viewCenter() });
      return;
    }
    const saved = readJfig(text);
    await flushCurrent();
    const open = store.tabOf(saved.doc.id);
    if (open !== undefined) {
      // The same figure is open: bring it forward, and take the file's content as one step.
      store.activate(open);
      if (!sameFigure(figure(store.getState()), saved)) {
        store.edit(openOver(file.name, saved));
        store.markDownloaded(open);
      }
    } else {
      store.open(saved, { hasFile: true });
    }
    if (handle) keepHandle(saved.doc.id, handle);
    analytics.track('file', 'open');
  } catch (e: unknown) {
    store.notify(e instanceof Error ? e.message : 'Could not open that file.', 'error');
  }
}

// --- save in place (note 38) ---------------------------------------------------------

const host = (): FsHost => window as unknown as FsHost;
const FILE_TYPES: readonly PickerType[] = [
  { description: 'Figure file', accept: { [BRAND.mime]: [BRAND.fileExt] } },
];

const liveHandles = new Map<string, FileHandleLike>();
const nameListeners = new Set<() => void>();

/** The file name a figure saves to, where one is known (a store for `useSyncExternalStore`). */
export const fileNames = {
  get: (id: string): string | undefined => liveHandles.get(id)?.name,
  subscribe: (cb: () => void): (() => void) => {
    nameListeners.add(cb);
    return () => nameListeners.delete(cb);
  },
  /** Changes whenever a handle is kept or dropped. */
  version: 0,
};

function keepHandle(id: string, handle: FileHandleLike | null): void {
  if (handle) liveHandles.set(id, handle);
  else liveHandles.delete(id);
  fileNames.version++;
  for (const cb of nameListeners) cb();
  const kept = getHandles();
  void (handle ? kept.put(id, handle) : kept.remove(id)).catch(() => undefined);
}

/** Loads the kept handles of the open figures, so their file names show after a reload. */
async function loadHandles(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try {
      const h = await getHandles().get(id);
      if (h && !liveHandles.has(id)) liveHandles.set(id, h);
    } catch {
      // No kept handle is not an error.
    }
  }
  fileNames.version++;
  for (const cb of nameListeners) cb();
}

/** The kept handle of a figure, when it may still be written (asks once after a reload). */
async function writableHandle(id: string): Promise<FileHandleLike | null> {
  let h = liveHandles.get(id) ?? null;
  if (!h) {
    try {
      h = await getHandles().get(id);
    } catch {
      return null;
    }
  }
  if (!h) return null;
  if (!(await ensureWritable(h))) return null;
  return h;
}

/**
 * Saves the open figure. Where the browser can write files, Save writes back
 * to the kept file (the first save, or `as`, asks where); elsewhere it
 * downloads, as it always did.
 */
export async function saveFile(opts: { as?: boolean } = {}): Promise<void> {
  const state = store.getState();
  const f = figure(state);
  const id = f.doc.id;
  const name = `${safeName(f.doc.title)}${BRAND.fileExt}`;
  const bytes = writeJfig(figureWithSnapshots(f), APP);
  const tab = state.tabs.find((t) => figure(t).doc.id === id);
  const present = tab?.history.present;
  const markClean = (): void => {
    // Only when nothing changed while the file was being written.
    const now = store.getState().tabs.find((t) => figure(t).doc.id === id);
    if (now && now.history.present === present) store.markDownloaded(now.key);
  };
  if (!canSaveInPlace(host())) {
    download(bytes, name, BRAND.mime);
    store.markDownloaded();
    analytics.track('file', 'download');
    return;
  }
  try {
    await flushCurrent();
    let handle = opts.as === true ? null : await writableHandle(id);
    if (handle) {
      try {
        await writeToHandle(handle, bytes);
        markClean();
        analytics.track('file', 'save-in-place');
        return;
      } catch (e) {
        if (!isHandleLost(e)) throw e;
        // The file or folder is gone, or access was refused: ask where to save instead.
        keepHandle(id, null);
        handle = null;
      }
    }
    const picked = await pickSaveHandle(host(), name, FILE_TYPES);
    if (!picked) return;
    await writeToHandle(picked, bytes);
    keepHandle(id, picked);
    markClean();
    analytics.track('file', opts.as === true ? 'save-as' : 'save-in-place');
  } catch (e: unknown) {
    store.notify(
      e instanceof Error ? `Could not save the file: ${e.message}` : 'Could not save the file.',
      'error',
    );
  }
}

export const saveFileAs = (): Promise<void> => saveFile({ as: true });

/** Open… : the file picker where there is one (it keeps the handle), else `fallback` (the file input). */
export function chooseFile(fallback: () => void): void {
  if (!canOpenWithPicker(host())) {
    fallback();
    return;
  }
  void (async () => {
    try {
      const handle = await pickOpenHandle(host(), FILE_TYPES);
      if (handle) await openFile(await handle.getFile(), handle);
    } catch (e: unknown) {
      store.notify(e instanceof Error ? e.message : 'Could not open that file.', 'error');
    }
  })();
}

/** Where new things go: the centre of the visible canvas, in page coordinates. */
export function viewCenter(): { x: number; y: number } {
  const s = store.getState();
  const el = document.querySelector('.canvas');
  const w = el?.clientWidth ?? 800;
  const h = el?.clientHeight ?? 600;
  return { x: (w / 2 - s.view.x) / s.view.zoom, y: (h / 2 - s.view.y) / s.view.zoom };
}

/** A BarelySig SVG with its data becomes an editable-in-BarelySig embedded object (note 05). */
async function importBarelySig(file: File, at: { x: number; y: number }): Promise<boolean> {
  if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') return false;
  const text = await file.text();
  if (!isBarelySigSvg(text)) return false;
  try {
    const imp = await readBarelySigSvg(text, file.name, at);
    store.edit({
      ...addObjects(currentPage(store.getState()).id, [imp.obj], imp.assets),
      label: 'Import BarelySig graph',
    });
    analytics.track('embedded', 'import', 'BarelySig');
    return true;
  } catch (e: unknown) {
    // Exported without its data: place it as an ordinary picture, and say so.
    store.notify(e instanceof Error ? e.message : 'Could not read the BarelySig data.', 'warning');
    return false;
  }
}

export async function importToCanvas(file: File, at?: { x: number; y: number }): Promise<void> {
  try {
    const c = at ?? viewCenter();
    if (await importBarelySig(file, c)) return;
    const imp = await importFile(file, { choosePdfPage: choosePdfPage(file.name) });
    if (!imp) return; // a page choice was cancelled
    store.edit(placeImport(currentPage(store.getState()).id, imp, c));
    analytics.track(
      'file',
      imp.asset.kind !== 'svgImport'
        ? 'import-image'
        : /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
          ? 'import-pdf'
          : 'import-svg',
    );
    if (imp.warnings.length > 0)
      store.notify(`Imported with changes: ${imp.warnings.join(' ')}`, 'warning');
  } catch (e: unknown) {
    store.notify(e instanceof Error ? e.message : 'Could not import that file.', 'error');
  }
}

export async function placeIcon(entry: IconEntry, at?: { x: number; y: number }): Promise<void> {
  try {
    const { hash, asset } = await getLibrary().asset(entry);
    const c = at ?? viewCenter();
    const [vw, vh] = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/
      .exec(asset.svg)
      ?.slice(1)
      .map(Number) ?? [100, 100];
    const size = 56;
    const k = size / Math.max(vw ?? 100, vh ?? 100);
    const w = (vw ?? 100) * k;
    const h = (vh ?? 100) * k;
    const [obj] = cloneObjects([
      {
        id: '' as Id,
        type: 'icon',
        name: entry.title,
        frame: frame(c.x - w / 2, c.y - h / 2, w, h),
        opacity: 1,
        asset: hash,
        slots: {},
        lockAspect: true,
      },
    ]);
    if (!obj) return;
    store.edit(addObjects(currentPage(store.getState()).id, [obj], { [hash]: asset }));
    analytics.track('icon', 'place');
  } catch (e: unknown) {
    store.notify(e instanceof Error ? e.message : 'Could not place that icon.', 'error');
  }
}

// --- procedural objects ------------------------------------------------------------

/** Places a new object of a procedural kind, centred on `at` (default: the view centre). */
export function placeProcedural(kind: string, at?: { x: number; y: number }): void {
  const k = getKind(kind);
  if (!k) return;
  const obj = createProcedural(k, at ?? viewCenter());
  store.edit({
    ...addObjects(currentPage(store.getState()).id, [obj]),
    label: `Add ${k.title.toLowerCase()}`,
  });
  analytics.track('procedural', 'place');
}

/** "Convert to shapes" on every procedural object selected. */
export function convertSelection(): void {
  const s = store.getState();
  if (
    store.edit(
      convertObjects(
        currentPage(s).id,
        selectedObjects(s),
        figure(s).doc.palette,
        figure(s).assets,
      ),
    )
  )
    analytics.track('procedural', 'convert');
}

// --- clipboard ------------------------------------------------------------------

let internalClipboard: string | null = null;

/** Objects with the assets they use, plus snapshots so an app that does not know a procedural kind still shows it. */
function selectionFragment(
  objs: readonly Obj[],
  assets: Assets,
  palette: readonly Swatch[],
): Fragment {
  const snap = withSnapshots(objs, palette);
  const all = { ...assets, ...snap.assets };
  const used: Record<string, Assets[string]> = {};
  for (const o of snap.objs) for (const h of objectAssets(o)) if (all[h]) used[h] = all[h];
  return { objects: snap.objs, assets: used };
}

function fragmentOf(objs: readonly Obj[], assets: Assets, palette: readonly Swatch[]): string {
  return writeFragment(selectionFragment(objs, assets, palette));
}

export function copySelection(cut = false): string | null {
  const s = store.getState();
  const objs = selectedObjects(s);
  if (objs.length === 0) return null;
  const text = fragmentOf(objs, figure(s).assets, figure(s).doc.palette);
  internalClipboard = text;
  void navigator.clipboard.writeText(text).catch(() => undefined);
  if (cut)
    store.edit({
      ...deleteObjects(
        currentPage(s).id,
        objs.map((o) => o.id),
      ),
      label: 'Cut',
    });
  return text;
}

/** Pastes a fragment (from the system clipboard text, else the internal one). `inPlace` keeps the copied positions, on any page or tab (note 35). */
export function pasteText(text: string | null, offset = 10, inPlace = false): boolean {
  const source = text ?? internalClipboard;
  if (source === null) return false;
  try {
    const frag = readFragment(source);
    if (!frag) return false;
    // Copied from this figure: next to the original. From elsewhere: in the middle of the view.
    const here = new Set(allIds(currentPage(store.getState())));
    const local = frag.objects.some((o) => here.has(o.id));
    const objs = importFragment(
      frag,
      inPlace ? { offset: 0 } : local ? { offset } : { at: viewCenter() },
      inPlace ? 'Paste in place' : 'Paste',
    );
    internalClipboard = writeFragment({ objects: objs, assets: frag.assets });
    return true;
  } catch (e: unknown) {
    store.notify(e instanceof JfigError ? e.message : 'Could not paste that.', 'error');
    return true;
  }
}

/**
 * Adds a fragment's objects to the page (note 05): fresh ids, offset from
 * where they were copied, or centred on `at` when they come from another
 * app or a file.
 */
export function importFragment(
  frag: Fragment,
  place: { offset: number } | { at: { x: number; y: number } },
  label = 'Paste',
): Obj[] {
  let dx = 0;
  let dy = 0;
  if ('offset' in place) {
    dx = place.offset;
    dy = place.offset;
  } else if (frag.objects.length > 0) {
    const b = boundsOf(frag.objects);
    dx = place.at.x - (b.x + b.w / 2);
    dy = place.at.y - (b.y + b.h / 2);
  }
  const objs = cloneObjects(frag.objects, dx, dy);
  store.edit({
    ...addObjects(currentPage(store.getState()).id, objs, frag.assets),
    label,
  });
  if (objs.some((o) => o.type === 'procedural')) analytics.track('procedural', 'fragment-paste');
  return objs;
}

// --- arrange extras (note 35) ---------------------------------------------------------

let copiedSpacing: Spacing | null = null;

/** Whether Paste spacing has a gap to apply. */
export const hasCopiedSpacing = (): boolean => copiedSpacing !== null;

/** Remembers the gaps between exactly two selected objects, in every tab. */
export function copySpacing(): boolean {
  const s = store.getState();
  const objs = selectedObjects(s);
  const [a, b] = objs;
  if (!a || !b || objs.length !== 2) return false;
  copiedSpacing = spacingBetween(a, b, drawnBoundsIn(figure(s).doc.palette));
  return true;
}

/** Spaces the selection (two or more objects) by the copied gap along an axis. */
export function pasteSpacing(axis: 'x' | 'y'): boolean {
  const s = store.getState();
  const objs = selectedObjects(s);
  if (copiedSpacing === null || objs.length < 2) return false;
  return store.edit(
    spaceObjects(
      currentPage(s).id,
      objs,
      axis,
      copiedSpacing[axis],
      drawnBoundsIn(figure(s).doc.palette),
    ),
  );
}

/** Paste spacing, saying so when nothing has been copied yet. */
export function pasteSpacingOrExplain(axis: 'x' | 'y'): void {
  if (!hasCopiedSpacing()) store.notify('Copy spacing from two objects first.', 'error');
  else pasteSpacing(axis);
}

/** Swaps the positions of exactly two selected objects. */
export function swapSelection(): boolean {
  const s = store.getState();
  const objs = selectedObjects(s);
  if (objs.length !== 2) return false;
  return store.edit(swapPositions(currentPage(s).id, objs, drawnBoundsIn(figure(s).doc.palette)));
}

export function duplicateSelection(): void {
  const s = store.getState();
  const objs = selectedObjects(s);
  if (objs.length === 0) return;
  const copies = cloneObjects(objs, 10, 10);
  store.edit({ ...addObjects(currentPage(s).id, copies), label: 'Duplicate' });
}

// --- export -----------------------------------------------------------------------

export type ExportFormat = 'svg' | 'pdf' | 'png' | 'tiff';

export interface ExportRequest {
  readonly format: ExportFormat;
  readonly allPages: boolean;
  readonly dpi: number;
  readonly transparent: boolean;
  readonly outline: boolean;
  readonly footer: boolean;
  /** One file per panel, in a zip (note 03). */
  readonly perPanel?: boolean;
}

export async function runExport(req: ExportRequest): Promise<void> {
  const s = store.getState();
  const fig = figure(s);
  const page = currentPage(s);
  const base = safeName(fig.doc.title);
  const pageSuffix = fig.doc.pages.length > 1 ? `-${safeName(page.name)}` : '';
  const opts = {
    textMode: req.outline ? 'outline' : 'text',
    footer: req.footer,
    background: true,
  } as const;
  if (req.perPanel) {
    download(
      await exportPanelsZip(
        fig,
        page,
        base + pageSuffix,
        { ...opts, format: req.format, dpi: req.dpi, transparent: req.transparent },
        APP.version,
      ),
      `${base}${pageSuffix}-panels.zip`,
      'application/zip',
    );
    analytics.track('export', 'panels', req.format);
    return;
  }
  switch (req.format) {
    case 'svg':
      download(
        exportSvg(fig, page, opts, APP.version),
        `${base}${pageSuffix}.svg`,
        'image/svg+xml',
      );
      break;
    case 'pdf': {
      const pages = req.allPages ? fig.doc.pages : [page];
      download(
        await exportPdf(fig, pages, opts, APP.version),
        `${base}${req.allPages ? '' : pageSuffix}.pdf`,
        'application/pdf',
      );
      break;
    }
    case 'png':
      download(
        await exportPng(
          fig,
          page,
          { dpi: req.dpi, transparent: req.transparent, footer: req.footer },
          APP.version,
        ),
        `${base}${pageSuffix}.png`,
        'image/png',
      );
      break;
    case 'tiff':
      download(
        await exportTiff(
          fig,
          page,
          { dpi: req.dpi, transparent: req.transparent, footer: req.footer },
          APP.version,
        ),
        `${base}${pageSuffix}.tif`,
        'image/tiff',
      );
      break;
  }
  analytics.track('export', req.format);
}

/** Adds the credit line as a text object under the page's content (bottom-left). */
export function addCreditText(line: string): void {
  const s = store.getState();
  const page = currentPage(s);
  const t = fitText({
    ...createText(8, 0, [[defaultRun(line, { size: 6, color: { hex: '#52606d' } })]]),
    autoWidth: false,
    frame: frame(8, 0, page.size.w - 16, 10),
  });
  const placed = { ...t, frame: { ...t.frame, y: page.size.h - t.frame.h - 6 } };
  store.edit({ ...addObjects(page.id, [placed]), label: 'Add credit line' });
  analytics.track('attribution', 'add-text');
}
