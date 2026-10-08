/**
 * Choose a PDF page (note 13): a PDF with several pages asks which one to
 * import. The pages are a radio group (arrow keys move, Enter imports) with
 * each page's size, and the chosen page is previewed as it will be placed.
 */
import { useEffect, useState } from 'react';

import { formatLength } from '@/core/units';

import type { PdfPageRequest } from '../state/pdfPagePicker';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

const svgUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function PdfPageDialog({ request }: { request: PdfPageRequest }) {
  const units = useAppState().units;
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ page: number; url: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    request.preview(page).then(
      (imp) => {
        if (live)
          setPreview({ page, url: imp.asset.kind === 'svgImport' ? svgUrl(imp.asset.svg) : null });
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
