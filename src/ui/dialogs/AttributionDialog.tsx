/**
 * Attribution (note 03): every icon and credited image in the figure with
 * its licence, the credit line (Copy, Add as text), the export footer
 * toggle (on by default) and a warning when share-alike icons are used.
 */
import { BRAND } from '@/brand';
import { creditLine, docCreditItems, needsModifiedNote } from '@/core/attribution/attribution';
import { setCreditFooter } from '@/core/edits/edits';
import { legendText } from '@/export/legend';

import { analytics } from '../analytics';
import { addCreditText } from '../state/session';
import { figure, store } from '../state/store';
import { useAppState } from '../state/useAppState';
import { Dialog } from './Dialog';

export function AttributionDialog({
  onClose,
  onCredits,
}: {
  onClose: () => void;
  onCredits: () => void;
}) {
  const s = useAppState();
  const fig = figure(s);
  const items = docCreditItems(fig.doc, fig.assets);
  const line = creditLine(items, BRAND.name);
  const legend = legendText(fig);
  const sa = items.filter((i) => i.shareAlike);
  const needsNotice = items.filter((i) => /^(MIT|BSD|Apache)/.test(i.license));
  const modified = items.filter((i) => i.modified !== undefined && needsModifiedNote(i.license));
  return (
    <Dialog title="Attribution and licences" onClose={onClose}>
      <p className="note">
        Legend skeleton: a line per panel with its title, the scale bars, channel names and picture
        credits, to paste into your figure legend.
      </p>
      {legend === '' ? (
        <p>Nothing to put in a legend yet: add panels, scale bars, merges or picture credits.</p>
      ) : (
        <>
          <pre className="credit-box" data-testid="legend-text" style={{ whiteSpace: 'pre-wrap' }}>
            {legend}
          </pre>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(legend).then(
                  () => {
                    store.notify('Legend copied.');
                  },
                  () => {
                    store.notify('Copying is blocked here; select the text instead.', 'warning');
                  },
                );
                analytics.track('attribution', 'copy-legend');
              }}
            >
              Copy legend
            </button>
          </div>
        </>
      )}
      {items.length === 0 ? (
        <p>This figure uses no library icons or credited images, so it needs no credit line.</p>
      ) : (
        <>
          <p className="note">Credit line for your figure legend or methods:</p>
          <div className="credit-box" data-testid="credit-line">
            {line}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(line).then(
                  () => {
                    store.notify('Credit line copied.');
                  },
                  () => {
                    store.notify('Copying is blocked here; select the text instead.', 'warning');
                  },
                );
                analytics.track('attribution', 'copy');
              }}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                addCreditText(line);
                onClose();
              }}
            >
              Add as text object
            </button>
          </div>
          {sa.length > 0 && (
            <p className="warn">
              {String(sa.length)} icon{sa.length === 1 ? ' is' : 's are'} share-alike (CC BY-SA): a
              figure using them must be shared under the same licence.
            </p>
          )}
          {needsNotice.length > 0 && (
            <p className="note">
              MIT, BSD and Apache icons also need their licence notice to travel with them: the
              credit line names them, and the full texts are in the{' '}
              <button type="button" className="link" onClick={onCredits}>
                icon credits and licences
              </button>
              .
            </p>
          )}
          {modified.length > 0 && (
            <p className="note">
              Recoloured CC BY and CC BY-SA icons are credited as “modified”, as their licences
              require.
            </p>
          )}
          <table className="licence-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Source</th>
                <th>Licence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.hash}>
                  <td>
                    {i.originalUrl ? (
                      <a href={i.originalUrl} target="_blank" rel="noreferrer">
                        {i.title}
                      </a>
                    ) : (
                      i.title
                    )}
                  </td>
                  <td>
                    {i.source}
                    {i.author ? ` (${i.author})` : ''}
                  </td>
                  <td>
                    {i.licenseUrl ? (
                      <a href={i.licenseUrl} target="_blank" rel="noreferrer">
                        {i.license}
                      </a>
                    ) : (
                      i.license
                    )}
                    {i.shareAlike ? ' (share-alike)' : ''}
                    {i.modified !== undefined && needsModifiedNote(i.license) ? ', modified' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <label>
          <input
            type="checkbox"
            checked={fig.doc.creditFooter}
            onChange={(e) => {
              store.edit(setCreditFooter(e.target.checked));
            }}
          />{' '}
          Include the credit line under exported figures (on by default)
        </label>
      </div>
      <div className="actions">
        <button type="button" onClick={onCredits}>
          Icon library credits
        </button>
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
