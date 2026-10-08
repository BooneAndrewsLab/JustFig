/**
 * Choose a PDF page (note 13): a PDF with several pages asks which one to
 * import. The pages are a radio group (arrow keys move, Enter imports) with
 * each page's size, and the chosen page is previewed as it will be placed.
 */
import { useEffect, useState } from 'react';

import { frameMatrix } from '@/core/geometry/matrix';
import { formatLength } from '@/core/units';
import type { Imported } from '@/io/import';
import { imageNode, svgImportNode } from '@/render/assets';
import { el, nodeToSvgString } from '@/render/svgNode';

import type { PdfPageRequest } from '../state/pdfPagePicker';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

/**
 * The page as it will be placed: text laid out in the bundled fonts, drawn as
 * outlines (note 14), over the pictures it holds (issue 24).
 */
function previewUrl(imp: Imported): string | null {
  if (imp.asset.kind !== 'svgImport') return null;
  const { w, h } = imp;
  const pictures = (imp.pictures ?? []).map((p) =>
    el(
      'g',
      {
        transform: `matrix(${frameMatrix(p.frame).join(' ')})`,
        opacity: p.opacity < 1 ? p.opacity : undefined,
      },
      [imageNode(p.asset, p.frame.w, p.frame.h)],
    ),
  );
  const body = [...pictures, svgImportNode(imp.asset.svg, w, h, 'outline')]
    .map((n) => nodeToSvgString(n))
    .join('');
  const page =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${String(w)}" height="${String(h)}" viewBox="0 0 ${String(w)} ${String(h)}">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(page)}`;
}

export function PdfPageDialog({ request }: { request: PdfPageRequest }) {
  const units = useAppState().units;
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ page: number; url: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    request.preview(page).then(
      (imp) => {
        if (live)
          setPreview({
            page,
            url: previewUrl(imp),
          });
      },
      () => {
        if (live) setPreview({ page, url: null });
      },
    );
    return () => {
      live = false;
    };
  }, [request, page]);

  const cancel = () => {
    request.answer(null);
  };

  return (
    <Dialog title="Choose a PDF page" onClose={cancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          request.answer(page);
        }}
      >
        <p className="note">
          {request.fileName} has {request.pages.length} pages. Choose the one to import.
        </p>
        <div className="pdf-pages">
          <fieldset>
            <legend>Page</legend>
            <ul className="pdf-page-list">
              {request.pages.map((p) => (
                <li key={p.number}>
                  <label>
                    <input
                      type="radio"
                      name="pdf-page"
                      value={p.number}
                      checked={page === p.number}
                      onChange={() => {
                        setPage(p.number);
                      }}
                    />{' '}
                    Page {p.number}{' '}
                    <span className="note">
                      {formatLength(p.width, units)} × {formatLength(p.height, units)} {units}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="pdf-preview" aria-live="polite">
            {preview?.page !== page ? (
              <span className="note">Preparing a preview…</span>
            ) : preview.url ? (
              <img src={preview.url} alt={`Preview of page ${String(page)}`} />
            ) : (
              <span className="note">No preview for this page.</span>
            )}
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Import page {page}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
