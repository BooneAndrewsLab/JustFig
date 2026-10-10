/** Copy as image (note 36) from the top bar: the selection, else the page, to the clipboard. */
import {
  copyPixelSize,
  copyPngBytes,
  copyScope,
  copySvgText,
  writeToClipboard,
} from '@/export/clipboardImage';

import { analytics } from './analytics';
import { APP } from './state/session';
import { currentPage, figure, store } from './state/store';

export async function copyAsImage(): Promise<void> {
  const s = store.getState();
  const fig = figure(s);
  const scope = copyScope(currentPage(s), s.selection);
  const what = scope.kind === 'selection' ? 'selection' : 'page';
  try {
    const { w, h } = copyPixelSize(fig, scope);
    const png = copyPngBytes(fig, scope, APP.version).then(
      (b) => new Blob([b as BlobPart], { type: 'image/png' }),
    );
    const result = await writeToClipboard(
      png,
      () => new Blob([copySvgText(fig, scope, APP.version)], { type: 'text/plain' }),
    );
    if (result === 'unavailable') {
      store.notify(
        'This browser cannot copy images to the clipboard. Use Export… and choose PNG instead.',
        'warning',
      );
      return;
    }
    analytics.track('export', result === 'png+svg' ? 'copy-image' : 'copy-image-png');
    store.notify(
      `Copied the ${what} as an image (${String(w)} × ${String(h)} px${result === 'png' ? '' : ', SVG as text'}).`,
    );
  } catch {
    store.notify(
      `Could not copy the ${what} as an image. Use Export… and choose PNG instead.`,
      'error',
    );
  }
}
