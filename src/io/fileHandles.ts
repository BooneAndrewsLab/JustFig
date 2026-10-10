/**
 * Save in place (note 38): the File System Access API behind one small,
 * injectable seam. Everything here takes a `FsHost` (the `window`), so unit
 * tests stub the pickers, permissions and errors. Feature detection only.
 * Handles live in IndexedDB beside the figures (`handles`, keyed by
 * `doc.id`), never in a `.jfig` and never in the document model.
 */
import type { FigureDb } from './storage';

export interface WritableLike {
  write(data: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface FileHandleLike {
  readonly name: string;
  createWritable(): Promise<WritableLike>;
  getFile(): Promise<File>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}

export interface PickerType {
  readonly description: string;
  readonly accept: Record<string, readonly string[]>;
}

/** The part of `window` this module uses. */
export interface FsHost {
  showSaveFilePicker?: (o: {
    suggestedName?: string;
    types?: readonly PickerType[];
  }) => Promise<FileHandleLike>;
  showOpenFilePicker?: (o: {
    multiple?: boolean;
    types?: readonly PickerType[];
  }) => Promise<readonly FileHandleLike[]>;
}

export const canSaveInPlace = (host: FsHost): boolean =>
  typeof host.showSaveFilePicker === 'function';
export const canOpenWithPicker = (host: FsHost): boolean =>
  typeof host.showOpenFilePicker === 'function';

const errName = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'name' in e ? String(e.name) : '';

/** The user dismissed a picker. */
export const isAbort = (e: unknown): boolean => errName(e) === 'AbortError';
/** The file or its folder is gone, or the permission was refused: save as instead. */
export const isHandleLost = (e: unknown): boolean =>
  ['NotFoundError', 'NotAllowedError', 'InvalidStateError', 'SecurityError'].includes(errName(e));

/** Asks where to save; null when the user cancelled. Other errors are thrown. */
export async function pickSaveHandle(
  host: FsHost,
  suggestedName: string,
  types: readonly PickerType[],
): Promise<FileHandleLike | null> {
  if (!host.showSaveFilePicker) return null;
  try {
    return await host.showSaveFilePicker({ suggestedName, types });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Asks which file to open; null when the user cancelled. */
export async function pickOpenHandle(
  host: FsHost,
  types: readonly PickerType[],
): Promise<FileHandleLike | null> {
  if (!host.showOpenFilePicker) return null;
  try {
    return (await host.showOpenFilePicker({ multiple: false, types }))[0] ?? null;
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Read-write permission on a kept handle, asking once when it is not already granted. */
export async function ensureWritable(handle: FileHandleLike): Promise<boolean> {
  try {
    const opts = { mode: 'readwrite' } as const;
    if (!handle.queryPermission) return true;
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission?.(opts)) === 'granted';
  } catch {
    return false;
  }
}

/** Writes the whole file; a failed write leaves the file as it was. */
export async function writeToHandle(
  handle: FileHandleLike,
  data: string | Uint8Array,
): Promise<void> {
  const w = await handle.createWritable();
  try {
    await w.write(data);
    await w.close();
  } catch (e) {
    await w.abort?.().catch(() => undefined);
    throw e;
  }
}

export interface HandleRow {
  readonly id: string;
  readonly handle: FileHandleLike;
  readonly name: string;
  readonly updatedAt: number;
}

/** The kept handles, one row per `doc.id`. */
export class HandleStore {
  constructor(private readonly db: FigureDb) {}

  async get(id: string): Promise<FileHandleLike | null> {
    return (await this.db.handles.get(id))?.handle ?? null;
  }

  async put(id: string, handle: FileHandleLike, now = Date.now()): Promise<void> {
    await this.db.handles.put({ id, handle, name: handle.name, updatedAt: now });
  }

  async remove(id: string): Promise<void> {
    await this.db.handles.delete(id);
  }
}
