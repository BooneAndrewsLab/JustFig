/**
 * Export (note 03): SVG, PDF, PNG or TIFF of the page (PDF: or every
 * page). The credit line is on by default (the figure's setting) and can
 * be turned off per export.
 */
import { useMemo, useState } from 'react';

import { setCreditFooter } from '@/core/edits/edits';
import type { Id } from '@/core/model/ids';
import type { Page } from '@/core/model/types';
import { JOURNALS, PAGE_PRESETS } from '@/core/presets/pages';
import { formatLength } from '@/core/units';
import {
  type CheckRule,
  type CheckWarning,
  MIN_DPI,
  MIN_STROKE_PT,
  checkPage,
  minTextFor,
} from '@/export/checks';
import { MAX_PIXELS, rasterLimit, rasterSize } from '@/export/raster';
import { panelCrops } from '@/export/panels';
import { pageCredit } from '@/export/svg';

import { analytics } from '../analytics';
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

const RULE_TITLES: Record<CheckRule, string> = {
  'journal-width': 'Page width',
  'text-size': 'Small text',
  'stroke-width': 'Thin lines',
  'image-dpi': 'Low-resolution pictures',
  overlap: 'Overlapping text',
};
const RULE_ORDER: readonly CheckRule[] = [
  'journal-width',
  'text-size',
  'stroke-width',
  'image-dpi',
  'overlap',
];
/** Warnings listed per rule before "Select all". */
const SHOWN = 5;

/** The journal last chosen in this session (undefined: none chosen yet). */
let lastJournal: string | null | undefined;

const presetJournal = (page: Page): string | null =>
  PAGE_PRESETS.find((p) => p.id === page.size.preset)?.journal ?? null;

/**
 * Checks before export (issue 4): warnings grouped by rule. Choosing one
 * selects what it is about (switching page if needed) and closes the dialog,
 * so the selection shows on the canvas.
 */
function ExportChecks({
  allPages,
  initialJournal,
  onShow,
}: {
  allPages: boolean;
  initialJournal: string | null;
  onShow: (pageId: Id, ids: readonly Id[], rule: CheckRule) => void;
}) {
  const s = useAppState();
  const fig = figure(s);
  const page = currentPage(s);
  const [journal, setJournal] = useState(lastJournal === undefined ? initialJournal : lastJournal);
  const pages = allPages ? fig.doc.pages : [page];
  const warnings = useMemo(
    () => (allPages ? fig.doc.pages : [page]).flatMap((p) => checkPage(fig, p, { journal })),
    [fig, page, allPages, journal],
  );
  const groups = RULE_ORDER.map((r) => [r, warnings.filter((w) => w.rule === r)] as const).filter(
    ([, ws]) => ws.length > 0,
  );
  const pageName = (w: CheckWarning): string =>
    pages.length > 1 ? `${fig.doc.pages.find((p) => p.id === w.pageId)?.name ?? ''}: ` : '';
  return (
    <fieldset>
      <legend>Check before export</legend>
      <div className="row">
        <label htmlFor="check-journal">Journal</label>
        <select
          id="check-journal"
          value={journal ?? ''}
          onChange={(e) => {
            const j = e.target.value === '' ? null : e.target.value;
            lastJournal = j;
            setJournal(j);
          }}
        >
          <option value="">None</option>
          {JOURNALS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>
      <p className="note">
        Looks for text under {String(minTextFor(journal))} pt, lines under {String(MIN_STROKE_PT)}{' '}
        pt, pictures under {String(MIN_DPI)} dpi and overlapping text
        {journal === null ? '' : `, and the page width against ${journal}'s columns`}. Warnings
        only: you can still export. Choose one to select what it is about.
      </p>
      {groups.length === 0 ? (
        <p className="note" role="status">
          No problems found.
        </p>
      ) : (
        <ul className="export-checks" aria-label="Warnings">
          {groups.map(([rule, ws]) => {
            const first = ws[0];
            const samePage = first ? ws.filter((w) => w.pageId === first.pageId) : [];
            const all = [...new Set(samePage.flatMap((w) => w.ids))];
            return (
              <li key={rule}>
                <b>
                  {RULE_TITLES[rule]} ({String(ws.length)})
                </b>
                <ul>
                  {ws.slice(0, SHOWN).map((w, i) => (
                    <li key={`${w.pageId}-${String(i)}`}>
                      {w.ids.length > 0 ? (
                        <button
                          type="button"
                          className="link warn"
                          onClick={() => {
                            onShow(w.pageId, w.ids, rule);
                          }}
                        >
                          {pageName(w)}
                          {w.message}
                        </button>
                      ) : (
                        <span className="warn">
                          {pageName(w)}
                          {w.message}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {ws.length > SHOWN && first && all.length > 0 && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      onShow(first.pageId, all, rule);
                    }}
                  >
                    Select all {String(all.length)}
                    {pages.length > 1 ? ' on this page' : ''}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

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
  const crops = panelCrops(page, fig.doc.panelLabelStyle.format);
  const [perPanelWanted, setPerPanel] = useState(false);
  const perPanel = perPanelWanted && crops.length > 0;
  // With one file per panel, the size that matters is the largest panel's.
  const biggest = crops.reduce<(typeof crops)[number] | null>(
    (a, c) => (a === null || c.box.w * c.box.h > a.box.w * a.box.h ? c : a),
    null,
  );
  const px = raster
    ? rasterSize(fig, page, {
        dpi,
        transparent,
        footer,
        ...(perPanel && biggest ? { crop: biggest.box } : {}),
      })
    : null;
  const tooBig = px !== null && rasterLimit(px.w, px.h) !== null;
  const tiled = px !== null && !tooBig && px.w * px.h > MAX_PIXELS;

  const showWarning = (pageId: Id, ids: readonly Id[], rule: CheckRule) => {
    if (pageId !== s.pageId) store.setPage(pageId);
    store.select(ids);
    analytics.track('check', 'select', rule);
    onClose();
  };

  const go = async () => {
    setBusy(true);
    try {
      await runExport({ format, allPages, dpi, transparent, outline, footer, perPanel });
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
              checked={perPanel}
              disabled={crops.length === 0}
              aria-describedby="per-panel-note"
              onChange={(e) => {
                setPerPanel(e.target.checked);
              }}
            />{' '}
            One file per panel, in a zip
          </label>
        </div>
        <p className="note" id="per-panel-note">
          {crops.length === 0
            ? 'Unavailable: this page has no panels. Add some with the Panel tool.'
            : perPanel
              ? `Each file is cropped to its panel and named after its label (${crops
                  .slice(0, 3)
                  .map((c) => c.name)
                  .join(
                    ', ',
                  )}${crops.length > 3 ? ', …' : ''}). The credit line goes in credits.txt.`
              : `Each of the ${String(crops.length)} panels as its own file.`}
        </p>
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
      <ExportChecks
        allPages={format === 'pdf' && allPages}
        initialJournal={presetJournal(page)}
        onShow={showWarning}
      />
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
          {busy
            ? 'Exporting…'
            : perPanel
              ? `Export ${format.toUpperCase()} panels`
              : `Export ${format.toUpperCase()}`}
        </button>
      </div>
    </Dialog>
  );
}
