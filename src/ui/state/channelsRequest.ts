/**
 * "Open Merge channels": asked by the import code (a TIFF stack, note 43) outside
 * React, answered by `App`, which owns the dialogs. The dialog reads its channels
 * from the selection, so the import selects the pictures first.
 */
const listeners = new Set<() => void>();

export function requestChannelsDialog(): void {
  for (const l of listeners) l();
}

export function onChannelsRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
