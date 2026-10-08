/**
 * What the menus and shortcuts do with files, the clipboard, icons and
 * exports: everything that reaches outside the store. Saving downloads a
 * file (never a kept handle); autosave keeps a copy in IndexedDB.
 */
import { BRAND } from '@/brand';
import { addObjects, allIds, deleteObjects, updateDoc } from '@/core/edits/edits';
import { placeImport } from '@/core/edits/placeImport';
import { boundsOf } from '@/core/geometry/transform';
import { cloneObjects } from '@/core/model/clone';
import { createDoc, createText, defaultRun, frame } from '@/core/model/factory';
import type { Id } from '@/core/model/ids';
import { objectAssets } from '@/core/model/tree';
import type { Assets, Figure, Obj, Swatch } from '@/core/model/types';
import { fitText } from '@/core/text/layout';
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
import { convertObjects, createProcedural } from '@/procedural/edits';
import { getKind } from '@/procedural/registry';
import { figureWithSnapshots, withSnapshots } from '@/procedural/snapshot';
import { type FigureSummary, getStorage } from '@/io/storage';

import { analytics } from '../analytics';
import { Autosaver } from './autosave';
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

const CURRENT_KEY = 'justfig.current';

/** The figure the user last had open: opening an old one from Recent figures must survive a reload. */
function rememberCurrent(id: string): void {
  try {
    globalThis.localStorage.setItem(CURRENT_KEY, id);
  } catch {
    // Blocked storage: a reload restores the most recently changed figure instead.
  }
}

function rememberedCurrent(): string | null {
  try {
    return globalThis.localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

/** Restores the last figure from the browser and starts autosaving. */
export async function startSession(): Promise<void> {
  const storage = getStorage();
  try {
    const wanted = rememberedCurrent();
    const kept = await Promise.race([
      (async () => (wanted ? await storage.load(wanted) : null) ?? (await storage.latest()))(),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 1500);
      }),
    ]);
    if (kept) store.load(kept, { hasFile: kept.downloaded });
  } catch {
    // A wedged IndexedDB must not block the app.
  }
  saver = new Autosaver(
    store,
    storage,
    APP,
    () => {
      store.notify('Could not keep a copy in this browser; save the file to be safe.', 'warning');
    },
    renderThumbnail,
  );
  saver.markSaved(figure(store.getState()));
  store.subscribe(() => {
    rememberCurrent(figure(store.getState()).doc.id);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saver?.flush();
  });
}

/** Writes the current figure to the browser now: every switch to another figure goes through here first. */
export async function flushCurrent(): Promise<void> {
  await saver?.flush();
}

export function newFigure(): void {
  // flush() takes the pending change before load() replaces it; the write finishes on its own.
  void saver?.flush();
  store.load({ doc: createDoc(), assets: {} });
}

/** A new figure from a gallery entry (note 08). */
export function openGallery(e: { build: () => Figure }): void {
  void saver?.flush();
  store.load(e.build());
}

// --- Recent figures (note 02) -----------------------------------------------------

export async function listRecent(): Promise<FigureSummary[]> {
  await flushCurrent();
  return getStorage().list();
}

/** The id of the figure on the canvas. */
export const currentId = (): string => figure(store.getState()).doc.id;

export async function openRecent(id: string): Promise<boolean> {
  if (id === currentId()) return true;
  await flushCurrent();
  const kept = await getStorage().load(id);
  if (!kept) {
    store.notify('That figure can no longer be opened (it may be from a newer version).', 'error');
    return false;
  }
  store.load(kept, { hasFile: kept.downloaded });
  saver?.markSaved(figure(store.getState()));
  analytics.track('file', 'open-recent');
  return true;
}

export async function renameRecent(id: string, title: string): Promise<void> {
  const name = title.trim();
  if (!name) return;
  if (id === currentId()) {
    store.edit(
      updateDoc('Rename figure', (d) => ({ ...d, title: name })),
      { coalesce: 'title' },
    );
    await flushCurrent();
  } else {
    await getStorage().rename(id, name, APP);
  }
}

export async function deleteRecent(id: string): Promise<void> {
  await getStorage().remove(id);
}

export async function downloadRecent(id: string): Promise<void> {
  if (id === currentId()) {
    await flushCurrent();
    saveFile();
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

export async function openFile(file: File): Promise<void> {
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
    await saver?.flush();
    store.load(saved, { hasFile: true });
    analytics.track('file', 'open');
  } catch (e: unknown) {
    store.notify(e instanceof Error ? e.message : 'Could not open that file.', 'error');
  }
}

export function saveFile(): void {
  const f = figure(store.getState());
  download(
    writeJfig(figureWithSnapshots(f), APP),
    `${safeName(f.doc.title)}${BRAND.fileExt}`,
    BRAND.mime,
  );
  store.markDownloaded();
  analytics.track('file', 'download');
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
  if (store.edit(convertObjects(currentPage(s).id, selectedObjects(s), figure(s).doc.palette)))
    analytics.track('procedural', 'convert');
}

// --- clipboard ------------------------------------------------------------------

let internalClipboard: string | null = null;

function fragmentOf(objs: readonly Obj[], assets: Assets, palette: readonly Swatch[]): string {
  // Snapshots let an app that does not know a procedural kind still show it.
  const snap = withSnapshots(objs, palette);
  const all = { ...assets, ...snap.assets };
  const used: Record<string, Assets[string]> = {};
  for (const o of snap.objs) for (const h of objectAssets(o)) if (all[h]) used[h] = all[h];
  return writeFragment({ objects: snap.objs, assets: used });
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

/** Pastes a fragment (from the system clipboard text, else the internal one). */
export function pasteText(text: string | null, offset = 10): boolean {
  const source = text ?? internalClipboard;
  if (source === null) return false;
  try {
    const frag = readFragment(source);
    if (!frag) return false;
    // Copied from this figure: next to the original. From elsewhere: in the middle of the view.
    const here = new Set(allIds(currentPage(store.getState())));
    const local = frag.objects.some((o) => here.has(o.id));
    const objs = importFragment(frag, local ? { offset } : { at: viewCenter() });
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
    label: 'Paste',
  });
  if (objs.some((o) => o.type === 'procedural')) analytics.track('procedural', 'fragment-paste');
  return objs;
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
