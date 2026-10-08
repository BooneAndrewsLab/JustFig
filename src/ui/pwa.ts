/**
 * Offline support (note 01): the service worker vite-plugin-pwa generates,
 * registered in production only; figure files opened from the OS by an
 * installed app. Ported from BarelySig's `src/ui/pwa.ts`.
 */

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  globalThis.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline caching is a convenience; the app works without it.
    });
  });
}

interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

/** An installed app opened with a figure file (the manifest's file handler) gets it here. */
export function onLaunchFiles(open: (file: File) => void): void {
  const queue = (globalThis as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer((params) => {
    const [handle] = params.files;
    if (handle) void handle.getFile().then(open);
  });
}
