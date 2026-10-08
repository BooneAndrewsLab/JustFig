/**
 * The question "which page of this PDF?" (note 13), asked by the import code
 * outside React and answered by `PdfPageDialog`: `choosePdfPage` resolves when
 * the dialog does. One question at a time; a second one cancels the first.
 */
import { useSyncExternalStore } from 'react';

import type { ChoosePdfPage, Imported, PdfPageChoice } from '@/io/import';

export interface PdfPageRequest {
  readonly fileName: string;
  readonly pages: readonly PdfPageChoice[];
  readonly preview: (number: number) => Promise<Imported>;
  readonly answer: (page: number | null) => void;
}

let current: PdfPageRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function choosePdfPage(fileName: string): ChoosePdfPage {
  return (pages, preview) =>
    new Promise((resolve) => {
      current?.answer(null);
      const req: PdfPageRequest = {
        fileName,
        pages,
        preview,
        answer: (page) => {
          if (current === req) {
            current = null;
            emit();
          }
          resolve(page);
        },
      };
      current = req;
      emit();
    });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => current;

export function usePdfPageRequest(): PdfPageRequest | null {
  return useSyncExternalStore(subscribe, get, get);
}
