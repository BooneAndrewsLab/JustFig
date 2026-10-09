/**
 * Export (note 03): SVG, PDF, PNG or TIFF of the page (PDF: or every
 * page). The credit line is on by default (the figure's setting) and can
 * be turned off per export.
 */
import { useState } from 'react';

import { setCreditFooter } from '@/core/edits/edits';
import { formatLength } from '@/core/units';
import { MAX_PIXELS, rasterLimit, rasterSize } from '@/export/raster';
import { pageCredit } from '@/export/svg';

import { type ExportFormat, runExport } from '../state/session';
import { currentPage, figure, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

const FORMATS: readonly { id: ExportFormat; label: string; note: string }[] = [
  { id: 'pdf', label: 'PDF', note: 'Vector, fonts embedded. Best for journals and printing.' },
  { id: 'svg', label: 'SVG', note: 'Vector, editable in Illustrator or Inkscape.' },
  { id: 'png', label: 'PNG', note: 'Image at a set resolution, for slides and the web.' },
  {
    id: 'tiff',
    label: 'TIFF',
    note: 'Image with LZW compression and DPI recorded, as many journals ask.',
  },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const fig = figure(s);
  const page = currentPage(s);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [dpi, setDpi] = useState(300);
  const [transparent, setTransparent] = useState(false);
  const [outline, setOutline] = useState(false);
  const [allPages, setAllPages] = useState(false);
  const [footer, setFooter] = useState(fig.doc.creditFooter);
  const [busy, setBusy] = useState(false);
  const raster = format === 'png' || format === 'tiff';
  const credit = pageCredit(fig, page);
  const px = raster ? rasterSize(fig, page, { dpi, transparent, footer }) : null;
  const tooBig = px !== null && rasterLimit(px.w, px.h) !== null;
  const tiled = px !== null && !tooBig && px.w * px.h > MAX_PIXELS;

  const go = async () => {
    setBusy(true);
    try {
      await runExport({ format, allPages, dpi, transparent, outline, footer });
      onClose();
    } catch (e: unknown) {
      store.notify(e instanceof Error ? e.message : 'Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Export figure" onClose={onClose}>
      <fieldset>
        <legend>Format</legend>
        {FORMATS.map((f) => (
          <label key={f.id} style={{ display: 'block', margin: '3px 0' }}>
            <input
              type="radio"
              name="format"
              value={f.id}
              checked={format === f.id}
              onChange={() => {
                setFormat(f.id);
              }}
            />{' '}
            <b>{f.label}</b> <span className="note">{f.note}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Options</legend>
        {raster && (
          <>
            <div className="row">
              <label htmlFor="dpi">Resolution</label>
              <select
                id="dpi"
                value={[150, 300, 600].includes(dpi) ? dpi : 'custom'}
                onChange={(e) => {
                  setDpi(e.target.value === 'custom' ? 450 : Number(e.target.value));
                }}
              >
                <option value={150}>150 dpi (screen)</option>
                <option value={300}>300 dpi (print)</option>
                <option value={600}>600 dpi (line art)</option>
                <option value="custom">Custom</option>
              </select>
              {![150, 300, 600].includes(dpi) && (
                <input
                  type="number"
                  aria-label="Custom dpi"
                  min={36}
                  max={2400}
                  value={dpi}
                  onChange={(e) => {
                    setDpi(Number(e.target.value) || 300);
                  }}
                />
              )}
            </div>
            <div className="row">
              <label>
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(e) => {
                    setTransparent(e.target.checked);
                  }}
                />{' '}
                Transparent background
              </label>
            </div>
            {px && (
              <p className={tooBig ? 'warn' : 'note'}>
                {String(px.w)} × {String(px.h)} pixels
                {tooBig
                  ? ': too large to export. Lower the resolution, or export PDF.'
                  : tiled
                    ? ': a large image, drawn in pieces, so it may take a while.'
                    : '.'}
              </p>
            )}
            <p className="note">RGB only. Journals convert to CMYK; colours may shift slightly.</p>
          </>
        )}
        {!raster && (
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={outline}
                onChange={(e) => {
                  setOutline(e.target.checked);
                }}
              />{' '}
              Outline text (no fonts needed, text no longer editable)
            </label>
          </div>
        )}
        {format === 'pdf' && fig.doc.pages.length > 1 && (
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={allPages}
                onChange={(e) => {
                  setAllPages(e.target.checked);
                }}
              />{' '}
              All {String(fig.doc.pages.length)} pages
            </label>
          </div>
        )}
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={footer}
              onChange={(e) => {
                setFooter(e.target.checked);
                if (e.target.checked !== fig.doc.creditFooter)
                  store.edit(setCreditFooter(e.target.checked));
              }}
            />{' '}
            Include credit line under the figure
          </label>
        </div>
        {credit !== '' ? (
          <p className="note">{credit}</p>
        ) : (
          <p className="note">Nothing on this page needs a credit line.</p>
        )}
        <p className="note">
          Page {formatLength(page.size.w, s.units)} × {formatLength(page.size.h, s.units)} {s.units}
          .
        </p>
      </fieldset>
      <div className="actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || tooBig}
          onClick={() => {
            void go();
          }}
        >
          {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
        </button>
      </div>
    </Dialog>
  );
}
