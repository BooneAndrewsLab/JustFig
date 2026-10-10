import { describe, expect, it, vi } from 'vitest';

import {
  type FileHandleLike,
  HandleStore,
  type WritableLike,
  canOpenWithPicker,
  canSaveInPlace,
  ensureWritable,
  isAbort,
  isHandleLost,
  pickOpenHandle,
  pickSaveHandle,
  writeToHandle,
} from './fileHandles';
import { FigureDb } from './storage';

const err = (name: string) => Object.assign(new Error(name), { name });

function handle(over: Partial<FileHandleLike> = {}, w: Partial<WritableLike> = {}) {
  const writable = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    ...w,
  };
  const h = {
    name: 'fig.jfig',
    createWritable: vi.fn().mockResolvedValue(writable),
    getFile: vi.fn(),
    ...over,
  };
  return { h, writable };
}

describe('save in place (note 38)', () => {
  it('detects the pickers by feature, not by browser', () => {
    expect(canSaveInPlace({})).toBe(false);
    expect(canOpenWithPicker({})).toBe(false);
    expect(canSaveInPlace({ showSaveFilePicker: vi.fn() })).toBe(true);
    expect(canOpenWithPicker({ showOpenFilePicker: vi.fn() })).toBe(true);
  });

  it('a cancelled picker is silent, other errors are thrown', async () => {
    const abort = { showSaveFilePicker: vi.fn().mockRejectedValue(err('AbortError')) };
    expect(await pickSaveHandle(abort, 'a.jfig', [])).toBeNull();
    const bad = { showSaveFilePicker: vi.fn().mockRejectedValue(err('SecurityError')) };
    await expect(pickSaveHandle(bad, 'a.jfig', [])).rejects.toThrow();
    const open = { showOpenFilePicker: vi.fn().mockRejectedValue(err('AbortError')) };
    expect(await pickOpenHandle(open, [])).toBeNull();
    const { h } = handle();
    expect(await pickOpenHandle({ showOpenFilePicker: vi.fn().mockResolvedValue([h]) }, [])).toBe(
      h,
    );
    expect(isAbort(err('AbortError'))).toBe(true);
    expect(isHandleLost(err('NotFoundError'))).toBe(true);
    expect(isHandleLost(err('QuotaExceededError'))).toBe(false);
  });

  it('asks for read-write permission only when it is not already granted', async () => {
    const granted = handle({ queryPermission: vi.fn().mockResolvedValue('granted') });
    expect(await ensureWritable(granted.h)).toBe(true);
    const request = vi.fn().mockResolvedValue('granted');
    const prompt = handle({
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: request,
    });
    expect(await ensureWritable(prompt.h)).toBe(true);
    expect(request).toHaveBeenCalledWith({ mode: 'readwrite' });
    const denied = handle({
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });
    expect(await ensureWritable(denied.h)).toBe(false);
    const throws = handle({ queryPermission: vi.fn().mockRejectedValue(err('NotFoundError')) });
    expect(await ensureWritable(throws.h)).toBe(false);
  });

  it('writes through createWritable and aborts a failed write', async () => {
    const ok = handle();
    await writeToHandle(ok.h, 'text');
    expect(ok.writable.write).toHaveBeenCalledWith('text');
    expect(ok.writable.close).toHaveBeenCalled();
    const bad = handle({}, { write: vi.fn().mockRejectedValue(err('QuotaExceededError')) });
    await expect(writeToHandle(bad.h, 'x')).rejects.toThrow();
    expect(bad.writable.abort).toHaveBeenCalled();
    const gone = handle({ createWritable: vi.fn().mockRejectedValue(err('NotFoundError')) });
    await expect(writeToHandle(gone.h, 'x')).rejects.toSatisfy(isHandleLost);
  });

  it('keeps a handle per document id in IndexedDB', async () => {
    const store = new HandleStore(new FigureDb(`t-${String(Math.random())}`));
    expect(await store.get('d_1')).toBeNull();
    await store.put('d_1', { name: 'fig.jfig' } as FileHandleLike);
    expect((await store.get('d_1'))?.name).toBe('fig.jfig');
    await store.remove('d_1');
    expect(await store.get('d_1')).toBeNull();
  });
});
