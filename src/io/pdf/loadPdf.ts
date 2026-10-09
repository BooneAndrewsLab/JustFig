/**
 * Reading a PDF with pdf.js (note 13). pdf.js (~0.5 MB, plus a ~1.3 MB
 * worker) is imported only here, and this module only by a dynamic
 * `import()` when a PDF is imported, so it is not in the main bundle. The
 * legacy build is used: pdf.js 6's modern build needs newer JavaScript than
 * some supported browsers (and Playwright's WebKit) parse.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { type Pixels, base64, encodePng } from '../png';
import type { Matrix } from '../svg/matrix';
import {
  PDF_IMAGE_HREF,
  type PdfFont,
  type PdfImage,
  type PdfPageSvg,
  type PictureSource,
  pageToSvg,
} from './pageToSvg';
import { type PdfJpegs, findJpegs, sizeKey } from './pdfJpegs';

export interface PdfPageInfo {
  /** 1-based. */
  readonly number: number;
  /** Size in points, as displayed (rotation applied). */
  readonly width: number;
  readonly height: number;
}

export interface PdfFile {
  readonly pages: readonly PdfPageInfo[];
  /**
   * The page as SVG text in CSS pixel units (1 pt = 4/3 px, what SVG import
   * expects), its pictures embedded as PNG, or JPEG when the PDF's was.
   */
  pageSvg(number: number): Promise<Pick<PdfPageSvg, 'svg' | 'warnings'>>;
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
    // Images as pixels (not ImageBitmaps decoded in the worker): they become shapes or PNG.
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
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
  const jpegs = findJpegs(bytes);
  const pages: PdfPageInfo[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
    pages.push({ number: n, width: vp.width, height: vp.height });
  }
  return {
    pages,
    async pageSvg(number: number): Promise<Pick<PdfPageSvg, 'svg' | 'warnings'>> {
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
      const out = pageToSvg({
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
        // Shadings arrive before the operator list does (pdf.js's canvas reads them the same way).
        pattern: (id) => {
          try {
            if (page.objs.has(id)) return page.objs.get(id) as unknown;
            return page.commonObjs.has(id) ? (page.commonObjs.get(id) as unknown) : null;
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
      return { svg: await withPictures(out, jpegs), warnings: out.warnings };
    },
    close: () => task.destroy(),
  };
}

/** JPEG quality for a photo re-encoded after cutting (issue 36). */
const JPEG_QUALITY = 0.92;

/** Pixels as JPEG with the browser's encoder; null where there is none (Node). */
export async function encodeJpeg(px: Pixels): Promise<Uint8Array | null> {
  if (typeof ImageData === 'undefined') return null;
  const rgba = new Uint8ClampedArray(px.width * px.height * 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += px.channels) {
    rgba[i] = px.data[j] ?? 0;
    rgba[i + 1] = px.data[j + 1] ?? 0;
    rgba[i + 2] = px.data[j + 2] ?? 0;
    rgba[i + 3] = 255;
  }
  const image = new ImageData(rgba, px.width, px.height);
  let blob: Blob | null = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(px.width, px.height);
      canvas.getContext('2d')?.putImageData(image, 0, 0);
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = px.width;
      canvas.height = px.height;
      canvas.getContext('2d')?.putImageData(image, 0, 0);
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
      });
    }
  } catch {
    return null;
  }
  return blob?.type === 'image/jpeg' ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/**
 * A picture's data URL: the PDF's own JPEG when the picture is all of a
 * JPEG image, a JPEG re-encoded from its pixels when it is part of one
 * (cut to a clip, or reduced) and that is smaller, else PNG (issue 36).
 */
export async function pictureUrl(
  px: Pixels,
  source: PictureSource | undefined,
  jpegs: PdfJpegs,
  jpeg: (px: Pixels) => Promise<Uint8Array | null> = encodeJpeg,
): Promise<string> {
  const key = source ? sizeKey(source.width, source.height) : '';
  const fromJpeg = px.channels === 3 && jpegs.has(key);
  const original = jpegs.get(key);
  if (fromJpeg && original && source?.whole) return `data:image/jpeg;base64,${base64(original)}`;
  const png = await encodePng(px);
  if (fromJpeg) {
    const again = await jpeg(px);
    if (again && again.length < png.length) return `data:image/jpeg;base64,${base64(again)}`;
  }
  return `data:image/png;base64,${base64(png)}`;
}

/** A converted page's SVG with each picture's pixels in place (issues 24 and 36). */
async function withPictures(page: PdfPageSvg, jpegs: PdfJpegs): Promise<string> {
  if (page.images.length === 0) return page.svg;
  const urls = await Promise.all(
    page.images.map((px, i) => pictureUrl(px, page.sources[i], jpegs)),
  );
  return page.svg.replace(
    new RegExp(`href="${PDF_IMAGE_HREF}(\\d+)"`, 'g'),
    (_, n: string) => `href="${urls[Number(n)] ?? ''}"`,
  );
}
