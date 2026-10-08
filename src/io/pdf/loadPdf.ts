/**
 * Reading a PDF with pdf.js (note 13). pdf.js (~0.5 MB, plus a ~1.3 MB
 * worker) is imported only here, and this module only by a dynamic
 * `import()` when a PDF is imported, so it is not in the main bundle. The
 * legacy build is used: pdf.js 6's modern build needs newer JavaScript than
 * some supported browsers (and Playwright's WebKit) parse.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { Matrix } from '../svg/matrix';
import { type PdfFont, type PdfImage, type PdfPageSvg, pageToSvg } from './pageToSvg';

export interface PdfPageInfo {
  /** 1-based. */
  readonly number: number;
  /** Size in points, as displayed (rotation applied). */
  readonly width: number;
  readonly height: number;
}

export interface PdfFile {
  readonly pages: readonly PdfPageInfo[];
  /** The page as SVG text in CSS pixel units (1 pt = 4/3 px, what SVG import expects). */
  pageSvg(number: number): Promise<PdfPageSvg>;
  close(): Promise<void>;
}

export class PdfImportError extends Error {
  override readonly name = 'PdfImportError';
}

let workerReady: Promise<void> | null = null;

/** Browsers run pdf.js in a module worker; Node (unit tests) uses pdf.js's own fallback. */
function setUpWorker(): Promise<void> {
  workerReady ??= (async () => {
    if (typeof window === 'undefined') return;
    const { default: url } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = url;
  })();
  return workerReady;
}

const PX_PER_PT = 4 / 3;

export async function openPdf(bytes: Uint8Array): Promise<PdfFile> {
  await setUpWorker();
  let doc: pdfjs.PDFDocumentProxy;
  const task = pdfjs.getDocument({
    // pdf.js takes ownership of the buffer: give it a copy.
    data: bytes.slice(),
    // Glyph outlines come to the main thread as paths (for letters without text).
    disableFontFace: true,
    fontExtraProperties: true,
    useSystemFonts: false,
    // Nothing is fetched: no CMap or standard-font files are shipped.
    useWorkerFetch: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  try {
    doc = await task.promise;
  } catch (e: unknown) {
    await task.destroy();
    const msg = e instanceof Error ? e.message : '';
    throw new PdfImportError(
      /password/i.test(msg)
        ? 'This PDF is protected by a password and cannot be imported.'
        : 'This is not a readable PDF file.',
    );
  }
  const pages: PdfPageInfo[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
    pages.push({ number: n, width: vp.width, height: vp.height });
  }
  return {
    pages,
    async pageSvg(number: number): Promise<PdfPageSvg> {
      const page = await doc.getPage(number);
      const vp = page.getViewport({ scale: PX_PER_PT });
      const ops = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
      // Fonts and images arrive asynchronously: wait for every dependency first.
      const deps = new Set<string>();
      ops.fnArray.forEach((fn, i) => {
        if (fn === pdfjs.OPS.dependency)
          for (const id of (ops.argsArray[i] ?? []) as string[]) deps.add(id);
      });
      await Promise.all(
        [...deps].map(
          (id) =>
            new Promise<void>((resolve) => {
              const pool = id.startsWith('g_') ? page.commonObjs : page.objs;
              pool.get(id, () => {
                resolve();
              });
            }),
        ),
      );
      const font = (id: string): PdfFont | null => {
        try {
          const f: unknown = page.commonObjs.get(id);
          return f !== null && typeof f === 'object' && 'loadedName' in f ? (f as PdfFont) : null;
        } catch {
          return null;
        }
      };
      return pageToSvg({
        ops,
        OPS: pdfjs.OPS,
        width: vp.width,
        height: vp.height,
        viewport: vp.transform as unknown as Matrix,
        font,
        image: (id) => {
          try {
            const pool = id.startsWith('g_') ? page.commonObjs : page.objs;
            const img: unknown = pool.has(id) ? pool.get(id) : null;
            return img !== null && typeof img === 'object' && 'data' in img && 'kind' in img
              ? (img as PdfImage)
              : null;
          } catch {
            return null;
          }
        },
        glyphPath: (f, ch) => {
          const id = `${f.loadedName ?? ''}_path_${ch}`;
          try {
            if (!page.commonObjs.has(id)) return null;
            const p: unknown = page.commonObjs.get(id);
            return p !== null && typeof p === 'object' && 'path' in p
              ? (p as { path: ArrayLike<number> }).path
              : null;
          } catch {
            return null;
          }
        },
      });
    },
    close: () => task.destroy(),
  };
}
